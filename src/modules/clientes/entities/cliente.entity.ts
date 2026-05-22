import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

@Entity('CLIENTE')
export class Cliente {
  @PrimaryGeneratedColumn()
  cod_cli: number;

  @Column({ nullable: true, length: 20 })
  NUM_CI_NIT: string;

  @Column({ nullable: true, length: 100 })
  RAZON_SOCIAL: string;

  @Column({ nullable: true, length: 20 })
  TEL_DOM: string;

  @Column({ nullable: true, length: 20 })
  CEL: string;

  @Column({ nullable: true, length: 100 })
  DOMICILIO: string;

  @Column({ nullable: true })
  baja: number;
}