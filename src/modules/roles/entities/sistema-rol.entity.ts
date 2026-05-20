import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { SistemaUsuarioRol } from './sistema-usuario-rol.entity';

@Entity('SISTEMA_ROLES')
export class SistemaRol {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true, length: 50 })
  nombre: string;

  @Column({ nullable: true, length: 200 })
  descripcion: string;

  @Column({ default: true })
  activo: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => SistemaUsuarioRol, (ur) => ur.rol)
  usuarioRoles: SistemaUsuarioRol[];
}