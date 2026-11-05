import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { SearchUsuarioDto } from './dto/search-usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(private readonly dataSource: DataSource) {}

  async search(dto: SearchUsuarioDto, cod_emp: string) {
    const { q, limit = 20 } = dto;
    const term = `%${q}%`;

    const items = await this.dataSource.query(`
      SELECT
        u.COD_USU as codUsu,
        u.NOM_USU as nomUsu,
        u.AP_USU  as apUsu,
        u.ALIAS   as alias,
        u.baja    as baja
      FROM USUARIO u
      INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
      WHERE u.baja = '0'
        AND s.COD_EMP = @2
        AND (
          u.NOM_USU LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          u.AP_USU  LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI OR
          u.ALIAS   LIKE @0 COLLATE SQL_Latin1_General_CP1_CI_AI
        )
      ORDER BY u.NOM_USU ASC
      OFFSET 0 ROWS FETCH NEXT @1 ROWS ONLY
    `, [term, limit, cod_emp]);

    return { data: items, total: items.length };
  }

async findAll(cod_emp: string) {
  const items = await this.dataSource.query(`
    SELECT
      u.COD_USU as codUsu,
      u.NOM_USU as nomUsu,
      u.AP_USU  as apUsu,
      u.ALIAS   as alias,
      u.baja    as baja
    FROM USUARIO u
    INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
    WHERE u.baja = '0'
      AND s.COD_EMP = @0
    ORDER BY u.NOM_USU ASC
  `, [cod_emp]);

  return { data: items, total: items.length };
}
}