import { TipoMaterial, type ConfiguracionOptimizador, type DetallePedido, type Material, type PrismaClient } from "../../generated/prisma/client.js";
import { AppError } from "../../utils/http.js";

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
// El beam se corre por etapas, de barata a cara, hasta encontrar solucion o
// quedarse sin presupuesto. Un beam angosto no es solo mas rapido: muchas veces
// encuentra soluciones que el ancho pierde, porque el ancho se llena de estados
// casi identicos. La primera etapa son los valores del optimizador del frontend
// y la ultima equivale a la configuracion vieja, que queda como red de seguridad.
const BEAM_STAGES = [
  { width: 24, branches: 4, variants: 4 },
  { width: 48, branches: 6, variants: 6 },
  { width: 96, branches: 10, variants: 8 }
];

// Presupuesto para la fase de refinamiento (la que intenta bajar una placa).
// La fase greedy nunca se corta: el presupuesto solo limita la mejora opcional.
// 1200 ms por material es el punto donde el refinamiento deja de perder placas
// contra la version sin limite; mas tiempo que eso no mejoro ningun caso.
// El refinamiento se limita por cantidad de trabajo, no por reloj: si midieramos
// tiempo, el mismo pedido podria dar 17 placas en el preview y 16 al guardarlo
// segun la carga del servidor, y el presupuesto que ve el cliente tiene que ser
// reproducible. El reloj queda solo como red de seguridad.
// Calibrado sobre 40 pedidos de prueba: con 500k el refinamiento deja de perder
// placas contra la version sin limite, y subirlo a 1M, 2M o 4M no mejoro ningun
// caso, solo agrego tiempo.
const REFINE_STATES_PER_MATERIAL = Number(process.env.ORDER_ESTIMATE_BUDGET_STATES ?? 500000);
const REFINE_STATES_TOTAL = Number(process.env.ORDER_ESTIMATE_TOTAL_BUDGET_STATES ?? 1500000);
const MIN_REFINE_STATES = 150000;
const SAFETY_TIMEOUT_MS = Number(process.env.ORDER_ESTIMATE_SAFETY_TIMEOUT_MS ?? 15000);

type Budget = { states: number; until: number };

/** Reparte el trabajo entre los materiales del pedido, con tope por pedido. */
function createBudget(materialCount: number): Budget {
  const share = Math.floor(REFINE_STATES_TOTAL / Math.max(1, materialCount));
  return {
    states: Math.max(MIN_REFINE_STATES, Math.min(REFINE_STATES_PER_MATERIAL, share)),
    until: Date.now() + SAFETY_TIMEOUT_MS
  };
}

function expired(budget: Budget | null) {
  return budget !== null && (budget.states <= 0 || Date.now() >= budget.until);
}

function spend(budget: Budget | null, states: number) {
  if (budget !== null) budget.states -= states;
}

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

// Objeto reutilizado al recorrer ubicaciones: evita crear un objeto por cada
// candidata. Quien quiera conservar una ubicacion tiene que clonarla.
const placementScratch: PlacementOption = {
  boardIndex: 0,
  rect: { x: 0, y: 0, width: 0, height: 0 },
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  rotated: false,
  areaFit: 0,
  shortSideWaste: 0,
  longSideWaste: 0,
  areaWaste: 0,
  exactEdgeMatches: 0
};

let scannedRects = 0;

function clonePlacement(placement: PlacementOption): PlacementOption {
  return { ...placement };
}

/**
 * Recorre todas las ubicaciones posibles de una pieza sin armar el array
 * completo. Mantiene el mismo orden de generacion que la version anterior para
 * que los desempates den identico resultado.
 */
