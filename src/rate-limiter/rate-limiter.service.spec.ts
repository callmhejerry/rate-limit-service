import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service';
import { RedisService } from '../redis/redis.service';
import { ClientService } from '../client/client.service';
import { NotFoundException } from '@nestjs/common';

// Hermetic in-memory mock of Redis client and the custom Lua command
class MockRedisClient {
  private store = new Map<string, { tokens: string; last_refill: string }>();

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
  private client = new MockRedisClient();
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

  async findById(id: string) {
    return this.clients.find((c) => c.id === id) || null;
  }

  async findAll() {
    return this.clients;
  }
}

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  let redisService: MockRedisService;

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
      ],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
    redisService = module.get<RedisService>(RedisService) as any;

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
});
