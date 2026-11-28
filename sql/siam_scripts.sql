/* =============================================================================
   SIAM — Scripts de base de datos (BDSIAM)
   -----------------------------------------------------------------------------
   Archivo único con TODOS los scripts propios del sistema nuevo, en el orden
   en que deben ejecutarse. Cada bloque se puede ejecutar más de una vez sin
   error (solo crea lo que falta).

   Regla de oro del proyecto: las tablas nuevas llevan prefijo SISTEMA_ y las
   FK van solo desde las tablas nuevas hacia las legacy. Ningún script de este
   archivo modifica tablas legacy.

   Al agregar un script nuevo: añadirlo AL FINAL como un bloque numerado y
   anotarlo en el índice.

   Índice
     1. Roles para traspasos (Encargado de Almacen, Vendedor)
     2. SISTEMA_TRASPASO_AUTORIZACION (firma digital de traspasos)
     3. Ejemplo: asignar rol y almacén a un encargado (comentado)
     4. Tipo de traspaso DEVOLUCION (actualiza CK_STA_TIPO)
     5. SISTEMA_TRASPASO_DET (cantidades vendidas / devueltas por producto)
     6. SISTEMA_TRASPASO_VENTA (en qué venta o crédito salió cada producto)
     7. SISTEMA_PRODUCTO_AUDITORIA (creación y edición de productos)
     8. CANT_ANULADA en SISTEMA_TRASPASO_VENTA (anulación de ventas)
     9. SISTEMA_DEVOLUCION_REGISTRO (devoluciones firmadas y cambios de producto)
    10. SISTEMA_AUDITORIA (auditoría general: ventas, créditos, pagos, devoluciones,
        tipo de cambio, roles, almacenes, clientes y usuarios)
    11. Estados de las salidas: COMPLETADO / PARCIAL / DEVUELTO (sin seguimiento de venta)
   ============================================================================= */

/* =============================================================================
   1. Roles para traspasos
     - Encargado de Almacen: registra traspasos desde el/los almacén(es) que
       tiene asignados en SISTEMA_USUARIO_ALMACEN.
     - Vendedor: firma las salidas a venta (almacén de tienda -> MOTOR ZONE).
   ============================================================================= */

IF NOT EXISTS (SELECT 1 FROM dbo.SISTEMA_ROLES WHERE nombre = 'Encargado de Almacen')
    INSERT INTO dbo.SISTEMA_ROLES (nombre, descripcion, activo, createdAt, updatedAt)
    VALUES ('Encargado de Almacen',
            'Registra traspasos desde los almacenes que tiene asignados',
            1, GETDATE(), GETDATE());

IF NOT EXISTS (SELECT 1 FROM dbo.SISTEMA_ROLES WHERE nombre = 'Vendedor')
    INSERT INTO dbo.SISTEMA_ROLES (nombre, descripcion, activo, createdAt, updatedAt)
    VALUES ('Vendedor',
            'Vende y firma la salida de productos de los almacenes de la tienda',
            1, GETDATE(), GETDATE());
GO

