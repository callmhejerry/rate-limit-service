export class CreateClientDto {
  id: string;
  name: string;
  apiKey: string;
  capacity: number;
  refillRatePerSecond: number;
  algorithm?: string;
  enabled?: boolean;
}