function eachPlacement(boards: BoardPlan[], piece: Piece, visit: (placement: PlacementOption) => void) {
  const orientations = candidateOrientations(piece);

  for (let boardIndex = 0; boardIndex < boards.length; boardIndex += 1) {
    const freeRects = boards[boardIndex].freeRects;
    // El costo real de empaquetar es recorrer los rectangulos libres, y crece
    // con la cantidad de placas y la fragmentacion. Medir el presupuesto en
    // esta unidad hace que el tope de trabajo se traduzca en un tiempo parejo
    // sin importar el tamano del pedido.
    scannedRects += freeRects.length;

    for (let rectIndex = 0; rectIndex < freeRects.length; rectIndex += 1) {
      const rect = freeRects[rectIndex];

      for (const orientation of orientations) {
        if (orientation.width > rect.width || orientation.height > rect.height) continue;

        const farX = rect.x + rect.width - orientation.width;
        const farY = rect.y + rect.height - orientation.height;
        const shortSideWaste = Math.min(rect.width - orientation.width, rect.height - orientation.height);
        const longSideWaste = Math.max(rect.width - orientation.width, rect.height - orientation.height);
        const areaWaste = rect.width * rect.height - orientation.width * orientation.height;

        for (let yIndex = 0; yIndex < 2; yIndex += 1) {
          if (yIndex === 1 && farY === rect.y) continue;
          const y = yIndex === 0 ? rect.y : farY;

          for (let xIndex = 0; xIndex < 2; xIndex += 1) {
            if (xIndex === 1 && farX === rect.x) continue;
            const x = xIndex === 0 ? rect.x : farX;

            placementScratch.boardIndex = boardIndex;
            placementScratch.rect = rect;
            placementScratch.x = x;
            placementScratch.y = y;
            placementScratch.width = orientation.width;
            placementScratch.height = orientation.height;
            placementScratch.rotated = orientation.rotated;
            placementScratch.areaFit = orientation.width * orientation.height;
            placementScratch.shortSideWaste = shortSideWaste;
            placementScratch.longSideWaste = longSideWaste;
            placementScratch.areaWaste = areaWaste;
            placementScratch.exactEdgeMatches =
              Number(x === rect.x || x + orientation.width === rect.x + rect.width) +
              Number(y === rect.y || y + orientation.height === rect.y + rect.height);

            visit(placementScratch);
          }
        }
      }
    }
  }
}

function tightFitOrder(a: PlacementOption, b: PlacementOption) {
  return (
    a.shortSideWaste - b.shortSideWaste ||
    a.longSideWaste - b.longSideWaste ||
    a.areaWaste - b.areaWaste ||
    b.exactEdgeMatches - a.exactEdgeMatches ||
    a.boardIndex - b.boardIndex ||
    a.rect.y - b.rect.y ||
    a.rect.x - b.rect.x ||
    a.y - b.y ||
    a.x - b.x ||
    Number(a.rotated) - Number(b.rotated)
  );
}

function areaWasteOrder(a: PlacementOption, b: PlacementOption) {
  return (
    a.areaWaste - b.areaWaste ||
    a.shortSideWaste - b.shortSideWaste ||
    b.exactEdgeMatches - a.exactEdgeMatches ||
    a.boardIndex - b.boardIndex ||
    a.rect.y - b.rect.y ||
    a.rect.x - b.rect.x ||
    a.y - b.y ||
    a.x - b.x ||
    Number(a.rotated) - Number(b.rotated)
  );
}

function edgesOrder(a: PlacementOption, b: PlacementOption) {
  return (
    b.exactEdgeMatches - a.exactEdgeMatches ||
    a.shortSideWaste - b.shortSideWaste ||
    a.areaWaste - b.areaWaste ||
    a.boardIndex - b.boardIndex ||
    a.rect.y - b.rect.y ||
    a.rect.x - b.rect.x ||
    a.y - b.y ||
    a.x - b.x ||
    Number(a.rotated) - Number(b.rotated)
  );
}

function comparePlacements(a: PlacementOption, b: PlacementOption, variant: number) {
  const mode = variant % 8;
  if (mode === 1) return areaWasteOrder(a, b);
  if (mode === 2) return edgesOrder(a, b);
  if (mode === 3) return a.boardIndex - b.boardIndex || tightFitOrder(a, b);
  if (mode === 4) return tightFitOrder(a, b) || Number(a.rotated) - Number(b.rotated);
  if (mode === 5) return a.y - b.y || a.x - b.x || tightFitOrder(a, b);
  if (mode === 6) return a.longSideWaste - b.longSideWaste || tightFitOrder(a, b);
  if (mode === 7) return b.areaFit - a.areaFit || tightFitOrder(a, b);
  return tightFitOrder(a, b);
}

/** Equivale a ordenar todas las ubicaciones y quedarse con la primera. */
function bestPlacement(boards: BoardPlan[], piece: Piece, variant: number) {
  let best: PlacementOption | null = null;

  eachPlacement(boards, piece, (placement) => {
    if (best === null || comparePlacements(placement, best, variant) < 0) {
      best = clonePlacement(placement);
    }
  });

  return best as PlacementOption | null;
}

/** Equivale a ordenar todas las ubicaciones y cortar las primeras `limit`. */
function topPlacements(boards: BoardPlan[], piece: Piece, variant: number, limit: number) {
  const top: PlacementOption[] = [];

  eachPlacement(boards, piece, (placement) => {
    let index = top.length;
    while (index > 0 && comparePlacements(placement, top[index - 1], variant) < 0) index -= 1;
    if (index >= limit) return;

    top.splice(index, 0, clonePlacement(placement));
    if (top.length > limit) top.pop();
  });

  return top;
}

