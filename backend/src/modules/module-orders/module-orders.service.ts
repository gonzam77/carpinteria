// Solicitudes de modulos: del modulo configurado a las filas de corte (spec §8).
//
// Paridad con las solicitudes de corte (regla 1): las piezas salen del armador compartido (buildModulePieces,
// DECISIONES R6), las filas pasan por el mismo normalizeDetails que el corte (R8) y el presupuesto es el mismo
// buildOrderEstimateSnapshot, sin cambios (R1). Unas mismas piezas dan las mismas placas y los mismos importes
// se carguen como corte o como modulos: lo unico que agrega este servicio es de donde sale cada fila.
import { EstadoPedido, OrigenDetalle, Prisma, TipoMaterial, TipoPedido, type PrismaClient } from "../../generated/prisma/client.js";
import { fromDateOnly, toDateOnly, todayInBusinessZone } from "../../utils/dates.js";
import { AppError } from "../../utils/http.js";
import type { OrderedModulePiece, RoundingMode } from "../../shared/moduleFormula.js";
import { describeChanges, hasChanges, matchRows, summarizeChanges } from "../../shared/moduleOrderChanges.js";
import { toCentavos } from "../../shared/orderEstimate.js";
import { getModulesConfig, MODULE_INCLUDE, toDefinition } from "../catalog/catalog.service.js";
import { normalizeDetails, type NormalizedDetail } from "../orders/order-details.service.js";
import { buildOrderEstimateSnapshot, getOptimizerSettings } from "../orders/order-estimate.service.js";
import { DETALLES_ORDENADOS } from "../orders/order-queries.js";
import { hasStockCommitment } from "../orders/order-stock.service.js";
import { compareForList } from "./module-order-list.js";
import { moduleBarcode, planModuleOrder, type MissingDefaultEdge, type PlanModule } from "./module-order-plan.js";
import type { ModuleOrderCreateInput, ModuleOrderFilters, ModuleOrderLine, ModuleOrderUpdateInput } from "./module-orders.schemas.js";

export { moduleBarcode } from "./module-order-plan.js";

type Tx = PrismaClient | Prisma.TransactionClient;
type ModuleWithRelations = Prisma.ModuloGetPayload<{ include: typeof MODULE_INCLUDE }>;

/** Copia de la definicion usada (spec D2): la solicitud no cambia si despues se edita el catalogo. */
function snapshotOf(module: ModuleWithRelations) {
  const { imagen: _imagen, tienePedidos: _tienePedidos, ...definition } = toDefinition(module);
  return definition;
}

/** Un modulo de la solicitud ya armado: sus datos y sus filas, en el orden del modulo. */
export type BuiltModuleLine = {
  posicion: number;
  moduloId: string;
  nombreModulo: string;
  version: number;
  valores: Record<string, number>;
  colorEsqueletoId: string;
  colorFrentesId: string;
  perfilCantoOrden: 1 | 2;
  /** Placa que usaron las piezas de fondo (la elegida, la del modulo o la de la configuracion); null si no tiene fondo. */
  materialFondoId: string | null;
  observaciones: string | null;
  definicionSnapshot: ReturnType<typeof snapshotOf>;
  piezas: OrderedModulePiece[];
  detalles: NormalizedDetail[];
  /** Lados que van sin canto porque la placa de la pieza no tiene uno de su color (DECISIONES 45): se avisan. */
  cantosSinElegir: MissingDefaultEdge[];
};

/**
 * Arma las filas de corte de los modulos de una solicitud (spec §8.2 y §8.3): trae de la base los modulos, las
 * placas, los cantos y la configuracion, arma con planModuleOrder y pasa las filas por normalizeDetails.
 * Si algo no sirve responde 400 con un codigo y todos los problemas de ese tipo juntos (ver planModuleOrder).
 */
