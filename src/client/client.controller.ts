import { Controller, Get, Post, Body } from '@nestjs/common';
import { ClientService } from './client.service';
import { CreateClientDto } from './dtos/create-client.dto';
import { ClientEntity } from './entities/client.entity';

@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Post()
  async createOrUpdate(@Body() dto: CreateClientDto): Promise<ClientEntity> {
    return this.clientService.createOrUpdate(dto);
  }

  @Get()
  async findAll(): Promise<ClientEntity[]> {
    return this.clientService.findAll();
  }
}
