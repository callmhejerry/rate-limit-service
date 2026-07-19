import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('request_logs')
export class RequestLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @Column()
  allowed: boolean;

  @Column('float', { name: 'response_time' })
  responseTime: number; // response time of the check operation in ms

  @CreateDateColumn({ name: 'timestamp' })
  timestamp: Date;
}