/* =============================================================================
   2. SISTEMA_TRASPASO_AUTORIZACION
   Firma digital de traspasos entre almacenes (reemplaza el talonario físico).

   Tipos (los calcula el backend según origen y destino, no los elige el usuario):
     INGRESO_TIENDA   almacén FUERA de la tienda  -> almacén DENTRO de la tienda.
                      Firma el mismo encargado que registra (con su contraseña).
     SALIDA_VENTA     almacén DENTRO de la tienda -> principal (MOTOR ZONE 00011)
                      para vender. Firma el VENDEDOR que se lleva el producto.
     ENTRE_ALMACENES  cualquier otro traspaso. Firma el encargado que registra.
     DEVOLUCION       regreso al almacén de origen de lo que no se vendió de una
                      SALIDA_VENTA (ver bloque 4). Firma el encargado que recibe.

   Fecha y hora:
     Las calcula SQL Server desde su hora UTC menos 4 horas (Bolivia es UTC-4
     todo el año, sin horario de verano). No dependen de la PC del usuario ni
     de la zona horaria del servidor, y el backend no las recibe del cliente.
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_TRASPASO_AUTORIZACION', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_TRASPASO_AUTORIZACION (
        ID_TA              INT IDENTITY(1,1) NOT NULL,
        COD_REM            VARCHAR(16)  NOT NULL,   -- REMISION_S.COD_REM (salida)
        COD_REM_E          VARCHAR(16)  NULL,       -- REMISION_E.COD_REM (entrada)
        TIPO               VARCHAR(16)  NOT NULL,   -- INGRESO_TIENDA | SALIDA_VENTA | ENTRE_ALMACENES
        SUC_ORI            VARCHAR(5)   NOT NULL,   -- almacén de origen
        SUC_DES            VARCHAR(5)   NOT NULL,   -- almacén de destino
        COD_USU_ENCARGADO  VARCHAR(7)   NOT NULL,   -- quien registra y autoriza (usuario del token)
        COD_USU_FIRMANTE   VARCHAR(7)   NOT NULL,   -- quien firma: el vendedor (SALIDA_VENTA) o el propio encargado

        -- Hora local de Bolivia generada por el servidor de BD (no editable desde la app)
        FECHA_HORA         DATETIME2(0) NOT NULL
            CONSTRAINT DF_STA_FECHA_HORA DEFAULT (DATEADD(HOUR, -4, SYSUTCDATETIME())),
        FECHA              AS CAST(FECHA_HORA AS DATE)    PERSISTED,
        HORA               AS CAST(FECHA_HORA AS TIME(0)) PERSISTED,

        -- SALIDA_VENTA: COMPLETADO -> PARCIAL | DEVUELTO (bloque 11)
        -- Otros tipos:  COMPLETADO
        ESTADO             VARCHAR(10)  NOT NULL,
        ID_TA_ORIGEN       INT          NULL,       -- en una devolución: el traspaso que se devuelve
        COD_VENTA          VARCHAR(18)  NULL,       -- venta en la que salió el producto
        OBS                VARCHAR(512) NULL,

        CONSTRAINT PK_SISTEMA_TRASPASO_AUTORIZACION PRIMARY KEY (ID_TA),
        CONSTRAINT CK_STA_TIPO   CHECK (TIPO IN ('INGRESO_TIENDA', 'SALIDA_VENTA', 'ENTRE_ALMACENES', 'DEVOLUCION')),
        CONSTRAINT CK_STA_ESTADO CHECK (ESTADO IN ('PENDIENTE', 'VENDIDO', 'DEVUELTO', 'COMPLETADO')),
        -- En una salida a venta firman dos personas distintas
        CONSTRAINT CK_STA_FIRMANTE CHECK (TIPO <> 'SALIDA_VENTA' OR COD_USU_FIRMANTE <> COD_USU_ENCARGADO),

        CONSTRAINT FK_STA_REMISION_S FOREIGN KEY (COD_REM)           REFERENCES dbo.REMISION_S (COD_REM),
        CONSTRAINT FK_STA_SUC_ORI    FOREIGN KEY (SUC_ORI)           REFERENCES dbo.SUCURSAL (COD_SUC),
        CONSTRAINT FK_STA_SUC_DES    FOREIGN KEY (SUC_DES)           REFERENCES dbo.SUCURSAL (COD_SUC),
        CONSTRAINT FK_STA_ENCARGADO  FOREIGN KEY (COD_USU_ENCARGADO) REFERENCES dbo.USUARIO (COD_USU),
        CONSTRAINT FK_STA_FIRMANTE   FOREIGN KEY (COD_USU_FIRMANTE)  REFERENCES dbo.USUARIO (COD_USU),
        CONSTRAINT FK_STA_ORIGEN     FOREIGN KEY (ID_TA_ORIGEN)      REFERENCES dbo.SISTEMA_TRASPASO_AUTORIZACION (ID_TA),
        CONSTRAINT UQ_STA_COD_REM    UNIQUE (COD_REM)
    );

    CREATE INDEX IX_STA_FIRMANTE_ESTADO ON dbo.SISTEMA_TRASPASO_AUTORIZACION (COD_USU_FIRMANTE, ESTADO);
    CREATE INDEX IX_STA_FECHA           ON dbo.SISTEMA_TRASPASO_AUTORIZACION (FECHA);
END
GO

-- Comprobación: debe mostrar la hora actual de Bolivia
-- SELECT DATEADD(HOUR, -4, SYSUTCDATETIME()) AS hora_bolivia;

/* =============================================================================
   3. Ejemplo: asignar un encargado a su almacén (cambiar los códigos reales)
   Descomentar y ejecutar por cada encargado. También se puede hacer desde
   POST /api/roles/asignar y POST /api/almacenes/asignar.
   ============================================================================= */

