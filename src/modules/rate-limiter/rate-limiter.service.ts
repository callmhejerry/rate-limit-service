import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RedisService } from '../redis/redis.service';
import { ClientService } from '../client/client.service';
import { CheckResult } from './interfaces/rate-limit.interface';

@Injectable()
export class RateLimiterService implements OnModuleInit {
  private readonly logger = new Logger(RateLimiterService.name);
  // Fallback in-memory token buckets for when Redis cache is down
  private readonly fallbackBuckets = new Map<string, { tokens: number; lastRefill: number }>();

  constructor(
    private readonly redisService: RedisService,
    private readonly clientService: ClientService,
    @InjectQueue('request-logs')
    private readonly logQueue: Queue,
  ) { }

  onModuleInit() {
    try {
      // Define custom Redis command using Lua script for atomic Token Bucket evaluation
      this.redisService.getClient().defineCommand('checkTokenBucket', {
        numberOfKeys: 1,
        lua: `
          local key = KEYS[1]
          local capacity = tonumber(ARGV[1])
          local refill_rate = tonumber(ARGV[2])
          local now = tonumber(ARGV[3])
          local requested = tonumber(ARGV[4])

          -- Read current state
          local state = redis.call('HMGET', key, 'tokens', 'last_refill')
          local current_tokens = tonumber(state[1])
          local last_refill = tonumber(state[2])

          if not current_tokens then
            -- First initialization of the bucket
            current_tokens = capacity
            last_refill = now
          else
            -- Calculate refilled tokens based on time elapsed
            local elapsed = (now - last_refill) / 1000
            if elapsed > 0 then
              local tokens_to_add = elapsed * refill_rate
              current_tokens = math.min(capacity, current_tokens + tokens_to_add)
              last_refill = now
            end
          end

          -- Check if request is allowed
          local allowed = 0
          if current_tokens >= requested then
            current_tokens = current_tokens - requested
            allowed = 1
          end

          -- Update state in Redis
          redis.call('HMSET', key, 'tokens', current_tokens, 'last_refill', last_refill)
          
          -- Set TTL to clean up inactive buckets (capacity refill time + 1 hour buffer)
          local ttl = math.ceil(capacity / refill_rate) + 3600
          redis.call('EXPIRE', key, ttl)

          return {allowed, current_tokens}
        `,
      });
    } catch (err) {
      this.logger.error('Failed to define custom Redis command checkTokenBucket on startup:', err);
    }
  }

  /**
   * Checks if a client is rate-limited using Redis, and queues a request log asynchronously.
   * Seamlessly falls back to local in-memory Token Bucket evaluation if Redis is unreachable.
   */
  async checkRateLimit(clientId: string): Promise<CheckResult> {
    const start = Date.now();

    const client = await this.clientService.findById(clientId);

    if (!client) {
      throw new NotFoundException(`Client not found with ID '${clientId}'`);
    }

    if (!client.enabled) {
      const duration = Date.now() - start;
      try {
        this.logQueue.add('log', {
          clientId,
          allowed: true,
          responseTime: duration,
          timestamp: new Date().toISOString(),
        }).catch(err => {
          this.logger.error('Failed to queue enabled fallback request log asynchronously:', err);
        });
      } catch (err) {
        this.logger.error('Failed to queue enabled fallback request log:', err);
      }
      return { allowed: true, remainingTokens: client.capacity };
    }

    const key = `rate_limit:${clientId}`;
    const now = Date.now();

    let allowed = false;
    let remainingTokensVal = 0;

    try {
      // Execute the atomic Lua script in Redis
      const [allowedVal, remainingTokensValResult] = (await (
        this.redisService.getClient() as any
      ).checkTokenBucket(
        key,
        client.capacity.toString(),
        client.refillRatePerSecond.toString(),
        now.toString(),
        '1', // request 1 token at a time
      )) as [number, number];

      allowed = allowedVal === 1;
      remainingTokensVal = remainingTokensValResult;
    } catch (err) {
      this.logger.warn(
        `Redis cache is temporarily unavailable. Falling back to local in-memory token bucket for client '${clientId}'.`,
        err instanceof Error ? err.message : String(err),
      );

      // In-memory local token bucket calculation
      const bucket = this.fallbackBuckets.get(clientId) || {
        tokens: client.capacity,
        lastRefill: now,
      };

      const elapsed = (now - bucket.lastRefill) / 1000;
      let currentTokens = bucket.tokens;
      if (elapsed > 0) {
        const tokensToAdd = elapsed * client.refillRatePerSecond;
        currentTokens = Math.min(client.capacity, currentTokens + tokensToAdd);
      }

      if (currentTokens >= 1) {
        currentTokens -= 1;
        allowed = true;
      } else {
        allowed = false;
      }

      this.fallbackBuckets.set(clientId, { tokens: currentTokens, lastRefill: now });
      remainingTokensVal = currentTokens;
    }

    const duration = Date.now() - start;

    try {
      // Queue the log job asynchronously to BullMQ (unawaited)
      this.logQueue.add('log', {
        clientId,
        allowed,
        responseTime: duration,
        timestamp: new Date().toISOString(),
      }).catch(err => {
        this.logger.error('Failed to queue request log asynchronously:', err);
      });
    } catch (err) {
      this.logger.error('Failed to initiate queue request log:', err);
    }

    return {
      allowed,
      remainingTokens: Math.floor(remainingTokensVal),
    };
  }

  /**
   * Helper to reset Redis states for active clients (useful for testing)
   */
  async resetStates(): Promise<void> {
    try {
      const clients = await this.clientService.findAll();
      const keys = clients.map((c) => `rate_limit:${c.id}`);
      if (keys.length > 0) {
        await this.redisService.getClient().del(...keys);
      }
    } catch (err) {
      this.logger.warn('Failed to reset Redis states:', err instanceof Error ? err.message : String(err));
    }
  }
}
