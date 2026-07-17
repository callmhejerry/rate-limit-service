import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { RateLimiterService } from './rate-limiter.service';
import { CheckRateLimitDto } from './dtos/check-rate-limit.dto';
import { CheckResult } from './interfaces/rate-limit.interface';

@Controller('rate-limit')
export class RateLimiterController {
  constructor(private readonly rateLimiterService: RateLimiterService) {}

  @Post('check')
  @HttpCode(HttpStatus.OK)
  async check(@Body() dto: CheckRateLimitDto): Promise<CheckResult> {
    return this.rateLimiterService.checkRateLimit(dto.clientId);
  }
}
