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

type BudgetSettingsSnapshot = {
  manoObraCanto045Mm: number;
  manoObraCanto1Mm: number;
  manoObraCanto2Mm: number;
  manoObraPlacaPorPlaca: number;
};

type Piece = {
  width: number;
  height: number;
  canRotate: boolean;
};

type GuillotineAxis = "rows" | "columns";

type RowStrip = {
  y: number;
  height: number;
  usedWidth: number;
};

type ColumnStrip = {
  x: number;
  width: number;
  usedHeight: number;
};

type GuillotineBoard = {
  rowStrips: RowStrip[];
  columnStrips: ColumnStrip[];
  usedArea: number;
  rotatedCount: number;
};

type PlacementOption = {
  boardIndex: number;
  rect: FreeRect;
  width: number;
  height: number;
  waste: number;
  shortSideWaste: number;
  rotationPenalty: number;
  guillotinePenalty: number;
  axisPriority: number;
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

function sortPlacements(placements: PlacementOption[], variant: number) {
  const mode = variant % 10;
  return [...placements].sort((a, b) => {
    const compareProductionFirst =
      a.guillotinePenalty - b.guillotinePenalty ||
      a.axisPriority - b.axisPriority ||
      a.rotationPenalty - b.rotationPenalty ||
      a.waste - b.waste ||
      a.shortSideWaste - b.shortSideWaste ||
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x;
    const compareCurrentHeuristic =
      a.waste - b.waste ||
      a.shortSideWaste - b.shortSideWaste ||
      a.guillotinePenalty - b.guillotinePenalty ||
      a.axisPriority - b.axisPriority ||
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.rotationPenalty - b.rotationPenalty;

    if (mode === 1) return a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.guillotinePenalty - b.guillotinePenalty || a.axisPriority - b.axisPriority || a.rotationPenalty - b.rotationPenalty;
    if (mode === 2) return a.guillotinePenalty - b.guillotinePenalty || a.shortSideWaste - b.shortSideWaste || a.axisPriority - b.axisPriority || a.waste - b.waste;
    if (mode === 3) return a.axisPriority - b.axisPriority || a.guillotinePenalty - b.guillotinePenalty || a.rotationPenalty - b.rotationPenalty || a.waste - b.waste;
    if (mode === 4) return compareCurrentHeuristic;
    if (mode === 5) return a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.shortSideWaste - b.shortSideWaste || a.guillotinePenalty - b.guillotinePenalty;
    if (mode === 6) return a.shortSideWaste - b.shortSideWaste || a.guillotinePenalty - b.guillotinePenalty || a.waste - b.waste || a.axisPriority - b.axisPriority;
    if (mode === 7) return a.axisPriority - b.axisPriority || a.waste - b.waste || a.guillotinePenalty - b.guillotinePenalty || a.rotationPenalty - b.rotationPenalty;
    if (mode === 8) return a.guillotinePenalty - b.guillotinePenalty || a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.waste - b.waste;
    if (mode === 9) return a.axisPriority - b.axisPriority || a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.shortSideWaste - b.shortSideWaste;
    return compareProductionFirst;
  });
}

function collectPlacementOptions(board: BoardPlan, piece: Piece, boardIndex: number) {
  const orientations = [
    { width: piece.width, height: piece.height, rotationPenalty: 0 },
    ...(piece.canRotate ? [{ width: piece.height, height: piece.width, rotationPenalty: 1 }] : [])
  ];

  return board.freeRects.flatMap((rect) =>
    orientations
      .filter((orientation) => orientation.width <= rect.width && orientation.height <= rect.height)
      .map((orientation) => ({
        boardIndex,
        rect,
        ...orientation,
        waste: rect.width * rect.height - orientation.width * orientation.height,
        shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height),
        guillotinePenalty: Number(orientation.width !== rect.width) + Number(orientation.height !== rect.height),
        axisPriority: Math.min(rect.width - orientation.width, rect.height - orientation.height)
      }))
  );
}

