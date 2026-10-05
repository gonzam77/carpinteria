// Solicitudes de modulos: del modulo configurado a las filas de corte (spec §8).
//
// Paridad con las solicitudes de corte (regla 1): las piezas salen del armador compartido (buildModulePieces,
// DECISIONES R6), las filas pasan por el mismo normalizeDetails que el corte (R8) y el presupuesto es el mismo
// buildOrderEstimateSnapshot, sin cambios (R1). Unas mismas piezas dan las mismas placas y los mismos importes
// se carguen como corte o como modulos: lo unico que agrega este servicio es de donde sale cada fila.
import { EstadoPedido, Prisma, TipoMaterial, TipoPedido, type PrismaClient } from "../../generated/prisma/client.js";
import { fromDateOnly, toDateOnly } from "../../utils/dates.js";
import { AppError } from "../../utils/http.js";
import type { OrderedModulePiece, RoundingMode } from "../../shared/moduleFormula.js";
import { toCentavos } from "../../shared/orderEstimate.js";
import { getModulesConfig, MODULE_INCLUDE, toDefinition } from "../catalog/catalog.service.js";
import { normalizeDetails, type NormalizedDetail } from "../orders/order-details.service.js";
import { buildOrderEstimateSnapshot, getOptimizerSettings } from "../orders/order-estimate.service.js";
import { DETALLES_ORDENADOS } from "../orders/order-queries.js";
import { moduleBarcode, planModuleOrder, type PlanModule } from "./module-order-plan.js";
import type { ModuleOrderCreateInput, ModuleOrderFilters, ModuleOrderLine } from "./module-orders.schemas.js";

export { moduleBarcode, moduleRemark } from "./module-order-plan.js";

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
  colorCantoId: string;
  perfilCantoOrden: 1 | 2;
  observaciones: string | null;
  definicionSnapshot: ReturnType<typeof snapshotOf>;
  piezas: OrderedModulePiece[];
  detalles: NormalizedDetail[];
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
  const materialIds = new Set<string>(lines.flatMap((line) => [line.colorEsqueletoId, line.colorFrentesId, line.colorCantoId]));
  if (config.materialFondoId) materialIds.add(config.materialFondoId);
  for (const { definition } of modules.values()) {
    if (definition.materialFondoId) materialIds.add(definition.materialFondoId);
    definition.piezas.forEach((pieza) => pieza.materialFijoId && materialIds.add(pieza.materialFijoId));
  }
  const [materials, cantos] = await Promise.all([
    tx.material.findMany({ where: { id: { in: [...materialIds] } } }),
    tx.material.findMany({
      where: { tipo: TipoMaterial.CANTO, activo: true, placaMaterialId: { in: [...new Set(lines.map((line) => line.colorCantoId))] } },
      orderBy: [{ nombre: "asc" }, { id: "asc" }] // si hubiera dos del mismo color y espesor, siempre el mismo
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
  const lineas: BuiltModuleLine[] = plan.lines.map(({ posicion, line, module, piezas, valores }) => {
    const item: BuiltModuleLine = {
      posicion,
      moduloId: module.id,
      nombreModulo: module.nombre,
      version: module.version,
      valores,
      colorEsqueletoId: line.colorEsqueletoId,
      colorFrentesId: line.colorFrentesId,
      colorCantoId: line.colorCantoId,
      perfilCantoOrden: line.perfilCantoOrden,
      observaciones: line.observaciones?.trim() || null,
      definicionSnapshot: snapshotOf(modules.get(module.id)!.raw),
      piezas,
      detalles: detalles.slice(offset, offset + piezas.length)
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
    include: { colorEsqueleto: { select: PLATE_SELECT }, colorFrentes: { select: PLATE_SELECT }, colorCanto: { select: PLATE_SELECT } }
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
  if (!order) throw new AppError(404, "Solicitud de modulos no encontrada.");
  return serializeModuleOrder(order);
}

/** 409 si algun modulo no esta en la version esperada (la que mostro la vista previa, o la que se uso para calcular). */
function assertSameVersions(expected: Array<{ posicion: number; moduloId: string; nombreModulo: string; version?: number }>, current: Map<string, number>) {
  const changed = expected.filter((item) => item.version !== undefined && current.get(item.moduloId) !== item.version);
  if (!changed.length) return;
  const problems = changed.map(
    (item) => `El modulo ${item.posicion} (${item.nombreModulo}) cambio en el catalogo (version ${item.version} -> ${current.get(item.moduloId) ?? "borrado"}).`
  );
  throw new AppError(409, `${problems.join(" ")} Volve a revisar la vista previa antes de crear la solicitud.`, {
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
export async function createModuleOrder(prisma: PrismaClient, input: ModuleOrderCreateInput, userId: string) {
  const order = await buildModuleOrder(prisma, input.modulos, { cliente: input.cliente, numeroContacto: input.numeroContacto });
  // La version que vio quien carga (la de la vista previa) contra la que se acaba de usar para calcular.
  assertSameVersions(
    order.lineas.map((linea, index) => ({ ...linea, version: input.modulos[index].version })),
    new Map(order.lineas.map((linea) => [linea.moduloId, linea.version]))
  );
  const { costoHerrajes, presupuestoConHerrajes: _total, ...snapshot } = await buildModuleOrderEstimate(prisma, order.detalles);

  const id = await prisma.$transaction(async (tx) => {
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
        colorCantoId: linea.colorCantoId,
        perfilCantoOrden: linea.perfilCantoOrden,
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

  return getModuleOrder(prisma, id);
}

/**
 * Listado de solicitudes de modulos (spec §13.2 y §9.1). La busqueda mira cliente, telefono, referencia y numero
 * (1044 o M-1044). Orden: primero las que no estan entregadas, por fecha de entrega (sin fecha al final) y numero.
 */
export async function listModuleOrders(tx: Tx, filters: ModuleOrderFilters) {
  const where: Prisma.PedidoWhereInput = { tipo: TipoPedido.MODULOS };
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
  const delivered = (estado: EstadoPedido) => (estado === EstadoPedido.ENTREGADA ? 1 : 0);
  return orders
    .sort(
      (a, b) =>
        delivered(a.estado) - delivered(b.estado) ||
        (a.fechaEntrega?.getTime() ?? Number.POSITIVE_INFINITY) - (b.fechaEntrega?.getTime() ?? Number.POSITIVE_INFINITY) ||
        a.numero - b.numero
    )
    .map(({ _count, ...order }) => ({
      ...order,
      fechaEntrega: toDateOnly(order.fechaEntrega),
      cantidadModulos: _count.modulos,
      presupuestoConHerrajes: withHardwareTotal(order.presupuestoEstimado, order.costoHerrajes)
    }));
}