function countPlacements(boards: BoardPlan[], piece: Piece) {
  let total = 0;
  eachPlacement(boards, piece, () => {
    total += 1;
  });
  return total;
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
  let selected: Piece | null = null;
  let selectedCount = Number.POSITIVE_INFINITY;

  // Solo se cuentan las ubicaciones de cada pieza; ordenarlas todas para
  // despues descartarlas era el grueso del costo de esta funcion.
  for (const piece of remaining) {
    const count = countPlacements(boards, piece);
    if (selected === null) {
      selected = piece;
      selectedCount = count;
      continue;
    }

    const better =
      count !== selectedCount
        ? count < selectedCount
        : piece.area !== selected.area
          ? piece.area > selected.area
          : Math.max(piece.width, piece.height) > Math.max(selected.width, selected.height);

    if (better) {
      selected = piece;
      selectedCount = count;
    }
  }

  if (selected === null) return null;

  return { piece: selected, placements: topPlacements(boards, selected, variant, SEARCH_CANDIDATE_LIMIT) };
}

function greedyPackFixedBoards(pieces: Piece[], boardCount: number, boardWidth: number, boardHeight: number, kerf: number, variant: number): SearchResult {
  const boards = Array.from({ length: boardCount }, () => createBoard(boardWidth, boardHeight));
  const orderedPieces = sortPieces(pieces, variant);

  for (const piece of orderedPieces) {
    const placement = bestPlacement(boards, piece, variant);
    if (!placement) return { boards, success: false };
    applyPlacement(boards[placement.boardIndex], placement, kerf);
  }

  return { boards, success: true };
}

