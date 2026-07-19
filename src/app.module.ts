import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RateLimiterModule } from './modules/rate-limiter/rate-limiter.module';
import { ClientModule } from './modules/client/client.module';
import { LoggingModule } from './modules/logging/logging.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { ClientEntity } from './modules/client/entities/client.entity';
import { RequestLogEntity } from './modules/logging/entities/request-log.entity';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DATABASE_HOST ?? 'localhost',
      port: parseInt(process.env.DATABASE_PORT ?? '5433', 10),
      username: process.env.DATABASE_USER ?? 'postgres',
      password: process.env.DATABASE_PASSWORD ?? 'postgres',
      database: process.env.DATABASE_NAME ?? 'rate_limit_db',
      entities: [ClientEntity, RequestLogEntity],
      synchronize: true, // automatically synchronizes schemas for local development
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST ?? 'localhost',
        port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      },
    }),
    ClientModule,
    RateLimiterModule,
    LoggingModule,
    AnalyticsModule,
  ],
})
export class AppModule { }
