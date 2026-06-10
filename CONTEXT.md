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
    ├── productos/
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

### Tablas satélite creadas

| Tabla nueva | Apunta a | Propósito |
|---|---|---|
| `SISTEMA_ROLES` | — | Catálogo de roles del sistema |
| `SISTEMA_USUARIO_ROL` | `USUARIO.COD_USU` | Asignación de roles a usuarios |
| `CLIENTE_EXTENSION` | `CLIENTE.cod_cli` | Datos extendidos de clientes |

---

## Épicas y estado actual

### ÉPICA 1 — Infraestructura y base de datos ✅

**HU-0 — Inicialización del proyecto** ✅
- Proyecto NestJS creado con pnpm
- TypeORM configurado con SQL Server (ver sección de configuración de BD)
- Conexión a BDSIAM funcionando
- Health check en `GET /api/health`
- Repositorio en GitHub

**HU-1.01 — Tablas satélite de usuarios** ✅
- Script SQL ejecutado en SSMS
- Tablas creadas: `SISTEMA_ROLES`, `SISTEMA_USUARIO_ROL`
- Entities TypeORM mapeadas

**HU-1.02 — Tabla satélite de clientes** ✅
- Script SQL ejecutado en SSMS
- Tabla creada: `CLIENTE_EXTENSION`
- Entity TypeORM mapeada

---

### ÉPICA 2 — Gestión de usuarios y roles ✅

**HU-2.01 — CRUD de roles** ✅
- `POST /api/roles` — crear rol
- `GET /api/roles/:id` — obtener rol por ID
- `PUT /api/roles/:id` — actualizar rol
- `DELETE /api/roles/:id` — desactivar rol (soft delete via campo `activo`)

**HU-2.02 — Listar roles** ✅
- `GET /api/roles` — lista todos los roles ordenados por nombre

**HU-2.03 — Asignar rol a usuario** ✅
- `POST /api/roles/asignar` — asigna o actualiza rol de un usuario
- `GET /api/roles/usuario/:cod_usu` — obtiene el rol actual de un usuario
- Si el usuario ya tiene rol, se reemplaza (no duplica)

**HU-2.04 — Autenticación con roles** ✅
- `POST /api/auth/login` — login con alias + contraseña
- Valida contra tabla legacy `USUARIO` (contraseñas en texto plano — sistema legacy)
- Hace JOIN con `SISTEMA_USUARIO_ROL` y `SISTEMA_ROLES`
- Devuelve JWT con payload: `{ cod_usu, alias, nombre, apellido, rol, id_rol }`
- Token expira en 8 horas
- Estrategia JWT implementada con `passport-jwt`

---

### ÉPICA 3 — Búsqueda de productos ✅

**HU-3.01 — Búsqueda básica de productos** ✅
- `GET /api/productos/search?q=termino&limit=20`
- Búsqueda parcial (LIKE) en `DESC_PRO` y `COD_PRO` de tabla legacy `PRODUCTO`
- Parámetro `q` requerido — devuelve 400 si está vacío
- Parámetro `limit` opcional, default 20
- Usa QueryBuilder con variables parametrizadas (previene SQL Injection)

**HU-3.02 — Búsqueda por código exclusivo** ✅
- `GET /api/productos/search/codigo?q=termino`
- Extiende búsqueda a tabla `PROV_PRO`: campos `COD_FAB`, `barra`, `COD_ANT`
- Usa `MAX()` en QueryBuilder para evitar duplicados en relación 1:N entre `PRODUCTO` y `PROV_PRO`
- Expone `codFab`, `barra`, `codAnt` en la respuesta

**HU-3.03 — Búsqueda avanzada unificada** ✅
- `GET /api/productos/search/advanced?q=termino&codigo=X&page=1&limit=20`
- Combina filtros de nombre y código en un solo endpoint
- Paginación nativa con `page` y `limit`
- Devuelve estructura con `data` y `meta` (total, page, limit, totalPages)
- Usa `COUNT(DISTINCT producto.ID_PRO)` para calcular total real sin duplicados

---

### ÉPICA 4 — Stock y Kardex de productos ✅

**HU-4.01 — Stock actualizado por sucursal** ✅
- `GET /api/productos/:id/stock`
- Cruza `SUC_PRO_PROV` con `SUCURSAL` para obtener inventario físico y virtual desglosado por locación
- `ParseIntPipe` en el parámetro `:id`
- Devuelve 404 si el producto no existe

**HU-4.02 — Historial de ingresos** ✅
- `GET /api/productos/:id/ingresos`
- Consolida cronológicamente movimientos de entrada fusionando `IMPORTACION` (compras) e `INVENTARIO` (solo ajustes positivos)

**HU-4.03 — Historial de salidas** ✅
- `GET /api/productos/:id/salidas`
- Consolida egresos de `VENTA`, `CREDITO` y `PEDIDO` (este último filtrado solo por cantidad realmente enviada)

