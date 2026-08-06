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
  usedArea: number;
  rotatedCount: number;
};

type BudgetSettingsSnapshot = {
  manoObraCanto045Mm: number;
  manoObraCanto1Mm: number;
  manoObraCanto2Mm: number;
  manoObraPlacaPorPlaca: number;
};

type Piece = {
  id: string;
  width: number;
  height: number;
  canRotate: boolean;
  area: number;
};

type PieceOrientation = {
  width: number;
  height: number;
  rotated: boolean;
};

type PlacementOption = {
  boardIndex: number;
  rect: FreeRect;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  areaFit: number;
  shortSideWaste: number;
  longSideWaste: number;
  areaWaste: number;
  exactEdgeMatches: number;
};

type SearchResult = {
  boards: BoardPlan[];
  success: boolean;
};

const MAX_SEARCH_PIECES = 24;
const MAX_SEARCH_NODES = 25000;
const GREEDY_VARIANTS = 8;
const SEARCH_VARIANTS = 6;
const SEARCH_CANDIDATE_LIMIT = 18;
const BEAM_WIDTH = 96;
const BEAM_BRANCHES = 10;

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

function createBoard(boardWidth: number, boardHeight: number): BoardPlan {
  return {
    freeRects: [{ x: 0, y: 0, width: boardWidth, height: boardHeight }],
    usedArea: 0,
    rotatedCount: 0
  };
}

function cloneBoards(boards: BoardPlan[]) {
  return boards.map((board) => ({
    freeRects: board.freeRects.map((rect) => ({ ...rect })),
    usedArea: board.usedArea,
    rotatedCount: board.rotatedCount
  }));
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
  return rects
    .filter((rect, index) => !rects.some((other, otherIndex) => index !== otherIndex && containsRect(other, rect)))
    .sort((a, b) => a.y - b.y || a.x - b.x || a.width * a.height - b.width * b.height);
}

function candidateOrientations(piece: Piece): PieceOrientation[] {
  if (!piece.canRotate || piece.width === piece.height) return [{ width: piece.width, height: piece.height, rotated: false }];
  return [
    { width: piece.width, height: piece.height, rotated: false },
    { width: piece.height, height: piece.width, rotated: true }
  ];
}

function collectPlacementOptions(boards: BoardPlan[], piece: Piece) {
  const placements: PlacementOption[] = [];

  boards.forEach((board, boardIndex) => {
    board.freeRects.forEach((rect) => {
      candidateOrientations(piece).forEach((orientation) => {
        if (orientation.width > rect.width || orientation.height > rect.height) return;

        const anchors = [
          { x: rect.x, y: rect.y },
          { x: rect.x + rect.width - orientation.width, y: rect.y },
          { x: rect.x, y: rect.y + rect.height - orientation.height },
          { x: rect.x + rect.width - orientation.width, y: rect.y + rect.height - orientation.height }
        ];
        const seenAnchors = new Set<string>();

        anchors.forEach((anchor) => {
          const anchorKey = `${anchor.x}:${anchor.y}`;
          if (seenAnchors.has(anchorKey)) return;
          seenAnchors.add(anchorKey);

          placements.push({
            boardIndex,
            rect,
            x: anchor.x,
            y: anchor.y,
            width: orientation.width,
            height: orientation.height,
            rotated: orientation.rotated,
            areaFit: orientation.width * orientation.height,
            shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height),
            longSideWaste: Math.max(rect.width - orientation.width, rect.height - orientation.height),
            areaWaste: rect.width * rect.height - orientation.width * orientation.height,
            exactEdgeMatches:
              Number(anchor.x === rect.x || anchor.x + orientation.width === rect.x + rect.width) +
              Number(anchor.y === rect.y || anchor.y + orientation.height === rect.y + rect.height)
          });
        });
      });
    });
  });

  return placements;
}