function tryPlaceInBoards(boards: BoardPlan[], piece: Piece, settings: ConfiguracionOptimizador, variant: number) {
  const placements = boards.flatMap((board, boardIndex) => collectPlacementOptions(board, piece, boardIndex));
  const placement = sortPlacements(placements, variant)[0];

  if (!placement) return false;

  const board = boards[placement.boardIndex];
  const usedRect = {
    x: placement.rect.x,
    y: placement.rect.y,
    width: placement.width + (placement.rect.width > placement.width ? settings.espesorSierraMm : 0),
    height: placement.height + (placement.rect.height > placement.height ? settings.espesorSierraMm : 0)
  };
  board.freeRects = pruneFreeRects(board.freeRects.flatMap((rect) => splitFreeRect(rect, usedRect)));
  return true;
}

function sortPieces<T extends { width: number; height: number }>(pieces: T[], variant: number) {
  const mode = variant % 6;
  return [...pieces].sort((a, b) => {
    if (mode === 1) return Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height;
    if (mode === 2) return b.height - a.height || b.width - a.width;
    if (mode === 3) return b.width - a.width || b.height - a.height;
    if (mode === 4) return Math.min(b.width, b.height) - Math.min(a.width, a.height) || b.width * b.height - a.width * a.height;
    if (mode === 5) return b.width + b.height - (a.width + a.height) || b.width * b.height - a.width * a.height;
    return b.width * b.height - a.width * a.height;
  });
}

function createGuillotineBoard(): GuillotineBoard {
  return {
    rowStrips: [],
    columnStrips: [],
    usedArea: 0,
    rotatedCount: 0
  };
}

function candidateOrientations(piece: Piece) {
  return [
    { width: piece.width, height: piece.height, rotated: false },
    ...(piece.canRotate ? [{ width: piece.height, height: piece.width, rotated: true }] : [])
  ];
}

function chooseRowPlacement(board: GuillotineBoard, piece: Piece, boardWidth: number, boardHeight: number, kerf: number) {
  const placements = candidateOrientations(piece).flatMap((orientation) => {
    const existingRows = board.rowStrips.flatMap((row, rowIndex) => {
      if (orientation.height > row.height) return [];
      const x = row.usedWidth === 0 ? 0 : row.usedWidth + kerf;
      if (x + orientation.width > boardWidth) return [];
      return [{ type: "existing" as const, rowIndex, x, y: row.y, ...orientation, stripPenalty: row.height - orientation.height }];
    });
    const lastRow = board.rowStrips[board.rowStrips.length - 1];
    const y = lastRow ? lastRow.y + lastRow.height + kerf : 0;
    const newRow = y + orientation.height <= boardHeight ? [{ type: "new" as const, rowIndex: board.rowStrips.length, x: 0, y, ...orientation, stripPenalty: 0 }] : [];
    return [...existingRows, ...newRow];
  });

  return placements.sort((a, b) => Number(a.rotated) - Number(b.rotated) || a.stripPenalty - b.stripPenalty || a.y - b.y || a.x - b.x || b.width - a.width)[0];
}

function chooseColumnPlacement(board: GuillotineBoard, piece: Piece, boardWidth: number, boardHeight: number, kerf: number) {
  const placements = candidateOrientations(piece).flatMap((orientation) => {
    const existingColumns = board.columnStrips.flatMap((column, columnIndex) => {
      if (orientation.width > column.width) return [];
      const y = column.usedHeight === 0 ? 0 : column.usedHeight + kerf;
      if (y + orientation.height > boardHeight) return [];
      return [{ type: "existing" as const, columnIndex, x: column.x, y, ...orientation, stripPenalty: column.width - orientation.width }];
    });
    const lastColumn = board.columnStrips[board.columnStrips.length - 1];
    const x = lastColumn ? lastColumn.x + lastColumn.width + kerf : 0;
    const newColumn = x + orientation.width <= boardWidth ? [{ type: "new" as const, columnIndex: board.columnStrips.length, x, y: 0, ...orientation, stripPenalty: 0 }] : [];
    return [...existingColumns, ...newColumn];
  });

  return placements.sort((a, b) => Number(a.rotated) - Number(b.rotated) || a.stripPenalty - b.stripPenalty || a.x - b.x || a.y - b.y || b.height - a.height)[0];
}