export async function buildModuleOrder(tx: Tx, lines: ModuleOrderLine[], context: { cliente: string; numeroContacto: string }) {
  const [config, optimizer, rawModules] = await Promise.all([
    getModulesConfig(tx),
    getOptimizerSettings(tx as PrismaClient),
    tx.modulo.findMany({ where: { id: { in: [...new Set(lines.map((line) => line.moduloId))] } }, include: MODULE_INCLUDE })
  ]);
  const modules = new Map(rawModules.map((module) => [module.id, { raw: module, definition: toDefinition(module) satisfies PlanModule }]));

  // Todas las placas que la solicitud puede usar: colores, fondos (del modulo y de la configuracion) y fijos.
  const materialIds = new Set<string>(lines.flatMap((line) => [line.colorEsqueletoId, line.colorFrentesId, ...(line.materialFondoId ? [line.materialFondoId] : [])]));
  if (config.materialFondoId) materialIds.add(config.materialFondoId);
  for (const { definition } of modules.values()) {
    if (definition.materialFondoId) materialIds.add(definition.materialFondoId);
    definition.piezas.forEach((pieza) => pieza.materialFijoId && materialIds.add(pieza.materialFijoId));
  }
  const [materials, cantos] = await Promise.all([
    tx.material.findMany({ where: { id: { in: [...materialIds] } } }),
    // Todos los cantos activos: por defecto cada pieza lleva el de su placa, y a mano se puede elegir cualquiera.
    tx.material.findMany({
      where: { tipo: TipoMaterial.CANTO, activo: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }] // si hubiera dos de la misma placa y espesor, siempre el mismo
    })
  ]);

  const plan = planModuleOrder({
    lines,
    modules: new Map([...modules].map(([id, { definition }]) => [id, definition])),
    materials: new Map(materials.map((material) => [material.id, material])),
    cantos,
    config: { redondeo: config.redondeo as RoundingMode, materialFondoId: config.materialFondoId },
    optimizer
  });
  if (!plan.ok) {
    const { code, message, problems, details } = plan.error;
    throw new AppError(400, message, { code, details: { errores: problems, ...details } });
  }

  // Las filas pasan por el mismo normalizeDetails que el corte: nombres de canto, cliente e indice (R8).
  const flat = plan.lines.flatMap((item) => item.rows).map((row, indice) => ({ ...row, indice }));
  const detalles = await normalizeDetails(flat, context.cliente, context.numeroContacto, tx);
  let offset = 0;
  const lineas: BuiltModuleLine[] = plan.lines.map(({ posicion, line, module, piezas, valores, materialFondoId, sinCanto }) => {
    const item: BuiltModuleLine = {
      posicion,
      moduloId: module.id,
      nombreModulo: module.nombre,
      version: module.version,
      valores,
      colorEsqueletoId: line.colorEsqueletoId,
      colorFrentesId: line.colorFrentesId,
      perfilCantoOrden: line.perfilCantoOrden,
      materialFondoId,
      observaciones: line.observaciones?.trim() || null,
      definicionSnapshot: snapshotOf(modules.get(module.id)!.raw),
      piezas,
      detalles: detalles.slice(offset, offset + piezas.length),
      cantosSinElegir: sinCanto
    };
    offset += piezas.length;
    return item;
  });
  return { lineas, detalles };
}

/**
 * Presupuesto de una solicitud de modulos (spec §8.4 y DECISIONES R1): presupuestoEstimado y todos sus
 * componentes son exactamente los de buildOrderEstimateSnapshot, como en corte. Los herrajes (Fase 6) van aparte.
 */
export async function buildModuleOrderEstimate(tx: Tx, detalles: NormalizedDetail[]) {
  const snapshot = await buildOrderEstimateSnapshot(tx as PrismaClient, detalles as never);
  const costoHerrajes = 0;
  return {
    ...snapshot,
    costoHerrajes,
    presupuestoConHerrajes: (toCentavos(snapshot.presupuestoEstimado) + toCentavos(costoHerrajes)) / 100
  };
}

// ---------------------------------------------------------------- alta, detalle y listado (F4.3)

const PLATE_SELECT = { id: true, nombre: true, espesorMm: true } satisfies Prisma.MaterialSelect;

