# CONTEXT.md — Guía de colaboración SIAM

Este documento es la fuente de verdad para el desarrollo colaborativo del proyecto SIAM.
Pasalo completo a la IA al inicio de cada sesión de trabajo para que esté en contexto.
Actualizalo cada vez que se implementen nuevas funcionalidades.

---

## ¿Qué es SIAM?

SIAM (Sistema Integral de Administración y Mercadería) es una API REST para una empresa distribuidora/importadora. Maneja ventas, compras, inventario, créditos, importaciones, remisiones, caja y compatibilidad vehicular (autopartes).

El backend se conecta a una base de datos SQL Server legacy llamada `BDSIAM` que ya tiene datos reales de producción. El sistema anterior ya está en producción y seguirá funcionando en paralelo.

---

## Stack tecnológico

| Tecnología | Versión | Uso |
|---|---|---|
| NestJS | 11 | Framework principal |
| TypeScript | 5.7 | Lenguaje |
| SQL Server | Express local | Base de datos |
| TypeORM | 0.3.x | ORM y acceso a datos |
| mssql + tedious | 12.x / 19.x | Driver SQL Server |
| JWT | - | Autenticación |
| class-validator | 0.15 | Validación de DTOs |
| class-transformer | 0.5 | Transformación de datos |
| pnpm | 10.x | Package manager |

---

## Arquitectura general

```
HTTP Request
↓
Controller  (recibe, valida DTO, delega)
↓
Service     (lógica de negocio, reglas de dominio)
↓
Repository  (acceso a datos via TypeORM)
↓
SQL Server  (BDSIAM)
```

### Reglas obligatorias

- Controllers NUNCA contienen lógica de negocio
- Toda la lógica vive en Services
- Todos los endpoints usan DTOs con class-validator
- No usar `any` — tipado fuerte siempre
- Cada módulo es autocontenido
- Exportar Services solo si otros módulos los necesitan
- Usar `async/await` en todas las operaciones I/O
- Errores con `HttpException` y derivados (`NotFoundException`, `BadRequestException`, etc.)

### Anti-patrones prohibidos

- Lógica de negocio en controllers
- Acceso directo a repositorios desde controllers
- DTOs compartidos innecesariamente entre dominios
- Variables globales fuera de ConfigModule
- Módulos con demasiadas responsabilidades
- Includes/joins innecesarios en queries

---

## Estructura de carpetas

```
src/
├── app.module.ts
├── app.controller.ts       (solo health check)
├── main.ts
│
├── common/
│   ├── decorators/
│   ├── filters/
│   ├── guards/
│   ├── interceptors/
│   └── pipes/
│
└── modules/
    ├── auth/
    ├── roles/
    └── [dominio]/
        ├── [dominio].module.ts
        ├── [dominio].controller.ts
        ├── [dominio].service.ts
        ├── dto/
        │   ├── create-[dominio].dto.ts
        │   └── update-[dominio].dto.ts
        └── entities/
            └── [dominio].entity.ts
```

---

## Convenciones de nombrado

| Artefacto | Convención | Ejemplo |
|---|---|---|
| Módulo | `[dominio].module.ts` | `roles.module.ts` |
| Controller | `[dominio].controller.ts` | `roles.controller.ts` |
| Service | `[dominio].service.ts` | `roles.service.ts` |
| DTO creación | `create-[dominio].dto.ts` | `create-rol.dto.ts` |
| DTO actualización | `update-[dominio].dto.ts` | `update-rol.dto.ts` |
| Entity | `[entidad].entity.ts` | `sistema-rol.entity.ts` |
| Guard | `[nombre].guard.ts` | `jwt-auth.guard.ts` |
| Carpetas | kebab-case | `sistema-roles/` |
| Clases | PascalCase | `RolesService` |
| Variables/métodos | camelCase | `findAll()` |

---

## Base de datos — Regla de oro

La BD legacy `BDSIAM` tiene datos reales de producción y el sistema anterior sigue en uso.

### Lo que ESTÁ permitido
- Crear nuevas tablas con el prefijo `SISTEMA_`
- Agregar FK en tablas nuevas apuntando hacia tablas legacy (una sola dirección)
- Leer cualquier tabla legacy con SELECT

### Lo que está PROHIBIDO
- Modificar columnas de tablas existentes
- Agregar columnas nuevas a tablas existentes
- Agregar FK en tablas legacy apuntando a tablas nuevas
- Hacer DROP de cualquier tabla
- Hacer UPDATE/DELETE masivos sin supervisión

### Patrón de extensión
Cuando necesitamos agregar datos a una entidad legacy, creamos una tabla satélite:

```
TABLA_LEGACY (existente, no tocar)
    ↑ FK
SISTEMA_TABLA_EXTENSION (nueva, nuestra)
```

El backend hace JOIN entre ambas en el Service cuando necesita datos combinados.

### Tablas satélite ya creadas

| Tabla nueva | Apunta a | Propósito |
|---|---|---|
| `SISTEMA_ROLES` | — | Catálogo de roles del sistema |
| `SISTEMA_USUARIO_ROL` | `USUARIO.COD_USU` | Asignación de roles a usuarios |
| `CLIENTE_EXTENSION` | `CLIENTE.cod_cli` | Datos extendidos de clientes |

---

## Módulos implementados

### UH 0 — Inicialización (completada)
- Proyecto NestJS creado con pnpm
- TypeORM configurado con SQL Server
- Conexión a BDSIAM funcionando
- Health check en `GET /api/health`
- Repositorio en GitHub

