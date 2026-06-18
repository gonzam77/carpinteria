export type Rol = "ADMIN" | "CARPINTERO";
export type EstadoSolicitud = "PENDIENTE" | "EN_PROCESO" | "TERMINADA" | "ENTREGADA" | "RECHAZADA";
export type MaterialType = "PLACA" | "CANTO";

export type OptimizerSettings = {
  id: string;
  espesorSierraMm: number;
  perfiladoBordeMm: number;
  fechaActualizacion?: string;
};

export type Material = {
  id: string;
  nombre: string;
  tipo: MaterialType;
  valor: number;
  espesorMm: number;
  anchoPlaca: number | null;
  altoPlaca: number | null;
  colorCanto: string | null;
  stockPlacas: number | null;
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
  cantoLargo1Id?: string | null;
  cantoLargo1Nombre?: string | null;
  cantoLargo1: boolean;
  cantoLargo2Id?: string | null;
  cantoLargo2Nombre?: string | null;
  cantoLargo2: boolean;
  cantoAncho1Id?: string | null;
  cantoAncho1Nombre?: string | null;
  cantoAncho1: boolean;
  cantoAncho2Id?: string | null;
  cantoAncho2Nombre?: string | null;
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
