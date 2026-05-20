import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { SistemaRol } from './sistema-rol.entity';

@Entity('SISTEMA_USUARIO_ROL')
@Unique(['cod_usu', 'id_rol'])
export class SistemaUsuarioRol {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 7 })
  cod_usu: string;

  @Column()
  id_rol: number;

  @CreateDateColumn()
  asignadoAt: Date;

  @ManyToOne(() => SistemaRol, (rol) => rol.usuarioRoles)
  @JoinColumn({ name: 'id_rol' })
  rol: SistemaRol;
}