function placePieceGuillotine(board: GuillotineBoard, piece: Piece, axis: GuillotineAxis, boardWidth: number, boardHeight: number, kerf: number) {
  const placement = axis === "rows" ? chooseRowPlacement(board, piece, boardWidth, boardHeight, kerf) : chooseColumnPlacement(board, piece, boardWidth, boardHeight, kerf);
  if (!placement) return false;

  board.usedArea += placement.width * placement.height;
  board.rotatedCount += Number(placement.rotated);

  if (axis === "rows") {
    const rowPlacement = placement as Extract<typeof placement, { rowIndex: number }>;
    if (placement.type === "new") board.rowStrips.push({ y: placement.y, height: placement.height, usedWidth: placement.width });
    else board.rowStrips[rowPlacement.rowIndex].usedWidth = placement.x + placement.width;
  } else {
    const columnPlacement = placement as Extract<typeof placement, { columnIndex: number }>;
    if (placement.type === "new") board.columnStrips.push({ x: placement.x, width: placement.width, usedHeight: placement.height });
    else board.columnStrips[columnPlacement.columnIndex].usedHeight = placement.y + placement.height;
  }

  return true;
}

function calculateBoardsForMaterial(details: DetallePedido[], material: Material, settings: ConfiguracionOptimizador) {
  const basePieces = details.flatMap((detail) =>
    Array.from({ length: detail.cantidad }, () => ({
      width: detail.ancho,
      height: detail.largo,
      canRotate: detail.permiteRotar
    }))
  );

  if (!basePieces.length) return 0;
  if (!usableBoardWidthMm(material, settings) || !usableBoardHeightMm(material, settings)) return Number.POSITIVE_INFINITY;

  const boardWidth = usableBoardWidthMm(material, settings);
  const boardHeight = usableBoardHeightMm(material, settings);
  const boardArea = boardWidth * boardHeight;

  const attempts = ["rows", "columns"].flatMap((axis) =>
    Array.from({ length: 6 }, (_, variant) => {
      const pieces = sortPieces(basePieces, variant);
      const boards: GuillotineBoard[] = [];
      const unplaced: Piece[] = [];

      for (const piece of pieces) {
        const placed = boards.some((board) => placePieceGuillotine(board, piece, axis as GuillotineAxis, boardWidth, boardHeight, settings.espesorSierraMm));
        if (placed) continue;

        const board = createGuillotineBoard();
        if (placePieceGuillotine(board, piece, axis as GuillotineAxis, boardWidth, boardHeight, settings.espesorSierraMm)) boards.push(board);
        else unplaced.push(piece);
      }

      const usedArea = boards.reduce((total, board) => total + board.usedArea, 0);
      const rotatedCount = boards.reduce((total, board) => total + board.rotatedCount, 0);
      const wastePercent = boards.length ? Math.max(0, 100 - usedArea / (boards.length * boardArea) * 100) : 0;
      return { boards, unplaced, usedArea, rotatedCount, wastePercent };
    })
  ).sort((a, b) => {
    if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length - b.unplaced.length;
    if (a.boards.length !== b.boards.length) return a.boards.length - b.boards.length;
    if (a.rotatedCount !== b.rotatedCount) return a.rotatedCount - b.rotatedCount;
    if (a.wastePercent !== b.wastePercent) return a.wastePercent - b.wastePercent;
    return b.usedArea - a.usedArea;
  });

  const best = attempts[0];
  return best && !best.unplaced.length ? best.boards.length : Number.POSITIVE_INFINITY;
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
  let costoManoObraPlacas = 0;

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
    costoManoObraPlacas += boards * budgetSettings.manoObraPlacaPorPlaca;
    if ((material.stockPlacas ?? 0) < boards) {
      faltanteStock = true;
    }
  }

  for (const detail of detalles) {
    const edgeTotals = calculateEdgeTotals(detail, cantoById, budgetSettings);
    costoMaterialCantos += edgeTotals.costoMaterial;
    costoPegadoCantos += edgeTotals.costoPegado;
    costoCantos += edgeTotals.costoMaterial + edgeTotals.costoPegado;
    metrosCanto += edgeTotals.metros;
  }

  return {
    placasEstimadas,
    costoPlacas,
    costoMaterialCantos,
    costoPegadoCantos,
    costoCantos,
    metrosCanto,
    presupuestoEstimado: costoPlacas + costoCantos + costoManoObraPlacas,
    faltanteStock
  };
}
