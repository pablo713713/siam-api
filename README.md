# SIAM API

API REST del Sistema Integral de Administración y Mercadería, construida con NestJS + TypeORM + SQL Server.

---

## Stack

- NestJS 11
- TypeScript
- SQL Server (base de datos legacy BDSIAM)
- TypeORM
- JWT Authentication
- class-validator / class-transformer
- pnpm

---

## Requisitos previos

Antes de clonar el proyecto, asegurate de tener instalado:

- **Node.js** v18 o superior → https://nodejs.org
- **pnpm** → se instala después de Node (ver paso 1)
- **SQL Server Management Studio (SSMS)** con acceso a la BD `BDSIAM`
- **Git** → https://git-scm.com

---

## Paso 1 — Instalar pnpm

Abrí PowerShell **como Administrador** y ejecutá:

```powershell
iwr https://get.pnpm.io/install.ps1 -useb | iex
```

Cerrá y abrí una terminal nueva. Verificá:

```powershell
pnpm -v
```

---

## Paso 2 — Configurar SQL Server

### 2.1 Habilitar TCP/IP en SQL Server

Esto es obligatorio. Por defecto SQL Server Express usa named pipes y no acepta conexiones por red.

1. Abrí **SQL Server Configuration Manager** desde el menú inicio
2. Navegá a: `SQL Server Network Configuration → Protocols for SQLEXPRESS`
3. Hacé doble click en **TCP/IP** → cambiá **Enabled** a **Yes**
4. En la misma ventana, andá a la pestaña **IP Addresses**
5. Bajá hasta **IPAll** → en **TCP Port** escribí `1433` → dejá **TCP Dynamic Ports** vacío
6. Hacé click en OK
7. Andá a `SQL Server Services → SQL Server (SQLEXPRESS)` → click derecho → **Restart**

Verificá que funciona:

```powershell
sqlcmd -S localhost,1433 -Q "SELECT @@SERVERNAME"
```

Debe devolver el nombre del servidor sin errores.

### 2.2 Habilitar SQL Server Authentication

1. Abrí SSMS y conectate con **Windows Authentication**
2. Click derecho en el servidor (raíz del árbol) → **Properties**
3. Andá a **Security**
4. Seleccioná **SQL Server and Windows Authentication mode**
5. Hacé click en OK
6. Reiniciá el servicio SQL Server desde Configuration Manager (igual que el paso anterior)

### 2.3 Crear usuario de aplicación

En SSMS, abrí una **New Query** y ejecutá:

```sql
-- Crear el login
CREATE LOGIN siam_user WITH PASSWORD = 'Siam2024!';

-- Darle acceso a la BD
USE BDSIAM;
CREATE USER siam_user FOR LOGIN siam_user;

-- Darle permisos completos
ALTER ROLE db_owner ADD MEMBER siam_user;
```

Verificá que el usuario funciona conectándote en SSMS con:
- **Authentication:** SQL Server Authentication
- **Login:** siam_user
- **Password:** Siam2024!

## Full-Text Search — Búsqueda de productos

La búsqueda de productos (`/api/productos/search` y `/api/productos/search/advanced`) usa **SQL Server Full-Text Search** en lugar de `LIKE '%texto%'` por rendimiento. Con ~35,000 productos y ~53,000 registros en `PROV_PRO`, `LIKE` con comodín al inicio obligaba a un table scan completo en cada búsqueda, lo cual era notablemente lento en equipos menos potentes.

**Esto es un requisito de instalación**: si alguien levanta el proyecto desde cero en otra máquina, debe instalar Full-Text Search y crear estos índices antes de que la búsqueda de productos funcione.

### 1. Verificar si Full-Text Search ya está instalado

```sql
SELECT SERVERPROPERTY('IsFullTextInstalled') as FullTextInstalado
```

Si devuelve `1`, ya está instalado y se puede saltar al paso 3. Si devuelve `0` o `NULL`, seguir con el paso 2.

### 2. Instalar Full-Text Search (solo si no está instalado)

1. Descargar el instalador de SQL Server Express de la misma versión que la instancia existente desde `https://www.microsoft.com/es-es/sql-server/sql-server-downloads`.
2. Ejecutar el instalador y elegir **"Custom"** (no "Basic").
3. En el SQL Server Installation Center, elegir **"Nueva instalación independiente de SQL Server o agregar características a una instalación existente"**.
4. Seleccionar **"Agregar características a una instancia existente"** y elegir la instancia `SQLEXPRESS`.
5. En la pantalla de Features, marcar únicamente **"Full-Text and Semantic Extractions for Search"**.
6. Completar el wizard (el servicio de SQL Server se reinicia brevemente, no afecta los datos).
7. Verificar de nuevo con la query del paso 1 — debe devolver `1`.

No afecta ni modifica la base de datos legacy de ninguna forma; es un componente adicional del motor.

### 3. Crear el catálogo y los índices Full-Text

Ejecutar en SSMS sobre la base `BDSIAM`, en orden:

```sql
-- Catálogo (contenedor de los índices)
CREATE FULLTEXT CATALOG ftCatalogSiam AS DEFAULT;
GO

-- Índice en PRODUCTO (DESC_PRO y COD_PRO)
CREATE FULLTEXT INDEX ON PRODUCTO(DESC_PRO, COD_PRO)
KEY INDEX PK__PRODUCTO__20AF98FDF84FA07C
ON ftCatalogSiam
WITH STOPLIST = OFF;
GO

-- Índice en MARCA (NOM_MARCA)
CREATE FULLTEXT INDEX ON MARCA(NOM_MARCA)
KEY INDEX PK__MARCA__0CBAE877
ON ftCatalogSiam
WITH STOPLIST = OFF;
GO

-- Índice en MODELO (NOM_MODELO)
CREATE FULLTEXT INDEX ON MODELO(NOM_MODELO)
KEY INDEX PK__MODELO__0EA330E9
ON ftCatalogSiam
WITH STOPLIST = OFF;
GO
```