export const MODULE_ORDER_INCLUDE = {
  usuario: { select: { id: true, nombre: true, apellido: true, email: true, telefono: true } },
  modulos: {
    orderBy: { posicion: "asc" },
    include: {
      colorEsqueleto: { select: PLATE_SELECT },
      colorFrentes: { select: PLATE_SELECT },
      materialFondo: { select: PLATE_SELECT }
    }
  },
  detalles: DETALLES_ORDENADOS,
  herrajes: true,
  historial: { include: { usuario: { select: { nombre: true, apellido: true } } }, orderBy: { fechaCreacion: "desc" } }
} satisfies Prisma.PedidoInclude;

type ModuleOrderWithRelations = Prisma.PedidoGetPayload<{ include: typeof MODULE_ORDER_INCLUDE }>;

/** Total con herrajes (R1): no es una columna; se suma en centavos al leer. */
const withHardwareTotal = (presupuestoEstimado: number, costoHerrajes: number) => (toCentavos(presupuestoEstimado) + toCentavos(costoHerrajes)) / 100;

/** Una solicitud de modulos como la devuelve la API: la fecha de entrega como AAAA-MM-DD (DECISIONES 8). */
function serializeModuleOrder(order: ModuleOrderWithRelations) {
  return {
    ...order,
    fechaEntrega: toDateOnly(order.fechaEntrega),
    presupuestoConHerrajes: withHardwareTotal(order.presupuestoEstimado, order.costoHerrajes)
  };
}

export async function getModuleOrder(tx: Tx, id: string) {
  const order = await tx.pedido.findFirst({ where: { id, tipo: TipoPedido.MODULOS }, include: MODULE_ORDER_INCLUDE });
  if (!order) throw new AppError(404, "Solicitud de módulos no encontrada.");
  return serializeModuleOrder(order);
}

/**
 * Cambia la fecha de entrega (spec §9.3) y lo deja en el historial: CAMBIAR_FECHA_ENTREGA, con la fecha anterior y la
 * nueva como AAAA-MM-DD. Una solicitud entregada ya no cambia de fecha; la misma fecha no hace nada. Se aplica solo si
 * la solicitud no cambio desde que se leyo, como el cambio de estado: si cambio, 409 ORDER_CHANGED.
 */
export async function changeModuleOrderDeliveryDate(prisma: PrismaClient, id: string, fechaEntrega: string, userId: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.pedido.findFirst({
      where: { id, tipo: TipoPedido.MODULOS },
      select: { estado: true, fechaEntrega: true, fechaActualizacion: true }
    });
    if (!order) throw new AppError(404, "Solicitud de módulos no encontrada.");
    if (order.estado === EstadoPedido.ENTREGADA) {
      throw new AppError(409, "La solicitud ya se entregó: no se puede cambiar la fecha de entrega.", { code: "ORDER_DELIVERED" });
    }
    const anterior = toDateOnly(order.fechaEntrega);
    if (anterior === fechaEntrega) return;
    const updated = await tx.pedido.updateMany({
      where: { id, estado: order.estado, fechaActualizacion: order.fechaActualizacion },
      data: { fechaEntrega: fromDateOnly(fechaEntrega) }
    });
    if (updated.count !== 1) throw new AppError(409, "La solicitud cambió mientras tanto. Recargá la página y volvé a intentar.", { code: "ORDER_CHANGED" });
    await tx.historialPedido.create({ data: { pedidoId: id, usuarioId: userId, accion: "CAMBIAR_FECHA_ENTREGA", valorAnterior: anterior, valorNuevo: fechaEntrega } });
  });
  return getModuleOrder(prisma, id);
}

/** Se puede editar mientras no este en proceso, terminada ni entregada (spec §10.1, igual que corte). */
export const canEditModuleOrder = (estado: EstadoPedido) =>
  estado !== EstadoPedido.EN_PROCESO && estado !== EstadoPedido.TERMINADA && estado !== EstadoPedido.ENTREGADA;

