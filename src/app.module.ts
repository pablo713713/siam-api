import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';

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
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: false,
        logging: false,
      }),
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}