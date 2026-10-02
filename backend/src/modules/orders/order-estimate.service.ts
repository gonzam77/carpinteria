import { TipoMaterial, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
import { computeOrderEstimate, toCentavos, type OrderEstimate } from "../../shared/orderEstimate.js";

/**
 * Detalle del calculo con el que se armo la constancia. Se guarda en Pedido.estimacionDetalle para que el
 * listado de materiales y el dashboard muestren exactamente las mismas placas que la constancia, aunque
 * despues cambien los precios, la configuracion o el optimizador.
 */
export type EstimacionDetalle = {
  version: 1;
  porMaterial: Array<{ materialId: string; nombre: string; placas: number; piezas: number; valorCentavos: number }>;
  porCanto: Array<{ cantoId: string; mm: number; espesorMm: number; valorCentavos: number }>;
  optimizador: { espesorSierraMm: number; perfiladoBordeMm: number };
  tarifas: { manoObraPlacaPorPlaca: number; manoObraCanto045Mm: number; manoObraCanto1Mm: number; manoObraCanto2Mm: number };
};

type EstimateSnapshot = {
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
};

/** De donde salen las placas: del detalle guardado con la constancia, o recalculadas (pedidos anteriores). */
export type OrigenPlacas = "CONSTANCIA" | "RECALCULADO";

const ZERO_BUDGET = { manoObraPlacaPorPlaca: 0, manoObraCanto045Mm: 0, manoObraCanto1Mm: 0, manoObraCanto2Mm: 0 };

async function getOptimizerSettings(tx: PrismaClient) {
  return tx.configuracionOptimizador.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
}

async function getBudgetSettings(tx: PrismaClient) {
  return tx.configuracionPresupuesto.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" }
  });
}

function cantoIdsOf(detalles: DetallePedido[]) {
  return [
    ...new Set(
      detalles
        .flatMap((detail) => [detail.cantoLargo1Id, detail.cantoLargo2Id, detail.cantoAncho1Id, detail.cantoAncho2Id])
        .filter(Boolean)
    )
  ] as string[];
}

// Trae de la base lo que necesita el calculo compartido (frontend/src/lib/orderEstimate.ts) y lo corre.
// Es el unico calculo de placas y presupuesto del backend: snapshot, listado de materiales y stock, y el
// mismo que usa el plano de cortes del navegador. Las placas salen del optimizador con la variante 0, que
// es la que muestra el plano al abrirse. Antes el backend tenia un empaquetador propio, sin cortes de
// guillotina, que podia acomodar las piezas en menos placas de las que realmente se pueden cortar.
async function estimateOrder(tx: PrismaClient, detalles: DetallePedido[], withBudget: boolean) {
  const materialIds = [...new Set(detalles.map((detail) => detail.materialId).filter(Boolean))] as string[];
  const cantoIds = cantoIdsOf(detalles);
  const [settings, budgetSettings, materials, cantos] = await Promise.all([
    getOptimizerSettings(tx),
    withBudget ? getBudgetSettings(tx) : Promise.resolve(ZERO_BUDGET),
    materialIds.length ? tx.material.findMany({ where: { id: { in: materialIds }, tipo: TipoMaterial.PLACA } }) : Promise.resolve([]),
    cantoIds.length ? tx.material.findMany({ where: { id: { in: cantoIds }, tipo: TipoMaterial.CANTO } }) : Promise.resolve([])
  ]);

  const estimate = computeOrderEstimate({
    rows: detalles,
    plates: materials,
    cantos,
    optimizerSettings: settings,
    budgetSettings
  });
  return { estimate, settings, budgetSettings, cantos };
}

function throwFirstError(estimate: OrderEstimate, missingMaterialMessage: string) {
  const [error] = estimate.errores;
  if (!error) return;
  throw new AppError(400, error.tipo === "MATERIAL_INEXISTENTE" ? missingMaterialMessage : error.mensaje);
}

export async function buildOrderEstimateSnapshot(tx: PrismaClient, detalles: DetallePedido[]): Promise<EstimateSnapshot> {
  const { estimate, settings, budgetSettings, cantos } = await estimateOrder(tx, detalles, true);
  throwFirstError(estimate, "Material no encontrado para calcular presupuesto.");
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  return {
    ...estimate.totales,
    faltanteStock: estimate.faltanteStock,
    estimacionDetalle: {
      version: 1,
      porMaterial: estimate.porMaterial.map((item) => ({
        materialId: item.materialId,
        nombre: item.placa?.nombre ?? "",
        placas: item.placas,
        piezas: item.piezas,
        valorCentavos: toCentavos(item.placa?.valor ?? 0)
      })),
      porCanto: estimate.porCanto.map(({ cantoId, mm }) => ({
        cantoId,
        mm,
        espesorMm: cantoById.get(cantoId)?.espesorMm ?? 0,
        valorCentavos: toCentavos(cantoById.get(cantoId)?.valor ?? 0)
      })),
      optimizador: { espesorSierraMm: settings.espesorSierraMm, perfiladoBordeMm: settings.perfiladoBordeMm },
      tarifas: {
        manoObraPlacaPorPlaca: budgetSettings.manoObraPlacaPorPlaca,
        manoObraCanto045Mm: budgetSettings.manoObraCanto045Mm,
        manoObraCanto1Mm: budgetSettings.manoObraCanto1Mm,
        manoObraCanto2Mm: budgetSettings.manoObraCanto2Mm
      }
    }
  };
}

