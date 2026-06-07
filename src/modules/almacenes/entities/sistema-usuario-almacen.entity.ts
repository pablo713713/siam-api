import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('SISTEMA_USUARIO_ALMACEN')
export class SistemaUsuarioAlmacen {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 7 })
  cod_usu: string;

  @Column({ length: 5 })
  cod_suc: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;
}