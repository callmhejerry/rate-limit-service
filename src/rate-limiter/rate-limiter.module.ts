import { Module } from '@nestjs/common';
import { RateLimiterController } from './rate-limiter.controller';
import { RateLimiterService } from './rate-limiter.service';
import { RedisModule } from '../redis/redis.module';
import { ClientModule } from '../client/client.module';

@Module({
  imports: [RedisModule, ClientModule],
  controllers: [RateLimiterController],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
