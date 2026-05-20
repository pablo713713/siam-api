import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity('PRODUCTO', { schema: 'dbo' })
export class Producto {
  @PrimaryGeneratedColumn({ name: 'ID_PRO' })
  id: number;

  @Column({ name: 'COD_PRO', type: 'varchar', length: 50, nullable: true })
  codPro: string;

  @Column({ name: 'DESC_PRO', type: 'varchar', length: 150 })
  descPro: string;

  @Column({ name: 'ESTADO', type: 'varchar', length: 1, nullable: true })
  estado: string;

  @Column({ name: 'CODIGO', type: 'varchar', length: 4, nullable: true })
  codigo: string;
}
