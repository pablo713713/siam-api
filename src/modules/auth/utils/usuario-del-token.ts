import { ForbiddenException } from '@nestjs/common';

/**
 * Las operaciones se registran siempre a nombre del usuario del token.
 * Por compatibilidad el body puede seguir trayendo cod_usu, pero si no
 * coincide con el del token se rechaza: nadie registra a nombre de otro.
 */
export function usuarioDelToken(enviado: string | undefined | null, delToken: string): string {
  if (enviado && String(enviado).trim() !== delToken) {
    throw new ForbiddenException('No puede registrar operaciones a nombre de otro usuario.');
  }
  return delToken;
}