**HU-4.04 — Kardex unificado** ✅
- `GET /api/productos/:id/kardex`
- Reutiliza los servicios de HU-4.01, 4.02 y 4.03
- Genera array cronológico unificado de ingresos y salidas
- Calcula saldo acumulado por movimiento mediante ingeniería inversa matemática tomando como base el stock físico actual

### ÉPICA 5 — Gestión de clientes ✅

**HU-5.01 — Perfil combinado del cliente** ✅
- `GET /api/clientes/:cod_cli/perfil`
- Cruza tabla legacy `CLIENTE` con `CLIENTE_EXTENSION`
- Si no existe extensión devuelve valores por defecto (`acepta_devoluciones: false`, resto null/0)

**HU-5.02 — Actualizar extensión del cliente** ✅
- `PUT /api/clientes/:cod_cli/extension`
- Upsert sobre `CLIENTE_EXTENSION` (inserta si no existe, actualiza si existe)
- Campos: `acepta_devoluciones`, `limite_credito`, `nivel_fidelidad`, `observaciones`

**HU-5.03 — Historial de compras del cliente** ✅
- `GET /api/clientes/:cod_cli/historial-compras`
- Combina `VENTA` (campo fecha: `FECHA`) y `CREDITO` (campo fecha: `FEC_INICIO`)
- Ordena cronológicamente descendente y devuelve tipo, fecha, monto y estado

---

### ÉPICA 6 — Reportes financieros ✅

**HU-6.01 — Ingresos totales** ✅
- `GET /api/reportes/ingresos?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`
- Suma `VENTA` (estado `C`) y `CREDITO` (estado `C`) en rango de fechas
- Devuelve totales separados por tipo y total bruto combinado

**HU-6.02 — Costo de mercancía vendida** ✅
- `GET /api/reportes/costos?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`
- Cruza `DET_VENTA`/`DET_CREDITO` con `PROV_PRO` usando `ID_FAB`
- Campo de costo: `CIF_CBBA` (no existe `PRECIO_COSTO` en la BD)

**HU-6.03 — Ganancia neta** ✅
- `GET /api/reportes/ganancia?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD`
- Orquesta HU-6.01 y HU-6.02 con `Promise.all`
- Devuelve `ingresos_brutos`, `costo_mercancia`, `ganancia_neta` y `margen_porcentaje`

### ÉPICA 7 — Devoluciones y Ajustes ✅