`WITH STOPLIST = OFF` es importante: evita que SQL Server ignore palabras consideradas "comunes" (artículos, preposiciones), lo que podría omitir resultados válidos en descripciones de productos.

Si los nombres de los índices PK (`PK__PRODUCTO__...`, `PK__MARCA__...`, `PK__MODELO__...`) son distintos en otra instancia, obtenerlos con:

```sql
SELECT t.name AS tabla, i.name AS indice
FROM sys.indexes i
INNER JOIN sys.tables t ON t.object_id = i.object_id
WHERE i.is_primary_key = 1
AND t.name IN ('PRODUCTO', 'MARCA', 'MODELO')
```

### 4. Verificar que los índices quedaron activos

```sql
SELECT 
  OBJECT_NAME(object_id) as tabla,
  is_enabled
FROM sys.fulltext_indexes
```

Debe devolver `PRODUCTO`, `MARCA` y `MODELO` con `is_enabled = 1`.

### Notas sobre el uso en el backend

Las queries usan `CONTAINS(columna, '"texto*"')` en lugar de `LIKE '%texto%'`. La sintaxis con comillas y asterisco (`"texto*"`) es búsqueda por prefijo de palabra — encuentra cualquier palabra que *empiece* con ese texto, no cualquier substring en cualquier posición como hacía `LIKE`. En la práctica cubre el mismo caso de uso (buscar "SUSP" encuentra "SUSPENSIÓN"), y además es case-insensitive y accent-insensitive sin necesidad de `COLLATE` explícito.

---

## Paso 3 — Clonar e instalar

```powershell
git clone https://github.com/TU_USUARIO/siam-api.git
cd siam-api
pnpm install
```

Si pnpm pide aprobar build scripts:

```powershell
pnpm approve-builds
```

Seleccioná todos con espacio y confirmá con Enter.

---

## Paso 4 — Variables de entorno

Creá el archivo `.env` en la raíz del proyecto:

```dotenv
DB_HOST=localhost
DB_PORT=1433
DB_NAME=BDSIAM
DB_USER=siam_user
DB_PASSWORD=Siam2024!
JWT_SECRET=siam_secret_super_seguro
PORT=3000
NODE_ENV=development
```

> El archivo `.env` está en `.gitignore` y nunca se sube al repositorio.
> Usá `.env.example` como referencia (ya incluido en el repo).

---

## Paso 5 — Levantar el proyecto

```powershell
pnpm start:dev
```

Si todo está bien, deberías ver:

```
[Nest] LOG [NestApplication] Nest application successfully started
```

### Verificar que funciona

En Postman o el navegador, escribí la URL **a mano** (no copies y pegues para evitar caracteres invisibles):

```
GET http://localhost:3000/api/health
```

Respuesta esperada:

```json
{
  "status": "ok",
  "timestamp": "2026-..."
}
```

---

## Scripts disponibles

```powershell
pnpm start:dev      # desarrollo con hot reload
pnpm start          # producción
pnpm build          # compilar
pnpm lint           # linter
pnpm test           # tests unitarios
pnpm test:e2e       # tests end-to-end
pnpm test:cov       # cobertura
```

---

## Estructura del proyecto

```
src/
├── app.module.ts           # Módulo raíz, solo compone módulos
├── app.controller.ts       # Health check
├── main.ts                 # Bootstrap
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
    │   ├── auth.module.ts
    │   ├── auth.controller.ts
    │   ├── auth.service.ts
    │   ├── dto/
    │   └── strategies/
    │
    ├── roles/
    │   ├── roles.module.ts
    │   ├── roles.controller.ts
    │   ├── roles.service.ts
    │   ├── dto/
    │   └── entities/
    │
    └── [dominio]/
        ├── [dominio].module.ts
        ├── [dominio].controller.ts
        ├── [dominio].service.ts
        ├── dto/
        └── entities/
```

---

## Reglas del proyecto

- Los controllers nunca contienen lógica de negocio
- Toda la lógica vive en services
- Todos los endpoints usan DTOs con class-validator
- No usar `any`
- Mantener tipado fuerte
- Separación estricta por dominio
- Cada módulo debe ser autocontenido
- Ver `CONTEXT.md` para guía completa de arquitectura y colaboración

---

## Notas importantes sobre la BD

Este proyecto trabaja sobre una base de datos legacy (`BDSIAM`). Las reglas son:

- **NO** modificar tablas existentes
- **NO** agregar columnas a tablas existentes
- **NO** agregar Foreign Keys en tablas existentes apuntando a tablas nuevas
- **SÍ** crear nuevas tablas satélite con FK apuntando hacia las tablas legacy
- Las tablas nuevas tienen el prefijo `SISTEMA_` para distinguirlas

---

## Problemas frecuentes

**pnpm no se reconoce después de instalar**
Cerrá y abrí una terminal nueva para recargar el PATH.

**Error de build scripts bloqueados**
Ejecutá `pnpm approve-builds` y aprobá todos.

**Error `self-signed certificate`**
Verificá que en `app.module.ts` estén presentes `encrypt: false` y `cryptoCredentialsDetails: { rejectUnauthorized: false }` dentro de `options`.

**Error `Failed to connect to localhost\SQLEXPRESS`**
Significa que SQL Server usa named pipes. Seguí el Paso 2.1 para habilitar TCP/IP.

**Error `Cannot GET /api/health%0A`**
El `%0A` es un salto de línea invisible. Escribí la URL a mano en Postman, no la copies y pegues.
