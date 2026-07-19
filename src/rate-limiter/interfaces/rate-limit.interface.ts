export interface Client {
  id: string;
  name: string;
  apiKey: string;
  capacity: number;
  refillRatePerSecond: number;
  algorithm: string;
  enabled: boolean;
}
// we are going to be using Token bucket algorithm so we need to keep track of the current tokens and the last time the bucket was refilled
export interface BucketState {
  currentTokens: number;
  lastRefill: number; // millisecond timestamp
}

export class CheckResult {
  allowed: boolean;
  remainingTokens: number;
}
