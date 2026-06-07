export interface JwtPayload {
  cod_usu: string;
  alias: string;
  nombre: string;
  apellido: string;
  roles: string[];
  id_roles: number[];
  almacenes: { codSuc: string; nomSuc: string }[];
}