export function parseEstimacionDetalle(value: unknown): EstimacionDetalle | null {
  if (!value || typeof value !== "object") return null;
  const detail = value as Partial<EstimacionDetalle>;
  if (detail.version !== 1 || !Array.isArray(detail.porMaterial) || !Array.isArray(detail.porCanto)) return null;
  return detail as EstimacionDetalle;
}

/** Placas por material recalculadas con el codigo actual. Lo usa la reserva de stock. */
export async function calculateOrderMaterialBoardsEstimate(tx: PrismaClient, detalles: DetallePedido[]) {
  const { estimate } = await estimateOrder(tx, detalles, false);
  throwFirstError(estimate, "Material no encontrado para calcular stock.");
  return estimate.porMaterial.map((material) => ({ material: material.placa as Material, boards: material.placas, piezas: material.piezas }));
}

/**
 * Placas por material de un pedido tal como las informa su constancia. Los pedidos guardados antes de que
 * existiera el detalle se recalculan con el codigo actual (origen RECALCULADO).
 */
export async function orderMaterialBoards(
  tx: PrismaClient,
  order: { detalles: DetallePedido[]; estimacionDetalle?: unknown },
  missingMaterialMessage = "Material no encontrado para calcular stock."
): Promise<{ origen: OrigenPlacas; items: Array<{ material: Material; boards: number; piezas: number }> }> {
  const detail = parseEstimacionDetalle(order.estimacionDetalle);
  if (!detail) {
    if (!order.detalles.some((row) => row.materialId)) return { origen: "RECALCULADO", items: [] };
    return { origen: "RECALCULADO", items: await calculateOrderMaterialBoardsEstimate(tx, order.detalles) };
  }

  const materials = detail.porMaterial.length
    ? await tx.material.findMany({ where: { id: { in: detail.porMaterial.map((item) => item.materialId) } } })
    : [];
  const materialById = new Map(materials.map((material) => [material.id, material]));
  return {
    origen: "CONSTANCIA",
    items: detail.porMaterial.map((item) => {
      const material = materialById.get(item.materialId);
      if (!material) throw new AppError(400, missingMaterialMessage);
      return { material, boards: item.placas, piezas: item.piezas };
    })
  };
}

type MaterialsSummaryPlate = {
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

type MaterialsSummaryEdge = {
  cantoId: string;
  nombre: string;
  espesorMm: number;
  metros: number;
};

export type OrderMaterialsSummary = {
  origen: OrigenPlacas;
  placas: MaterialsSummaryPlate[];
  cantos: MaterialsSummaryEdge[];
  totalPlacas: number;
  totalMetrosCanto: number;
};

export async function buildOrderMaterialsSummary(
  tx: PrismaClient,
  order: { detalles: DetallePedido[]; estimacionDetalle?: unknown }
): Promise<OrderMaterialsSummary> {
  const { detalles } = order;
  const missing = "Material no encontrado para calcular el listado de materiales.";
  const detail = parseEstimacionDetalle(order.estimacionDetalle);
  if (!detail && !detalles.some((row) => row.materialId)) {
    return { origen: "RECALCULADO", placas: [], cantos: [], totalPlacas: 0, totalMetrosCanto: 0 };
  }

  const { origen, items } = await orderMaterialBoards(tx, order, missing);
  const placas: MaterialsSummaryPlate[] = items.map(({ material, boards, piezas }) => {
    const stockPlacas = material.stockPlacas ?? null;
    return {
      materialId: material.id,
      nombre: material.nombre,
      anchoPlaca: material.anchoPlaca,
      altoPlaca: material.altoPlaca,
      espesorMm: material.espesorMm,
      piezas,
      placas: boards,
      stockPlacas,
      faltantePlacas: Math.max(0, boards - (stockPlacas ?? 0))
    };
  });

  // Los mm por canto salen del mismo calculo que la constancia: guardados en el detalle o recalculados.
  const edgeMm = detail ? detail.porCanto : (await estimateOrder(tx, detalles, false)).estimate.porCanto;
  const cantoIds = edgeMm.map((edge) => edge.cantoId);
  const cantos = cantoIds.length ? await tx.material.findMany({ where: { id: { in: cantoIds }, tipo: TipoMaterial.CANTO } }) : [];
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  // El nombre que se muestra es el guardado en el primer detalle que usa el canto, como antes.
  const nameByCanto = new Map<string, string>();
  for (const row of detalles) {
    for (const [id, nombre] of [
      [row.cantoLargo1Id, row.cantoLargo1Nombre],
      [row.cantoLargo2Id, row.cantoLargo2Nombre],
      [row.cantoAncho1Id, row.cantoAncho1Nombre],
      [row.cantoAncho2Id, row.cantoAncho2Nombre]
    ]) {
      if (id && !nameByCanto.has(id)) nameByCanto.set(id, nombre ?? cantoById.get(id)?.nombre ?? "");
    }
  }
  const cantosList: MaterialsSummaryEdge[] = edgeMm.map(({ cantoId, mm }) => ({
    cantoId,
    nombre: nameByCanto.get(cantoId) || cantoById.get(cantoId)?.nombre || "",
    espesorMm: cantoById.get(cantoId)?.espesorMm ?? 0,
    metros: mm / 1000
  }));

  cantosList.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  placas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    origen,
    placas,
    cantos: cantosList,
    totalPlacas: placas.reduce((total, placa) => total + placa.placas, 0),
    totalMetrosCanto: edgeMm.reduce((total, edge) => total + edge.mm, 0) / 1000
  };
}
