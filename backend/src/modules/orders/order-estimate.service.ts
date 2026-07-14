import { TipoMaterial, type ConfiguracionOptimizador, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";

type EstimateSnapshot = {
  placasEstimadas: number;
  costoPlacas: number;
  costoMaterialCantos: number;
  costoPegadoCantos: number;
  costoCantos: number;
  metrosCanto: number;
  presupuestoEstimado: number;
  faltanteStock: boolean;
};

type FreeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoardPlan = {
  freeRects: FreeRect[];
};

type Piece = {
  width: number;
  height: number;
  canRotate: boolean;
};

function materialBoardWidthMm(material: Material) {
  return material.anchoPlaca ?? 0;
}

function materialBoardHeightMm(material: Material) {
  return material.altoPlaca ?? 0;
}

function usableBoardWidthMm(material: Material, settings: ConfiguracionOptimizador) {
  return Math.max(0, materialBoardWidthMm(material) - settings.perfiladoBordeMm * 2);
}

function usableBoardHeightMm(material: Material, settings: ConfiguracionOptimizador) {
  return Math.max(0, materialBoardHeightMm(material) - settings.perfiladoBordeMm * 2);
}

function createBoard(material: Material, settings: ConfiguracionOptimizador): BoardPlan {
  return {
    freeRects: [{ x: 0, y: 0, width: usableBoardWidthMm(material, settings), height: usableBoardHeightMm(material, settings) }]
  };
}

function intersects(a: FreeRect, b: FreeRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function splitFreeRect(rect: FreeRect, used: FreeRect) {
  if (!intersects(rect, used)) return [rect];

  const nextRects: FreeRect[] = [];
  const rectRight = rect.x + rect.width;
  const rectBottom = rect.y + rect.height;
  const usedRight = used.x + used.width;
  const usedBottom = used.y + used.height;

  if (used.y > rect.y) nextRects.push({ x: rect.x, y: rect.y, width: rect.width, height: used.y - rect.y });
  if (usedBottom < rectBottom) nextRects.push({ x: rect.x, y: usedBottom, width: rect.width, height: rectBottom - usedBottom });
  if (used.x > rect.x) nextRects.push({ x: rect.x, y: rect.y, width: used.x - rect.x, height: rect.height });
  if (usedRight < rectRight) nextRects.push({ x: usedRight, y: rect.y, width: rectRight - usedRight, height: rect.height });

  return nextRects.filter((nextRect) => nextRect.width > 0 && nextRect.height > 0);
}

function containsRect(outer: FreeRect, inner: FreeRect) {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.width <= outer.x + outer.width && inner.y + inner.height <= outer.y + outer.height;
}

function pruneFreeRects(rects: FreeRect[]) {
  return rects.filter((rect, index) => !rects.some((other, otherIndex) => index !== otherIndex && containsRect(other, rect))).sort((a, b) => a.y - b.y || a.x - b.x);
}

function tryPlaceInBoard(board: BoardPlan, piece: Piece, settings: ConfiguracionOptimizador) {
  const orientations = [
    { width: piece.width, height: piece.height },
    ...(piece.canRotate ? [{ width: piece.height, height: piece.width }] : [])
  ];

  const placements = board.freeRects.flatMap((rect) =>
    orientations
      .filter((orientation) => orientation.width <= rect.width && orientation.height <= rect.height)
      .map((orientation) => ({
        rect,
        ...orientation,
        waste: rect.width * rect.height - orientation.width * orientation.height,
        shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height)
      }))
  );
  const placement = [...placements].sort((a, b) => a.waste - b.waste || a.shortSideWaste - b.shortSideWaste)[0];

  if (!placement) return false;

  const usedRect = {
    x: placement.rect.x,
    y: placement.rect.y,
    width: placement.width + (placement.rect.width > placement.width ? settings.espesorSierraMm : 0),
    height: placement.height + (placement.rect.height > placement.height ? settings.espesorSierraMm : 0)
  };
  board.freeRects = pruneFreeRects(board.freeRects.flatMap((rect) => splitFreeRect(rect, usedRect)));
  return true;
}

function calculateBoardsForMaterial(details: DetallePedido[], material: Material, settings: ConfiguracionOptimizador) {
  const pieces = details
    .flatMap((detail) =>
      Array.from({ length: detail.cantidad }, () => ({
        width: detail.ancho,
        height: detail.largo,
        canRotate: detail.permiteRotar
      }))
    )
    .sort((a, b) => b.width * b.height - a.width * a.height);

  if (!pieces.length) return 0;
  if (!usableBoardWidthMm(material, settings) || !usableBoardHeightMm(material, settings)) return Number.POSITIVE_INFINITY;

  const boards: BoardPlan[] = [];

  for (const piece of pieces) {
    const placed = boards.some((board) => tryPlaceInBoard(board, piece, settings));
    if (placed) continue;

    const board = createBoard(material, settings);
    if (tryPlaceInBoard(board, piece, settings)) {
      boards.push(board);
    } else {
      return Number.POSITIVE_INFINITY;
    }
  }

  return boards.length;
}

function calculateEdgeTotals(detail: DetallePedido, cantoById: Map<string, Material>, manoObraCantoPorMetro: number) {
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
      return {
        costoMaterial: total.costoMaterial + metros * canto.valor,
        costoPegado: total.costoPegado + metros * manoObraCantoPorMetro,
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
  let costoCantos = 0;
  let metrosCanto = 0;
  let faltanteStock = false;
  let cantidadPiezas = 0;

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
    if ((material.stockPlacas ?? 0) < boards) {
      faltanteStock = true;
    }
  }

  for (const detail of detalles) {
    cantidadPiezas += detail.cantidad;
    const edgeTotals = calculateEdgeTotals(detail, cantoById, budgetSettings.manoObraCantoPorMetro);
    costoMaterialCantos += edgeTotals.costoMaterial;
    costoPegadoCantos += edgeTotals.costoPegado;
    costoCantos += edgeTotals.costoMaterial + edgeTotals.costoPegado;
    metrosCanto += edgeTotals.metros;
  }

  const costoCorte = cantidadPiezas * budgetSettings.manoObraCortePorPieza;

  return {
    placasEstimadas,
    costoPlacas,
    costoMaterialCantos,
    costoPegadoCantos,
    costoCantos,
    metrosCanto,
    presupuestoEstimado: costoPlacas + costoCantos + costoCorte,
    faltanteStock
  };
}

