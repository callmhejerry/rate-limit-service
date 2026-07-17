import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { RequestLogEntity } from './entities/request-log.entity';
import { LoggingProcessor } from './logging.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([RequestLogEntity]),
    BullModule.registerQueue({
      name: 'request-logs',
    }),
  ],
  providers: [LoggingProcessor],
  exports: [BullModule], // export the queue to make it injectable elsewhere
})
export class LoggingModule {}