/**
 * Edicion de una solicitud de modulos (spec §10.3). Reemplaza las filas como el PUT de corte, pero cada fila que sigue
 * conserva su modulo, su codigo de pieza, su orden y su codigo de barra; si cambio, pasa a EDITADO (una MANUAL sigue
 * MANUAL). Las nuevas son MANUAL, van al final de su modulo y llevan el codigo M{numero}-{posicion}-{orden} (las
 * adicionales, posicion 00). Los modulos (medidas, colores, fondo) no cambian (spec §10.4). Las filas siguen al
 * cliente de la solicitud. El presupuesto sale del mismo normalizeDetails y buildOrderEstimateSnapshot que el corte.
 * Sin ningun cambio no escribe nada. Con cambios, deja EDITAR_PEDIDO en el historial con el resumen.
 */
export async function updateModuleOrder(prisma: PrismaClient, id: string, input: ModuleOrderUpdateInput, userId: string) {
  const existing = await prisma.pedido.findFirst({
    where: { id, tipo: TipoPedido.MODULOS },
    include: { detalles: DETALLES_ORDENADOS, modulos: { select: { id: true, posicion: true } } }
  });
  if (!existing) throw new AppError(404, "Solicitud de módulos no encontrada.");
  if (!canEditModuleOrder(existing.estado)) throw new AppError(403, "No se pueden editar pedidos en proceso, terminados o entregados.");
  if (hasStockCommitment(existing)) throw new AppError(409, "La solicitud tiene stock descontado. Pasala a pendiente antes de editarla.");
  if (input.fechaActualizacion && new Date(input.fechaActualizacion).getTime() !== existing.fechaActualizacion.getTime()) {
    throw new AppError(409, "La solicitud cambió mientras la editabas. Recargá la página y volvé a hacer los cambios.", { code: "ORDER_CHANGED" });
  }
  const fechaAnterior = toDateOnly(existing.fechaEntrega);
  if (input.fechaEntrega !== fechaAnterior && input.fechaEntrega < todayInBusinessZone()) {
    throw new AppError(400, "La fecha de entrega no puede ser anterior a hoy.", { code: "DELIVERY_DATE_PAST" });
  }

  // Cada fila va con un modulo de esta solicitud o sin modulo (pieza adicional).
  const posicionDe = new Map(existing.modulos.map((modulo) => [modulo.id, modulo.posicion]));
  const ajena = input.detalles.findIndex((detalle) => detalle.pedidoModuloId && !posicionDe.has(detalle.pedidoModuloId));
  if (ajena >= 0) {
    throw new AppError(400, `La pieza ${ajena + 1} es de un módulo que no está en esta solicitud. Recargá la página y volvé a intentar.`, {
      code: "MODULE_NOT_IN_ORDER"
    });
  }

  // Las filas, agrupadas como se leen: por modulo (posicion) y las adicionales al final; dentro de cada grupo, como vinieron.
  const grupo = (pedidoModuloId: string | null | undefined) => (pedidoModuloId ? posicionDe.get(pedidoModuloId)! : Number.MAX_SAFE_INTEGER);
  const filas = input.detalles.map((detalle, index) => ({ detalle, index })).sort((a, b) => grupo(a.detalle.pedidoModuloId) - grupo(b.detalle.pedidoModuloId) || a.index - b.index);

  const guardadas = existing.detalles;
  const { matches } = matchRows(
    guardadas,
    filas.map(({ detalle }) => detalle)
  );
  // Las nuevas siguen al ultimo orden guardado de su grupo, asi un codigo de barra no se repite.
  const ultimoOrden = new Map<string, number>();
  for (const detalle of guardadas) {
    const key = detalle.pedidoModuloId ?? "";
    ultimoOrden.set(key, Math.max(ultimoOrden.get(key) ?? 0, detalle.orden));
  }
  const nuevas = filas.map(({ detalle }, indice) => {
    const match = matches[indice];
    const pedidoModuloId = detalle.pedidoModuloId ?? null;
    const base = { ...detalle, id: undefined, numeroCliente: "", nombreCliente: "", pedidoModuloId, indice };
    if (match.kind === "kept") {
      const { saved, changed } = match;
      const origen = saved.origen === OrigenDetalle.MANUAL ? OrigenDetalle.MANUAL : changed ? OrigenDetalle.EDITADO : saved.origen;
      return { ...base, piezaCodigo: saved.piezaCodigo, orden: saved.orden, origen, codigoBarra: saved.codigoBarra };
    }
    const key = pedidoModuloId ?? "";
    const orden = (ultimoOrden.get(key) ?? 0) + 1;
    ultimoOrden.set(key, orden);
    const posicion = pedidoModuloId ? posicionDe.get(pedidoModuloId)! : 0;
    return { ...base, piezaCodigo: null, orden, origen: OrigenDetalle.MANUAL, codigoBarra: moduleBarcode(existing.numero, posicion, orden) };
  });

  const changes = summarizeChanges(
    {
      data: {
        cliente: existing.cliente,
        numeroContacto: existing.numeroContacto ?? "",
        emailContacto: existing.emailContacto,
        direccionEntrega: existing.direccionEntrega,
        fechaEntrega: fechaAnterior,
        observaciones: existing.observaciones
      },
      rows: guardadas
    },
    { data: input, rows: filas.map(({ detalle }) => detalle) }
  );
  if (!hasChanges(changes)) return getModuleOrder(prisma, id);

  // Calculo afuera de la transaccion, como el alta: el optimizador puede tardar mas de lo que dura una transaccion.
  const detalles = await normalizeDetails(nuevas, input.cliente, input.numeroContacto);
  const { costoHerrajes, presupuestoConHerrajes: _total, ...snapshot } = await buildModuleOrderEstimate(prisma, detalles);

  await prisma.$transaction(async (tx) => {
    // Solo si sigue como se leyo: si otro la cambio mientras se calculaba, 409 y no se toca nada.
    const claimed = await tx.pedido.updateMany({
      where: { id, estado: existing.estado, fechaActualizacion: existing.fechaActualizacion },
      data: {
        cliente: input.cliente,
        numeroContacto: input.numeroContacto,
        emailContacto: input.emailContacto ?? null,
        direccionEntrega: input.direccionEntrega ?? null,
        fechaEntrega: fromDateOnly(input.fechaEntrega),
        observaciones: input.observaciones ?? null,
        costoHerrajes,
        ...snapshot
      }
    });
    if (claimed.count !== 1) throw new AppError(409, "La solicitud cambió mientras la editabas. Recargá la página y volvé a hacer los cambios.", { code: "ORDER_CHANGED" });
    await tx.detallePedido.deleteMany({ where: { pedidoId: id } });
    await tx.detallePedido.createMany({ data: detalles.map((detalle) => ({ ...detalle, pedidoId: id })) });
    await tx.historialPedido.create({ data: { pedidoId: id, usuarioId: userId, accion: "EDITAR_PEDIDO", valorNuevo: describeChanges(changes) } });
  });
  return getModuleOrder(prisma, id);
}

