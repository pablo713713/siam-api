import { ExecutionContext, ForbiddenException, HttpException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './guards/roles.guard';
import { usuarioDelToken } from './utils/usuario-del-token';
import { AuthService } from './auth.service';

describe('usuarioDelToken', () => {
  it('usa el usuario del token cuando el body no trae cod_usu', () => {
    expect(usuarioDelToken(undefined, '0000101')).toBe('0000101');
  });
  it('acepta el mismo cod_usu del token', () => {
    expect(usuarioDelToken('0000101', '0000101')).toBe('0000101');
  });
  it('rechaza registrar a nombre de otro usuario', () => {
    expect(() => usuarioDelToken('0000401', '0000402')).toThrow(ForbiddenException);
  });
});

describe('RolesGuard', () => {
  const ctx = (roles: string[]) =>
    ({
      getHandler: () => null,
      getClass: () => null,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as unknown as ExecutionContext;
  const guard = (requeridos?: string[]) =>
    new RolesGuard({ getAllAndOverride: () => requeridos } as unknown as Reflector);

  it('un usuario sin roles no pasa un endpoint con @Roles', () => {
    expect(() => guard(['Administrador']).canActivate(ctx([]))).toThrow(ForbiddenException);
  });
  it('basta con uno de los roles requeridos', () => {
    expect(guard(['Vendedor', 'Administrador']).canActivate(ctx(['Vendedor']))).toBe(true);
  });
});

describe('AuthService: bloqueo de login', () => {
  const usuario = { COD_USU: '0000001', ALIAS: 'admin', CONTRASEÑA: 'buena' };
  const repo = {
    createQueryBuilder: () => ({
      addSelect() { return this; },
      where() { return this; },
      andWhere() { return this; },
      getOne: async () => usuario,
    }),
    manager: { query: async () => [{ codEmp: '001' }] },
  };
  const servicio = () =>
    new AuthService(
      repo as never,
      { find: async () => [] } as never,
      { sign: () => 'token' } as never,
      { getAlmacenesDeUsuario: async () => [] } as never,
    );

  it('bloquea el alias tras 5 intentos fallidos aunque la 6ta contraseña sea correcta', async () => {
    const auth = servicio();
    for (let i = 0; i < 5; i++) {
      await expect(auth.login({ alias: 'admin', contrasena: 'mala' })).rejects.toThrow(UnauthorizedException);
    }
    await expect(auth.login({ alias: 'admin', contrasena: 'buena' })).rejects.toThrow(HttpException);
    await expect(auth.login({ alias: 'admin', contrasena: 'buena' })).rejects.toMatchObject({ status: 429 });
  });

  it('un login correcto reinicia el contador', async () => {
    const auth = servicio();
    for (let i = 0; i < 4; i++) {
      await expect(auth.login({ alias: 'admin', contrasena: 'mala' })).rejects.toThrow(UnauthorizedException);
    }
    await expect(auth.login({ alias: 'admin', contrasena: 'buena' })).resolves.toHaveProperty('access_token');
    await expect(auth.login({ alias: 'admin', contrasena: 'mala' })).rejects.toThrow(UnauthorizedException);
  });
});
