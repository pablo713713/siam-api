import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

/**
 * Guard global: si el endpoint tiene @Roles(...), exige que el usuario del
 * token tenga al menos uno de esos roles. Sin @Roles no restringe nada.
 * Se registra después de JwtAuthGuard, que es quien carga req.user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requeridos = this.reflector.getAllAndOverride<string[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requeridos || requeridos.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const roles = user?.roles ?? [];
    if (!roles.some((r) => requeridos.includes(r))) {
      throw new ForbiddenException(
        `Esta acción requiere el rol: ${requeridos.join(' o ')}.`,
      );
    }
    return true;
  }
}
