import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RequestLogEntity } from './entities/request-log.entity';

@Processor('request-logs')
export class LoggingProcessor extends WorkerHost {
  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly requestLogRepository: Repository<RequestLogEntity>,
  ) {
    super();
  }

  /**
   * Processes request log jobs from the queue and saves them to the database.
   */
  async process(job: Job<{ clientId: string; allowed: boolean; responseTime: number; timestamp: string }>): Promise<void> {
    const { clientId, allowed, responseTime, timestamp } = job.data;

    const log = this.requestLogRepository.create({
      clientId,
      allowed,
      responseTime,
      timestamp: new Date(timestamp),
    });

    await this.requestLogRepository.save(log);
  }
}
