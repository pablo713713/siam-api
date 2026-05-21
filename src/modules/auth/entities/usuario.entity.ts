import { Entity, Column, PrimaryColumn } from 'typeorm';

@Entity('USUARIO')
export class Usuario {
  @PrimaryColumn({ length: 7 })
  COD_USU: string;

  @Column({ length: 30 })
  NOM_USU: string;

  @Column({ length: 30 })
  AP_USU: string;

  @Column({ nullable: true, length: 20 })
  ALIAS: string;

  @Column({ length: 20, select: false })
  CONTRASEÑA: string;

  @Column({ nullable: true, length: 3 })
  COD_CAR: string;

  @Column({ nullable: true, length: 5 })
  COD_SUC: string;

  @Column({ nullable: true, length: 1 })
  baja: string;

  @Column({ nullable: true, length: 100 })
  email: string;

  @Column({ nullable: true, length: 1 })
  INI: string;
}