### UH 1 — Tablas satélite (completada)
- `SISTEMA_ROLES`: id, nombre, descripcion, activo, createdAt, updatedAt
- `SISTEMA_USUARIO_ROL`: id, cod_usu, id_rol, asignadoAt
- `CLIENTE_EXTENSION`: id, cod_cli, acepta_devoluciones, limite_credito, nivel_fidelidad, observaciones

### UH 2 — ClienteExtension (completada)
- Tabla `CLIENTE_EXTENSION` creada y mapeada como entity

---

## Entidades TypeORM implementadas

### SistemaRol
```typescript
// modules/roles/entities/sistema-rol.entity.ts
@Entity('SISTEMA_ROLES')
export class SistemaRol {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true, length: 50 }) nombre: string;
  @Column({ nullable: true, length: 200 }) descripcion: string;
  @Column({ default: true }) activo: boolean;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

### SistemaUsuarioRol
```typescript
// modules/roles/entities/sistema-usuario-rol.entity.ts
@Entity('SISTEMA_USUARIO_ROL')
export class SistemaUsuarioRol {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 7 }) cod_usu: string;
  @Column() id_rol: number;
  @CreateDateColumn() asignadoAt: Date;
}
```

### ClienteExtension
```typescript
// modules/clientes/entities/cliente-extension.entity.ts
@Entity('CLIENTE_EXTENSION')
export class ClienteExtension {
  @PrimaryGeneratedColumn() id: number;
  @Column({ unique: true }) cod_cli: number;
  @Column({ default: true }) acepta_devoluciones: boolean;
  @Column({ nullable: true, type: 'money' }) limite_credito: number;
  @Column({ default: 0 }) nivel_fidelidad: number;
  @Column({ nullable: true, length: 500 }) observaciones: string;
  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

---

## Tabla USUARIO legacy — Estructura relevante

```json
{
  "COD_USU": "0000001",      // PK — 7 dígitos con ceros a la izquierda
  "NOM_USU": "BLADIMIR",
  "AP_USU": "PAZ MAMANI",
  "ALIAS": "bladyd",
  "CONTRASEÑA": "pmb",       // Texto plano en el sistema legacy
  "COD_CAR": "001",          // FK a CARGO
  "COD_SUC": "00000",        // FK a SUCURSAL
  "baja": "0",               // '0' = activo, '1' = inactivo
  "email": "blady_pm@hotmail.com",
  "INI": "1"                 // Flag de inicialización
}
```

> Las contraseñas en el sistema legacy están en texto plano. El nuevo sistema las valida
> contra ese campo pero en futuras UH se podrá migrar a hashing progresivo.

---

## Configuración de conexión a BD

```typescript
// La config que funcionó tras varios intentos — no modificar sin probar
{
  type: 'mssql',
  host: 'localhost',
  port: 1433,                          // Puerto fijo, NO usar instanceName (son mutuamente excluyentes en tedious)
  database: 'BDSIAM',
  username: 'siam_user',
  password: 'Siam2024!',
  options: {
    enableArithAbort: true,
    trustServerCertificate: true,
    encrypt: false,                    // Necesario para evitar error de certificado autofirmado
    cryptoCredentialsDetails: {
      rejectUnauthorized: false,       // Necesario para SQL Server Express local
    },
  },
  synchronize: false,                  // NUNCA en true — la BD es legacy
}
```

---

## Flujo de autenticación (planificado — UH 6)

```
POST /api/auth/login
  → Validar ALIAS + CONTRASEÑA contra tabla legacy USUARIO
  → JOIN con SISTEMA_USUARIO_ROL para obtener rol
  → JOIN con SISTEMA_ROLES para obtener nombre del rol
  → Generar JWT con payload: { cod_usu, alias, rol }
  → Retornar token
```

Rutas protegidas usan `JwtAuthGuard` + decorador `@Roles()`.

---

## Cómo agregar un nuevo módulo

```powershell
npx nest g module modules/[nombre]
npx nest g controller modules/[nombre]
npx nest g service modules/[nombre]
```

Luego registrarlo en `app.module.ts`:

```typescript
import { NuevoModule } from './modules/nuevo/nuevo.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({...}),
    NuevoModule,   // agregar acá
  ],
})
```

---

## Cómo usar este documento con la IA

Al iniciar una sesión de trabajo, pegá este documento completo y decile a la IA:

> "Este es el contexto completo del proyecto SIAM. [descripción de lo que querés hacer]"

Al terminar una sesión donde implementaste algo nuevo, pedile a la IA:

> "Actualizá el CONTEXT.md con lo que implementamos hoy"

Y pegá la sección actualizada acá.

---

## Historial de decisiones técnicas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| TypeORM en lugar de Prisma | Prisma 6/7 | Prisma intentaba controlar toda la BD legacy y fallaba con `db push` |
| Puerto fijo 1433 sin `instanceName` | `instanceName: SQLEXPRESS` | En tedious, `instanceName` y `port` son mutuamente excluyentes |
| `encrypt: false` en options | `trustServerCertificate: true` solo | SQL Server Express usa certificado autofirmado que Node.js rechaza |
| Usuario SQL `siam_user` | Windows Authentication | `tedious` tiene soporte limitado para NTLM en entornos no corporativos |
| `synchronize: false` siempre | `synchronize: true` | La BD tiene datos reales, nunca permitir que TypeORM la modifique automáticamente |
