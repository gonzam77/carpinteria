import { TipoMaterial, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
import { computeOrderEstimate, type OrderEstimate } from "../../shared/orderEstimate.js";

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
};

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
  return { estimate, materials, cantos };
}

function throwFirstError(estimate: OrderEstimate, missingMaterialMessage: string) {
  const [error] = estimate.errores;
  if (!error) return;
  throw new AppError(400, error.tipo === "MATERIAL_INEXISTENTE" ? missingMaterialMessage : error.mensaje);
}

export async function buildOrderEstimateSnapshot(tx: PrismaClient, detalles: DetallePedido[]): Promise<EstimateSnapshot> {
  const { estimate } = await estimateOrder(tx, detalles, true);
  throwFirstError(estimate, "Material no encontrado para calcular presupuesto.");
  return { ...estimate.totales, faltanteStock: estimate.faltanteStock };
}

/** Placas por material del pedido, con el mismo calculo que el snapshot. Lo usan la reserva de stock y el dashboard. */
export async function calculateOrderMaterialBoardsEstimate(tx: PrismaClient, detalles: DetallePedido[]) {
  const { estimate } = await estimateOrder(tx, detalles, false);
  throwFirstError(estimate, "Material no encontrado para calcular stock.");
  return estimate.porMaterial.map((material) => ({ material: material.placa as Material, boards: material.placas }));
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
  placas: MaterialsSummaryPlate[];
  cantos: MaterialsSummaryEdge[];
  totalPlacas: number;
  totalMetrosCanto: number;
};

export async function buildOrderMaterialsSummary(tx: PrismaClient, detalles: DetallePedido[]): Promise<OrderMaterialsSummary> {
  if (!detalles.some((detail) => detail.materialId)) {
    return { placas: [], cantos: [], totalPlacas: 0, totalMetrosCanto: 0 };
  }

  const { estimate, cantos } = await estimateOrder(tx, detalles, false);
  throwFirstError(estimate, "Material no encontrado para calcular el listado de materiales.");

  const placas: MaterialsSummaryPlate[] = estimate.porMaterial.map((item) => {
    const material = item.placa as Material;
    const stockPlacas = material.stockPlacas ?? null;
    return {
      materialId: material.id,
      nombre: material.nombre,
      anchoPlaca: material.anchoPlaca,
      altoPlaca: material.altoPlaca,
      espesorMm: material.espesorMm,
      piezas: item.piezas,
      placas: item.placas,
      stockPlacas,
      faltantePlacas: Math.max(0, item.placas - (stockPlacas ?? 0))
    };
  });

  // El nombre que se muestra es el guardado en el primer detalle que usa el canto (como antes); los metros
  // salen de los mm enteros del calculo compartido, asi coinciden con los de la constancia.
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));
  const nameByCanto = new Map<string, string>();
  for (const detail of detalles) {
    for (const [id, nombre] of [
      [detail.cantoLargo1Id, detail.cantoLargo1Nombre],
      [detail.cantoLargo2Id, detail.cantoLargo2Nombre],
      [detail.cantoAncho1Id, detail.cantoAncho1Nombre],
      [detail.cantoAncho2Id, detail.cantoAncho2Nombre]
    ]) {
      if (id && !nameByCanto.has(id)) nameByCanto.set(id, nombre ?? cantoById.get(id)?.nombre ?? "");
    }
  }
  const cantosList: MaterialsSummaryEdge[] = estimate.porCanto.map(({ cantoId, mm }) => ({
    cantoId,
    nombre: nameByCanto.get(cantoId) || cantoById.get(cantoId)?.nombre || "",
    espesorMm: cantoById.get(cantoId)?.espesorMm ?? 0,
    metros: mm / 1000
  }));

  cantosList.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  placas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    placas,
    cantos: cantosList,
    totalPlacas: estimate.totales.placasEstimadas,
    totalMetrosCanto: estimate.totales.metrosCanto
  };
}
