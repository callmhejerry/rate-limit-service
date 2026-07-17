import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClientEntity } from './entities/client.entity';
import { CreateClientDto } from './dtos/create-client.dto';

@Injectable()
export class ClientService {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly clientRepository: Repository<ClientEntity>,
  ) {}

  /**
   * Creates or updates a client configuration in the database.
   */
  async createOrUpdate(dto: CreateClientDto): Promise<ClientEntity> {
    const client = this.clientRepository.create({
      id: dto.id,
      name: dto.name,
      apiKey: dto.apiKey,
      capacity: dto.capacity,
      refillRatePerSecond: dto.refillRatePerSecond,
      algorithm: dto.algorithm ?? 'TOKEN_BUCKET',
      enabled: dto.enabled ?? true,
    });
    return this.clientRepository.save(client);
  }

  /**
   * Finds a client by ID.
   */
  async findById(id: string): Promise<ClientEntity | null> {
    return this.clientRepository.findOneBy({ id });
  }

  /**
   * Lists all clients.
   */
  async findAll(): Promise<ClientEntity[]> {
    return this.clientRepository.find();
  }
}
