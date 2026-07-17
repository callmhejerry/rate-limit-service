import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';
import { ClientModule } from './client/client.module';
import { LoggingModule } from './logging/logging.module';
import { ClientEntity } from './client/entities/client.entity';
import { RequestLogEntity } from './logging/entities/request-log.entity';

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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
