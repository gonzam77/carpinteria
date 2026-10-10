export type CompanySettings = {
  id: string;
  nombre: string;
  telefono: string;
  email: string;
  fechaActualizacion?: string;
};
export type Rol = "ADMIN" | "CARPINTERO" | "OPERARIO";
export type EstadoSolicitud = "PENDIENTE" | "EN_PROCESO" | "TERMINADA" | "ENTREGADA" | "RECHAZADA";
export type MaterialType = "PLACA" | "CANTO";

export type OptimizerSettings = {
  id: string;
  espesorSierraMm: number;
  perfiladoBordeMm: number;
  fechaActualizacion?: string;
};

export type BudgetSettings = {
  id: string;
  manoObraCanto045Mm: number;
  manoObraCanto1Mm: number;
  manoObraCanto2Mm: number;
  manoObraPlacaPorPlaca: number;
  fechaActualizacion?: string;
};

export type StockAlert = {
  materialId: string;
  materialNombre: string;
  stockDisponible: number;
  placasPendientes: number;
  pedidosPendientes: number;
  faltantePlacas: number;
};

export type DashboardStats = {
  totalOrders: number;
  totalUsers: number;
  totalPieces: number;
  totalRows: number;
  /** Los totales incluyen los dos tipos; `modulos` dice cuantos de ese estado son de modulos a medida (spec §15). */
  byStatus: Array<{ estado: EstadoSolicitud; total: number; modulos?: number }>;
  byTipo?: Array<{ tipo: TipoPedido; total: number }>;
  stockAlerts: StockAlert[];
  /** Las solicitudes de modulos (punto 8). */
  modulos?: ModuleOrdersStats;
};

export type ModuleOrdersStats = {
  activas: number;
  porEstado: Array<{ estado: EstadoSolicitud; total: number }>;
  modulosActivos: number;
  placasActivas: number;
  /** Presupuesto con herrajes de las que estan en curso. */
  presupuestoActivo: number;
  vencidas: number;
  porVencer: number;
  diasAviso: number;
  proximas: Array<{ id: string; numero: number; cliente: string; estado: EstadoSolicitud; fechaEntrega: string | null; dias: number | null }>;
  /** De las entregadas en los ultimos 90 dias, cuantas salieron hasta su fecha. */
  cumplimiento: { entregadas: number; aTiempo: number };
  /** Promedio de las creadas en los ultimos 90 dias (sin las rechazadas). */
  ticketPromedio: number;
  meses: Array<{ mes: string; solicitudes: number; presupuesto: number }>;
  topModulos: Array<{ nombre: string; cantidad: number }>;
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
  placaMaterialId: string | null;
  placaMaterial?: Pick<Material, "id" | "nombre" | "activo"> | null;
  stockPlacas: number | null;
  activo: boolean;
  linkedOrdersCount?: number;
  linkedCantosCount?: number;
  /** Vinculos con el catalogo de modulos y las solicitudes de modulos. */
  linkedModulesCount?: number;
  canDeletePermanently?: boolean;
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
  /** Solo en solicitudes de modulos: el modulo de la solicitud (null, pieza adicional). Agrupa la tabla al editar. */
  pedidoModuloId?: string | null;
};

