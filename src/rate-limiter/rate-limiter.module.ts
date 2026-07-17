import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { RateLimiterController } from './rate-limiter.controller';
import { RateLimiterService } from './rate-limiter.service';
import { RedisModule } from '../redis/redis.module';
import { ClientModule } from '../client/client.module';

@Module({
  imports: [
    RedisModule,
    ClientModule,
    BullModule.registerQueue({
      name: 'request-logs',
    }),
  ],
  controllers: [RateLimiterController],
  providers: [RateLimiterService],
  exports: [RateLimiterService],
})
export class RateLimiterModule {}