function beamPackFixedBoards(pieces: Piece[], boardCount: number, boardWidth: number, boardHeight: number, kerf: number, variant: number, budget: Budget | null, beamWidth: number, beamBranches: number): SearchResult {
  const orderedPieces = sortPieces(pieces, variant);
  const boardArea = boardWidth * boardHeight;
  let frontier: BoardPlan[][] = [Array.from({ length: boardCount }, () => createBoard(boardWidth, boardHeight))];

  for (const piece of orderedPieces) {
    if (expired(budget)) return { boards: [], success: false };
    const scannedBefore = scannedRects;
    const nextStates: BoardPlan[][] = [];

    for (const state of frontier) {
      const placements = topPlacements(state, piece, variant, beamBranches);
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
      .slice(0, beamWidth);

    spend(budget, scannedRects - scannedBefore);
  }

  return frontier.length ? { boards: frontier[0], success: true } : { boards: [], success: false };
}

function searchPackFixedBoards(pieces: Piece[], boardCount: number, boardWidth: number, boardHeight: number, kerf: number, variant: number, budget: Budget | null): SearchResult {
  const startingBoards = Array.from({ length: boardCount }, () => createBoard(boardWidth, boardHeight));
  const orderedPieces = sortPieces(pieces, variant);
  let exploredNodes = 0;
  const failedStates = new Set<string>();

  const visit = (boards: BoardPlan[], remaining: Piece[]): BoardPlan[] | null => {
    if (!remaining.length) return boards;
    if (exploredNodes >= MAX_SEARCH_NODES) return null;
    if (expired(budget)) return null;
    exploredNodes += 1;
    const scannedBefore = scannedRects;

    const stateKey = `${remaining.map((piece) => piece.id).sort().join(",")}###${boardStateSignature(boards)}`;
    if (failedStates.has(stateKey)) return null;

    const selected = chooseMostConstrainedPiece(remaining, boards, variant);
    spend(budget, scannedRects - scannedBefore);
    if (!selected || !selected.placements.length) return null;

    const nextRemaining = remaining.filter((piece) => piece.id !== selected.piece.id);
    const candidates = selected.placements;

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

function compareSolutions(a: BoardPlan[], b: BoardPlan[], boardArea: number) {
  const scoreA = boardUsageScore(a, boardArea);
  const scoreB = boardUsageScore(b, boardArea);
  if (scoreA.rotatedCount !== scoreB.rotatedCount) return scoreA.rotatedCount - scoreB.rotatedCount;
  if (scoreA.wastePercent !== scoreB.wastePercent) return scoreA.wastePercent - scoreB.wastePercent;
  return scoreB.usedArea - scoreA.usedArea;
}

function usedBoardCount(boards: BoardPlan[]) {
  return boards.filter((board) => board.usedArea > 0).length;
}

function bestGreedySolution(
  pieces: Piece[],
  boardCount: number,
  boardWidth: number,
  boardHeight: number,
  kerf: number,
  boardArea: number,
  firstVariant: number,
  variantCount: number,
  budget: Budget | null
) {
  let best: BoardPlan[] | null = null;

  for (let offset = 0; offset < variantCount; offset += 1) {
    if (offset > 0 && expired(budget)) break;
    const attempt = greedyPackFixedBoards(pieces, boardCount, boardWidth, boardHeight, kerf, firstVariant + offset);
    if (!attempt.success) continue;
    if (best === null || compareSolutions(attempt.boards, best, boardArea) < 0) best = attempt.boards;
  }

  return best;
}

function bestBeamSolution(
  pieces: Piece[],
  boardCount: number,
  boardWidth: number,
  boardHeight: number,
  kerf: number,
  boardArea: number,
  budget: Budget | null
) {
  for (const stage of BEAM_STAGES) {
    let best: BoardPlan[] | null = null;

    for (let variant = 0; variant < stage.variants; variant += 1) {
      if (expired(budget)) return best;
      const attempt = beamPackFixedBoards(pieces, boardCount, boardWidth, boardHeight, kerf, variant, budget, stage.width, stage.branches);
      if (!attempt.success) continue;
      if (best === null || compareSolutions(attempt.boards, best, boardArea) < 0) best = attempt.boards;
    }

    // Etapa resuelta: no hace falta gastar presupuesto en las mas caras.
    if (best !== null) return best;
  }

  return null;
}

function bestSearchSolution(
  pieces: Piece[],
  boardCount: number,
  boardWidth: number,
  boardHeight: number,
  kerf: number,
  boardArea: number,
  budget: Budget | null
) {
  if (pieces.length > MAX_SEARCH_PIECES) return null;

  let best: BoardPlan[] | null = null;

  for (let variant = 0; variant < SEARCH_VARIANTS; variant += 1) {
    if (expired(budget)) break;
    const attempt = searchPackFixedBoards(pieces, boardCount, boardWidth, boardHeight, kerf, variant, budget);
    if (!attempt.success) continue;
    if (best === null || compareSolutions(attempt.boards, best, boardArea) < 0) best = attempt.boards;
  }

  return best;
}

function calculateBoardsForMaterial(details: DetallePedido[], material: Material, settings: ConfiguracionOptimizador, budget: Budget | null = null) {
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
  const kerf = settings.espesorSierraMm;
  const totalArea = basePieces.reduce((total, piece) => total + piece.area, 0);

  const oversizedPiece = basePieces.some((piece) =>
    !candidateOrientations(piece).some((orientation) => orientation.width <= boardWidth && orientation.height <= boardHeight)
  );
  if (oversizedPiece) return Number.POSITIVE_INFINITY;

  const minBoardsByArea = Math.max(1, Math.ceil(totalArea / boardArea));

  // Fase 1 - respuesta garantizada. Solo greedy, y sin limite de tiempo: es
  // barato y tiene que terminar si o si, porque de aca sale el presupuesto.
  let bestBoards: number | null = null;

  for (let boardCount = minBoardsByArea; boardCount <= basePieces.length; boardCount += 1) {
    const solved = bestGreedySolution(basePieces, boardCount, boardWidth, boardHeight, kerf, boardArea, 0, 1, null);
    if (solved) {
      bestBoards = usedBoardCount(solved);
      break;
    }
  }

  if (bestBoards === null) return Number.POSITIVE_INFINITY;

  // Fase 2 - mejora opcional, acotada por tiempo. Se baja de a una placa desde
  // la respuesta de la fase 1. Si un nivel no se puede resolver, ninguno mas
  // bajo va a poder tampoco, asi que se corta ahi: probar de menor a mayor
  // gastaba casi todo el tiempo demostrando que lo imposible era imposible.
  let target = bestBoards - 1;

  while (target >= minBoardsByArea && !expired(budget)) {
    const solved =
      bestGreedySolution(basePieces, target, boardWidth, boardHeight, kerf, boardArea, 1, GREEDY_VARIANTS - 1, budget) ??
      bestBeamSolution(basePieces, target, boardWidth, boardHeight, kerf, boardArea, budget) ??
      bestSearchSolution(basePieces, target, boardWidth, boardHeight, kerf, boardArea, budget);

    if (!solved) break;

    bestBoards = usedBoardCount(solved);
    target = Math.min(target, bestBoards) - 1;
  }

  return bestBoards;
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

  // Cada material recibe su parte del trabajo, asi un material grande no se
  // come el presupuesto de los demas.

  for (const materialId of materialIds) {
    const material = materialsById.get(materialId);
    if (!material) throw new AppError(400, "Material no encontrado para calcular presupuesto.");

    const materialDetails = detalles.filter((detail) => detail.materialId === materialId);
    const boards = calculateBoardsForMaterial(materialDetails, material, settings, createBudget(materialIds.length));
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
    const boards = calculateBoardsForMaterial(materialDetails, material, settings, createBudget(materialIds.length));
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