function sortPlacements(placements: PlacementOption[], variant: number) {
  const mode = variant % 8;
  return [...placements].sort((a, b) => {
    const byTightFit =
      a.shortSideWaste - b.shortSideWaste ||
      a.longSideWaste - b.longSideWaste ||
      a.areaWaste - b.areaWaste ||
      b.exactEdgeMatches - a.exactEdgeMatches ||
      a.boardIndex - b.boardIndex ||
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.y - b.y ||
      a.x - b.x ||
      Number(a.rotated) - Number(b.rotated);
    const byAreaWaste =
      a.areaWaste - b.areaWaste ||
      a.shortSideWaste - b.shortSideWaste ||
      b.exactEdgeMatches - a.exactEdgeMatches ||
      a.boardIndex - b.boardIndex ||
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.y - b.y ||
      a.x - b.x ||
      Number(a.rotated) - Number(b.rotated);
    const byEdges =
      b.exactEdgeMatches - a.exactEdgeMatches ||
      a.shortSideWaste - b.shortSideWaste ||
      a.areaWaste - b.areaWaste ||
      a.boardIndex - b.boardIndex ||
      a.rect.y - b.rect.y ||
      a.rect.x - b.rect.x ||
      a.y - b.y ||
      a.x - b.x ||
      Number(a.rotated) - Number(b.rotated);

    if (mode === 1) return byAreaWaste;
    if (mode === 2) return byEdges;
    if (mode === 3) return a.boardIndex - b.boardIndex || byTightFit;
    if (mode === 4) return byTightFit || Number(a.rotated) - Number(b.rotated);
    if (mode === 5) return a.y - b.y || a.x - b.x || byTightFit;
    if (mode === 6) return a.longSideWaste - b.longSideWaste || byTightFit;
    if (mode === 7) return b.areaFit - a.areaFit || byTightFit;
    return byTightFit;
  });
}

function sortPieces<T extends { width: number; height: number; area: number }>(pieces: T[], variant: number) {
  const mode = variant % 8;
  return [...pieces].sort((a, b) => {
    if (mode === 1) return Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.area - a.area;
    if (mode === 2) return b.height - a.height || b.width - a.width || b.area - a.area;
    if (mode === 3) return b.width - a.width || b.height - a.height || b.area - a.area;
    if (mode === 4) return b.width + b.height - (a.width + a.height) || b.area - a.area;
    if (mode === 5) return Math.min(b.width, b.height) - Math.min(a.width, a.height) || b.area - a.area;
    if (mode === 6) return Number(b.width === b.height) - Number(a.width === a.height) || b.area - a.area;
    if (mode === 7) return b.area - a.area || Math.max(b.width, b.height) - Math.max(a.width, a.height);
    return b.area - a.area || Math.max(b.width, b.height) - Math.max(a.width, a.height);
  });
}

function applyPlacement(board: BoardPlan, placement: PlacementOption, kerf: number) {
  const usedRect = {
    x: placement.x,
    y: placement.y,
    width: placement.width + (placement.rect.width > placement.width ? kerf : 0),
    height: placement.height + (placement.rect.height > placement.height ? kerf : 0)
  };

  board.usedArea += placement.width * placement.height;
  board.rotatedCount += Number(placement.rotated);
  board.freeRects = pruneFreeRects(board.freeRects.flatMap((rect) => splitFreeRect(rect, usedRect)));
}

function boardUsageScore(boards: BoardPlan[], boardArea: number) {
  const usedArea = boards.reduce((total, board) => total + board.usedArea, 0);
  const rotatedCount = boards.reduce((total, board) => total + board.rotatedCount, 0);
  const boardCount = boards.filter((board) => board.usedArea > 0).length;
  const wastePercent = boardCount ? Math.max(0, 100 - (usedArea / (boardCount * boardArea)) * 100) : 0;
  return { usedArea, rotatedCount, boardCount, wastePercent };
}

function boardStateSignature(boards: BoardPlan[]) {
  return boards
    .map((board) =>
      board.freeRects
        .map((rect) => `${rect.x}:${rect.y}:${rect.width}:${rect.height}`)
        .sort()
        .join("|")
    )
    .join("||");
}

