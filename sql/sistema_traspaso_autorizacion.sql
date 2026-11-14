/* =============================================================================
   SISTEMA_TRASPASO_AUTORIZACION
   Firma digital de traspasos entre almacenes (reemplaza el talonario físico).

   Tipos (los calcula el backend según origen y destino, no los elige el usuario):
     INGRESO_TIENDA   almacén FUERA de la tienda  -> almacén DENTRO de la tienda.
                      Firma el mismo encargado que registra (con su contraseña).
     SALIDA_VENTA     almacén DENTRO de la tienda -> principal (MOTOR ZONE 00011)
                      para vender. Firma el VENDEDOR que se lleva el producto.
     ENTRE_ALMACENES  cualquier otro traspaso. Firma el encargado que registra.

   Fecha y hora:
     Las calcula SQL Server desde su hora UTC menos 4 horas (Bolivia es UTC-4
     todo el año, sin horario de verano). No dependen de la PC del usuario ni
     de la zona horaria del servidor, y el backend no las recibe del cliente.

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

        -- SALIDA_VENTA: PENDIENTE -> VENDIDO | DEVUELTO
        -- Otros tipos:  COMPLETADO
        ESTADO             VARCHAR(10)  NOT NULL,
        ID_TA_ORIGEN       INT          NULL,       -- en una devolución: el traspaso que se devuelve
        COD_VENTA          VARCHAR(18)  NULL,       -- venta en la que salió el producto
        OBS                VARCHAR(512) NULL,

        CONSTRAINT PK_SISTEMA_TRASPASO_AUTORIZACION PRIMARY KEY (ID_TA),
        CONSTRAINT CK_STA_TIPO   CHECK (TIPO IN ('INGRESO_TIENDA', 'SALIDA_VENTA', 'ENTRE_ALMACENES')),
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

/* Comprobación: debe mostrar la hora actual de Bolivia
SELECT DATEADD(HOUR, -4, SYSUTCDATETIME()) AS hora_bolivia;
*/
