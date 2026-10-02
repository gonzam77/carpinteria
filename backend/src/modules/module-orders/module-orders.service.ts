// Solicitudes de modulos: del modulo configurado a las filas de corte (spec §8).
//
// Paridad con las solicitudes de corte (regla 1): las piezas salen del armador compartido (buildModulePieces,
// DECISIONES R6), las filas pasan por el mismo normalizeDetails que el corte (R8) y el presupuesto es el mismo
// buildOrderEstimateSnapshot, sin cambios (R1). Unas mismas piezas dan las mismas placas y los mismos importes
// se carguen como corte o como modulos: lo unico que agrega este servicio es de donde sale cada fila.
import { Prisma, TipoMaterial, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
import type { OrderedModulePiece, RoundingMode } from "../../shared/moduleFormula.js";
import { toCentavos } from "../../shared/orderEstimate.js";
import { getModulesConfig, MODULE_INCLUDE, toDefinition } from "../catalog/catalog.service.js";
import { normalizeDetails, type NormalizedDetail } from "../orders/order-details.service.js";
import { buildOrderEstimateSnapshot, getOptimizerSettings } from "../orders/order-estimate.service.js";
import { planModuleOrder, type PlanModule } from "./module-order-plan.js";
import type { ModuleOrderLine } from "./module-orders.schemas.js";

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
