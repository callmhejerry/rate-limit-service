import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { RequestLogEntity } from '../logging/entities/request-log.entity';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(RequestLogEntity)
    private readonly requestLogRepository: Repository<RequestLogEntity>,
  ) {}

  /**
   * Retrieves aggregated statistics for request logs based on optional filters.
   */
  async getStats(filters: { clientId?: string; startDate?: string; endDate?: string }) {
    const where: any = {};

    if (filters.clientId) {
      where.clientId = filters.clientId;
    }

    if (filters.startDate || filters.endDate) {
      const start = filters.startDate ? new Date(filters.startDate) : new Date(0);
      const end = filters.endDate ? new Date(filters.endDate) : new Date();
      where.timestamp = Between(start, end);
    }

    // Fetch the logs matching the specified criteria
    const logs = await this.requestLogRepository.find({ where, order: { timestamp: 'DESC' } });

    const totalRequests = logs.length;
    const allowedRequests = logs.filter((l) => l.allowed).length;
    const blockedRequests = totalRequests - allowedRequests;
    const blockedPercentage = totalRequests > 0 ? parseFloat(((blockedRequests / totalRequests) * 100).toFixed(2)) : 0;
    const totalResponseTime = logs.reduce((sum, l) => sum + l.responseTime, 0);
    const averageResponseTimeMs = totalRequests > 0 ? parseFloat((totalResponseTime / totalRequests).toFixed(2)) : 0;

    // Group logs by clientId to calculate breakdown statistics
    const clientGroups = new Map<string, RequestLogEntity[]>();
    for (const log of logs) {
      const group = clientGroups.get(log.clientId) || [];
      group.push(log);
      clientGroups.set(log.clientId, group);
    }

    const breakdownByClient = Array.from(clientGroups.entries()).map(([clientId, clientLogs]) => {
      const cTotal = clientLogs.length;
      const cAllowed = clientLogs.filter((l) => l.allowed).length;
      const cBlocked = cTotal - cAllowed;
      const cResponseTime = clientLogs.reduce((sum, l) => sum + l.responseTime, 0);

      return {
        clientId,
        totalRequests: cTotal,
        allowedRequests: cAllowed,
        blockedRequests: cBlocked,
        averageResponseTimeMs: cTotal > 0 ? parseFloat((cResponseTime / cTotal).toFixed(2)) : 0,
      };
    });

    return {
      totalRequests,
      allowedRequests,
      blockedRequests,
      blockedPercentage,
      averageResponseTimeMs,
      breakdownByClient,
    };
  }
}
