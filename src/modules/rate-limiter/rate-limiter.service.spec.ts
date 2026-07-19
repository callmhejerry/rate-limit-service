import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { RateLimiterService } from './rate-limiter.service';
import { RedisService } from '../redis/redis.service';
import { ClientService } from '../client/client.service';
import { NotFoundException } from '@nestjs/common';

// Hermetic in-memory mock of Redis client and the custom Lua command
class MockRedisClient {
  private store = new Map<string, { tokens: string; last_refill: string }>();
  public shouldThrow = false;

  defineCommand(name: string, options: any) {
    // Command is registered, we mock the execution in checkTokenBucket
  }

  async checkTokenBucket(
    key: string,
    capacityStr: string,
    refillRateStr: string,
    nowStr: string,
    requestedStr: string,
  ): Promise<[number, number]> {
    if (this.shouldThrow) {
      throw new Error('Redis connection lost');
    }

    const capacity = parseFloat(capacityStr);
    const refill_rate = parseFloat(refillRateStr);
    const now = parseInt(nowStr, 10);
    const requested = parseInt(requestedStr, 10);

    const state = this.store.get(key);
    let current_tokens: number;
    let last_refill: number;

    if (!state) {
      current_tokens = capacity;
      last_refill = now;
    } else {
      current_tokens = parseFloat(state.tokens);
      last_refill = parseInt(state.last_refill, 10);

      const elapsed = (now - last_refill) / 1000;
      if (elapsed > 0) {
        const tokens_to_add = elapsed * refill_rate;
        current_tokens = Math.min(capacity, current_tokens + tokens_to_add);
        last_refill = now;
      }
    }

    let allowed = 0;
    if (current_tokens >= requested) {
      current_tokens -= requested;
      allowed = 1;
    }

    this.store.set(key, {
      tokens: current_tokens.toString(),
      last_refill: last_refill.toString(),
    });

    return [allowed, current_tokens];
  }

  async del(...keys: string[]): Promise<number> {
    let deletedCount = 0;
    for (const key of keys) {
      if (this.store.delete(key)) {
        deletedCount++;
      }
    }
    return deletedCount;
  }
}

class MockRedisService {
  public client = new MockRedisClient();
  getClient() {
    return this.client;
  }
}

class MockClientService {
  private clients = [
    {
      id: 'payment-service',
      name: 'Payment Service',
      apiKey: 'payment-secret-key',
      capacity: 100,
      refillRatePerSecond: 1.67,
      algorithm: 'TOKEN_BUCKET',
      enabled: true,
    },
    {
      id: 'wallet-service',
      name: 'Wallet Service',
      apiKey: 'wallet-secret-key',
      capacity: 5000,
      refillRatePerSecond: 83.33,
      algorithm: 'TOKEN_BUCKET',
      enabled: true,
    },
  ];

  private configCache = new Map<string, any>();
  public shouldThrow = false;

  async findById(id: string) {
    if (this.shouldThrow) {
      const cached = this.configCache.get(id);
      if (cached) return cached;
      throw new Error('Postgres connection lost');
    }
    const client = this.clients.find((c) => c.id === id) || null;
    if (client) {
      this.configCache.set(id, client);
    }
    return client;
  }

  async findAll() {
    if (this.shouldThrow) {
      return Array.from(this.configCache.values());
    }
    const clients = this.clients;
    for (const client of clients) {
      this.configCache.set(client.id, client);
    }
    return clients;
  }
}

class MockQueue {
  async add(name: string, data: any) {
    return { id: 'mock-job-id', data };
  }
}

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let redisService: MockRedisService;
  let clientService: MockClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimiterService,
        {
          provide: RedisService,
          useClass: MockRedisService,
        },
        {
          provide: ClientService,
          useClass: MockClientService,
        },
        {
          provide: getQueueToken('request-logs'),
          useClass: MockQueue,
        },
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
    redisService = module.get<RedisService>(RedisService) as any;
    clientService = module.get<ClientService>(ClientService) as any;

    // Trigger onModuleInit to mimic NestJS lifecycle command registration
    service.onModuleInit();
  });

  afterEach(async () => {
    await service.resetStates();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException if no client exists', async () => {
    await expect(
      service.checkRateLimit('unknown-client'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should allow requests and decrement tokens down to 0', async () => {
    // payment-service capacity is 100
    for (let i = 0; i < 100; i++) {
      const result = await service.checkRateLimit('payment-service');
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(100 - i - 1);
    }

    // The 101st request should be blocked
    const blockedResult = await service.checkRateLimit('payment-service');
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.remainingTokens).toBe(0);
  });

  it('should replenish tokens over time', async () => {
    // Consume 100 tokens to empty the bucket
    for (let i = 0; i < 100; i++) {
      await service.checkRateLimit('payment-service');
    }

    // Verify it is empty
    expect((await service.checkRateLimit('payment-service')).allowed).toBe(false);

    // Wait for 1.2 seconds. Refill rate is 1.67 per second, so 1.2 * 1.67 = 2 tokens refilled.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Next request should be allowed since it replenished >= 1 token
    const result = await service.checkRateLimit('payment-service');
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBeGreaterThanOrEqual(1);
  });

  describe('Fail-safe Outage Fallbacks', () => {
    it('should fall back to local in-memory configuration cache if PostgreSQL database fails', async () => {
      // Warm cache by loading the configuration once successfully
      const firstCheck = await service.checkRateLimit('payment-service');
      expect(firstCheck.allowed).toBe(true);

      // Simulate database outage
      clientService.shouldThrow = true;

      // Rate limit check should still succeed, fetching config from cache
      const secondCheck = await service.checkRateLimit('payment-service');
      expect(secondCheck.allowed).toBe(true);
      expect(secondCheck.remainingTokens).toBe(98);
    });

    it('should fall back to local in-memory token bucket calculations if Redis cache fails', async () => {
      // Warm configuration cache (so PostgreSQL doesn't fail, but Redis will)
      await service.checkRateLimit('payment-service');

      // Simulate Redis cache outage
      redisService.client.shouldThrow = true;

      // Run multiple check requests; they should fall back to local bucket state calculations and decrement correctly
      const r1 = await service.checkRateLimit('payment-service');
      expect(r1.allowed).toBe(true);
      // Wait, since we warmed it up, it had 99 tokens. The local fallback bucket is initialized at capacity (100) and decrements to 99:
      expect(r1.remainingTokens).toBe(99);

      const r2 = await service.checkRateLimit('payment-service');
      expect(r2.allowed).toBe(true);
      expect(r2.remainingTokens).toBe(98);

      const r3 = await service.checkRateLimit('payment-service');
      expect(r3.allowed).toBe(true);
      expect(r3.remainingTokens).toBe(97);
    });
  });
});
