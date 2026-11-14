/* =============================================================================
   Roles para traspasos con firma digital
     - Encargado de Almacen: registra traspasos desde el/los almacén(es) que
       tiene asignados en SISTEMA_USUARIO_ALMACEN.
     - Vendedor: firma las salidas a venta (sub-almacén de tienda -> MOTOR ZONE).

   Solo crea los roles si no existen. Se puede ejecutar más de una vez.
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

/* ---------------------------------------------------------------------------
   Ejemplo: asignar un encargado a su almacén (cambiar códigos reales)

   -- 1) Rol
   INSERT INTO dbo.SISTEMA_USUARIO_ROL (cod_usu, id_rol, asignadoAt)
   SELECT '0000123', id, GETDATE() FROM dbo.SISTEMA_ROLES WHERE nombre = 'Encargado de Almacen';

   -- 2) Almacén que maneja (también se puede hacer desde POST /api/almacenes/asignar)
   INSERT INTO dbo.SISTEMA_USUARIO_ALMACEN (cod_usu, cod_suc, activo, createdAt)
   VALUES ('0000123', '00005', 1, GETDATE());
--------------------------------------------------------------------------- */
