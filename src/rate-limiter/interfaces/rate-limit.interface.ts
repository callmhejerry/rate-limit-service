export interface Client {
  id: string;
  name: string;
  apiKey: string;
  capacity: number;
  refillRatePerSecond: number;
  algorithm: string;
  enabled: boolean;
}

export interface BucketState {
  currentTokens: number;
  lastRefill: number; // millisecond timestamp
}

export class CheckResult {
  allowed: boolean;
  remainingTokens: number;
}