/** 409 si algun modulo no esta en la version esperada (la que mostro la vista previa, o la que se uso para calcular). */
function assertSameVersions(expected: Array<{ posicion: number; moduloId: string; nombreModulo: string; version?: number }>, current: Map<string, number>) {
  const changed = expected.filter((item) => item.version !== undefined && current.get(item.moduloId) !== item.version);
  if (!changed.length) return;
  const problems = changed.map(
    (item) => `El módulo ${item.posicion} (${item.nombreModulo}) cambió en el catálogo (versión ${item.version} -> ${current.get(item.moduloId) ?? "borrado"}).`
  );
  throw new AppError(409, `${problems.join(" ")} Volvé a revisar la vista previa antes de crear la solicitud.`, {
    code: "MODULE_CHANGED",
    details: {
      errores: problems,
      modulos: changed.map((item) => ({ posicion: item.posicion, version: item.version, versionActual: current.get(item.moduloId) ?? null }))
    }
  });
}

/**
 * Alta de una solicitud de modulos (spec §13.2). Calcula afuera de la transaccion, igual que el alta de corte: el
 * optimizador puede tardar varios segundos y una transaccion interactiva de Prisma corta a los 5. Adentro solo
 * escribe: el Pedido (para tener su numero), los PedidoModulo con su copia de la definicion y las filas con el
 * codigo de barra definitivo. No manda push ni WhatsApp (spec §15). Guarda exactamente lo que da la vista previa.
 */