-- -- Rol
-- INSERT INTO dbo.SISTEMA_USUARIO_ROL (cod_usu, id_rol, asignadoAt)
-- SELECT '0000123', id, GETDATE() FROM dbo.SISTEMA_ROLES WHERE nombre = 'Encargado de Almacen';
--
-- -- Almacén que maneja
-- INSERT INTO dbo.SISTEMA_USUARIO_ALMACEN (cod_usu, cod_suc, activo, createdAt)
-- VALUES ('0000123', '00005', 1, GETDATE());
--
-- -- Vendedor (para que aparezca en el combo de firma)
-- INSERT INTO dbo.SISTEMA_USUARIO_ROL (cod_usu, id_rol, asignadoAt)
-- SELECT '0000456', id, GETDATE() FROM dbo.SISTEMA_ROLES WHERE nombre = 'Vendedor';

/* =============================================================================
   4. Tipo de traspaso DEVOLUCION
   Para instalaciones donde la tabla del bloque 2 ya existía: vuelve a crear
   CK_STA_TIPO aceptando también 'DEVOLUCION'.
   ============================================================================= */

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_STA_TIPO'
             AND parent_object_id = OBJECT_ID('dbo.SISTEMA_TRASPASO_AUTORIZACION')
             AND definition NOT LIKE '%DEVOLUCION%')
BEGIN
    ALTER TABLE dbo.SISTEMA_TRASPASO_AUTORIZACION DROP CONSTRAINT CK_STA_TIPO;
    ALTER TABLE dbo.SISTEMA_TRASPASO_AUTORIZACION ADD CONSTRAINT CK_STA_TIPO
        CHECK (TIPO IN ('INGRESO_TIENDA', 'SALIDA_VENTA', 'ENTRE_ALMACENES', 'DEVOLUCION'));
END
GO

