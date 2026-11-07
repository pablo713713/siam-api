import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const CodEmp = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const cod_emp = request.user?.cod_emp;

    if (!cod_emp) {
      throw new UnauthorizedException(
        'Token sin cod_emp — no se puede determinar la empresa del usuario',
      );
    }

    return cod_emp;
  },
);