export type Order = {
  id: string;
  cliente: string;
  numeroContacto?: string;
  observaciones?: string;
  estado: EstadoSolicitud;
  /** La API lo manda siempre; MODULOS son las solicitudes de modulos a medida. */
  tipo?: TipoPedido;
  placasEstimadas: number;
  costoPlacas: number;
  costoManoObraCortes?: number;
  costoMaterialCantos: number;
  costoPegadoCantos: number;
  costoCantos: number;
  metrosCanto: number;
  presupuestoEstimado: number;
  /** Herrajes de las solicitudes de modulos, aparte del presupuesto de placas (DECISIONES 57). */
  costoHerrajes?: number;
  faltanteStock: boolean;
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


export type OrderMaterialsPlate = {
  materialId: string;
  nombre: string;
  anchoPlaca: number | null;
  altoPlaca: number | null;
  espesorMm: number;
  piezas: number;
  placas: number;
  stockPlacas: number | null;
  faltantePlacas: number;
};

export type OrderMaterialsEdge = {
  cantoId: string;
  nombre: string;
  espesorMm: number;
  metros: number;
};

export type OrderMaterialsSummary = {
  /** CONSTANCIA: las placas que se guardaron con la constancia. RECALCULADO: pedidos anteriores, calculados hoy. */
  origen: "CONSTANCIA" | "RECALCULADO";
  placas: OrderMaterialsPlate[];
  cantos: OrderMaterialsEdge[];
  totalPlacas: number;
  totalMetrosCanto: number;
};

// ---------------------------------------------------------------- Catalogo de modulos a medida (spec §5.2 y §13.1)

export type TipoParametroModulo = "MEDIDA" | "ENTERO" | "OPCION" | "CALCULADO";
export type RolPiezaModulo = "ESQUELETO" | "FRENTE" | "FONDO" | "FIJO";
export type LadoCanto = "LARGO_1" | "LARGO_2" | "ANCHO_1" | "ANCHO_2";
export type EspesorCanto = 0.45 | 1 | 2;

export type ModuleCategory = { id: string; nombre: string; orden: number; activo: boolean; modulos?: number };

export type ModuleParameter = {
  clave: string;
  etiqueta: string;
  tipo: TipoParametroModulo;
  valorDefecto: number | null;
  minimo: number | null;
  maximo: number | null;
  opciones: Array<{ valor: number; etiqueta: string }> | null;
  formula: string | null;
  ayuda: string | null;
  orden: number;
};

export type ModuleProfile = { orden: 1 | 2; nombre: string; descripcion: string | null; predeterminado: boolean };

export type ModulePiece = {
  codigo: string;
  nombre: string;
  rol: RolPiezaModulo;
  materialFijoId: string | null;
  formulaLargo: string;
  formulaAncho: string;
  formulaCantidad: string;
  permiteRotar: boolean;
  orden: number;
  observaciones: string | null;
  cantos: Array<{ perfilOrden: 1 | 2; lado: LadoCanto; espesorMm: EspesorCanto }>;
};

export type ModuleFormulaError = { ref: string; mensaje: string };

/** Lo que se manda al crear o guardar un modulo. */
export type ModuleInput = {
  nombre: string;
  categoriaId: string;
  descripcion: string | null;
  activo: boolean;
  espesorDisenoMm: number;
  materialFondoId: string | null;
  observaciones: string | null;
  parametros: ModuleParameter[];
  perfiles: ModuleProfile[];
  piezas: ModulePiece[];
  /** Modelo por defecto, formula de cantidad y, si va por medida, la de la medida (DECISIONES 57). */
  herrajes: Array<{ herrajeId: string; formulaCantidad: string; formulaMedida: string | null; orden: number }>;
};

export type ModuleDefinition = ModuleInput & {
  id: string;
  /** Automatico, con el nombre: lo arma el servidor. */
  codigo: string;
  categoria: { id: string; nombre: string };
  version: number;
  fechaActualizacion: string;
  imagen: { mime: string; tamanoBytes: number; fechaActualizacion: string } | null;
  tienePedidos: boolean;
  estadoFormulas?: "OK" | "CON_ERRORES";
  errores?: ModuleFormulaError[];
};

export type ModuleListItem = {
  id: string;
  codigo: string;
  nombre: string;
  categoria: { id: string; nombre: string };
  activo: boolean;
  version: number;
  fechaActualizacion: string;
  tieneImagen: boolean;
  imagenActualizada: string | null;
  piezas: number;
  parametros: number;
  tienePedidos: boolean;
  estadoFormulas: "OK" | "CON_ERRORES";
  observaciones: string | null;
  cantidadObservaciones: number;
};

export type ModulesConfig = {
  id: string;
  materialFondoId: string | null;
  redondeo: "REDONDEAR" | "TRUNCAR";
  diasEntregaDefecto: number;
  diasAvisoVencimiento: number;
  herrajesHabilitados: boolean;
};

export type ModuleEvaluation = {
  piezas: Array<{ codigo: string; nombre: string; largo: number; ancho: number; cantidad: number; largoExacto: number; anchoExacto: number }>;
  errores: ModuleFormulaError[];
  herrajes: Array<{ herrajeId: string; cantidad: number | null; medidaNecesaria?: number | null }>;
};

// ---------------------------------------------------------------- Solicitudes de modulos (spec §13.2)

export type TipoPedido = "CORTE" | "MODULOS";
export type OrigenDetalle = "CALCULADO" | "EDITADO" | "MANUAL";
/**
 * Cantos elegidos a mano para una pieza (DECISIONES 45): solo los lados que se tocaron, cada uno con el canto elegido
 * (id de un material CANTO) o null si va sin canto. Los demas lados llevan el de por defecto.
 */
export type PieceEdgeChoice = Partial<Record<LadoCanto, string | null>>;

/** Un lado que el perfil pide con canto, pero la placa de la pieza no tiene canto de su color: va sin canto. */
export type MissingDefaultEdge = { piezaCodigo: string; pieza: string; lado: LadoCanto; espesorMm: number; placa: string };

/** Un modulo de la solicitud como lo recibe la API. Es estricto: solo estos campos (DECISIONES 17). */
export type ModuleOrderLineInput = {
  moduloId: string;
  valores: Record<string, number>;
  colorEsqueletoId: string;
  colorFrentesId: string;
  perfilCantoOrden: 1 | 2;
  /** Opcional: sin elegir, el fondo del modulo o de la configuracion (DECISIONES 32). */
  materialFondoId?: string | null;
  observaciones?: string | null;
  /** Cantos elegidos a mano en el paso 4, por codigo de pieza (DECISIONES 45). */
  cantosOverride?: Record<string, PieceEdgeChoice>;
  /** Herrajes elegidos a mano en el paso 4: por el modelo por defecto de cada linea, el modelo elegido (DECISIONES 57). */
  herrajesOverride?: Record<string, string>;
  /** La version del modulo que mostro la vista previa: si el catalogo cambio, el alta responde 409. */
  version?: number;
};

/** Datos del cliente y de la entrega (paso 1). La fecha es AAAA-MM-DD (DECISIONES 26). */
export type ModuleOrderClient = {
  cliente: string;
  numeroContacto: string;
  emailContacto?: string | null;
  direccionEntrega?: string | null;
  fechaEntrega: string;
  observaciones?: string | null;
};

export type ModuleOrderDetail = OrderDetail & {
  indice: number;
  piezaCodigo: string | null;
  origen: OrigenDetalle | null;
  orden: number;
  pedidoModuloId?: string | null;
  /** Solo en la vista previa: a que modulo de la solicitud pertenece la fila. */
  posicionModulo?: number;
};

export type EstimacionDetalle = {
  version: 1;
  porMaterial: Array<{ materialId: string; nombre: string; placas: number; piezas: number; mm2?: number; valorCentavos: number }>;
  porCanto: Array<{ cantoId: string; mm: number; espesorMm: number; valorCentavos: number }>;
  recalculado?: boolean;
};

export type ModuleOrderEstimate = {
  placasEstimadas: number;
  costoPlacas: number;
  costoManoObraCortes: number;
  costoMaterialCantos: number;
  costoPegadoCantos: number;
  costoCantos: number;
  metrosCanto: number;
  presupuestoEstimado: number;
  faltanteStock: boolean;
  estimacionDetalle: EstimacionDetalle;
  costoHerrajes: number;
  presupuestoConHerrajes: number;
};

export type ModuleOrderPreviewModule = {
  posicion: number;
  moduloId: string;
  nombreModulo: string;
  version: number;
  valores: Record<string, number>;
  colorEsqueletoId: string;
  colorFrentesId: string;
  perfilCantoOrden: 1 | 2;
  materialFondoId: string | null;
  observaciones: string | null;
  /** Cantidad de filas del modulo. */
  piezas: number;
  /** Lados que van sin canto porque la placa de la pieza no tiene uno de su color (DECISIONES 45). */
  cantosSinElegir: MissingDefaultEdge[];
  /** Herrajes del modulo (vacio si estan apagados, DECISIONES 57). */
  herrajes: PlannedHardware[];
};

/** Un herraje de un modulo calculado por el servidor (vista previa). */
export type PlannedHardware = {
  herrajeId: string;
  /** El modelo por defecto de la linea: la clave para elegir otro. */
  herrajeDefectoId: string;
  nombre: string;
  unidad: string;
  tipo: string | null;
  linea: string | null;
  medidaMm: number | null;
  cantidad: number;
  valorUnitario: number;
  medidaNecesaria: number | null;
  eleccion: "POR_DEFECTO" | "POR_MEDIDA" | "MAS_CHICO" | "ELEGIDO";
  origen: "CALCULADO" | "EDITADO";
  orden: number;
};

/** Un herraje guardado en una solicitud (PedidoHerraje). */
export type OrderHardware = {
  id: string;
  pedidoModuloId: string | null;
  herrajeId: string | null;
  nombre: string;
  unidad: string;
  tipo: string | null;
  linea: string | null;
  medidaMm: number | null;
  cantidad: number;
  valorUnitario: number;
  orden: number;
  origen: OrigenDetalle | null;
};

/** Una columna agregada a mano al Excel de corte (punto 5): su contenido va tal cual al archivo. */
export type MachineExcelExtraColumn = { id: string; titulo: string };

/** La pestaña "Excel de corte" (GET /api/pedidos-modulos/:id/excel-corte): lo mismo que sale en el archivo. */
export type MachineExcel = {
  numero: number;
  fechaActualizacion: string;
  /** Las de la maquina (titulo vacio en las 4 en blanco) y las agregadas (extra). critica: cambia lo que se corta. */
  columnas: Array<{ key: string; titulo: string; extra: boolean; critica: boolean }>;
  columnasExtra: MachineExcelExtraColumn[];
  filas: Array<{
    /** El codigo de barra de la pieza: no cambia al editar la solicitud. */
    clave: string;
    posicionModulo: number | null;
    valores: Record<string, string | number>;
    /** Lo que sale de la pieza, sin ajustes. */
    base: Record<string, string | number>;
    /** Las columnas de la maquina cambiadas a mano en esta fila. */
    ajustadas: string[];
  }>;
  ajustes: { total: number; critical: number };
};

/** Respuesta de "Recalcular herrajes" (POST /api/pedidos-modulos/:id/herrajes/recalcular, F6.4): lo del catalogo, sin guardar. */
export type OrderHardwareRecalc = {
  /** Con id, uno guardado que queda igual (conserva su precio). */
  herrajes: Array<PlannedHardware & { id: string | null; pedidoModuloId: string; posicionModulo: number }>;
  costoHerrajes: number;
};

/** Respuesta de POST /api/pedidos-modulos/preview (DECISIONES 17): el paso 4 muestra solo esto (R3). */
export type ModuleOrderPreview = ModuleOrderEstimate & {
  id: "preview";
  tipo: "MODULOS";
  numero: null;
  /** Hora del servidor al calcularla (ISO). */
  fechaCreacion: string;
  modulos: ModuleOrderPreviewModule[];
  detalles: ModuleOrderDetail[];
  herrajes: Array<PlannedHardware & { posicionModulo: number }>;
};

type PlateRef = { id: string; nombre: string; espesorMm: number };

export type ModuleOrder = Omit<Order, "detalles"> &
  ModuleOrderEstimate & {
    numero: number;
    tipo: TipoPedido;
    fechaEntrega: string | null;
    emailContacto: string | null;
    direccionEntrega: string | null;
    modulos: Array<
      Omit<ModuleOrderPreviewModule, "version" | "piezas" | "moduloId" | "cantosSinElegir" | "herrajes"> & {
        id: string;
        moduloId: string | null;
        definicionSnapshot: Omit<ModuleDefinition, "imagen" | "tienePedidos">;
        colorEsqueleto: PlateRef;
        colorFrentes: PlateRef;
        materialFondo: PlateRef | null;
      }
    >;
    detalles: ModuleOrderDetail[];
    herrajes: OrderHardware[];
  };

/** Un cliente de solicitudes de modulos anteriores, para autocompletar el paso 1 del asistente. */
export type ModuleOrderClientSuggestion = {
  cliente: string;
  numeroContacto: string;
  emailContacto: string | null;
  direccionEntrega: string | null;
};

/** Respuesta de la vista previa de recalcular un modulo (spec §10.6). */
export type ModuleRecalcPreview = {
  posicion: number;
  nombreModulo: string;
  version: number;
  valores: Record<string, number>;
  materialFondoId: string | null;
  cantosSinElegir: MissingDefaultEdge[];
  /** Piezas que tiene hoy el modulo (se reemplazan todas). */
  piezasAntes: number;
  /** De esas, las editadas o agregadas a mano (se pierden). */
  cambiosManuales: number;
  detalles: ModuleOrderDetail[];
  /** Los herrajes del modulo como quedan (vuelven a lo del catalogo, DECISIONES 57). */
  herrajes: PlannedHardware[];
  /** Herrajes de este modulo ajustados a mano, que se pierden. */
  herrajesManuales: number;
  antes: { placasEstimadas: number; presupuestoEstimado: number; presupuestoConHerrajes: number };
  despues: ModuleOrderEstimate;
};

export type ModuleOrderListItem = {
  id: string;
  numero: number;
  cliente: string;
  numeroContacto: string | null;
  emailContacto: string | null;
  observaciones: string | null;
  estado: EstadoSolicitud;
  fechaCreacion: string;
  fechaActualizacion: string;
  fechaEntrega: string | null;
  placasEstimadas: number;
  presupuestoEstimado: number;
  costoHerrajes: number;
  presupuestoConHerrajes: number;
  faltanteStock: boolean;
  stockReservado: boolean;
  usuarioId: string;
  cantidadModulos: number;
};

// ---------------------------------------------------------------- Herrajes (Fase 6, spec §12 y DECISIONES 57)

export type HardwareUnit = "unidad" | "par" | "juego" | "metro";

export type HardwareType = { id: string; nombre: string; orden: number; activo: boolean; herrajes: number };

export type Hardware = {
  id: string;
  nombre: string;
  unidad: HardwareUnit;
  valor: number;
  activo: boolean;
  tipoId: string | null;
  tipo: { id: string; nombre: string; activo: boolean } | null;
  /** Solo los que van por medida: la linea agrupa las medidas de un mismo modelo. */
  linea: string | null;
  medidaMm: number | null;
  /** Formulas que se precargan al agregarlo a un modulo (se pueden cambiar ahi). */
  formulaCantidadDefecto: string | null;
  formulaMedidaDefecto: string | null;
  usoModulos: number;
  usoSolicitudes: number;
  canDeletePermanently: boolean;
};

export type HardwareInput = {
  nombre: string;
  tipoId: string;
  unidad: HardwareUnit;
  valor: number;
  linea: string | null;
  medidaMm: number | null;
  formulaCantidadDefecto: string | null;
  formulaMedidaDefecto: string | null;
};