/* =============================================================================
   5. SISTEMA_TRASPASO_DET
   Por cada producto de una SALIDA_VENTA: cuánto se llevó el vendedor, cuánto
   ya vendió y cuánto devolvió al almacén de origen. El estado del traspaso
   sale de aquí:
     PENDIENTE  queda algo sin vender ni devolver
     VENDIDO    todo resuelto y al menos una unidad vendida
     DEVUELTO   todo resuelto y nada vendido (todo volvió al almacén)
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_TRASPASO_DET', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_TRASPASO_DET (
        ID_TAD         INT IDENTITY(1,1) NOT NULL,
        ID_TA          INT          NOT NULL,   -- SISTEMA_TRASPASO_AUTORIZACION
        ID_FAB         INT          NOT NULL,   -- PROV_PRO.ID_FAB
        COD_FAB        VARCHAR(50)  NOT NULL,
        CANTIDAD       INT          NOT NULL,   -- unidades que se llevó
        CANT_VENDIDA   INT          NOT NULL CONSTRAINT DF_STD_VENDIDA  DEFAULT (0),
        CANT_DEVUELTA  INT          NOT NULL CONSTRAINT DF_STD_DEVUELTA DEFAULT (0),

        CONSTRAINT PK_SISTEMA_TRASPASO_DET PRIMARY KEY (ID_TAD),
        CONSTRAINT UQ_STD_TA_FAB UNIQUE (ID_TA, ID_FAB),
        CONSTRAINT CK_STD_CANTIDADES CHECK (
            CANTIDAD > 0 AND CANT_VENDIDA >= 0 AND CANT_DEVUELTA >= 0
            AND CANT_VENDIDA + CANT_DEVUELTA <= CANTIDAD),
        CONSTRAINT FK_STD_TA  FOREIGN KEY (ID_TA)  REFERENCES dbo.SISTEMA_TRASPASO_AUTORIZACION (ID_TA),
        CONSTRAINT FK_STD_FAB FOREIGN KEY (ID_FAB) REFERENCES dbo.PROV_PRO (ID_FAB)
    );

    CREATE INDEX IX_STD_FAB ON dbo.SISTEMA_TRASPASO_DET (ID_FAB);
END
GO

-- Detalle de las salidas a venta registradas antes de existir esta tabla
INSERT INTO dbo.SISTEMA_TRASPASO_DET (ID_TA, ID_FAB, COD_FAB, CANTIDAD)
SELECT ta.ID_TA, ds.ID_FAB, MAX(ds.COD_FAB), SUM(ds.CANTIDAD)
FROM dbo.SISTEMA_TRASPASO_AUTORIZACION ta
INNER JOIN dbo.DET_REMIS ds ON ds.COD_REM = ta.COD_REM
WHERE ta.TIPO = 'SALIDA_VENTA'
  AND ds.CANTIDAD > 0
  AND NOT EXISTS (SELECT 1 FROM dbo.SISTEMA_TRASPASO_DET d WHERE d.ID_TA = ta.ID_TA)
GROUP BY ta.ID_TA, ds.ID_FAB;
GO

/* =============================================================================
   6. SISTEMA_TRASPASO_VENTA
   Rastro de en qué venta (o crédito) salió cada producto de una SALIDA_VENTA.
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_TRASPASO_VENTA', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_TRASPASO_VENTA (
        ID_TV       INT IDENTITY(1,1) NOT NULL,
        ID_TAD      INT          NOT NULL,   -- SISTEMA_TRASPASO_DET
        TIPO_DOC    VARCHAR(7)   NOT NULL,   -- VENTA | CREDITO
        COD_DOC     VARCHAR(18)  NOT NULL,   -- VENTA.COD_VENTA o CREDITO.COD_CRE
        CANTIDAD    INT          NOT NULL,
        FECHA_HORA  DATETIME2(0) NOT NULL
            CONSTRAINT DF_STV_FECHA_HORA DEFAULT (DATEADD(HOUR, -4, SYSUTCDATETIME())),

        CONSTRAINT PK_SISTEMA_TRASPASO_VENTA PRIMARY KEY (ID_TV),
        CONSTRAINT CK_STV_TIPO_DOC CHECK (TIPO_DOC IN ('VENTA', 'CREDITO')),
        CONSTRAINT CK_STV_CANTIDAD CHECK (CANTIDAD > 0),
        CONSTRAINT FK_STV_TAD FOREIGN KEY (ID_TAD) REFERENCES dbo.SISTEMA_TRASPASO_DET (ID_TAD)
    );

    CREATE INDEX IX_STV_TAD ON dbo.SISTEMA_TRASPASO_VENTA (ID_TAD);
    CREATE INDEX IX_STV_DOC ON dbo.SISTEMA_TRASPASO_VENTA (TIPO_DOC, COD_DOC);
END
GO

/* =============================================================================
   7. SISTEMA_PRODUCTO_AUDITORIA
   Rastro de auditoría de productos: quién creó o editó un producto, cuándo
   (hora de Bolivia generada por SQL Server) y los datos antes y después.
   DATOS_ANTERIORES y DATOS_NUEVOS guardan el producto en formato JSON.
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_PRODUCTO_AUDITORIA', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_PRODUCTO_AUDITORIA (
        ID_PA             INT IDENTITY(1,1) NOT NULL,
        ACCION            VARCHAR(6)    NOT NULL,   -- CREAR | EDITAR
        ID_PRO            INT           NOT NULL,   -- PRODUCTO.ID_PRO
        ID_FAB            INT           NOT NULL,   -- PROV_PRO.ID_FAB
        COD_FAB           VARCHAR(50)   NOT NULL,   -- copia para buscar sin JOIN
        DESC_PRO          VARCHAR(150)  NOT NULL,   -- descripción al momento del cambio
        COD_USU           VARCHAR(7)    NOT NULL,   -- quien hizo el cambio
        COD_EMP           VARCHAR(3)    NOT NULL,

        FECHA_HORA        DATETIME2(0)  NOT NULL
            CONSTRAINT DF_SPA_FECHA_HORA DEFAULT (DATEADD(HOUR, -4, SYSUTCDATETIME())),
        FECHA             AS CAST(FECHA_HORA AS DATE)    PERSISTED,
        HORA              AS CAST(FECHA_HORA AS TIME(0)) PERSISTED,

        CAMPOS            VARCHAR(500)  NULL,       -- campos modificados, separados por coma
        DATOS_ANTERIORES  NVARCHAR(MAX) NULL,       -- JSON; NULL al crear
        DATOS_NUEVOS      NVARCHAR(MAX) NOT NULL,   -- JSON

        CONSTRAINT PK_SISTEMA_PRODUCTO_AUDITORIA PRIMARY KEY (ID_PA),
        CONSTRAINT CK_SPA_ACCION CHECK (ACCION IN ('CREAR', 'EDITAR')),
        CONSTRAINT FK_SPA_PRODUCTO FOREIGN KEY (ID_PRO)  REFERENCES dbo.PRODUCTO (ID_PRO),
        CONSTRAINT FK_SPA_PROV_PRO FOREIGN KEY (ID_FAB)  REFERENCES dbo.PROV_PRO (ID_FAB),
        CONSTRAINT FK_SPA_USUARIO  FOREIGN KEY (COD_USU) REFERENCES dbo.USUARIO (COD_USU)
    );

    CREATE INDEX IX_SPA_FECHA  ON dbo.SISTEMA_PRODUCTO_AUDITORIA (FECHA);
    CREATE INDEX IX_SPA_ID_FAB ON dbo.SISTEMA_PRODUCTO_AUDITORIA (ID_FAB);
END
GO

/* =============================================================================
   8. CANT_ANULADA en SISTEMA_TRASPASO_VENTA
   Al anular una venta, lo que había salido de una salida a venta vuelve a su
   almacén de origen. Aquí queda cuántas unidades de ese registro se anularon
   (el registro no se borra: se conserva el rastro de la venta original).
   ============================================================================= */

