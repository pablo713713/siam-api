/* =============================================================================
   SISTEMA_TRASPASO_AUTORIZACION
   Reemplaza el talonario físico de traspasos internos de Motor Zone.

   Por cada traspaso guarda:
     - de qué almacén sale y a cuál va
     - quién lo autoriza  (encargado del almacén, tomado del token JWT)
     - quién se lo lleva  (vendedor que firma con su usuario + contraseña)
     - fecha y hora LOCAL DE BOLIVIA, calculadas por el servidor de base de datos

   Fecha y hora:
     Se calculan en SQL Server a partir de la hora UTC del servidor y se restan
     4 horas (Bolivia es UTC-4 todo el año, no tiene horario de verano).
     Así no dependen del reloj de la PC del encargado ni de la zona horaria
     configurada en el servidor, y el backend NO las recibe desde el cliente.

   Regla de oro del proyecto: tabla nueva con prefijo SISTEMA_ y FK solo
   desde la tabla nueva hacia las legacy. No se modifica ninguna tabla legacy.

   Se puede ejecutar más de una vez sin error.
   ============================================================================= */

IF OBJECT_ID('dbo.SISTEMA_TRASPASO_AUTORIZACION', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.SISTEMA_TRASPASO_AUTORIZACION (
        ID_TA              INT IDENTITY(1,1) NOT NULL,
        COD_REM            VARCHAR(16)  NOT NULL,   -- REMISION_S.COD_REM (salida)
        COD_REM_E          VARCHAR(16)  NULL,       -- REMISION_E.COD_REM (entrada)
        SUC_ORI            VARCHAR(5)   NOT NULL,   -- almacén / sub-almacén de origen
        SUC_DES            VARCHAR(5)   NOT NULL,   -- destino (00011 MOTOR ZONE)
        COD_USU_ENCARGADO  VARCHAR(7)   NOT NULL,   -- quien autoriza
        COD_USU_VENDEDOR   VARCHAR(7)   NOT NULL,   -- quien firma y se lleva el producto

        -- Hora local de Bolivia generada por el servidor de BD (no editable desde la app)
        FECHA_HORA         DATETIME2(0) NOT NULL
            CONSTRAINT DF_STA_FECHA_HORA DEFAULT (DATEADD(HOUR, -4, SYSUTCDATETIME())),
        FECHA              AS CAST(FECHA_HORA AS DATE)    PERSISTED,
        HORA               AS CAST(FECHA_HORA AS TIME(0)) PERSISTED,

        -- PENDIENTE: el vendedor se lo llevó y aún no se vende
        -- VENDIDO:   se registró la venta
        -- DEVUELTO:  no se vendió y volvió a su sub-almacén de origen
        ESTADO             VARCHAR(10)  NOT NULL
            CONSTRAINT DF_STA_ESTADO DEFAULT ('PENDIENTE'),
        ID_TA_ORIGEN       INT          NULL,       -- en una devolución: traspaso que se devuelve
        COD_VENTA          VARCHAR(18)  NULL,       -- venta en la que salió el producto
        OBS                VARCHAR(512) NULL,

        CONSTRAINT PK_SISTEMA_TRASPASO_AUTORIZACION PRIMARY KEY (ID_TA),
        CONSTRAINT CK_STA_ESTADO CHECK (ESTADO IN ('PENDIENTE', 'VENDIDO', 'DEVUELTO')),
        CONSTRAINT CK_STA_PERSONAS CHECK (COD_USU_ENCARGADO <> COD_USU_VENDEDOR),

        CONSTRAINT FK_STA_REMISION_S FOREIGN KEY (COD_REM)           REFERENCES dbo.REMISION_S (COD_REM),
        CONSTRAINT FK_STA_SUC_ORI    FOREIGN KEY (SUC_ORI)           REFERENCES dbo.SUCURSAL (COD_SUC),
        CONSTRAINT FK_STA_SUC_DES    FOREIGN KEY (SUC_DES)           REFERENCES dbo.SUCURSAL (COD_SUC),
        CONSTRAINT FK_STA_ENCARGADO  FOREIGN KEY (COD_USU_ENCARGADO) REFERENCES dbo.USUARIO (COD_USU),
        CONSTRAINT FK_STA_VENDEDOR   FOREIGN KEY (COD_USU_VENDEDOR)  REFERENCES dbo.USUARIO (COD_USU),
        CONSTRAINT FK_STA_ORIGEN     FOREIGN KEY (ID_TA_ORIGEN)      REFERENCES dbo.SISTEMA_TRASPASO_AUTORIZACION (ID_TA),
        CONSTRAINT UQ_STA_COD_REM    UNIQUE (COD_REM)
    );

    CREATE INDEX IX_STA_VENDEDOR_ESTADO ON dbo.SISTEMA_TRASPASO_AUTORIZACION (COD_USU_VENDEDOR, ESTADO);
    CREATE INDEX IX_STA_FECHA           ON dbo.SISTEMA_TRASPASO_AUTORIZACION (FECHA);
END
GO

/* Comprobación: debe mostrar la hora actual de Bolivia
SELECT DATEADD(HOUR, -4, SYSUTCDATETIME()) AS hora_bolivia;
*/
