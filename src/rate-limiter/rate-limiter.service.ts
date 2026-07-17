import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';
import { ClientService } from '../client/client.service';
import { CheckResult } from './interfaces/rate-limit.interface';

@Injectable()
export class RateLimiterService implements OnModuleInit {
  constructor(
    private readonly redisService: RedisService,
    private readonly clientService: ClientService,
  ) {}

  onModuleInit() {
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
  }

  /**
   * Checks if a client is rate-limited using Redis and configurations from PostgreSQL.
   */
  async checkRateLimit(clientId: string): Promise<CheckResult> {
    const client = await this.clientService.findById(clientId);

    if (!client) {
      throw new NotFoundException(`Client not found with ID '${clientId}'`);
    }

    if (!client.enabled) {
      return { allowed: true, remainingTokens: client.capacity };
    }

    const key = `rate_limit:${clientId}`;
    const now = Date.now();

    // Execute the atomic Lua script in Redis
    const [allowedVal, remainingTokensVal] = (await (
      this.redisService.getClient() as any
    ).checkTokenBucket(
      key,
      client.capacity.toString(),
      client.refillRatePerSecond.toString(),
      now.toString(),
      '1', // request 1 token at a time
    )) as [number, number];

    return {
      allowed: allowedVal === 1,
      remainingTokens: Math.floor(remainingTokensVal),
    };
  }

  /**
   * Helper to reset Redis states for active clients (useful for testing)
   */
  async resetStates(): Promise<void> {
    const clients = await this.clientService.findAll();
    const keys = clients.map((c) => `rate_limit:${c.id}`);
    if (keys.length > 0) {
      await this.redisService.getClient().del(...keys);
    }
  }
}