function compareBoardStates(a: BoardPlan[], b: BoardPlan[], boardArea: number) {
  const scoreA = boardUsageScore(a, boardArea);
  const scoreB = boardUsageScore(b, boardArea);
  if (scoreA.boardCount !== scoreB.boardCount) return scoreA.boardCount - scoreB.boardCount;
  if (scoreA.rotatedCount !== scoreB.rotatedCount) return scoreA.rotatedCount - scoreB.rotatedCount;
  if (scoreA.wastePercent !== scoreB.wastePercent) return scoreA.wastePercent - scoreB.wastePercent;
  const freeRectsA = a.reduce((total, board) => total + board.freeRects.length, 0);
  const freeRectsB = b.reduce((total, board) => total + board.freeRects.length, 0);
  return freeRectsA - freeRectsB;
}

function chooseMostConstrainedPiece(remaining: Piece[], boards: BoardPlan[], variant: number) {
  const candidates = remaining.map((piece) => {
    const placements = sortPlacements(collectPlacementOptions(boards, piece), variant);
    return { piece, placements };
  });

  candidates.sort((a, b) => {
    if (a.placements.length !== b.placements.length) return a.placements.length - b.placements.length;
    return b.piece.area - a.piece.area || Math.max(b.piece.width, b.piece.height) - Math.max(a.piece.width, a.piece.height);
  });

  return candidates[0] ?? null;
}

function greedyPackFixedBoards(pieces: Piece[], boardCount: number, boardWidth: number, boardHeight: number, kerf: number, variant: number): SearchResult {
  const boards = Array.from({ length: boardCount }, () => createBoard(boardWidth, boardHeight));
  const orderedPieces = sortPieces(pieces, variant);

  for (const piece of orderedPieces) {
    const placement = sortPlacements(collectPlacementOptions(boards, piece), variant)[0];
    if (!placement) return { boards, success: false };
    applyPlacement(boards[placement.boardIndex], placement, kerf);
  }

  return { boards, success: true };
}

function beamPackFixedBoards(pieces: Piece[], boardCount: number, boardWidth: number, boardHeight: number, kerf: number, variant: number): SearchResult {
  const orderedPieces = sortPieces(pieces, variant);
  const boardArea = boardWidth * boardHeight;
  let frontier: BoardPlan[][] = [Array.from({ length: boardCount }, () => createBoard(boardWidth, boardHeight))];

  for (const piece of orderedPieces) {
    const nextStates: BoardPlan[][] = [];

    for (const state of frontier) {
      const placements = sortPlacements(collectPlacementOptions(state, piece), variant).slice(0, BEAM_BRANCHES);
      for (const placement of placements) {
        const nextBoards = cloneBoards(state);
        applyPlacement(nextBoards[placement.boardIndex], placement, kerf);
        nextStates.push(nextBoards);
      }
    }

    if (!nextStates.length) return { boards: frontier[0] ?? [], success: false };

    const uniqueStates = new Map<string, BoardPlan[]>();
    for (const state of nextStates) {
      const signature = boardStateSignature(state);
      const existing = uniqueStates.get(signature);
      if (!existing || compareBoardStates(state, existing, boardArea) < 0) {
        uniqueStates.set(signature, state);
      }
    }

    frontier = [...uniqueStates.values()]
      .sort((a, b) => compareBoardStates(a, b, boardArea))
      .slice(0, BEAM_WIDTH);
  }

  return frontier.length ? { boards: frontier[0], success: true } : { boards: [], success: false };
}

function searchPackFixedBoards(pieces: Piece[], boardCount: number, boardWidth: number, boardHeight: number, kerf: number, variant: number): SearchResult {
  const startingBoards = Array.from({ length: boardCount }, () => createBoard(boardWidth, boardHeight));
  const orderedPieces = sortPieces(pieces, variant);
  let exploredNodes = 0;
  const failedStates = new Set<string>();

  const visit = (boards: BoardPlan[], remaining: Piece[]): BoardPlan[] | null => {
    if (!remaining.length) return boards;
    if (exploredNodes >= MAX_SEARCH_NODES) return null;
    exploredNodes += 1;

    const stateKey = `${remaining.map((piece) => piece.id).sort().join(",")}###${boardStateSignature(boards)}`;
    if (failedStates.has(stateKey)) return null;

    const selected = chooseMostConstrainedPiece(remaining, boards, variant);
    if (!selected || !selected.placements.length) return null;

    const nextRemaining = remaining.filter((piece) => piece.id !== selected.piece.id);
    const candidates = selected.placements.slice(0, SEARCH_CANDIDATE_LIMIT);

    for (const placement of candidates) {
      const nextBoards = cloneBoards(boards);
      applyPlacement(nextBoards[placement.boardIndex], placement, kerf);
      const solved = visit(nextBoards, nextRemaining);
      if (solved) return solved;
    }

    failedStates.add(stateKey);
    return null;
  };

  const solvedBoards = visit(startingBoards, orderedPieces);
  return { boards: solvedBoards ?? startingBoards, success: Boolean(solvedBoards) };
}