IF COL_LENGTH('dbo.SISTEMA_TRASPASO_VENTA', 'CANT_ANULADA') IS NULL
BEGIN
    ALTER TABLE dbo.SISTEMA_TRASPASO_VENTA
        ADD CANT_ANULADA INT NOT NULL CONSTRAINT DF_STV_ANULADA DEFAULT (0);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_STV_ANULADA')
BEGIN
    ALTER TABLE dbo.SISTEMA_TRASPASO_VENTA
        ADD CONSTRAINT CK_STV_ANULADA CHECK (CANT_ANULADA >= 0 AND CANT_ANULADA <= CANTIDAD);
END
GO

/* =============================================================================
   9. SISTEMA_DEVOLUCION_REGISTRO
   Una fila por producto en cada devolución (de contado o de crédito).
   Las filas de una misma operación comparten ID_GRUPO. Guarda lo que la BD
   legacy no guarda:
     - quién la registró y qué vendedor la firmó con su contraseña
     - fecha y hora de Bolivia de cada devolución (DET_DEVOLUCION acumula)
     - a qué almacén reingresó cada producto (para el kardex)
     - en un cambio de producto (parte 5): los productos que el cliente se
       lleva (MOVIMIENTO = 'LLEVA') y la venta que se generó (COD_VENTA_CAMBIO)
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_DEVOLUCION_REGISTRO', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_DEVOLUCION_REGISTRO (
        ID_DR             INT IDENTITY(1,1) NOT NULL,
        ID_GRUPO          UNIQUEIDENTIFIER NOT NULL,   -- una operación = un grupo
        TIPO_DOC          VARCHAR(8)    NOT NULL,      -- VENTA | CREDITO (documento original)
        COD_DOC           VARCHAR(18)   NOT NULL,      -- VENTA.COD_VENTA o CREDITO.COD_CRE
        COD_DEVC          INT           NULL,          -- DEVOLUCION_CREDITO.COD_DEVC (solo crédito)
        MOVIMIENTO        VARCHAR(8)    NOT NULL       -- DEVUELVE (entra al almacén) | LLEVA (sale, cambio)
            CONSTRAINT DF_SDR_MOVIMIENTO DEFAULT ('DEVUELVE'),

        ID_FAB            INT           NOT NULL,
        COD_FAB           VARCHAR(50)   NOT NULL,
        CANTIDAD          INT           NOT NULL,
        PRECIO            DECIMAL(18,4) NOT NULL,      -- precio unitario en Bs
        TOTAL             DECIMAL(18,4) NOT NULL,
        COD_SUC           VARCHAR(5)    NOT NULL,      -- almacén al que reingresa / del que sale

        COD_EMP           VARCHAR(3)    NOT NULL,
        COD_USU_REGISTRA  VARCHAR(7)    NOT NULL,      -- usuario del token
        COD_USU_FIRMANTE  VARCHAR(7)    NOT NULL,      -- vendedor que firmó con su contraseña

        -- Hora local de Bolivia generada por el servidor de BD (no editable desde la app)
        FECHA_HORA        DATETIME2(0)  NOT NULL
            CONSTRAINT DF_SDR_FECHA_HORA DEFAULT (DATEADD(HOUR, -4, SYSUTCDATETIME())),
        FECHA             AS CAST(FECHA_HORA AS DATE)    PERSISTED,
        HORA              AS CAST(FECHA_HORA AS TIME(0)) PERSISTED,

        COD_VENTA_CAMBIO  VARCHAR(18)   NULL,          -- venta generada en un cambio de producto
        OBS               VARCHAR(512)  NULL,

        CONSTRAINT PK_SISTEMA_DEVOLUCION_REGISTRO PRIMARY KEY (ID_DR),
        CONSTRAINT CK_SDR_TIPO_DOC   CHECK (TIPO_DOC IN ('VENTA', 'CREDITO')),
        CONSTRAINT CK_SDR_MOVIMIENTO CHECK (MOVIMIENTO IN ('DEVUELVE', 'LLEVA')),
        CONSTRAINT CK_SDR_CANTIDAD   CHECK (CANTIDAD > 0),
        CONSTRAINT FK_SDR_PROV_PRO   FOREIGN KEY (ID_FAB)           REFERENCES dbo.PROV_PRO (ID_FAB),
        CONSTRAINT FK_SDR_SUCURSAL   FOREIGN KEY (COD_SUC)          REFERENCES dbo.SUCURSAL (COD_SUC),
        CONSTRAINT FK_SDR_REGISTRA   FOREIGN KEY (COD_USU_REGISTRA) REFERENCES dbo.USUARIO (COD_USU),
        CONSTRAINT FK_SDR_FIRMANTE   FOREIGN KEY (COD_USU_FIRMANTE) REFERENCES dbo.USUARIO (COD_USU)
    );

    CREATE INDEX IX_SDR_DOC    ON dbo.SISTEMA_DEVOLUCION_REGISTRO (TIPO_DOC, COD_DOC);
    CREATE INDEX IX_SDR_GRUPO  ON dbo.SISTEMA_DEVOLUCION_REGISTRO (ID_GRUPO);
    CREATE INDEX IX_SDR_ID_FAB ON dbo.SISTEMA_DEVOLUCION_REGISTRO (ID_FAB);
END
GO

/* =============================================================================
   10. SISTEMA_AUDITORIA
   Rastro de auditoría general: una fila por operación, con quién la hizo, la
   hora de Bolivia (la pone el servidor de BD), el módulo y la acción, el
   documento afectado y el detalle antes → después en JSON.
   Módulos: VENTA, CREDITO, PAGO, DEVOLUCION, TIPO_CAMBIO, ROL, ALMACEN,
            CLIENTE, USUARIO.
   La auditoría de productos sigue en SISTEMA_PRODUCTO_AUDITORIA (bloque 7) y
   la de traspasos en SISTEMA_TRASPASO_AUTORIZACION (bloque 2).
   La API solo inserta y consulta: no hay endpoint para editar ni borrar.
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_AUDITORIA', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_AUDITORIA (
        ID_AUD            BIGINT IDENTITY(1,1) NOT NULL,
        COD_EMP           VARCHAR(3)    NOT NULL,
        COD_USU           VARCHAR(7)    NOT NULL,      -- usuario del token

        -- Hora local de Bolivia generada por el servidor de BD (no editable desde la app)
        FECHA_HORA        DATETIME2(0)  NOT NULL
            CONSTRAINT DF_SAU_FECHA_HORA DEFAULT (DATEADD(HOUR, -4, SYSUTCDATETIME())),
        FECHA             AS CAST(FECHA_HORA AS DATE)    PERSISTED,
        HORA              AS CAST(FECHA_HORA AS TIME(0)) PERSISTED,

        MODULO            VARCHAR(20)   NOT NULL,
        ACCION            VARCHAR(20)   NOT NULL,      -- CREAR, CONFIRMAR, ANULAR, PAGAR, ASIGNAR, QUITAR, EDITAR…
        DOCUMENTO         VARCHAR(40)   NULL,          -- COD_VENTA, COD_CRE, rol, alias…
        DESCRIPCION       VARCHAR(400)  NOT NULL,
        DATOS_ANTERIORES  NVARCHAR(MAX) NULL,          -- JSON
        DATOS_NUEVOS      NVARCHAR(MAX) NULL,          -- JSON

        CONSTRAINT PK_SISTEMA_AUDITORIA PRIMARY KEY (ID_AUD),
        CONSTRAINT CK_SAU_MODULO CHECK (MODULO IN (
            'VENTA', 'CREDITO', 'PAGO', 'DEVOLUCION', 'TIPO_CAMBIO',
            'ROL', 'ALMACEN', 'CLIENTE', 'USUARIO')),
        CONSTRAINT FK_SAU_USUARIO FOREIGN KEY (COD_USU) REFERENCES dbo.USUARIO (COD_USU)
    );

    CREATE INDEX IX_SAU_EMP_FECHA ON dbo.SISTEMA_AUDITORIA (COD_EMP, FECHA);
    CREATE INDEX IX_SAU_MODULO    ON dbo.SISTEMA_AUDITORIA (MODULO, ACCION);
    CREATE INDEX IX_SAU_DOCUMENTO ON dbo.SISTEMA_AUDITORIA (DOCUMENTO);
END
GO

/* =============================================================================
   11. Estados de las salidas (traspasos SALIDA_VENTA, hacia MOTOR ZONE)
   El almacén no sabe si un producto se vendió: la salida no se enlaza con
   ventas. Firman encargado y vendedor y la salida queda COMPLETADO; si luego
   el vendedor devuelve, queda PARCIAL (devolvió una parte) o DEVUELTO (todo).
     - Pasa las salidas existentes (PENDIENTE / VENDIDO) al estado nuevo según
       lo que ya se devolvió.
     - Reemplaza CK_STA_ESTADO para aceptar solo COMPLETADO, PARCIAL y DEVUELTO.
   Las columnas CANT_VENDIDA y SISTEMA_TRASPASO_VENTA quedan sin uso (no se
   borran: conservan la historia).
   ============================================================================= */

