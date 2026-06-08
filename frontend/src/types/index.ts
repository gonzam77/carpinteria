export type Rol = "ADMIN" | "CARPINTERO";
export type EstadoSolicitud = "PENDIENTE" | "EN_PROCESO" | "TERMINADA" | "ENTREGADA" | "RECHAZADA";

export type Material = {
  id: string;
  nombre: string;
  valor: number;
  espesorMm: number;
  anchoPlaca: number;
  altoPlaca: number;
  activo: boolean;
  fechaCreacion?: string;
  fechaActualizacion?: string;
};

export type User = {
  id: string;
  nombre: string;
  apellido: string;
  email: string;
  telefono?: string;
  rol: Rol;
  fechaCreacion?: string;
};

export type OrderDetail = {
  id?: string;
  materialId?: string;
  codigoBarra: string;
  material: string;
  largo: number | string;
  ancho: number | string;
  cantidad: number | string;
  cantoLargo1: boolean;
  cantoLargo2: boolean;
  cantoAncho1: boolean;
  cantoAncho2: boolean;
  permiteRotar: boolean;
  codigoBarraCentro?: string;
  remark?: string;
  numeroCliente?: string;
  nombreCliente?: string;
  nombreProducto?: string;
};

export type Order = {
  id: string;
  cliente: string;
  numeroContacto?: string;
  observaciones?: string;
  estado: EstadoSolicitud;
  usuarioId: string;
  fechaCreacion: string;
  fechaActualizacion: string;
  usuario?: Pick<User, "id" | "nombre" | "apellido" | "email" | "telefono">;
  detalles: OrderDetail[];
  historial?: Array<{
    id: string;
    accion: string;
    valorAnterior?: string;
    valorNuevo?: string;
    fechaCreacion: string;
    usuario: Pick<User, "nombre" | "apellido">;
  }>;
};