function calculateBoardsForMaterial(details: DetallePedido[], material: Material, settings: ConfiguracionOptimizador) {
  const basePieces = details.flatMap((detail, detailIndex) =>
    Array.from({ length: detail.cantidad }, (_, copyIndex) => ({
      id: `${detailIndex}-${copyIndex}`,
      width: detail.ancho,
      height: detail.largo,
      canRotate: detail.permiteRotar,
      area: detail.ancho * detail.largo
    }))
  );

  if (!basePieces.length) return 0;

  const boardWidth = usableBoardWidthMm(material, settings);
  const boardHeight = usableBoardHeightMm(material, settings);
  if (!boardWidth || !boardHeight) return Number.POSITIVE_INFINITY;

  const boardArea = boardWidth * boardHeight;
  const totalArea = basePieces.reduce((total, piece) => total + piece.area, 0);

  const oversizedPiece = basePieces.some((piece) =>
    !candidateOrientations(piece).some((orientation) => orientation.width <= boardWidth && orientation.height <= boardHeight)
  );
  if (oversizedPiece) return Number.POSITIVE_INFINITY;

  const minBoardsByArea = Math.max(1, Math.ceil(totalArea / boardArea));

  for (let boardCount = minBoardsByArea; boardCount <= basePieces.length; boardCount += 1) {
    const attempts = Array.from({ length: GREEDY_VARIANTS }, (_, variant) =>
      greedyPackFixedBoards(basePieces, boardCount, boardWidth, boardHeight, settings.espesorSierraMm, variant)
    );

    const successfulGreedy = attempts
      .filter((attempt) => attempt.success)
      .sort((a, b) => {
        const scoreA = boardUsageScore(a.boards, boardArea);
        const scoreB = boardUsageScore(b.boards, boardArea);
        if (scoreA.rotatedCount !== scoreB.rotatedCount) return scoreA.rotatedCount - scoreB.rotatedCount;
        if (scoreA.wastePercent !== scoreB.wastePercent) return scoreA.wastePercent - scoreB.wastePercent;
        return scoreB.usedArea - scoreA.usedArea;
      })[0];

    if (successfulGreedy) {
      return successfulGreedy.boards.filter((board) => board.usedArea > 0).length;
    }

    const beamSolved = Array.from({ length: GREEDY_VARIANTS }, (_, variant) =>
      beamPackFixedBoards(basePieces, boardCount, boardWidth, boardHeight, settings.espesorSierraMm, variant)
    )
      .filter((attempt) => attempt.success)
      .sort((a, b) => {
        const scoreA = boardUsageScore(a.boards, boardArea);
        const scoreB = boardUsageScore(b.boards, boardArea);
        if (scoreA.rotatedCount !== scoreB.rotatedCount) return scoreA.rotatedCount - scoreB.rotatedCount;
        if (scoreA.wastePercent !== scoreB.wastePercent) return scoreA.wastePercent - scoreB.wastePercent;
        return scoreB.usedArea - scoreA.usedArea;
      })[0];

    if (beamSolved) {
      return beamSolved.boards.filter((board) => board.usedArea > 0).length;
    }

    if (basePieces.length > MAX_SEARCH_PIECES) continue;

    const searched = Array.from({ length: SEARCH_VARIANTS }, (_, variant) =>
      searchPackFixedBoards(basePieces, boardCount, boardWidth, boardHeight, settings.espesorSierraMm, variant)
    ).find((attempt) => attempt.success);

    if (searched) {
      return searched.boards.filter((board) => board.usedArea > 0).length;
    }
  }

  return Number.POSITIVE_INFINITY;
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