IF EXISTS (SELECT 1 FROM sys.check_constraints
           WHERE name = 'CK_STA_ESTADO' AND definition NOT LIKE '%PARCIAL%')
BEGIN
    ALTER TABLE dbo.SISTEMA_TRASPASO_AUTORIZACION DROP CONSTRAINT CK_STA_ESTADO;
END
GO

IF OBJECT_ID('dbo.SISTEMA_TRASPASO_DET', 'U') IS NOT NULL
BEGIN
    UPDATE ta
    SET ESTADO = CASE
            WHEN ISNULL(d.devuelta, 0) <= 0          THEN 'COMPLETADO'
            WHEN ISNULL(d.devuelta, 0) >= d.total    THEN 'DEVUELTO'
            ELSE 'PARCIAL'
        END
    FROM dbo.SISTEMA_TRASPASO_AUTORIZACION ta
    LEFT JOIN (
        SELECT ID_TA, SUM(CANTIDAD) as total, SUM(CANT_DEVUELTA) as devuelta
        FROM dbo.SISTEMA_TRASPASO_DET
        GROUP BY ID_TA
    ) d ON d.ID_TA = ta.ID_TA
    WHERE ta.TIPO = 'SALIDA_VENTA'
      AND ta.ESTADO IN ('PENDIENTE', 'VENDIDO', 'DEVUELTO');
END
GO

-- Cualquier otro estado viejo que quede (no debería) pasa a COMPLETADO
UPDATE dbo.SISTEMA_TRASPASO_AUTORIZACION
SET ESTADO = 'COMPLETADO'
WHERE ESTADO NOT IN ('COMPLETADO', 'PARCIAL', 'DEVUELTO');
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name = 'CK_STA_ESTADO')
BEGIN
    ALTER TABLE dbo.SISTEMA_TRASPASO_AUTORIZACION ADD CONSTRAINT CK_STA_ESTADO
        CHECK (ESTADO IN ('COMPLETADO', 'PARCIAL', 'DEVUELTO'));
END
GO
