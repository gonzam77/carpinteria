// Presupuesto de una solicitud: placas por material, metros de canto y costos.
// Vive en frontend/src/lib/orderEstimate.ts y se copia a backend/src/shared/ con scripts/sync-optimizer.mjs.
// Es el unico lugar donde se calcula: el snapshot del pedido, el listado de materiales, la reserva de stock
// y el plano de cortes del navegador lo usan, asi las mismas piezas dan los mismos numeros en todos lados.
//
// Para que el resultado no dependa del orden ni de como se partan las filas, todo se acumula en enteros:
// mm de canto por material y canto, y placas por material. La plata se calcula una sola vez por grupo, en
// centavos, con un unico redondeo (mitad hacia arriba). Los totales son la suma de esos grupos.

import { buildPiecesFromRows, countUsedBoards, optimizeCutLayout, type BoardPlan, type OptimizerRow, type PieceInput } from "./cutOptimizer.ts";

export type EstimateRow = OptimizerRow & { materialId?: string | null };

export type EstimatePlate = {
  id: string;
  nombre: string;
  valor: number;
  anchoPlaca: number | null;
  altoPlaca: number | null;
  stockPlacas?: number | null;
};

export type EstimateCanto = { id: string; valor: number; espesorMm: number };

export type EstimateOptimizerSettings = { espesorSierraMm: number; perfiladoBordeMm: number };

export type EstimateBudgetSettings = {
  manoObraPlacaPorPlaca: number;
  manoObraCanto045Mm: number;
  manoObraCanto1Mm: number;
  manoObraCanto2Mm: number;
};

export type EstimateError = {
  tipo: "MATERIAL_INEXISTENTE" | "NO_ENTRA";
  materialId: string;
  mensaje: string;
};

export type MaterialEdgeEstimate = {
  cantoId: string;
  mm: number;
  costoMaterialCentavos: number;
  costoPegadoCentavos: number;
};

export type MaterialEstimate = {
  materialId: string;
  placa: EstimatePlate | null;
  piezas: number;
  /**
   * Superficie de las piezas en mm² enteros (DECISIONES R3): de aca salen los m² que se muestran. Nunca se
   * estiman placas a partir de la superficie: las placas las da el optimizador.
   */
  mm2: number;
  /** Placas usadas. Si alguna pieza no entra, cuenta solo las placas del acomodo parcial. */
  placas: number;
  entra: boolean;
  boards: BoardPlan[];
  unplaced: PieceInput[];
  minimumPieceArea: number;
  usableBoardWidthMm: number;
  usableBoardHeightMm: number;
  cantos: MaterialEdgeEstimate[];
  mmCanto: number;
  costoPlacasCentavos: number;
  costoManoObraCortesCentavos: number;
  costoMaterialCantosCentavos: number;
  costoPegadoCantosCentavos: number;
  totalCentavos: number;
};

export type EstimateTotals = {
  placasEstimadas: number;
  costoPlacas: number;
  costoManoObraCortes: number;
  costoMaterialCantos: number;
  costoPegadoCantos: number;
  costoCantos: number;
  metrosCanto: number;
  presupuestoEstimado: number;
};

export type OrderEstimate = {
  porMaterial: MaterialEstimate[];
  /** mm de canto por canto, sumando todos los materiales. */
  porCanto: Array<{ cantoId: string; mm: number }>;
  totales: EstimateTotals;
  faltanteStock: boolean;
  errores: EstimateError[];
};

const EDGE_SIDES = [
  ["cantoLargo1Id", "largo"],
  ["cantoLargo2Id", "largo"],
  ["cantoAncho1Id", "ancho"],
  ["cantoAncho2Id", "ancho"]
] as const;

/** Precio en pesos a centavos enteros. */
export function toCentavos(value: number) {
  return Math.round(Number(value || 0) * 100);
}

/** Division entera con redondeo de la mitad hacia arriba, exacta mientras el numerador sea un entero seguro. */
function divRoundHalfUp(numerator: number, divisor: number) {
  let quotient = Math.floor(numerator / divisor);
  let remainder = numerator - quotient * divisor;
  if (remainder < 0) {
    quotient -= 1;
    remainder += divisor;
  } else if (remainder >= divisor) {
    quotient += 1;
    remainder -= divisor;
  }
  return remainder * 2 >= divisor ? quotient + 1 : quotient;
}

