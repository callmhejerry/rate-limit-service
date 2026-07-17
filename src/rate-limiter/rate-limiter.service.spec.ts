import { Test, TestingModule } from '@nestjs/testing';
import { RateLimiterService } from './rate-limiter.service';
import { NotFoundException } from '@nestjs/common';

describe('RateLimiterService', () => {
  let service: RateLimiterService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RateLimiterService],
    }).compile();

    service = module.get<RateLimiterService>(RateLimiterService);
  });

  afterEach(() => {
    service.resetStates();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw NotFoundException if no client exists', () => {
    expect(() =>
      service.checkRateLimit('unknown-client'),
    ).toThrow(NotFoundException);
  });

  it('should allow requests and decrement tokens down to 0', () => {
    // payment-service capacity is 100
    for (let i = 0; i < 100; i++) {
      const result = service.checkRateLimit('payment-service');
      expect(result.allowed).toBe(true);
      expect(result.remainingTokens).toBe(100 - i - 1);
    }

    // The 101st request should be blocked
    const blockedResult = service.checkRateLimit('payment-service');
    expect(blockedResult.allowed).toBe(false);
    expect(blockedResult.remainingTokens).toBe(0);
  });

  it('should replenish tokens over time', async () => {
    // Consume 100 tokens to empty the bucket
    for (let i = 0; i < 100; i++) {
      service.checkRateLimit('payment-service');
    }

    // Verify it is empty
    expect(service.checkRateLimit('payment-service').allowed).toBe(false);

    // Wait for 1.2 seconds. Refill rate is 1.67 per second, so 1.2 * 1.67 = 2 tokens refilled.
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Next request should be allowed since it replenished >= 1 token
    const result = service.checkRateLimit('payment-service');
    expect(result.allowed).toBe(true);
    expect(result.remainingTokens).toBeGreaterThanOrEqual(1);
  });
});
