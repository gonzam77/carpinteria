import { TipoMaterial, type ConfiguracionOptimizador, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";
import { buildPiecesFromRows, countUsedBoards, optimizeCutLayout } from "../../shared/cutOptimizer.js";

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

type BudgetSettingsSnapshot = {
  manoObraCanto045Mm: number;
  manoObraCanto1Mm: number;
  manoObraCanto2Mm: number;
  manoObraPlacaPorPlaca: number;
};

function usableBoardWidthMm(material: Material, settings: ConfiguracionOptimizador) {
  return Math.max(0, (material.anchoPlaca ?? 0) - settings.perfiladoBordeMm * 2);
}

function usableBoardHeightMm(material: Material, settings: ConfiguracionOptimizador) {
  return Math.max(0, (material.altoPlaca ?? 0) - settings.perfiladoBordeMm * 2);
}

// Usa el mismo optimizador (y con la misma entrada) que dibuja el plano de cortes en el frontend,
// con la variante 0 que es la que muestra el plano al abrirse. Antes el backend tenia un
// empaquetador propio, sin cortes de guillotina, que podia acomodar las piezas en menos placas de
// las que realmente se pueden cortar: la constancia decia 2 placas y el plano mostraba 3.
export function calculateBoardsForMaterial(details: DetallePedido[], material: Material, settings: ConfiguracionOptimizador) {
  const pieces = buildPiecesFromRows(details, material.id);
  if (!pieces.length) return 0;

  const boardWidth = usableBoardWidthMm(material, settings);
  const boardHeight = usableBoardHeightMm(material, settings);
  if (!boardWidth || !boardHeight) return Number.POSITIVE_INFINITY;

  const optimization = optimizeCutLayout({
    pieces,
    usableBoardWidthMm: boardWidth,
    usableBoardHeightMm: boardHeight,
    settings,
    variant: 0
  });
  if (optimization.unplaced.length) return Number.POSITIVE_INFINITY;

  return countUsedBoards(optimization.boards);
}

function resolveEdgeLaborCostPerMeter(espesorMm: number, budgetSettings: BudgetSettingsSnapshot) {
  if (espesorMm === 0.45) return budgetSettings.manoObraCanto045Mm;
  if (espesorMm === 1) return budgetSettings.manoObraCanto1Mm;
  if (espesorMm === 2) return budgetSettings.manoObraCanto2Mm;
  return 0;
}

function calculateEdgeTotals(detail: DetallePedido, cantoById: Map<string, Material>, budgetSettings: BudgetSettingsSnapshot) {
  const largoMeters = detail.largo / 1000;
  const anchoMeters = detail.ancho / 1000;
  const cantidad = detail.cantidad;

  return [
    { id: detail.cantoLargo1Id, meters: largoMeters },
    { id: detail.cantoLargo2Id, meters: largoMeters },
    { id: detail.cantoAncho1Id, meters: anchoMeters },
    { id: detail.cantoAncho2Id, meters: anchoMeters }
  ].reduce(
    (total, edge) => {
      if (!edge.id) return total;
      const canto = cantoById.get(edge.id);
      if (!canto) return total;
      const metros = edge.meters * cantidad;
      const laborCostPerMeter = resolveEdgeLaborCostPerMeter(canto.espesorMm, budgetSettings);
      return {
        costoMaterial: total.costoMaterial + metros * canto.valor,
        costoPegado: total.costoPegado + metros * laborCostPerMeter,
        metros: total.metros + metros
      };
    },
    { costoMaterial: 0, costoPegado: 0, metros: 0 }
  );
}

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

export async function buildOrderEstimateSnapshot(tx: PrismaClient, detalles: DetallePedido[]): Promise<EstimateSnapshot> {
  const materialIds = [...new Set(detalles.map((detail) => detail.materialId).filter(Boolean))] as string[];
  const cantoIds = [
    ...new Set(
      detalles
        .flatMap((detail) => [detail.cantoLargo1Id, detail.cantoLargo2Id, detail.cantoAncho1Id, detail.cantoAncho2Id])
        .filter(Boolean)
    )
  ] as string[];

  if (!materialIds.length) {
    return {
      placasEstimadas: 0,
      costoPlacas: 0,
      costoManoObraCortes: 0,
      costoMaterialCantos: 0,
      costoPegadoCantos: 0,
      costoCantos: 0,
      metrosCanto: 0,
      presupuestoEstimado: 0,
      faltanteStock: false
    };
  }

  const [settings, budgetSettings, materials, cantos] = await Promise.all([
    getOptimizerSettings(tx),
    getBudgetSettings(tx),
    tx.material.findMany({ where: { id: { in: materialIds }, tipo: TipoMaterial.PLACA } }),
    cantoIds.length ? tx.material.findMany({ where: { id: { in: cantoIds }, tipo: TipoMaterial.CANTO } }) : Promise.resolve([])
  ]);

  const materialsById = new Map(materials.map((material) => [material.id, material]));
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  let placasEstimadas = 0;
  let costoPlacas = 0;
  let costoMaterialCantos = 0;
  let costoPegadoCantos = 0;
  let metrosCanto = 0;
  let faltanteStock = false;
  let costoManoObraCortes = 0;

  for (const materialId of materialIds) {
    const material = materialsById.get(materialId);
    if (!material) throw new AppError(400, "Material no encontrado para calcular presupuesto.");

    const materialDetails = detalles.filter((detail) => detail.materialId === materialId);
    const boards = calculateBoardsForMaterial(materialDetails, material, settings);
    if (!Number.isFinite(boards)) {
      throw new AppError(400, `Hay piezas que no entran en la placa ${material.nombre}.`);
    }

    placasEstimadas += boards;
    costoPlacas += boards * material.valor;
    costoManoObraCortes += boards * budgetSettings.manoObraPlacaPorPlaca;
    if ((material.stockPlacas ?? 0) < boards) {
      faltanteStock = true;
    }
  }

  for (const detail of detalles) {
    const edgeTotals = calculateEdgeTotals(detail, cantoById, budgetSettings);
    costoMaterialCantos += edgeTotals.costoMaterial;
    costoPegadoCantos += edgeTotals.costoPegado;
    metrosCanto += edgeTotals.metros;
  }

  const costoCantos = costoMaterialCantos + costoPegadoCantos;
  const presupuestoEstimado = costoPlacas + costoManoObraCortes + costoCantos;

  return {
    placasEstimadas,
    costoPlacas,
    costoManoObraCortes,
    costoMaterialCantos,
    costoPegadoCantos,
    costoCantos,
    metrosCanto,
    presupuestoEstimado,
    faltanteStock
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
  placas: MaterialsSummaryPlate[];
  cantos: MaterialsSummaryEdge[];
  totalPlacas: number;
  totalMetrosCanto: number;
};

function edgeEntriesForDetail(detail: DetallePedido) {
  const largoMeters = detail.largo / 1000;
  const anchoMeters = detail.ancho / 1000;

  return [
    { id: detail.cantoLargo1Id, nombre: detail.cantoLargo1Nombre, meters: largoMeters },
    { id: detail.cantoLargo2Id, nombre: detail.cantoLargo2Nombre, meters: largoMeters },
    { id: detail.cantoAncho1Id, nombre: detail.cantoAncho1Nombre, meters: anchoMeters },
    { id: detail.cantoAncho2Id, nombre: detail.cantoAncho2Nombre, meters: anchoMeters }
  ].filter((edge) => Boolean(edge.id));
}

export async function buildOrderMaterialsSummary(tx: PrismaClient, detalles: DetallePedido[]): Promise<OrderMaterialsSummary> {
  const materialIds = [...new Set(detalles.map((detail) => detail.materialId).filter(Boolean))] as string[];
  const cantoIds = [
    ...new Set(
      detalles
        .flatMap((detail) => [detail.cantoLargo1Id, detail.cantoLargo2Id, detail.cantoAncho1Id, detail.cantoAncho2Id])
        .filter(Boolean)
    )
  ] as string[];

  if (!materialIds.length) {
    return { placas: [], cantos: [], totalPlacas: 0, totalMetrosCanto: 0 };
  }

  const [settings, materials, cantos] = await Promise.all([
    getOptimizerSettings(tx),
    tx.material.findMany({ where: { id: { in: materialIds }, tipo: TipoMaterial.PLACA } }),
    cantoIds.length ? tx.material.findMany({ where: { id: { in: cantoIds }, tipo: TipoMaterial.CANTO } }) : Promise.resolve([])
  ]);

  const materialsById = new Map(materials.map((material) => [material.id, material]));
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));

  const placas: MaterialsSummaryPlate[] = [];

  for (const materialId of materialIds) {
    const material = materialsById.get(materialId);
    if (!material) throw new AppError(400, "Material no encontrado para calcular el listado de materiales.");

    const materialDetails = detalles.filter((detail) => detail.materialId === materialId);
    const boards = calculateBoardsForMaterial(materialDetails, material, settings);
    if (!Number.isFinite(boards)) {
      throw new AppError(400, `Hay piezas que no entran en la placa ${material.nombre}.`);
    }

    const stockPlacas = material.stockPlacas ?? null;
    placas.push({
      materialId: material.id,
      nombre: material.nombre,
      anchoPlaca: material.anchoPlaca,
      altoPlaca: material.altoPlaca,
      espesorMm: material.espesorMm,
      piezas: materialDetails.reduce((total, detail) => total + detail.cantidad, 0),
      placas: boards,
      stockPlacas,
      faltantePlacas: Math.max(0, boards - (stockPlacas ?? 0))
    });
  }

  const cantoTotals = new Map<string, MaterialsSummaryEdge>();

  for (const detail of detalles) {
    for (const edge of edgeEntriesForDetail(detail)) {
      const canto = cantoById.get(edge.id as string);
      if (!canto) continue;
      const metros = edge.meters * detail.cantidad;
      const current = cantoTotals.get(canto.id) ?? {
        cantoId: canto.id,
        nombre: edge.nombre ?? canto.nombre,
        espesorMm: canto.espesorMm,
        metros: 0
      };
      current.metros += metros;
      cantoTotals.set(canto.id, current);
    }
  }

  const cantosList = [...cantoTotals.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  placas.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    placas,
    cantos: cantosList,
    totalPlacas: placas.reduce((total, placa) => total + placa.placas, 0),
    totalMetrosCanto: cantosList.reduce((total, canto) => total + canto.metros, 0)
  };
}