export async function createModuleOrder(prisma: PrismaClient, input: ModuleOrderCreateInput, userId: string): Promise<{ order: ModuleOrderView; created: boolean }> {
  // Un intento que ya entro (se perdio la respuesta y el navegador lo manda otra vez con la misma clave): se devuelve.
  const previous = input.claveAlta ? await findModuleOrderByAltaKey(prisma, input.claveAlta, userId) : null;
  if (previous) return { order: previous, created: false };

  const order = await buildModuleOrder(prisma, input.modulos, { cliente: input.cliente, numeroContacto: input.numeroContacto });
  // La version que vio quien carga (la de la vista previa) contra la que se acaba de usar para calcular.
  assertSameVersions(
    order.lineas.map((linea, index) => ({ ...linea, version: input.modulos[index].version })),
    new Map(order.lineas.map((linea) => [linea.moduloId, linea.version]))
  );
  const { costoHerrajes, presupuestoConHerrajes: _total, ...snapshot } = await buildModuleOrderEstimate(prisma, order.detalles);

  let id: string;
  try {
    id = await insertModuleOrder(prisma, input, userId, order, snapshot, costoHerrajes);
  } catch (error) {
    // Dos intentos con la misma clave a la vez (el primero todavia calculaba): el segundo choca con el indice unico y
    // devuelve el que entro.
    if (input.claveAlta && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const winner = await findModuleOrderByAltaKey(prisma, input.claveAlta, userId);
      if (winner) return { order: winner, created: false };
    }
    throw error;
  }
  return { order: await getModuleOrder(prisma, id), created: true };
}

type ModuleOrderView = Awaited<ReturnType<typeof getModuleOrder>>;

/** La solicitud de un intento de alta, si ya entro. Una clave de otro usuario o de otro tipo de pedido es un error. */
export async function findModuleOrderByAltaKey(prisma: PrismaClient, claveAlta: string, userId: string): Promise<ModuleOrderView | null> {
  const existing = await prisma.pedido.findUnique({ where: { claveAlta }, select: { id: true, usuarioId: true, tipo: true } });
  if (!existing) return null;
  if (existing.usuarioId !== userId || existing.tipo !== TipoPedido.MODULOS) {
    throw new AppError(409, "Esa clave de alta ya se usó en otra solicitud. Volvé a tocar Crear solicitud.", { code: "ALTA_KEY_CONFLICT" });
  }
  return getModuleOrder(prisma, existing.id);
}

