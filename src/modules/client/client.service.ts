import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from './entities/client.entity';
import { CreateClientDto } from './dtos/create-client.dto';

@Injectable()
export class ClientService {
  private readonly logger = new Logger(ClientService.name);
  private readonly configCache = new Map<string, ClientEntity>();

  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepository: Repository<ClientEntity>,
  ) { }

  /**
   * Creates or updates a client configuration in the database and caches it.
   */
  async createOrUpdate(dto: CreateClientDto): Promise<ClientEntity> {
    let capacity = dto.capacity ?? 100;
    let refillRatePerSecond = dto.refillRatePerSecond ?? 1.67;
    let requestsPerMinute = dto.requestsPerMinute ?? capacity;

    if (dto.requestsPerMinute !== undefined) {
      capacity = dto.requestsPerMinute;
      refillRatePerSecond = dto.requestsPerMinute / 60.0;
    }

    const client = this.clientRepository.create({
      id: dto.id,
      name: dto.name,
      apiKey: dto.apiKey,
      capacity,
      refillRatePerSecond,
      requestsPerMinute,
      algorithm: dto.algorithm ?? 'TOKEN_BUCKET',
      enabled: dto.enabled ?? true,
    });
    const saved = await this.clientRepository.save(client);

    // cache the saved client internally , we will need this in the feature if database fails
    this.configCache.set(saved.id, saved);
    return saved;
  }

  /**
   * Finds a client by ID, falling back to local memory if database is down.
   */
  async findById(id: string): Promise<ClientEntity | null> {
    try {
      const client = await this.clientRepository.findOneBy({ id });
      if (client) {
        this.configCache.set(id, client);
      }
      return client;
    } catch (err) {
      this.logger.warn(
        `Database is temporarily unavailable when querying client '${id}'. Falling back to local cache.`,
        err instanceof Error ? err.stack : String(err),
      );
      return this.configCache.get(id) || null;
    }
  }

  /**
   * Lists all clients, falling back to local memory if database is down.
   */
  async findAll(): Promise<ClientEntity[]> {
    try {
      const clients = await this.clientRepository.find();
      for (const client of clients) {
        this.configCache.set(client.id, client);
      }
      return clients;
    } catch (err) {
      this.logger.warn(
        'Database is temporarily unavailable when listing all clients. Falling back to local cache.',
        err instanceof Error ? err.stack : String(err),
      );
      return Array.from(this.configCache.values());
    }
  }
}
