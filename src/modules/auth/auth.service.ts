import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Usuario } from './entities/usuario.entity';
import { SistemaUsuarioRol } from '../roles/entities/sistema-usuario-rol.entity';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AlmacenesService } from '../almacenes/almacenes.service';

// Fuerza bruta en el login: tras 5 intentos fallidos seguidos con el mismo
// alias, se bloquea ese alias 5 minutos (igual que la firma de traspasos).
const MAX_FALLOS_LOGIN = 5;
const BLOQUEO_LOGIN_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly fallosLogin = new Map<string, { fallos: number; bloqueadoHasta: number }>();

  constructor(
  @InjectRepository(Usuario)
  private readonly usuarioRepository: Repository<Usuario>,
  @InjectRepository(SistemaUsuarioRol)
  private readonly usuarioRolRepository: Repository<SistemaUsuarioRol>,
  private readonly jwtService: JwtService,
  private readonly almacenesService: AlmacenesService,
) {}

  async login(dto: LoginDto): Promise<{ access_token: string; usuario: JwtPayload }> {
    const clave = String(dto.alias ?? '').trim().toLowerCase();
    this.verificarBloqueo(clave);

    const usuario = await this.usuarioRepository
      .createQueryBuilder('u')
      .addSelect('u.CONTRASEÑA')
      .where('u.ALIAS = :alias', { alias: dto.alias })
      .andWhere('u.baja = :baja', { baja: '0' })
      .getOne();

    // Usuario inexistente y contraseña incorrecta cuentan igual y dan el mismo mensaje
    // (contraseña en texto plano — sistema legacy)
    if (!usuario || usuario.CONTRASEÑA !== dto.contrasena) {
      this.registrarFallo(clave);
      throw new UnauthorizedException('Credenciales inválidas');
    }
    this.fallosLogin.delete(clave);

    // 3. Buscar TODOS los roles asignados
    const usuarioRoles = await this.usuarioRolRepository.find({
      where: { cod_usu: usuario.COD_USU },
      relations: ['rol'],
    });

    const almacenes = await this.almacenesService.getAlmacenesDeUsuario(usuario.COD_USU);

    // 4. Calcular cod_emp vía USUARIO.COD_SUC → SUCURSAL.COD_EMP
    const empresaResult = await this.usuarioRepository.manager.query(`
      SELECT s.COD_EMP as codEmp
      FROM USUARIO u
      INNER JOIN SUCURSAL s ON s.COD_SUC = u.COD_SUC
      WHERE u.COD_USU = @0
    `, [usuario.COD_USU]);

    const cod_emp = empresaResult[0]?.codEmp;

    if (!cod_emp) {
      throw new UnauthorizedException(
        'El usuario no tiene una sucursal/empresa válida asociada. Contacte al administrador.',
      );
    }

    const payload: JwtPayload = {
      cod_usu: usuario.COD_USU,
      alias: usuario.ALIAS,
      nombre: usuario.NOM_USU,
      apellido: usuario.AP_USU,
      roles: usuarioRoles.map((ur) => ur.rol.nombre),
      id_roles: usuarioRoles.map((ur) => ur.id_rol),
      almacenes,
      cod_emp,
    };

    // 5. Generar token
    return {
      access_token: this.jwtService.sign(payload),
      usuario: payload,
    };
  }

  private verificarBloqueo(clave: string): void {
    const reg = this.fallosLogin.get(clave);
    if (!reg) return;
    const restante = reg.bloqueadoHasta - Date.now();
    if (restante > 0) {
      const minutos = Math.ceil(restante / 60000);
      throw new HttpException(
        `Demasiados intentos fallidos. Intente nuevamente en ${minutos} min.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (reg.bloqueadoHasta > 0) this.fallosLogin.delete(clave);
  }

  private registrarFallo(clave: string): void {
    const reg = this.fallosLogin.get(clave) ?? { fallos: 0, bloqueadoHasta: 0 };
    reg.fallos += 1;
    if (reg.fallos >= MAX_FALLOS_LOGIN) {
      reg.bloqueadoHasta = Date.now() + BLOQUEO_LOGIN_MS;
      reg.fallos = 0;
    }
    this.fallosLogin.set(clave, reg);
  }
}
