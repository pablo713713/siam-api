import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Usuario autenticado (o uno de sus campos) tomado del JWT.
 *   @CurrentUser() user: JwtPayload
 *   @CurrentUser('cod_usu') cod_usu: string
 */
export const CurrentUser = createParamDecorator(
  (campo: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const user: JwtPayload | undefined = ctx.switchToHttp().getRequest().user;
    if (!user?.cod_usu) throw new UnauthorizedException();
    return campo ? user[campo] : user;
  },
);