/** Costo en centavos de `mm` milimetros a un precio por metro en centavos. */
function costPerMeterCentavos(mm: number, centavosPorMetro: number) {
  return divRoundHalfUp(mm * centavosPorMetro, 1000);
}

function edgeLaborCentavosPorMetro(espesorMm: number, budget: EstimateBudgetSettings) {
  if (espesorMm === 0.45) return toCentavos(budget.manoObraCanto045Mm);
  if (espesorMm === 1) return toCentavos(budget.manoObraCanto1Mm);
  if (espesorMm === 2) return toCentavos(budget.manoObraCanto2Mm);
  return 0;
}

export function usableBoardSize(plate: Pick<EstimatePlate, "anchoPlaca" | "altoPlaca">, settings: EstimateOptimizerSettings) {
  return {
    width: Math.max(0, (plate.anchoPlaca ?? 0) - settings.perfiladoBordeMm * 2),
    height: Math.max(0, (plate.altoPlaca ?? 0) - settings.perfiladoBordeMm * 2)
  };
}

/** Placas de un material con el optimizador compartido. */
export function estimateMaterialBoards(rows: OptimizerRow[], plate: EstimatePlate, settings: EstimateOptimizerSettings, variant = 0) {
  const pieces = buildPiecesFromRows(rows, plate.id);
  const usable = usableBoardSize(plate, settings);
  if (!pieces.length) {
    return { placas: 0, entra: true, boards: [] as BoardPlan[], unplaced: [] as PieceInput[], minimumPieceArea: 0, usable };
  }
  if (!usable.width || !usable.height) {
    return { placas: 0, entra: false, boards: [] as BoardPlan[], unplaced: pieces, minimumPieceArea: 0, usable };
  }
  const optimization = optimizeCutLayout({
    pieces,
    usableBoardWidthMm: usable.width,
    usableBoardHeightMm: usable.height,
    settings: { espesorSierraMm: settings.espesorSierraMm },
    variant
  });
  const boards = optimization.boards.filter((board) => board.usedArea > 0);
  return {
    placas: countUsedBoards(optimization.boards),
    entra: optimization.unplaced.length === 0,
    boards,
    unplaced: optimization.unplaced,
    minimumPieceArea: optimization.minimumPieceArea,
    usable
  };
}

