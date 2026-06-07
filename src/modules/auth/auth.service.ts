import {
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

@Injectable()
export class AuthService {
  constructor(
  @InjectRepository(Usuario)
  private readonly usuarioRepository: Repository<Usuario>,
  @InjectRepository(SistemaUsuarioRol)
  private readonly usuarioRolRepository: Repository<SistemaUsuarioRol>,
  private readonly jwtService: JwtService,
  private readonly almacenesService: AlmacenesService,
) {}

  async login(dto: LoginDto): Promise<{ access_token: string; usuario: JwtPayload }> {
    // 1. Buscar usuario por alias incluyendo contraseña
    const usuario = await this.usuarioRepository
      .createQueryBuilder('u')
      .addSelect('u.CONTRASEÑA')
      .where('u.ALIAS = :alias', { alias: dto.alias })
      .andWhere('u.baja = :baja', { baja: '0' })
      .getOne();

    if (!usuario) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 2. Validar contraseña (texto plano — sistema legacy)
    if (usuario.CONTRASEÑA !== dto.contrasena) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    // 3. Buscar TODOS los roles asignados
    const usuarioRoles = await this.usuarioRolRepository.find({
      where: { cod_usu: usuario.COD_USU },
      relations: ['rol'],
    });

    const almacenes = await this.almacenesService.getAlmacenesDeUsuario(usuario.COD_USU);

    const payload: JwtPayload = {
      cod_usu: usuario.COD_USU,
      alias: usuario.ALIAS,
      nombre: usuario.NOM_USU,
      apellido: usuario.AP_USU,
      roles: usuarioRoles.map((ur) => ur.rol.nombre),
      id_roles: usuarioRoles.map((ur) => ur.id_rol),
      almacenes,
    };

    // 5. Generar token
    return {
      access_token: this.jwtService.sign(payload),
      usuario: payload,
    };
  }
}