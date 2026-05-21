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

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Usuario)
    private readonly usuarioRepository: Repository<Usuario>,
    @InjectRepository(SistemaUsuarioRol)
    private readonly usuarioRolRepository: Repository<SistemaUsuarioRol>,
    private readonly jwtService: JwtService,
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

    // 3. Buscar rol asignado en tabla satélite
    const usuarioRol = await this.usuarioRolRepository.findOne({
      where: { cod_usu: usuario.COD_USU },
      relations: ['rol'],
    });

    // 4. Construir payload del JWT
    const payload: JwtPayload = {
      cod_usu: usuario.COD_USU,
      alias: usuario.ALIAS,
      nombre: usuario.NOM_USU,
      apellido: usuario.AP_USU,
      rol: usuarioRol?.rol?.nombre ?? null,
      id_rol: usuarioRol?.id_rol ?? null,
    };

    // 5. Generar token
    return {
      access_token: this.jwtService.sign(payload),
      usuario: payload,
    };
  }
}