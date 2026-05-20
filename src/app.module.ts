import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SistemaRol } from './modules/roles/entities/sistema-rol.entity';
import { SistemaUsuarioRol } from './modules/roles/entities/sistema-usuario-rol.entity';
import { ClienteExtension } from './modules/clientes/entities/cliente-extension.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mssql' as const,
        host: config.get<string>('DB_HOST'),
        port: parseInt(config.get<string>('DB_PORT') ?? '1433', 10),
        database: config.get<string>('DB_NAME'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        options: {
          enableArithAbort: true,
          trustServerCertificate: true,
          encrypt: false,
          cryptoCredentialsDetails: {
            rejectUnauthorized: false,
          },
        },
        entities: [SistemaRol, SistemaUsuarioRol, ClienteExtension],
        migrations: [__dirname + '/migrations/*{.ts,.js}'],
        synchronize: false,
        logging: false,
      }),
    }),
  ],
})
export class AppModule {}