import { Injectable, NotFoundException } from '@nestjs/common';
import { Client, BucketState, CheckResult } from './interfaces/rate-limit.interface';

@Injectable()
export class RateLimiterService {
  // In-memory client storage for Phase 1 (folded policy config)
  private readonly clients: Client[] = [
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

  // In-memory bucket states map (key: clientId)
  private readonly states = new Map<string, BucketState>();

  /**
   * Checks if a client is rate-limited.
   */
  checkRateLimit(clientId: string): CheckResult {
    const client = this.clients.find((c) => c.id === clientId);

    if (!client) {
      throw new NotFoundException(`Client not found with ID '${clientId}'`);
    }

    if (!client.enabled) {
      return { allowed: true, remainingTokens: client.capacity };
    }

    const key = clientId;
    const now = Date.now();
    let state = this.states.get(key);

    if (!state) {
      // First request initialize the bucket to capacity
      state = {
        currentTokens: client.capacity,
        lastRefill: now,
      };
    } else {
      // Calculate token replenishment based on time elapsed
      const elapsedSeconds = (now - state.lastRefill) / 1000;
      const tokensToAdd = elapsedSeconds * client.refillRatePerSecond;
      state.currentTokens = Math.min(
        client.capacity,
        state.currentTokens + tokensToAdd,
      );
      state.lastRefill = now;
    }

    if (state.currentTokens >= 1) {
      state.currentTokens -= 1;
      this.states.set(key, state);
      return {
        allowed: true,
        remainingTokens: Math.floor(state.currentTokens),
      };
    } else {
      this.states.set(key, state);
      return {
        allowed: false,
        remainingTokens: Math.floor(state.currentTokens),
      };
    }
  }

  /**
   * Helper to reset bucket states (useful for testing)
   */
  resetStates(): void {
    this.states.clear();
  }
}