/** Escribe la solicitud ya calculada, en una transaccion. Devuelve su id. */
async function insertModuleOrder(
  prisma: PrismaClient,
  input: ModuleOrderCreateInput,
  userId: string,
  order: Awaited<ReturnType<typeof buildModuleOrder>>,
  snapshot: Omit<Awaited<ReturnType<typeof buildModuleOrderEstimate>>, "costoHerrajes" | "presupuestoConHerrajes">,
  costoHerrajes: number
) {
  return prisma.$transaction(async (tx) => {
    // Y la que se uso para calcular contra el catalogo de este momento: si alguien guardo el modulo mientras tanto, 409.
    const current = await tx.modulo.findMany({ where: { id: { in: order.lineas.map((linea) => linea.moduloId) } }, select: { id: true, version: true } });
    assertSameVersions(order.lineas, new Map(current.map((module) => [module.id, module.version])));

    const pedido = await tx.pedido.create({
      data: {
        tipo: TipoPedido.MODULOS,
        estado: EstadoPedido.PENDIENTE,
        cliente: input.cliente,
        numeroContacto: input.numeroContacto,
        emailContacto: input.emailContacto ?? null,
        direccionEntrega: input.direccionEntrega ?? null,
        fechaEntrega: fromDateOnly(input.fechaEntrega),
        observaciones: input.observaciones ?? null,
        usuarioId: userId,
        costoHerrajes,
        claveAlta: input.claveAlta ?? null,
        ...snapshot
      },
      select: { id: true, numero: true }
    });
    const modulos = await tx.pedidoModulo.createManyAndReturn({
      data: order.lineas.map((linea) => ({
        pedidoId: pedido.id,
        moduloId: linea.moduloId,
        posicion: linea.posicion,
        nombreModulo: linea.nombreModulo,
        valores: linea.valores,
        colorEsqueletoId: linea.colorEsqueletoId,
        colorFrentesId: linea.colorFrentesId,
        perfilCantoOrden: linea.perfilCantoOrden,
        materialFondoId: linea.materialFondoId,
        observaciones: linea.observaciones,
        definicionSnapshot: linea.definicionSnapshot as unknown as Prisma.InputJsonValue
      })),
      select: { id: true, posicion: true }
    });
    const pedidoModuloId = new Map(modulos.map((modulo) => [modulo.posicion, modulo.id]));
    await tx.detallePedido.createMany({
      data: order.lineas.flatMap((linea) =>
        linea.detalles.map((detalle) => ({
          ...detalle,
          pedidoId: pedido.id,
          pedidoModuloId: pedidoModuloId.get(linea.posicion)!,
          codigoBarra: moduleBarcode(pedido.numero, linea.posicion, detalle.orden ?? 0)
        }))
      )
    });
    await tx.historialPedido.create({ data: { pedidoId: pedido.id, usuarioId: userId, accion: "CREAR_PEDIDO_MODULOS" } });
    return pedido.id;
  });
}

/**
 * Listado de solicitudes de modulos (spec §13.2 y §9.1). La busqueda mira cliente, telefono, referencia y numero
 * (1044 o M-1044). Orden (compareForList): primero las que siguen en curso, por fecha de entrega (sin fecha al final)
 * y numero; despues las rechazadas y al final las entregadas.
 */
export async function listModuleOrders(tx: Tx, filters: ModuleOrderFilters) {
  const where: Prisma.PedidoWhereInput = { tipo: TipoPedido.MODULOS };
  if (filters.clave) where.claveAlta = filters.clave;
  if (filters.estado) where.estado = filters.estado;
  if (filters.entregaDesde || filters.entregaHasta) {
    where.fechaEntrega = {
      ...(filters.entregaDesde ? { gte: fromDateOnly(filters.entregaDesde) } : {}),
      ...(filters.entregaHasta ? { lte: fromDateOnly(filters.entregaHasta) } : {})
    };
  }
  if (filters.search) {
    const contains = { contains: filters.search, mode: "insensitive" as const };
    const numero = /^\s*m?\s*-?\s*(\d{1,9})\s*$/i.exec(filters.search);
    where.OR = [{ cliente: contains }, { numeroContacto: contains }, { observaciones: contains }, ...(numero ? [{ numero: Number(numero[1]) }] : [])];
  }
  const orders = await tx.pedido.findMany({
    where,
    select: {
      id: true,
      numero: true,
      cliente: true,
      numeroContacto: true,
      emailContacto: true,
      observaciones: true,
      estado: true,
      fechaCreacion: true,
      fechaActualizacion: true,
      fechaEntrega: true,
      placasEstimadas: true,
      presupuestoEstimado: true,
      costoHerrajes: true,
      faltanteStock: true,
      stockReservado: true,
      usuarioId: true,
      _count: { select: { modulos: true } }
    }
  });
  return orders
    .sort(compareForList)
    .map(({ _count, ...order }) => ({
      ...order,
      fechaEntrega: toDateOnly(order.fechaEntrega),
      cantidadModulos: _count.modulos,
      presupuestoConHerrajes: withHardwareTotal(order.presupuestoEstimado, order.costoHerrajes)
    }));
}
