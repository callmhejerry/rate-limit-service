import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  onModuleInit() {
    const host = process.env.REDIS_HOST ?? 'localhost';
    const port = parseInt(process.env.REDIS_PORT ?? '6379', 10);

    this.client = new Redis({
      host,
      port,
      maxRetriesPerRequest: 3, // fail fast if commands cannot execute
      enableOfflineQueue: false, // throw immediate error instead of buffering commands when disconnected
      connectTimeout: 2000, // fail connection attempt after 2 seconds
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  getClient(): Redis {
    return this.client;
  }
}
