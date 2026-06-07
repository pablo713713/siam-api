import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchUsuarioDto } from './dto/search-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly dataSource: DataSource) {}

  async search(dto: SearchUsuarioDto) {
    const { q, limit = 20 } = dto;
    const term = `%${q}%`;

    const items = await this.dataSource.query(`
      SELECT
        COD_USU as codUsu,
        NOM_USU as nomUsu,
        AP_USU  as apUsu,
        ALIAS   as alias,
        baja    as baja
      FROM USUARIO
      WHERE baja = '0'
        AND (
          NOM_USU LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          AP_USU  LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          ALIAS   LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI
        )
      ORDER BY NOM_USU ASC
      OFFSET 0 ROWS FETCH NEXT @1 ROWS ONLY
    `, [term, limit]);

    return {
      data: items,
      total: items.length,
    };
  }

  async findAll() {
    const items = await this.dataSource.query(`
      SELECT
        COD_USU as codUsu,
        NOM_USU as nomUsu,
        AP_USU  as apUsu,
        ALIAS   as alias,
        baja    as baja
      FROM USUARIO
      WHERE baja = '0'
      ORDER BY NOM_USU ASC
    `);

    return { data: items, total: items.length };
  }
}