export class CreateClientDto {
  id: string;
  name: string;
  apiKey: string;
  capacity?: number;
  refillRatePerSecond?: number;
  requestsPerMinute?: number;
  algorithm?: string;
  enabled?: boolean;
}