**HU-D.01 — Registrar devolución parcial** ✅
- `POST /api/devoluciones`
- Permite devolver ítems específicos de una venta.
- Verifica la existencia de la venta (`VENTA`) y calcula dinámicamente el total devolviendo el `PRECIO_VENTA` original desde `DET_VENTA`.
- Implementa lógica segura (UPSERT manual) en tablas legacy `DEVOLUCION` y `DET_DEVOLUCION` para evitar violaciones de llaves primarias/únicas en devoluciones múltiples de la misma venta.
- Verifica que la cantidad a devolver no sobrepase la cantidad comprada originalmente menos lo que ya se haya devuelto.
- Revierte el inventario sumando la cantidad devuelta directamente a la sucursal de Motor Zone (`COD_SUC = '00011'`) en la tabla `SUC_PRO_PROV`.

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
  @OneToMany(() => SistemaUsuarioRol, (ur) => ur.rol) usuarioRoles: SistemaUsuarioRol[];
}
```

### SistemaUsuarioRol
```typescript
// modules/roles/entities/sistema-usuario-rol.entity.ts
@Entity('SISTEMA_USUARIO_ROL')
@Unique(['cod_usu', 'id_rol'])
export class SistemaUsuarioRol {
  @PrimaryGeneratedColumn() id: number;
  @Column({ length: 7 }) cod_usu: string;
  @Column() id_rol: number;
  @CreateDateColumn() asignadoAt: Date;
  @ManyToOne(() => SistemaRol, (rol) => rol.usuarioRoles)
  @JoinColumn({ name: 'id_rol' }) rol: SistemaRol;
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

### Usuario (legacy — solo lectura)
```typescript
// modules/auth/entities/usuario.entity.ts
@Entity('USUARIO')
export class Usuario {
  @PrimaryColumn({ length: 7 }) COD_USU: string;
  @Column({ length: 30 }) NOM_USU: string;
  @Column({ length: 30 }) AP_USU: string;
  @Column({ nullable: true, length: 20 }) ALIAS: string;
  @Column({ length: 20, select: false }) CONTRASEÑA: string;  // select:false por seguridad
  @Column({ nullable: true, length: 3 }) COD_CAR: string;
  @Column({ nullable: true, length: 5 }) COD_SUC: string;
  @Column({ nullable: true, length: 1 }) baja: string;        // '0'=activo, '1'=inactivo
  @Column({ nullable: true, length: 100 }) email: string;
}
```

### Producto (legacy — solo lectura)
```typescript
// modules/productos/entities/producto.entity.ts
// Mapea tabla PRODUCTO legacy
// Campos principales: ID_PRO, COD_PRO, DESC_PRO, estado, CODIGO
// Se usa en búsquedas junto a PROV_PRO (COD_FAB, barra, COD_ANT)
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
  "INI": "1"
}
```

---

## Endpoints disponibles

| Método | Ruta | Descripción | Auth |
|---|---|---|---|
| GET | /api/health | Health check | No |
| POST | /api/auth/login | Login | No |
| GET | /api/roles | Listar roles | No* |
| POST | /api/roles | Crear rol | No* |
| GET | /api/roles/:id | Obtener rol | No* |
| PUT | /api/roles/:id | Actualizar rol | No* |
| DELETE | /api/roles/:id | Desactivar rol | No* |
| POST | /api/roles/asignar | Asignar rol a usuario | No* |
| GET | /api/roles/usuario/:cod_usu | Ver rol de usuario | No* |
| GET | /api/productos/search | Búsqueda básica | No* |
| GET | /api/productos/search/codigo | Búsqueda por código | No* |
| GET | /api/productos/search/advanced | Búsqueda avanzada | No* |
| GET | /api/productos/:id/stock | Stock por sucursal | No* |
| GET | /api/productos/:id/ingresos | Historial de ingresos | No* |
| GET | /api/productos/:id/salidas | Historial de salidas | No* |
| GET | /api/productos/:id/kardex | Kardex unificado | No* |
| GET | /api/clientes/:cod_cli/perfil | Perfil combinado del cliente | No* |
| PUT | /api/clientes/:cod_cli/extension | Actualizar extensión del cliente | No* |
| GET | /api/clientes/:cod_cli/historial-compras | Historial de compras | No* |
| GET | /api/reportes/ingresos | Ingresos totales por rango | No* |
| GET | /api/reportes/costos | Costos de mercancía por rango | No* |
| GET | /api/reportes/ganancia | Ganancia neta por rango | No* |

> *Los guards JWT están implementados pero aún no aplicados globalmente. Se aplicarán cuando se definan las rutas protegidas.

---

## Configuración de conexión a BD

```typescript
// La config que funcionó — no modificar sin probar
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

## Cómo agregar un nuevo módulo

```powershell
npx nest g module modules/[nombre]
npx nest g controller modules/[nombre]
npx nest g service modules/[nombre]
```

Registrarlo en `app.module.ts` y agregar sus entities a la lista global de entities en `TypeOrmModule.forRootAsync`.

---

## Cómo usar este documento con la IA

Al iniciar una sesión de trabajo, pegá este documento completo y decile a la IA:

> "Este es el contexto completo del proyecto SIAM. [descripción de lo que querés hacer]"

Al terminar una sesión donde implementaste algo nuevo, pedile a la IA:

> "Actualizá el CONTEXT.md con lo que implementamos hoy"

Para incorporar el trabajo de un compañero, pasale el PR o descripción de lo implementado y pedile:

> "Agregá al CONTEXT.md lo que implementó mi compañero en la ÉPICA X"

---

## Historial de decisiones técnicas

| Decisión | Alternativa descartada | Motivo |
|---|---|---|
| TypeORM en lugar de Prisma | Prisma 6/7 | Prisma intentaba controlar toda la BD legacy y fallaba con `db push` |
| Script SQL directo en SSMS para migraciones | TypeORM migrations CLI | Evita complejidad de datasource config y problemas de PATH con pnpm |
| Puerto fijo 1433 sin `instanceName` | `instanceName: SQLEXPRESS` | En tedious, `instanceName` y `port` son mutuamente excluyentes |
| `encrypt: false` en options | `trustServerCertificate: true` solo | SQL Server Express usa certificado autofirmado que Node.js rechaza |
| Usuario SQL `siam_user` | Windows Authentication | `tedious` tiene soporte limitado para NTLM en entornos no corporativos |
| `synchronize: false` siempre | `synchronize: true` | La BD tiene datos reales, nunca permitir que TypeORM la modifique automáticamente |
| Soft delete en roles (campo `activo`) | Hard delete | Los roles pueden tener usuarios asignados, no se pueden eliminar físicamente |
| `MAX()` en búsqueda de productos | JOIN simple | Evita duplicados en relación 1:N entre PRODUCTO y PROV_PRO |
| Reutilización de services en Kardex | Query única | HU-4.04 reutiliza los services de 4.01, 4.02 y 4.03 para mantener bajo acoplamiento y evitar duplicación de lógica |
| Ingeniería inversa para saldo Kardex | Saldo acumulado directo | La BD legacy no guarda saldo histórico; se calcula hacia atrás desde el stock físico actual |
| `FEC_INICIO` en CREDITO en lugar de `FECHA` | `FECHA` | La tabla CREDITO usa `FEC_INICIO` para la fecha de inicio del crédito, no `FECHA` |
| `CIF_CBBA` como costo en PROV_PRO | `PRECIO_COSTO` | No existe columna `PRECIO_COSTO`; el costo real de importación está en `CIF_CBBA` |
| `Promise.all` en HU-6.03 | Llamadas secuenciales | Ejecuta ingresos y costos en paralelo para reducir tiempo de respuesta |