export interface JwtPayload {
  cod_usu: string;
  alias: string;
  nombre: string;
  apellido: string;
  rol: string | null;
  id_rol: number | null;
}