import { Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('clients')
export class ClientEntity {
  @PrimaryColumn()
  id: string; // e.g. 'payment-service'

  @Column()
  name: string;

  @Column({ name: 'api_key' })
  apiKey: string;

  @Column('float')
  capacity: number;

  @Column('float', { name: 'refill_rate_per_second' })
  refillRatePerSecond: number;

  @Column()
  algorithm: string;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
