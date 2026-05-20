import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('CLIENTE_EXTENSION')
export class ClienteExtension {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  cod_cli: number;

  @Column({ default: true })
  acepta_devoluciones: boolean;

  @Column({ nullable: true, type: 'money' })
  limite_credito: number;

  @Column({ default: 0 })
  nivel_fidelidad: number;

  @Column({ nullable: true, length: 500 })
  observaciones: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}