export function computeOrderEstimate({
  rows,
  plates,
  cantos,
  optimizerSettings,
  budgetSettings,
  variant = 0
}: {
  rows: EstimateRow[];
  plates: EstimatePlate[];
  cantos: EstimateCanto[];
  optimizerSettings: EstimateOptimizerSettings;
  budgetSettings: EstimateBudgetSettings;
  variant?: number;
}): OrderEstimate {
  const plateById = new Map(plates.map((plate) => [plate.id, plate]));
  const cantoById = new Map(cantos.map((canto) => [canto.id, canto]));
  const materialIds = [...new Set(rows.map((row) => row.materialId).filter(Boolean))] as string[];
  const manoObraPlacaCentavos = toCentavos(budgetSettings.manoObraPlacaPorPlaca);
  const errores: EstimateError[] = [];
  const mmByCanto = new Map<string, number>();
  let faltanteStock = false;

  const porMaterial = materialIds.map((materialId): MaterialEstimate => {
    const materialRows = rows.filter((row) => row.materialId === materialId);
    const plate = plateById.get(materialId) ?? null;
    const piezas = materialRows.reduce((total, row) => total + (Number(row.cantidad) || 0), 0);
    const mm2 = materialRows.reduce((total, row) => total + (Number(row.largo) || 0) * (Number(row.ancho) || 0) * (Number(row.cantidad) || 0), 0);

    // mm de canto por canto, en enteros: no dependen del orden ni de la particion de las filas.
    const mmByMaterialCanto = new Map<string, number>();
    for (const row of materialRows) {
      const cantidad = Number(row.cantidad) || 0;
      for (const [field, side] of EDGE_SIDES) {
        const cantoId = row[field];
        if (!cantoId || !cantoById.has(cantoId)) continue;
        const mm = (Number(row[side]) || 0) * cantidad;
        mmByMaterialCanto.set(cantoId, (mmByMaterialCanto.get(cantoId) ?? 0) + mm);
        mmByCanto.set(cantoId, (mmByCanto.get(cantoId) ?? 0) + mm);
      }
    }
    const edges = [...mmByMaterialCanto.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([cantoId, mm]): MaterialEdgeEstimate => {
        const canto = cantoById.get(cantoId)!;
        return {
          cantoId,
          mm,
          costoMaterialCentavos: costPerMeterCentavos(mm, toCentavos(canto.valor)),
          costoPegadoCentavos: costPerMeterCentavos(mm, edgeLaborCentavosPorMetro(canto.espesorMm, budgetSettings))
        };
      });
    const costoMaterialCantosCentavos = edges.reduce((total, edge) => total + edge.costoMaterialCentavos, 0);
    const costoPegadoCantosCentavos = edges.reduce((total, edge) => total + edge.costoPegadoCentavos, 0);
    const mmCanto = edges.reduce((total, edge) => total + edge.mm, 0);

    if (!plate) {
      errores.push({ tipo: "MATERIAL_INEXISTENTE", materialId, mensaje: "Material no encontrado para calcular presupuesto." });
      return {
        materialId,
        placa: null,
        piezas,
        mm2,
        placas: 0,
        entra: false,
        boards: [],
        unplaced: [],
        minimumPieceArea: 0,
        usableBoardWidthMm: 0,
        usableBoardHeightMm: 0,
        cantos: edges,
        mmCanto,
        costoPlacasCentavos: 0,
        costoManoObraCortesCentavos: 0,
        costoMaterialCantosCentavos,
        costoPegadoCantosCentavos,
        totalCentavos: costoMaterialCantosCentavos + costoPegadoCantosCentavos
      };
    }

    const boards = estimateMaterialBoards(materialRows, plate, optimizerSettings, variant);
    if (!boards.entra) {
      errores.push({ tipo: "NO_ENTRA", materialId, mensaje: `Hay piezas que no entran en la placa ${plate.nombre}.` });
    }
    if ((plate.stockPlacas ?? 0) < boards.placas) faltanteStock = true;

    const costoPlacasCentavos = boards.placas * toCentavos(plate.valor);
    const costoManoObraCortesCentavos = boards.placas * manoObraPlacaCentavos;
    return {
      materialId,
      placa: plate,
      piezas,
      mm2,
      placas: boards.placas,
      entra: boards.entra,
      boards: boards.boards,
      unplaced: boards.unplaced,
      minimumPieceArea: boards.minimumPieceArea,
      usableBoardWidthMm: boards.usable.width,
      usableBoardHeightMm: boards.usable.height,
      cantos: edges,
      mmCanto,
      costoPlacasCentavos,
      costoManoObraCortesCentavos,
      costoMaterialCantosCentavos,
      costoPegadoCantosCentavos,
      totalCentavos: costoPlacasCentavos + costoManoObraCortesCentavos + costoMaterialCantosCentavos + costoPegadoCantosCentavos
    };
  });

  const sum = (key: keyof MaterialEstimate) => porMaterial.reduce((total, material) => total + (material[key] as number), 0);
  const costoMaterialCantosCentavos = sum("costoMaterialCantosCentavos");
  const costoPegadoCantosCentavos = sum("costoPegadoCantosCentavos");

  return {
    porMaterial,
    porCanto: [...mmByCanto.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([cantoId, mm]) => ({ cantoId, mm })),
    totales: {
      placasEstimadas: sum("placas"),
      costoPlacas: sum("costoPlacasCentavos") / 100,
      costoManoObraCortes: sum("costoManoObraCortesCentavos") / 100,
      costoMaterialCantos: costoMaterialCantosCentavos / 100,
      costoPegadoCantos: costoPegadoCantosCentavos / 100,
      costoCantos: (costoMaterialCantosCentavos + costoPegadoCantosCentavos) / 100,
      metrosCanto: sum("mmCanto") / 1000,
      presupuestoEstimado: sum("totalCentavos") / 100
    },
    faltanteStock,
    errores
  };
}
