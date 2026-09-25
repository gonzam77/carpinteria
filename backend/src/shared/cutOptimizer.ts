// ESTE ARCHIVO ESTA DUPLICADO EN frontend/src/lib/cutOptimizer.ts Y backend/src/shared/cutOptimizer.ts.
// El frontend lo usa para dibujar el plano de cortes y el backend para calcular las placas del
// presupuesto, la constancia y el listado de materiales. Las dos copias tienen que ser identicas:
// si difieren, el plano y la constancia vuelven a dar cantidades de placas distintas. Editar la del
// frontend y correr `npm run sync:optimizer` desde la raiz (`npm run check:optimizer` lo verifica).
// Por eso no importa nada: tiene que compilar igual en Vite y en Node.

export type OptimizerSettingsInput = {
  espesorSierraMm: number;
};

const EPS_MM = 0.1;
const MIN_AREA_EPS_MM2 = 50;
const AREA_EPS_RATIO = 1e-4;

export const EPS = EPS_MM;

const ROUND_MM_FACTOR = 10;
const ROUND_AREA_FACTOR = 100;
const DEFAULT_TIME_BUDGET_MS = 300;
// El presupuesto se mide en trabajo (candidatos de colocacion evaluados), no en reloj. Con reloj el
// resultado dependia de la velocidad de la maquina: el navegador podia llegar a bajar una placa que
// el servidor no alcanzaba, o al reves, y el plano no coincidia con la constancia. Con trabajo, las
// mismas piezas dan siempre las mismas placas en cualquier equipo. `timeBudgetMs` se conserva como
// unidad de configuracion y se convierte con esta tasa, medida en una PC de escritorio.
const WORK_UNITS_PER_MS = 250;

let workDone = 0;

function workClock() {
  return workDone;
}

// localeCompare depende del idioma del entorno (el navegador y Node pueden ordenar distinto):
// para que los desempates sean identicos en todos lados se compara por codigo de caracter.
function compareText(a: string, b: string) {
  return a < b ? -1 : a > b ? 1 : 0;
}
const GREEDY_VARIANTS = 6;
const BEAM_VARIANTS = 4;
const SEARCH_VARIANTS = 3;
const MAX_SEARCH_PIECES = 24;
const SEARCH_BRANCH_LIMIT = 6;
const BEAM_WIDTH = 24;
const BEAM_BRANCHES = 4;
const PRIMARY_VARIANT_SEEDS = [0, 1, 3, 8, 26];
const FLOOR_EXPLORATION_SHARE = 0.35;
const CANDIDATE_ORDERS = ["fit-first", "size-first", "board-fit-first", "size-board-fit-first"] as const;
const BOARD_SCOPED_ORDERS: readonly CandidateOrder[] = ["board-fit-first", "size-board-fit-first"];
const SIZE_SCOPED_ORDERS: readonly CandidateOrder[] = ["size-first", "size-board-fit-first"];
// Los dos primeros son los modos historicos: se calculan siempre para que el resultado nunca
// pueda ser peor que el de la version anterior.
const REQUIRED_CANDIDATE_ORDERS = 2;

export type PieceEdges = {
  top?: string | null;
  right?: string | null;
  bottom?: string | null;
  left?: string | null;
};

export type CandidateOrder = (typeof CANDIDATE_ORDERS)[number];

export type FreeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type PieceInput = {
  id: string;
  width: number;
  height: number;
  label: string;
  colorIndex: number;
  canRotate: boolean;
  edges: PieceEdges;
  area: number;
  groupKey?: string;
};

export type PlacedPiece = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  requestedWidth: number;
  requestedHeight: number;
  label: string;
  colorIndex: number;
  rotated: boolean;
  canRotate: boolean;
  edges: PieceEdges;
  groupKey: string;
};

type CutDirection = "horizontal" | "vertical";

type PlacementRecord = {
  targetRect: FreeRect;
  piece: PlacedPiece;
  direction: CutDirection;
};

export type BoardPlan = {
  index: number;
  pieces: PlacedPiece[];
  freeRects: FreeRect[];
  usedArea: number;
  kerfArea: number;
  usableWidthMm: number;
  usableHeightMm: number;
  minimumPieceArea: number;
  placementHistory: PlacementRecord[];
};

export type OptimizationAttempt = {
  boards: BoardPlan[];
  unplaced: PieceInput[];
  boardCount: number;
  usedArea: number;
  wastePercent: number;
  totalFreeRectCount: number;
  rotatedCount: number;
  lastBoardLargestFreeRectArea: number;
  lastBoardFreeRectCount: number;
  signature: string;
};

export type OptimizeCutLayoutParams = {
  pieces: PieceInput[];
  usableBoardWidthMm: number;
  usableBoardHeightMm: number;
  settings: OptimizerSettingsInput;
  variant: number;
  // Presupuesto expresado en ms de referencia; se traduce a unidades de trabajo (ver WORK_UNITS_PER_MS).
  timeBudgetMs?: number;
  candidateOrder?: CandidateOrder;
};

export type OptimizeCutLayoutResult = {
  boards: BoardPlan[];
  unplaced: PieceInput[];
  attempts: OptimizationAttempt[];
  lowerBound: number;
  minimumPieceArea: number;
  floorBoardCount: number;
  improvementRan: boolean;
  improvementGained: number;
};

type NormalizedPieceInput = PieceInput & {
  area: number;
  groupKey: string;
};

type PieceBucket = {
  key: string;
  pieces: NormalizedPieceInput[];
};

type PieceOrientation = {
  width: number;
  height: number;
  rotated: boolean;
  edges: PieceEdges;
};

type GapResolution = {
  consumed: number;
  remainder: number;
};

type SplitResult = {
  freeRects: FreeRect[];
  kerfArea: number;
};

type MergedFreeRectsResult = {
  freeRects: FreeRect[];
  kerfArea: number;
};

type PlacementCandidate = {
  piece: NormalizedPieceInput;
  rect: FreeRect;
  width: number;
  height: number;
  rotated: boolean;
  edges: PieceEdges;
  direction: CutDirection;
  freeRectsAfterSplit: FreeRect[];
  boardFreeRectsAfterPlacement: FreeRect[];
  boardKerfAreaAfterPlacement: number;
  fitCount: number;
  blockedArea: number;
  largestRectArea: number;
  nextFreeRectCount: number;
  sameGroupStripeCapacity: number;
  sameHeightStripe: boolean;
  adjacentStripe: boolean;
  fullSpanRemainder: boolean;
  groupRank: number;
  projectedRemainingCount: number;
  projectedDominantFreeRatio: number;
  projectedFreeRectCount: number;
  projectedLargestFreeRectArea: number;
};

type BeamState = {
  sealedBoards: BoardPlan[];
  currentBoard: BoardPlan;
  remaining: PieceBucket[];
};

type ReplayResult = {
  pieces: PlacedPiece[];
  freeRects: FreeRect[];
  kerfArea: number;
  errors: string[];
};

type FirstFitSolveResult = {
  boards: BoardPlan[];
  unplaced: PieceInput[];
  candidateOrder: CandidateOrder;
  variant: number;
};

type FloorCandidate = {
  label: string;
  floor: FirstFitSolveResult;
  validation: { valid: boolean; errors: string[] };
  attempt: OptimizationAttempt;
};

function roundMm(value: number) {
  return Math.round(value * ROUND_MM_FACTOR) / ROUND_MM_FACTOR;
}

function resolveVariantSeed(variant: number) {
  return Number.isInteger(variant) && variant >= 0 && variant < PRIMARY_VARIANT_SEEDS.length
    ? PRIMARY_VARIANT_SEEDS[variant]
    : variant;
}

function roundArea(value: number) {
  return Math.round(value * ROUND_AREA_FACTOR) / ROUND_AREA_FACTOR;
}

function toPositive(value: number) {
  return value <= EPS_MM ? 0 : roundMm(value);
}

function rectArea(rect: FreeRect) {
  return roundArea(rect.width * rect.height);
}

function sameNumber(a: number, b: number) {
  return Math.abs(a - b) <= EPS_MM;
}

function lessOrEqual(a: number, b: number) {
  return a <= b + EPS_MM;
}

function greaterThan(a: number, b: number) {
  return a > b + EPS_MM;
}

function areaTolerance(a: number, b: number) {
  return Math.max(MIN_AREA_EPS_MM2, Math.max(Math.abs(a), Math.abs(b)) * AREA_EPS_RATIO);
}

function sameArea(a: number, b: number) {
  return Math.abs(a - b) <= areaTolerance(a, b);
}

function createRect(x: number, y: number, width: number, height: number): FreeRect {
  return {
    x: roundMm(x),
    y: roundMm(y),
    width: toPositive(width),
    height: toPositive(height)
  };
}

function sameRect(a: FreeRect, b: FreeRect) {
  return sameNumber(a.x, b.x) && sameNumber(a.y, b.y) && sameNumber(a.width, b.width) && sameNumber(a.height, b.height);
}

function sortRects(rects: FreeRect[]) {
  return [...rects].sort((a, b) => a.y - b.y || a.x - b.x || a.width - b.width || a.height - b.height);
}

function normalizePiece(piece: PieceInput): NormalizedPieceInput {
  const area = piece.area || Number(piece.width) * Number(piece.height);
  return {
    ...piece,
    width: Number(piece.width),
    height: Number(piece.height),
    area,
    groupKey: piece.groupKey || createPieceGroupKey(piece)
  };
}

export function createPieceGroupKey(piece: Pick<PieceInput, "width" | "height" | "canRotate" | "edges">) {
  return [
    piece.width,
    piece.height,
    Number(piece.canRotate),
    piece.edges.top || "",
    piece.edges.right || "",
    piece.edges.bottom || "",
    piece.edges.left || ""
  ].join(":");
}

export function buildOrientations(piece: Pick<PieceInput, "width" | "height" | "canRotate" | "edges">): PieceOrientation[] {
  if (!piece.canRotate || sameNumber(piece.width, piece.height)) {
    return [{ width: piece.width, height: piece.height, rotated: false, edges: piece.edges }];
  }

  return [
    { width: piece.width, height: piece.height, rotated: false, edges: piece.edges },
    {
      width: piece.height,
      height: piece.width,
      rotated: true,
      edges: {
        top: piece.edges.left,
        right: piece.edges.top,
        bottom: piece.edges.right,
        left: piece.edges.bottom
      }
    }
  ];
}

function createBoard(index: number, usableWidthMm: number, usableHeightMm: number, minimumPieceArea: number): BoardPlan {
  return {
    index,
    pieces: [],
    freeRects: [createRect(0, 0, usableWidthMm, usableHeightMm)],
    usedArea: 0,
    kerfArea: 0,
    usableWidthMm,
    usableHeightMm,
    minimumPieceArea,
    placementHistory: []
  };
}

function cloneBoard(board: BoardPlan): BoardPlan {
  return {
    index: board.index,
    pieces: board.pieces.map((piece) => ({ ...piece, edges: { ...piece.edges } })),
    freeRects: board.freeRects.map((rect) => ({ ...rect })),
    usedArea: board.usedArea,
    kerfArea: board.kerfArea,
    usableWidthMm: board.usableWidthMm,
    usableHeightMm: board.usableHeightMm,
    minimumPieceArea: board.minimumPieceArea,
    placementHistory: board.placementHistory.map((record) => ({
      targetRect: { ...record.targetRect },
      piece: { ...record.piece, edges: { ...record.piece.edges } },
      direction: record.direction
    }))
  };
}

function cloneBuckets(buckets: PieceBucket[]) {
  return buckets.map((bucket) => ({ key: bucket.key, pieces: [...bucket.pieces] }));
}

function buildBuckets(pieces: NormalizedPieceInput[]) {
  const buckets = new Map<string, NormalizedPieceInput[]>();

  pieces.forEach((piece) => {
    const current = buckets.get(piece.groupKey) || [];
    current.push(piece);
    buckets.set(piece.groupKey, current);
  });

  return [...buckets.entries()]
    .map(([key, groupedPieces]) => ({ key, pieces: groupedPieces }))
    .sort((a, b) => compareText(a.key, b.key));
}

function remainingPieceCount(buckets: PieceBucket[]) {
  return buckets.reduce((total, bucket) => total + bucket.pieces.length, 0);
}

function sortBucketsForVariant(buckets: PieceBucket[], variant: number) {
  const mode = variant % 6;
  return [...buckets].sort((a, b) => {
    const pieceA = a.pieces[0];
    const pieceB = b.pieces[0];
    const majorA = Math.max(pieceA.width, pieceA.height);
    const majorB = Math.max(pieceB.width, pieceB.height);
    const minorA = Math.min(pieceA.width, pieceA.height);
    const minorB = Math.min(pieceB.width, pieceB.height);

    if (mode === 1) return pieceB.area - pieceA.area || majorB - majorA || compareText(a.key, b.key);
    if (mode === 2) return pieceB.height - pieceA.height || pieceB.width - pieceA.width || pieceB.area - pieceA.area;
    if (mode === 3) return pieceB.width - pieceA.width || pieceB.height - pieceA.height || pieceB.area - pieceA.area;
    if (mode === 4) return minorB - minorA || majorB - majorA || pieceB.area - pieceA.area || compareText(a.key, b.key);
    if (mode === 5) return b.pieces.length - a.pieces.length || majorB - majorA || pieceB.area - pieceA.area || compareText(a.key, b.key);

    return majorB - majorA || pieceB.area - pieceA.area || b.pieces.length - a.pieces.length || compareText(a.key, b.key);
  });
}

function removePieceFromBuckets(buckets: PieceBucket[], piece: NormalizedPieceInput) {
  return buckets
    .map((bucket) => {
      if (bucket.key !== piece.groupKey) return { key: bucket.key, pieces: [...bucket.pieces] };
      return { key: bucket.key, pieces: bucket.pieces.slice(1) };
    })
    .filter((bucket) => bucket.pieces.length > 0);
}

function resolveGap(gap: number, kerf: number): GapResolution {
  if (gap <= EPS_MM) return { consumed: 0, remainder: 0 };
  if (gap <= kerf + EPS_MM) return { consumed: roundMm(gap), remainder: 0 };

  const remainder = toPositive(gap - kerf);
  return {
    consumed: roundMm(gap - remainder),
    remainder
  };
}

function splitGuillotineRect(rect: FreeRect, width: number, height: number, direction: CutDirection, kerf: number): SplitResult {
  const rightGap = resolveGap(rect.width - width, kerf);
  const bottomGap = resolveGap(rect.height - height, kerf);

  if (direction === "horizontal") {
    const freeRects = [
      createRect(rect.x + width + rightGap.consumed, rect.y, rightGap.remainder, height),
      createRect(rect.x, rect.y + height + bottomGap.consumed, rect.width, bottomGap.remainder)
    ].filter((freeRect) => freeRect.width > 0 && freeRect.height > 0);

    return {
      freeRects,
      kerfArea: roundArea(rightGap.consumed * height + bottomGap.consumed * rect.width)
    };
  }

  const freeRects = [
    createRect(rect.x, rect.y + height + bottomGap.consumed, width, bottomGap.remainder),
    createRect(rect.x + width + rightGap.consumed, rect.y, rightGap.remainder, rect.height)
  ].filter((freeRect) => freeRect.width > 0 && freeRect.height > 0);

  return {
    freeRects,
    kerfArea: roundArea(bottomGap.consumed * width + rightGap.consumed * rect.height)
  };
}

function canOrientationFitRect(orientation: PieceOrientation, rect: FreeRect) {
  return orientation.width <= rect.width && orientation.height <= rect.height;
}

function fitsAnyRect(piece: Pick<PieceInput, "width" | "height" | "canRotate" | "edges">, rects: FreeRect[]) {
  return buildOrientations(piece).some((orientation) => rects.some((rect) => canOrientationFitRect(orientation, rect)));
}

function bucketFitsAnyRect(bucket: PieceBucket, rects: FreeRect[]) {
  return fitsAnyRect(bucket.pieces[0], rects);
}

function hasAdjacentStripe(board: BoardPlan, rect: FreeRect, height: number, kerf: number) {
  return board.pieces.some(
    (placed) => {
      const gap = rect.x - (placed.x + placed.width);
      return sameNumber(placed.y, rect.y) && sameNumber(placed.height, height) && gap >= -EPS_MM && gap <= kerf + EPS_MM;
    }
  );
}

function countLinearCapacity(totalLength: number, pieceLength: number, kerf: number) {
  if (!lessOrEqual(pieceLength, totalLength)) return 0;

  let usedLength = 0;
  let capacity = 0;

  while (lessOrEqual(usedLength + pieceLength, totalLength)) {
    capacity += 1;
    usedLength += pieceLength;
    const remainingLength = totalLength - usedLength;
    if (remainingLength <= EPS_MM || remainingLength <= kerf + EPS_MM) break;
    usedLength += kerf;
  }

  return capacity;
}

function countStripeCapacity(rect: FreeRect, width: number, height: number, kerf: number) {
  if (!sameNumber(rect.height, height) || rect.width <= 0) return 0;

  return countLinearCapacity(rect.width, width, kerf);
}

function countRectCapacityForOrientation(rect: FreeRect, orientation: PieceOrientation, kerf: number) {
  const columns = countLinearCapacity(rect.width, orientation.width, kerf);
  const rows = countLinearCapacity(rect.height, orientation.height, kerf);
  return columns * rows;
}

function countRectCapacityForPiece(rect: FreeRect, piece: NormalizedPieceInput, orientations: PieceOrientation[], kerf: number) {
  return orientations.reduce((capacity, orientation) => {
    return Math.max(capacity, countRectCapacityForOrientation(rect, orientation, kerf));
  }, 0);
}

function countFittableUnitsForBucket(rects: FreeRect[], bucket: PieceBucket, kerf: number) {
  const piece = bucket.pieces[0];
  const orientations = buildOrientations(piece);
  let remainingUnits = bucket.pieces.length;
  let totalUnits = 0;

  for (const rect of rects) {
    if (remainingUnits <= 0) break;
    const capacity = countRectCapacityForPiece(rect, piece, orientations, kerf);
    const units = Math.min(remainingUnits, capacity);
    totalUnits += units;
    remainingUnits -= units;
  }

  return totalUnits;
}

function compareLastBoardStripePriority(a: PlacementCandidate, b: PlacementCandidate) {
  if (a.sameHeightStripe !== b.sameHeightStripe) return a.sameHeightStripe ? -1 : 1;
  if (a.adjacentStripe !== b.adjacentStripe) return a.adjacentStripe ? -1 : 1;
  return 0;
}

function compareSpanAndFragmentation(a: PlacementCandidate, b: PlacementCandidate, isLastBoard: boolean) {
  if (isLastBoard) {
    if (a.fullSpanRemainder !== b.fullSpanRemainder) return a.fullSpanRemainder ? -1 : 1;
    if (a.nextFreeRectCount !== b.nextFreeRectCount) return a.nextFreeRectCount - b.nextFreeRectCount;
    return 0;
  }

  if (a.nextFreeRectCount !== b.nextFreeRectCount) return a.nextFreeRectCount - b.nextFreeRectCount;
  if (a.fullSpanRemainder !== b.fullSpanRemainder) return a.fullSpanRemainder ? -1 : 1;
  return 0;
}

function compareCandidates(
  a: PlacementCandidate,
  b: PlacementCandidate,
  variant: number,
  isLastBoard: boolean,
  candidateOrder: CandidateOrder
) {
  if (SIZE_SCOPED_ORDERS.includes(candidateOrder) && a.piece.area !== b.piece.area) return b.piece.area - a.piece.area;
  if (isLastBoard) {
    const lastBoardStripePriority = compareLastBoardStripePriority(a, b);
    if (lastBoardStripePriority !== 0) return lastBoardStripePriority;
  }
  if (a.fitCount !== b.fitCount) return b.fitCount - a.fitCount;
  if (a.blockedArea !== b.blockedArea) return a.blockedArea - b.blockedArea;
  const mode = ((variant % 5) + 5) % 5;

  if (isLastBoard) {
    if (a.projectedRemainingCount !== b.projectedRemainingCount) {
      return a.projectedRemainingCount - b.projectedRemainingCount;
    }
    if (a.projectedDominantFreeRatio !== b.projectedDominantFreeRatio) {
      return b.projectedDominantFreeRatio - a.projectedDominantFreeRatio;
    }
    if (a.projectedFreeRectCount !== b.projectedFreeRectCount) {
      return a.projectedFreeRectCount - b.projectedFreeRectCount;
    }
    if (a.projectedLargestFreeRectArea !== b.projectedLargestFreeRectArea) {
      return b.projectedLargestFreeRectArea - a.projectedLargestFreeRectArea;
    }
    if (a.fullSpanRemainder !== b.fullSpanRemainder) return a.fullSpanRemainder ? -1 : 1;
    if (a.largestRectArea !== b.largestRectArea) return b.largestRectArea - a.largestRectArea;
  }

  if (mode === 1) {
    if (a.largestRectArea !== b.largestRectArea) return b.largestRectArea - a.largestRectArea;
    const spanAndFragmentation = compareSpanAndFragmentation(a, b, isLastBoard);
    if (spanAndFragmentation !== 0) return spanAndFragmentation;
    if (a.sameGroupStripeCapacity !== b.sameGroupStripeCapacity) return b.sameGroupStripeCapacity - a.sameGroupStripeCapacity;
    if (a.adjacentStripe !== b.adjacentStripe) return a.adjacentStripe ? -1 : 1;
    if (a.sameHeightStripe !== b.sameHeightStripe) return a.sameHeightStripe ? -1 : 1;
  } else if (mode === 2) {
    if (a.adjacentStripe !== b.adjacentStripe) return a.adjacentStripe ? -1 : 1;
    if (a.sameGroupStripeCapacity !== b.sameGroupStripeCapacity) return b.sameGroupStripeCapacity - a.sameGroupStripeCapacity;
    if (a.largestRectArea !== b.largestRectArea) return b.largestRectArea - a.largestRectArea;
    const spanAndFragmentation = compareSpanAndFragmentation(a, b, isLastBoard);
    if (spanAndFragmentation !== 0) return spanAndFragmentation;
    if (a.sameHeightStripe !== b.sameHeightStripe) return a.sameHeightStripe ? -1 : 1;
  } else if (mode === 3) {
    if (a.largestRectArea !== b.largestRectArea) return b.largestRectArea - a.largestRectArea;
    if (a.sameHeightStripe !== b.sameHeightStripe) return a.sameHeightStripe ? -1 : 1;
    const spanAndFragmentation = compareSpanAndFragmentation(a, b, isLastBoard);
    if (spanAndFragmentation !== 0) return spanAndFragmentation;
    if (a.adjacentStripe !== b.adjacentStripe) return a.adjacentStripe ? -1 : 1;
    if (a.sameGroupStripeCapacity !== b.sameGroupStripeCapacity) return b.sameGroupStripeCapacity - a.sameGroupStripeCapacity;
  } else if (mode === 4) {
    if (a.sameGroupStripeCapacity !== b.sameGroupStripeCapacity) return b.sameGroupStripeCapacity - a.sameGroupStripeCapacity;
    const spanAndFragmentation = compareSpanAndFragmentation(a, b, isLastBoard);
    if (spanAndFragmentation !== 0) return spanAndFragmentation;
    if (a.largestRectArea !== b.largestRectArea) return b.largestRectArea - a.largestRectArea;
    if (a.sameHeightStripe !== b.sameHeightStripe) return a.sameHeightStripe ? -1 : 1;
    if (a.adjacentStripe !== b.adjacentStripe) return a.adjacentStripe ? -1 : 1;
  } else {
    if (a.sameHeightStripe !== b.sameHeightStripe) return a.sameHeightStripe ? -1 : 1;
    if (a.adjacentStripe !== b.adjacentStripe) return a.adjacentStripe ? -1 : 1;
    if (a.sameGroupStripeCapacity !== b.sameGroupStripeCapacity) return b.sameGroupStripeCapacity - a.sameGroupStripeCapacity;
    if (a.largestRectArea !== b.largestRectArea) return b.largestRectArea - a.largestRectArea;
    const spanAndFragmentation = compareSpanAndFragmentation(a, b, isLastBoard);
    if (spanAndFragmentation !== 0) return spanAndFragmentation;
  }

  if (mode === 1) {
    if (a.rect.x !== b.rect.x) return a.rect.x - b.rect.x;
    if (a.rect.y !== b.rect.y) return a.rect.y - b.rect.y;
  } else if (mode === 2) {
    if (a.rect.x !== b.rect.x) return b.rect.x - a.rect.x;
    if (a.rect.y !== b.rect.y) return a.rect.y - b.rect.y;
  } else if (mode === 3) {
    if (a.rect.y !== b.rect.y) return b.rect.y - a.rect.y;
    if (a.rect.x !== b.rect.x) return a.rect.x - b.rect.x;
  } else if (mode === 4) {
    if (a.rect.y !== b.rect.y) return a.rect.y - b.rect.y;
    if (a.rect.x !== b.rect.x) return b.rect.x - a.rect.x;
  } else {
    if (a.rect.y !== b.rect.y) return a.rect.y - b.rect.y;
    if (a.rect.x !== b.rect.x) return a.rect.x - b.rect.x;
  }

  if (a.groupRank !== b.groupRank) return a.groupRank - b.groupRank;
  if (a.rotated !== b.rotated) return Number(a.rotated) - Number(b.rotated);

  const preferHorizontal = variant % 2 === 0;
  if (a.direction !== b.direction) return a.direction === (preferHorizontal ? "horizontal" : "vertical") ? -1 : 1;

  return compareText(a.piece.id, b.piece.id);
}

function previewLastBoardCandidate(
  board: BoardPlan,
  candidate: PlacementCandidate,
  nextRemaining: PieceBucket[],
  variant: number,
  kerf: number,
  candidateOrder: CandidateOrder
) {
  const previewBoard = cloneBoard(board);
  applyCandidate(previewBoard, candidate);
  const preview = fillBoardGreedy(previewBoard, nextRemaining, variant, 1, [], kerf, Number.POSITIVE_INFINITY, candidateOrder, false);
  const reportedPreviewBoard = finalizeBoardForReport(preview.board, kerf);
  const largestFreeRect = getLargestFreeRect(reportedPreviewBoard);
  const totalFreeArea = reportedPreviewBoard.freeRects.reduce((total, freeRect) => total + rectArea(freeRect), 0);

  return {
    projectedRemainingCount: remainingPieceCount(preview.remaining),
    projectedDominantFreeRatio: totalFreeArea && largestFreeRect ? rectArea(largestFreeRect) / totalFreeArea : 0,
    projectedFreeRectCount: reportedPreviewBoard.freeRects.length,
    projectedLargestFreeRectArea: largestFreeRect ? rectArea(largestFreeRect) : 0
  };
}

function collectBoardCandidates(
  board: BoardPlan,
  remaining: PieceBucket[],
  variant: number,
  isLastBoard: boolean,
  kerf: number,
  candidateOrder: CandidateOrder,
  enableLastBoardPreview = true
) {
  const orderedBuckets = sortBucketsForVariant(remaining, variant);
  const candidates: PlacementCandidate[] = [];
  const shouldPreviewLastBoard = enableLastBoardPreview && isLastBoard && remainingPieceCount(remaining) <= 12;

  orderedBuckets.forEach((bucket, groupRank) => {
    const piece = bucket.pieces[0];
    const orientations = buildOrientations(piece);
    const nextRemaining = removePieceFromBuckets(remaining, piece);

    board.freeRects.forEach((rect) => {
      const remainingFreeRects = board.freeRects.filter((freeRect) => !sameRect(freeRect, rect));

      orientations.forEach((orientation) => {
        if (!canOrientationFitRect(orientation, rect)) return;

        (["horizontal", "vertical"] as const).forEach((direction) => {
          const split = splitGuillotineRect(rect, orientation.width, orientation.height, direction, kerf);
          // La fusion se calcula aca y no al aplicar la jugada, para que todas las metricas del
          // candidato midan el estado real en que quedaria la placa. Si el candidato se evalua
          // sobre el sobrante partido y la placa despues se fusiona, el comparador decide sobre
          // una foto que ya no existe.
          const mergedAfterPlacement = mergeAdjacentFreeRects(
            sortRects([...remainingFreeRects, ...split.freeRects]),
            roundArea(board.kerfArea + split.kerfArea),
            kerf
          );
          const boardFreeRectsAfterPlacement = mergedAfterPlacement.freeRects;
          // "fit-first" mide cuantas piezas entran solo en los recortes del rectangulo usado, asi que
          // premia cortar el rectangulo mas grande aunque queden intactos otros mas ajustados.
          // "board-fit-first" mide lo mismo sobre la placa entera, con lo que favorece el encastre justo.
          const fitScopeRects = BOARD_SCOPED_ORDERS.includes(candidateOrder) ? boardFreeRectsAfterPlacement : split.freeRects;
          const fitCount = nextRemaining.reduce(
            (total, candidateBucket) => total + countFittableUnitsForBucket(fitScopeRects, candidateBucket, kerf),
            0
          );
          // Si no queda ninguna pieza por ubicar, "cuanta area queda bloqueada" y "cuantas piezas
          // mas entran en la franja" no significan nada: todo el sobrante queda igual de inutil.
          // Dejarlos en cero evita que la ultima colocacion se decida por diferencias de kerf de
          // unos pocos mm2 y deja que mande la calidad del remanente.
          const hasRemainingPieces = nextRemaining.length > 0;
          const blockedArea = hasRemainingPieces
            ? split.freeRects
                .filter((freeRect) => !nextRemaining.some((candidateBucket) => bucketFitsAnyRect(candidateBucket, [freeRect])))
                .reduce((total, freeRect) => total + rectArea(freeRect), 0)
            : 0;
          const largestRectArea = split.freeRects.reduce((largest, freeRect) => Math.max(largest, rectArea(freeRect)), 0);
          const sameGroupStripeCapacity = hasRemainingPieces
            ? split.freeRects.reduce(
                (capacity, freeRect) => capacity + countStripeCapacity(freeRect, orientation.width, orientation.height, kerf),
                0
              )
            : 0;
          const sameHeightStripe = sameNumber(rect.height, orientation.height);
          const adjacentStripe = hasAdjacentStripe(board, rect, orientation.height, kerf);
          const fullSpanRemainder = split.freeRects.some(
            (freeRect) => sameNumber(freeRect.width, board.usableWidthMm) || sameNumber(freeRect.height, board.usableHeightMm)
          );
          const candidate: PlacementCandidate = {
            piece,
            rect,
            width: orientation.width,
            height: orientation.height,
            rotated: orientation.rotated,
            edges: orientation.edges,
            direction,
            freeRectsAfterSplit: split.freeRects,
            boardFreeRectsAfterPlacement,
            boardKerfAreaAfterPlacement: mergedAfterPlacement.kerfArea,
            fitCount,
            blockedArea: roundArea(blockedArea),
            largestRectArea,
            nextFreeRectCount: boardFreeRectsAfterPlacement.length,
            sameGroupStripeCapacity,
            sameHeightStripe,
            adjacentStripe,
            fullSpanRemainder,
            groupRank,
            projectedRemainingCount: remainingPieceCount(nextRemaining),
            projectedDominantFreeRatio: 0,
            projectedFreeRectCount: boardFreeRectsAfterPlacement.length,
            projectedLargestFreeRectArea: boardFreeRectsAfterPlacement.reduce(
              (largest, freeRect) => Math.max(largest, rectArea(freeRect)),
              0
            )
          };

          if (shouldPreviewLastBoard) {
            Object.assign(candidate, previewLastBoardCandidate(board, candidate, nextRemaining, variant, kerf, candidateOrder));
          }

          candidates.push(candidate);
          workDone += 1;
        });
      });
    });
  });

  return candidates.sort((a, b) => compareCandidates(a, b, variant, isLastBoard, candidateOrder));
}

function applyCandidate(board: BoardPlan, candidate: PlacementCandidate) {
  const placedPiece: PlacedPiece = {
    id: candidate.piece.id,
    x: candidate.rect.x,
    y: candidate.rect.y,
    width: candidate.width,
    height: candidate.height,
    requestedWidth: candidate.piece.width,
    requestedHeight: candidate.piece.height,
    label: candidate.piece.label,
    colorIndex: candidate.piece.colorIndex,
    rotated: candidate.rotated,
    canRotate: candidate.piece.canRotate,
    edges: candidate.edges,
    groupKey: candidate.piece.groupKey
  };

  board.pieces.push(placedPiece);
  board.usedArea = roundArea(board.usedArea + candidate.width * candidate.height);
  // Ambos vienen ya fusionados desde collectBoardCandidates: el sobrante contiguo se unifica
  // apenas se coloca la pieza. Sin eso el empaquetador ve el sobrante partido en trozos que por
  // separado no aceptan ninguna pieza, aunque el material sea una sola tabla.
  board.kerfArea = candidate.boardKerfAreaAfterPlacement;
  board.freeRects = candidate.boardFreeRectsAfterPlacement;
  board.placementHistory.push({
    targetRect: { ...candidate.rect },
    piece: placedPiece,
    direction: candidate.direction
  });
}

function lastBoardFlag(boardLimit: number, sealedBoards: BoardPlan[]) {
  return sealedBoards.length + 1 === boardLimit;
}

function fillBoardGreedy(
  board: BoardPlan,
  remaining: PieceBucket[],
  variant: number,
  boardLimit: number,
  sealedBoards: BoardPlan[],
  kerf: number,
  deadline: number,
  candidateOrder: CandidateOrder,
  enableLastBoardPreview = true
) {
  let nextBoard = cloneBoard(board);
  let nextRemaining = cloneBuckets(remaining);

  while (workClock() <= deadline) {
    const candidates = collectBoardCandidates(
      nextBoard,
      nextRemaining,
      variant,
      lastBoardFlag(boardLimit, sealedBoards),
      kerf,
      candidateOrder,
      enableLastBoardPreview
    );
    if (!candidates.length) break;
    applyCandidate(nextBoard, candidates[0]);
    nextRemaining = removePieceFromBuckets(nextRemaining, candidates[0].piece);
  }

  return { board: nextBoard, remaining: nextRemaining };
}

function layoutSignature(boards: BoardPlan[], unplaced: PieceInput[]) {
  const boardSignature = boards
    .map((board) => {
      const pieces = board.pieces
        .map((piece) =>
          [
            piece.id,
            piece.x,
            piece.y,
            piece.width,
            piece.height,
            Number(piece.rotated),
            piece.requestedWidth,
            piece.requestedHeight
          ].join(":")
        )
        .sort()
        .join("|");
      const freeRects = board.freeRects
        .map((rect) => [rect.x, rect.y, rect.width, rect.height].join(":"))
        .sort()
        .join("|");
      return `${pieces}###${freeRects}`;
    })
    .join("||");

  return `${boardSignature}@@@${unplaced.map((piece) => piece.id).sort().join("|")}`;
}

function tryMergeFreeRects(a: FreeRect, b: FreeRect, kerf: number) {
  if (sameNumber(a.x, b.x) && sameNumber(a.width, b.width)) {
    const [topRect, bottomRect] = a.y <= b.y ? [a, b] : [b, a];
    const gap = bottomRect.y - (topRect.y + topRect.height);
    if (gap >= -EPS_MM && gap <= kerf + EPS_MM) {
      return {
        rect: createRect(topRect.x, topRect.y, topRect.width, bottomRect.y + bottomRect.height - topRect.y),
        recoveredKerfArea: roundArea(Math.max(0, gap) * topRect.width)
      };
    }
  }

  if (sameNumber(a.y, b.y) && sameNumber(a.height, b.height)) {
    const [leftRect, rightRect] = a.x <= b.x ? [a, b] : [b, a];
    const gap = rightRect.x - (leftRect.x + leftRect.width);
    if (gap >= -EPS_MM && gap <= kerf + EPS_MM) {
      return {
        rect: createRect(leftRect.x, leftRect.y, rightRect.x + rightRect.width - leftRect.x, leftRect.height),
        recoveredKerfArea: roundArea(Math.max(0, gap) * leftRect.height)
      };
    }
  }

  return null;
}

function mergeAdjacentFreeRects(freeRects: FreeRect[], kerfArea: number, kerf: number): MergedFreeRectsResult {
  const nextFreeRects = sortRects(freeRects.map((rect) => ({ ...rect })));
  let recoveredKerfArea = 0;
  let merged = true;

  while (merged) {
    merged = false;
    // Un sobrante en forma de L admite mas de una particion en rectangulos. Entre todas las
    // fusiones posibles se elige la que deja el rectangulo mas grande, que es el que sirve para
    // reusar como remanente; tomar la primera que aparece parte el sobrante en trozos mas chicos.
    let best: { index: number; otherIndex: number; rect: FreeRect; recoveredKerfArea: number } | null = null;

    for (let index = 0; index < nextFreeRects.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < nextFreeRects.length; otherIndex += 1) {
        const merge = tryMergeFreeRects(nextFreeRects[index], nextFreeRects[otherIndex], kerf);
        if (!merge) continue;
        if (best && rectArea(merge.rect) <= rectArea(best.rect)) continue;

        best = { index, otherIndex, rect: merge.rect, recoveredKerfArea: merge.recoveredKerfArea };
      }
    }

    if (best) {
      nextFreeRects.splice(best.otherIndex, 1);
      nextFreeRects.splice(best.index, 1, best.rect);
      recoveredKerfArea = roundArea(recoveredKerfArea + best.recoveredKerfArea);
      merged = true;
    }
  }

  return {
    freeRects: sortRects(nextFreeRects),
    kerfArea: roundArea(Math.max(0, kerfArea - recoveredKerfArea))
  };
}

function finalizeBoardForReport(board: BoardPlan, kerf: number): BoardPlan {
  const reportedBoard = cloneBoard(board);
  const merged = mergeAdjacentFreeRects(reportedBoard.freeRects, reportedBoard.kerfArea, kerf);
  reportedBoard.freeRects = merged.freeRects;
  reportedBoard.kerfArea = merged.kerfArea;
  return reportedBoard;
}

function finalizeBoardsForReport(boards: BoardPlan[], kerf: number) {
  return boards.map((board) => finalizeBoardForReport(board, kerf));
}

function summarizeAttempt(boards: BoardPlan[], unplaced: PieceInput[], boardArea: number): OptimizationAttempt {
  const normalizedBoards = boards.filter((board) => board.usedArea > 0);
  const usedArea = roundArea(normalizedBoards.reduce((total, board) => total + board.usedArea, 0));
  const boardCount = normalizedBoards.length;
  const wastePercent = boardCount && boardArea ? Math.max(0, roundArea(100 - (usedArea / (boardCount * boardArea)) * 100)) : 0;
  const totalFreeRectCount = normalizedBoards.reduce((total, board) => total + board.freeRects.length, 0);
  const rotatedCount = normalizedBoards.reduce(
    (total, board) => total + board.pieces.reduce((boardTotal, piece) => boardTotal + Number(piece.rotated), 0),
    0
  );
  const lastBoard = normalizedBoards[normalizedBoards.length - 1];
  const largestFreeRect = lastBoard ? getLargestFreeRect(lastBoard) : null;
  const lastBoardLargestFreeRectArea = largestFreeRect ? rectArea(largestFreeRect) : 0;
  const lastBoardFreeRectCount = lastBoard?.freeRects.length || 0;

  return {
    boards: normalizedBoards,
    unplaced,
    boardCount,
    usedArea,
    wastePercent,
    totalFreeRectCount,
    rotatedCount,
    lastBoardLargestFreeRectArea,
    lastBoardFreeRectCount,
    signature: layoutSignature(normalizedBoards, unplaced)
  };
}

function compareAttempts(a: OptimizationAttempt, b: OptimizationAttempt) {
  if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length - b.unplaced.length;
  if (a.boardCount !== b.boardCount) return a.boardCount - b.boardCount;
  if (a.wastePercent !== b.wastePercent) return a.wastePercent - b.wastePercent;
  if (a.lastBoardLargestFreeRectArea !== b.lastBoardLargestFreeRectArea) {
    return b.lastBoardLargestFreeRectArea - a.lastBoardLargestFreeRectArea;
  }
  if (a.lastBoardFreeRectCount !== b.lastBoardFreeRectCount) return a.lastBoardFreeRectCount - b.lastBoardFreeRectCount;
  if (a.totalFreeRectCount !== b.totalFreeRectCount) return a.totalFreeRectCount - b.totalFreeRectCount;
  if (a.rotatedCount !== b.rotatedCount) return a.rotatedCount - b.rotatedCount;
  return compareText(a.signature, b.signature);
}

function dedupeAttempts(attempts: OptimizationAttempt[]) {
  const unique = new Map<string, OptimizationAttempt>();

  attempts.forEach((attempt) => {
    const current = unique.get(attempt.signature);
    if (!current || compareAttempts(attempt, current) < 0) unique.set(attempt.signature, attempt);
  });

  return [...unique.values()].sort(compareAttempts);
}

function createValidatedAttempt(
  attempt: { boards: BoardPlan[]; unplaced: PieceInput[] },
  impossiblePieces: PieceInput[],
  boardArea: number,
  kerf: number
) {
  const combinedAttempt = {
    boards: attempt.boards.filter((board) => board.usedArea > 0),
    unplaced: [...impossiblePieces, ...attempt.unplaced]
  };
  const validation = validateAttempt(combinedAttempt, kerf);
  return {
    validation,
    attempt: summarizeAttempt(combinedAttempt.boards, combinedAttempt.unplaced, boardArea)
  };
}

function buildFloorCandidate(label: string, floor: FirstFitSolveResult, boardArea: number, kerf: number): FloorCandidate {
  return {
    label,
    floor,
    ...createValidatedAttempt(floor, [], boardArea, kerf)
  };
}

function compareValidatedAttempts(
  a: { validation: { valid: boolean }; attempt: OptimizationAttempt },
  b: { validation: { valid: boolean }; attempt: OptimizationAttempt }
) {
  if (a.validation.valid !== b.validation.valid) return a.validation.valid ? -1 : 1;
  if (a.attempt.boardCount !== b.attempt.boardCount) return a.attempt.boardCount - b.attempt.boardCount;
  return compareAttempts(a.attempt, b.attempt);
}

function stateSignature(remaining: PieceBucket[], currentBoard: BoardPlan, boardsLeft: number) {
  const counts = remaining
    .map((bucket) => `${bucket.key}:${bucket.pieces.length}`)
    .sort()
    .join("|");
  const freeRects = currentBoard.freeRects
    .map((rect) => [roundMm(rect.x), roundMm(rect.y), roundMm(rect.width), roundMm(rect.height)].join(":"))
    .sort()
    .join("|");
  return `${boardsLeft}###${counts}###${freeRects}`;
}

function solveGreedy(
  pieces: NormalizedPieceInput[],
  boardLimit: number,
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  minimumPieceArea: number,
  variant: number,
  kerf: number,
  deadline: number,
  candidateOrder: CandidateOrder
) {
  let remaining = buildBuckets(pieces);
  const boards: BoardPlan[] = [];

  for (let index = 0; index < boardLimit && remaining.length && workClock() <= deadline; index += 1) {
    const baseBoard = createBoard(index + 1, usableBoardWidthMm, usableBoardHeightMm, minimumPieceArea);
    const { board, remaining: nextRemaining } = fillBoardGreedy(
      baseBoard,
      remaining,
      variant,
      boardLimit,
      boards,
      kerf,
      deadline,
      candidateOrder
    );
    if (!board.pieces.length) break;
    boards.push(board);
    remaining = nextRemaining;
  }

  return {
    boards: finalizeBoardsForReport(boards, kerf),
    unplaced: remaining.flatMap((bucket) => bucket.pieces)
  };
}

function solveFirstFitCompleteForOrder(
  pieces: PieceInput[],
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  kerf: number,
  variant: number,
  candidateOrder: CandidateOrder
): FirstFitSolveResult {
  const resolvedVariant = resolveVariantSeed(variant);
  const normalizedPieces = pieces.map(normalizePiece);
  const minimumPieceArea = normalizedPieces.reduce((minimum, piece) => Math.min(minimum, piece.area), Number.POSITIVE_INFINITY);
  const fitPieces = normalizedPieces.filter((piece) => pieceCanFitBoard(piece, usableBoardWidthMm, usableBoardHeightMm));
  const impossiblePieces = normalizedPieces.filter((piece) => !pieceCanFitBoard(piece, usableBoardWidthMm, usableBoardHeightMm));
  const boardArea = usableBoardWidthMm * usableBoardHeightMm;

  if (!fitPieces.length) {
    return {
      boards: [] as BoardPlan[],
      unplaced: impossiblePieces as PieceInput[],
      candidateOrder,
      variant
    };
  }

  const initialFloor = solveGreedy(
    fitPieces,
    fitPieces.length,
    usableBoardWidthMm,
    usableBoardHeightMm,
    Number.isFinite(minimumPieceArea) ? minimumPieceArea : 0,
    resolvedVariant,
    kerf,
    Number.POSITIVE_INFINITY,
    candidateOrder
  );
  const initialBoardCount = initialFloor.boards.filter((board) => board.usedArea > 0).length;
  let solved = initialFloor;

  if (initialBoardCount > 0 && initialBoardCount < fitPieces.length) {
    const consolidatedFloor = solveGreedy(
      fitPieces,
      initialBoardCount,
      usableBoardWidthMm,
      usableBoardHeightMm,
      Number.isFinite(minimumPieceArea) ? minimumPieceArea : 0,
      resolvedVariant,
      kerf,
      Number.POSITIVE_INFINITY,
      candidateOrder
    );

    if (!consolidatedFloor.unplaced.length) {
      const initialAttempt = summarizeAttempt(
        initialFloor.boards,
        [...impossiblePieces, ...initialFloor.unplaced] as PieceInput[],
        boardArea
      );
      const consolidatedAttempt = summarizeAttempt(
        consolidatedFloor.boards,
        [...impossiblePieces, ...consolidatedFloor.unplaced] as PieceInput[],
        boardArea
      );

      if (compareAttempts(consolidatedAttempt, initialAttempt) <= 0) {
        solved = consolidatedFloor;
      }
    }
  }

  return {
    boards: solved.boards.filter((board) => board.usedArea > 0),
    unplaced: [...impossiblePieces, ...solved.unplaced] as PieceInput[],
    candidateOrder,
    variant
  };
}

function selectBestFirstFitResult(results: FirstFitSolveResult[], boardArea: number, kerf: number) {
  return [...results]
    .map((result) => ({
      result,
      ...createValidatedAttempt(result, [], boardArea, kerf)
    }))
    .sort((a, b) => compareValidatedAttempts(a, b))[0];
}

export function solveFirstFitComplete(
  pieces: PieceInput[],
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  kerf: number,
  variant = 0,
  candidateOrder?: CandidateOrder,
  deadline = Number.POSITIVE_INFINITY
) {
  const boardArea = usableBoardWidthMm * usableBoardHeightMm;
  const orders = candidateOrder ? [candidateOrder] : [...CANDIDATE_ORDERS];
  const results: FirstFitSolveResult[] = [];

  orders.forEach((order, index) => {
    // Los modos historicos se calculan siempre. Los adicionales solo si queda presupuesto: en
    // pedidos con muchas medidas distintas cada pasada cuesta cientos de ms y no conviene pagarla.
    if (index >= REQUIRED_CANDIDATE_ORDERS && workClock() > deadline) return;

    results.push(solveFirstFitCompleteForOrder(pieces, usableBoardWidthMm, usableBoardHeightMm, kerf, variant, order));
  });

  return selectBestFirstFitResult(results, boardArea, kerf).result;
}

function compareBeamStates(a: BeamState, b: BeamState) {
  const placedCountA = a.sealedBoards.reduce((total, board) => total + board.pieces.length, 0) + a.currentBoard.pieces.length;
  const placedCountB = b.sealedBoards.reduce((total, board) => total + board.pieces.length, 0) + b.currentBoard.pieces.length;
  if (placedCountA !== placedCountB) return placedCountB - placedCountA;

  const boardsUsedA = a.sealedBoards.length + Number(a.currentBoard.pieces.length > 0);
  const boardsUsedB = b.sealedBoards.length + Number(b.currentBoard.pieces.length > 0);
  if (boardsUsedA !== boardsUsedB) return boardsUsedA - boardsUsedB;

  const largestFreeRectA = rectArea(getLargestFreeRect(a.currentBoard) || createRect(0, 0, 0, 0));
  const largestFreeRectB = rectArea(getLargestFreeRect(b.currentBoard) || createRect(0, 0, 0, 0));
  if (largestFreeRectA !== largestFreeRectB) return largestFreeRectB - largestFreeRectA;

  if (a.currentBoard.freeRects.length !== b.currentBoard.freeRects.length) {
    return a.currentBoard.freeRects.length - b.currentBoard.freeRects.length;
  }

  return compareText(stateSignature(a.remaining, a.currentBoard, 0), stateSignature(b.remaining, b.currentBoard, 0));
}

function finalizeState(state: BeamState) {
  return [...state.sealedBoards, ...(state.currentBoard.pieces.length ? [state.currentBoard] : [])];
}

function solveBeam(
  pieces: NormalizedPieceInput[],
  boardLimit: number,
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  minimumPieceArea: number,
  variant: number,
  kerf: number,
  deadline: number,
  candidateOrder: CandidateOrder
) {
  let frontier: BeamState[] = [
    {
      sealedBoards: [],
      currentBoard: createBoard(1, usableBoardWidthMm, usableBoardHeightMm, minimumPieceArea),
      remaining: buildBuckets(pieces)
    }
  ];
  const successes: Array<{ boards: BoardPlan[]; unplaced: PieceInput[] }> = [];

  while (frontier.length && workClock() <= deadline) {
    const nextFrontier: BeamState[] = [];

    for (const state of frontier) {
      if (!state.remaining.length) {
        successes.push({ boards: finalizeBoardsForReport(finalizeState(state), kerf), unplaced: [] });
        continue;
      }

      const candidates = collectBoardCandidates(
        state.currentBoard,
        state.remaining,
        variant,
        lastBoardFlag(boardLimit, state.sealedBoards),
        kerf,
        candidateOrder
      );
      if (!candidates.length) {
        if (!state.currentBoard.pieces.length || state.sealedBoards.length + 1 >= boardLimit) continue;
        nextFrontier.push({
          sealedBoards: [...state.sealedBoards, cloneBoard(state.currentBoard)],
          currentBoard: createBoard(state.sealedBoards.length + 2, usableBoardWidthMm, usableBoardHeightMm, minimumPieceArea),
          remaining: cloneBuckets(state.remaining)
        });
        continue;
      }

      candidates.slice(0, BEAM_BRANCHES).forEach((candidate) => {
        const nextBoard = cloneBoard(state.currentBoard);
        applyCandidate(nextBoard, candidate);
        nextFrontier.push({
          sealedBoards: state.sealedBoards.map(cloneBoard),
          currentBoard: nextBoard,
          remaining: removePieceFromBuckets(state.remaining, candidate.piece)
        });
      });
    }

    if (successes.length) break;

    const uniqueStates = new Map<string, BeamState>();
    nextFrontier.forEach((state) => {
      const signature = `${state.sealedBoards.length}###${stateSignature(state.remaining, state.currentBoard, boardLimit - state.sealedBoards.length)}`;
      const current = uniqueStates.get(signature);
      if (!current || compareBeamStates(state, current) < 0) uniqueStates.set(signature, state);
    });

    frontier = [...uniqueStates.values()].sort(compareBeamStates).slice(0, BEAM_WIDTH);
  }

  if (successes.length) return successes;

  const bestState = frontier.sort(compareBeamStates)[0];
  if (!bestState) return [];

  return [{ boards: finalizeBoardsForReport(finalizeState(bestState), kerf), unplaced: bestState.remaining.flatMap((bucket) => bucket.pieces) }];
}

function solveSearch(
  pieces: NormalizedPieceInput[],
  boardLimit: number,
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  minimumPieceArea: number,
  variant: number,
  kerf: number,
  deadline: number,
  candidateOrder: CandidateOrder
) {
  const failedStates = new Set<string>();

  const visit = (sealedBoards: BoardPlan[], currentBoard: BoardPlan, remaining: PieceBucket[]): BoardPlan[] | null => {
    if (!remaining.length) return [...sealedBoards, ...(currentBoard.pieces.length ? [currentBoard] : [])];
    if (workClock() > deadline) return null;

    const boardsLeft = boardLimit - sealedBoards.length;
    const key = stateSignature(remaining, currentBoard, boardsLeft);
    if (failedStates.has(key)) return null;

    const candidates = collectBoardCandidates(
      currentBoard,
      remaining,
      variant,
      lastBoardFlag(boardLimit, sealedBoards),
      kerf,
      candidateOrder
    );

    if (!candidates.length) {
      if (!currentBoard.pieces.length || sealedBoards.length + 1 >= boardLimit) {
        failedStates.add(key);
        return null;
      }

      const nextBoard = createBoard(sealedBoards.length + 2, usableBoardWidthMm, usableBoardHeightMm, minimumPieceArea);
      const solved = visit([...sealedBoards, currentBoard], nextBoard, remaining);
      if (solved) return solved;
      failedStates.add(key);
      return null;
    }

    for (const candidate of candidates.slice(0, SEARCH_BRANCH_LIMIT)) {
      const nextBoard = cloneBoard(currentBoard);
      applyCandidate(nextBoard, candidate);
      const solved = visit(sealedBoards, nextBoard, removePieceFromBuckets(remaining, candidate.piece));
      if (solved) return solved;
    }

    failedStates.add(key);
    return null;
  };

  const solvedBoards = visit([], createBoard(1, usableBoardWidthMm, usableBoardHeightMm, minimumPieceArea), buildBuckets(pieces));
  return solvedBoards ? [{ boards: finalizeBoardsForReport(solvedBoards, kerf), unplaced: [] as PieceInput[] }] : [];
}

function pairCanShareBoard(a: NormalizedPieceInput, b: NormalizedPieceInput, usableBoardWidthMm: number, usableBoardHeightMm: number, kerf: number) {
  return buildOrientations(a).some((orientationA) =>
    buildOrientations(b).some((orientationB) => {
      const shareHorizontally =
        lessOrEqual(orientationA.width + kerf + orientationB.width, usableBoardWidthMm) &&
        lessOrEqual(Math.max(orientationA.height, orientationB.height), usableBoardHeightMm);
      const shareVertically =
        lessOrEqual(orientationA.height + kerf + orientationB.height, usableBoardHeightMm) &&
        lessOrEqual(Math.max(orientationA.width, orientationB.width), usableBoardWidthMm);

      return shareHorizontally || shareVertically;
    })
  );
}

export function calculateLowerBound(
  pieces: PieceInput[],
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  kerf: number
) {
  if (!pieces.length) return 0;

  const normalizedPieces = pieces.map(normalizePiece);
  const boardArea = usableBoardWidthMm * usableBoardHeightMm;
  const totalArea = normalizedPieces.reduce((total, piece) => total + piece.area, 0);
  const areaBound = boardArea ? Math.max(1, Math.ceil(totalArea / boardArea)) : normalizedPieces.length;
  const dimensionalBound = normalizedPieces.filter((piece, index) => {
    return !normalizedPieces.some((otherPiece, otherIndex) => {
      if (index === otherIndex) return false;
      return pairCanShareBoard(piece, otherPiece, usableBoardWidthMm, usableBoardHeightMm, kerf);
    });
  }).length;

  return Math.max(areaBound, dimensionalBound || 1);
}

export function getLargestFreeRect(board: BoardPlan) {
  return sortRects(board.freeRects).sort((a, b) => rectArea(b) - rectArea(a) || a.y - b.y || a.x - b.x)[0] || null;
}

export function calculateBoardUtilization(board: BoardPlan) {
  const area = board.usableWidthMm * board.usableHeightMm;
  return area ? roundArea((board.usedArea / area) * 100) : 0;
}

export function canPlacePieceInBoard(
  board: Pick<BoardPlan, "freeRects">,
  piece: Pick<PieceInput, "width" | "height" | "canRotate" | "edges">
) {
  return fitsAnyRect(piece, board.freeRects);
}

function replayBoard(board: BoardPlan, kerf: number): ReplayResult {
  let freeRects = [createRect(0, 0, board.usableWidthMm, board.usableHeightMm)];
  const pieces: PlacedPiece[] = [];
  let kerfArea = 0;
  const errors: string[] = [];

  board.placementHistory.forEach((record) => {
    const targetRect = freeRects.find((freeRect) => sameRect(freeRect, record.targetRect));
    if (!targetRect) {
      errors.push(`No se encontró el rectángulo libre objetivo para la pieza ${record.piece.id}.`);
      return;
    }

    if (!sameNumber(record.piece.x, targetRect.x) || !sameNumber(record.piece.y, targetRect.y)) {
      errors.push(`La pieza ${record.piece.id} no quedó anclada al origen del rectángulo libre.`);
      return;
    }

    const split = splitGuillotineRect(targetRect, record.piece.width, record.piece.height, record.direction, kerf);
    // Misma fusion que en applyCandidate y en el mismo punto: asi el replay reproduce exactamente
    // el estado que vio el empaquetador y los rectangulos objetivo se siguen encontrando.
    const mergedAfterSplit = mergeAdjacentFreeRects(
      [...freeRects.filter((freeRect) => !sameRect(freeRect, targetRect)), ...split.freeRects],
      roundArea(kerfArea + split.kerfArea),
      kerf
    );

    freeRects = mergedAfterSplit.freeRects;
    kerfArea = mergedAfterSplit.kerfArea;
    pieces.push(record.piece);
  });

  return {
    pieces,
    freeRects,
    kerfArea,
    errors
  };
}

type CuttableRect = Pick<FreeRect, "x" | "y" | "width" | "height">;

// Parte las piezas por una linea pasante. Devuelve null si alguna pieza la cruza (el corte no
// seria de borde a borde) o si deja un lado vacio (no separa nada).
function splitPiecesByCut<T extends CuttableRect>(pieces: T[], cut: number, axis: "x" | "y") {
  const size = axis === "x" ? "width" : "height";
  const before: T[] = [];
  const after: T[] = [];

  for (const piece of pieces) {
    if (lessOrEqual(piece[axis] + piece[size], cut)) before.push(piece);
    else if (!greaterThan(cut, piece[axis])) after.push(piece);
    else return null;
  }

  return before.length && after.length ? { before, after } : null;
}

// Una seccionadora solo hace cortes pasantes: cada corte atraviesa el material de lado a lado.
// Esto verifica que exista una secuencia de cortes asi que libere todas las piezas. Reemplaza a la
// reconstruccion del arbol de cortes, que solo sabia deshacer particiones y por eso rechazaba
// cualquier plano armado sobre rectangulos libres fusionados.
function isGuillotineCuttable<T extends CuttableRect>(pieces: T[], failed = new Set<string>()): boolean {
  if (pieces.length <= 1) return true;

  const signature = pieces
    .map((piece) => [piece.x, piece.y, piece.width, piece.height].join(":"))
    .sort()
    .join("|");
  if (failed.has(signature)) return false;

  for (const axis of ["x", "y"] as const) {
    const size = axis === "x" ? "width" : "height";
    const cuts = [...new Set(pieces.map((piece) => piece[axis] + piece[size]))];

    for (const cut of cuts) {
      const parts = splitPiecesByCut(pieces, cut, axis);
      if (parts && isGuillotineCuttable(parts.before, failed) && isGuillotineCuttable(parts.after, failed)) return true;
    }
  }

  failed.add(signature);
  return false;
}

function rectanglesOverlap(a: FreeRect, b: FreeRect) {
  const overlapWidth = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const overlapHeight = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return greaterThan(overlapWidth, 0) && greaterThan(overlapHeight, 0);
}

export function validateBoardPlan(board: BoardPlan, usableWidthMm: number, usableHeightMm: number, kerf: number) {
  const errors: string[] = [];

  if (!board.pieces.length) {
    errors.push(`La placa ${board.index} quedó vacía.`);
  }

  board.pieces.forEach((piece) => {
    if (piece.rotated && !piece.canRotate) {
      errors.push(`La pieza ${piece.id} quedó rotada sin permiso.`);
    }
    if (piece.x < -EPS_MM || piece.y < -EPS_MM) {
      errors.push(`La pieza ${piece.id} quedó fuera del origen de la placa.`);
    }
    if (piece.x + piece.width > usableWidthMm + EPS_MM || piece.y + piece.height > usableHeightMm + EPS_MM) {
      errors.push(`La pieza ${piece.id} se salió del área útil.`);
    }
  });

  board.pieces.forEach((piece, pieceIndex) => {
    board.pieces.slice(pieceIndex + 1).forEach((otherPiece) => {
      if (rectanglesOverlap(piece, otherPiece)) {
        errors.push(`Las piezas ${piece.id} y ${otherPiece.id} se solapan.`);
      }
    });
  });

  board.freeRects.forEach((freeRect, rectIndex) => {
    if (freeRect.x < -EPS_MM || freeRect.y < -EPS_MM) {
      errors.push(`Un rectángulo libre quedó fuera del origen de la placa ${board.index}.`);
    }
    if (freeRect.x + freeRect.width > usableWidthMm + EPS_MM || freeRect.y + freeRect.height > usableHeightMm + EPS_MM) {
      errors.push(`Un rectángulo libre se salió del área útil de la placa ${board.index}.`);
    }

    board.freeRects.slice(rectIndex + 1).forEach((otherRect) => {
      if (rectanglesOverlap(freeRect, otherRect)) {
        errors.push(`Los rectángulos libres de la placa ${board.index} se solapan.`);
      }
    });

    board.pieces.forEach((piece) => {
      if (rectanglesOverlap(freeRect, piece)) {
        errors.push(`Un rectángulo libre se solapa con la pieza ${piece.id}.`);
      }
    });
  });

  const replay = replayBoard(board, kerf);
  errors.push(...replay.errors);

  const boardFreeRectSignature = sortRects(board.freeRects)
    .map((rect) => [rect.x, rect.y, rect.width, rect.height].join(":"))
    .join("|");
  const replayFreeRectSignature = sortRects(replay.freeRects)
    .map((rect) => [rect.x, rect.y, rect.width, rect.height].join(":"))
    .join("|");

  if (boardFreeRectSignature !== replayFreeRectSignature) {
    errors.push(`La placa ${board.index} no conserva los rectángulos libres al reconstruir las colocaciones.`);
  }

  if (!sameArea(replay.kerfArea, board.kerfArea)) {
    errors.push(`La placa ${board.index} no conserva el área consumida por kerf.`);
  }

  if (!isGuillotineCuttable(board.pieces)) {
    errors.push(`La placa ${board.index} no se puede resolver con cortes pasantes de borde a borde.`);
  }

  const pieceArea = board.pieces.reduce((total, piece) => total + piece.width * piece.height, 0);
  const freeArea = board.freeRects.reduce((total, freeRect) => total + rectArea(freeRect), 0);
  const boardArea = usableWidthMm * usableHeightMm;

  if (!sameArea(pieceArea + freeArea + board.kerfArea, boardArea)) {
    errors.push(`La placa ${board.index} no conserva el balance de áreas.`);
  }

  return errors;
}

function pieceCanFitBoard(piece: NormalizedPieceInput, usableBoardWidthMm: number, usableBoardHeightMm: number) {
  return buildOrientations(piece).some(
    (orientation) => lessOrEqual(orientation.width, usableBoardWidthMm) && lessOrEqual(orientation.height, usableBoardHeightMm)
  );
}

function validateAttempt(attempt: { boards: BoardPlan[]; unplaced: PieceInput[] }, kerf: number) {
  const errors = attempt.boards.flatMap((board) => validateBoardPlan(board, board.usableWidthMm, board.usableHeightMm, kerf));
  return { valid: errors.length === 0, errors };
}

function logValidationErrors(context: string, errors: string[]) {
  if (!errors.length) return;

  // En Node (backend) import.meta.env no existe: ahi se loguea siempre.
  const shouldLog = !(import.meta as { env?: { PROD?: boolean } }).env?.PROD;
  if (shouldLog) {
    console.warn(`[cutOptimizer] ${context}`, errors);
  }
}

function calculateStageDeadline(overallDeadline: number, remainingStages: number) {
  const remainingMs = Math.max(0, overallDeadline - workClock());
  if (remainingStages <= 1) return workClock() + remainingMs;

  return workClock() + Math.max(1, Math.floor(remainingMs / remainingStages));
}

function runStrategies(
  pieces: NormalizedPieceInput[],
  boardLimit: number,
  usableBoardWidthMm: number,
  usableBoardHeightMm: number,
  minimumPieceArea: number,
  variant: number,
  kerf: number,
  deadline: number,
  candidateOrder: CandidateOrder
) {
  const attempts: Array<{ boards: BoardPlan[]; unplaced: PieceInput[] }> = [];

  for (let attemptVariant = 0; attemptVariant < GREEDY_VARIANTS && workClock() <= deadline; attemptVariant += 1) {
    const attempt = solveGreedy(
      pieces,
      boardLimit,
      usableBoardWidthMm,
      usableBoardHeightMm,
      minimumPieceArea,
      variant + attemptVariant,
      kerf,
      deadline,
      candidateOrder
    );
    if (!attempt.unplaced.length) attempts.push(attempt);
  }

  for (let attemptVariant = 0; attemptVariant < BEAM_VARIANTS && workClock() <= deadline; attemptVariant += 1) {
    const beamAttempts = solveBeam(
      pieces,
      boardLimit,
      usableBoardWidthMm,
      usableBoardHeightMm,
      minimumPieceArea,
      variant + attemptVariant,
      kerf,
      deadline,
      candidateOrder
    );
    beamAttempts.forEach((attempt) => {
      if (!attempt.unplaced.length) attempts.push(attempt);
    });
  }

  if (pieces.length <= MAX_SEARCH_PIECES) {
    for (let attemptVariant = 0; attemptVariant < SEARCH_VARIANTS && workClock() <= deadline; attemptVariant += 1) {
      const searchAttempts = solveSearch(
        pieces,
        boardLimit,
        usableBoardWidthMm,
        usableBoardHeightMm,
        minimumPieceArea,
        variant + attemptVariant,
        kerf,
        deadline,
        candidateOrder
      );
      searchAttempts.forEach((attempt) => {
        if (!attempt.unplaced.length) attempts.push(attempt);
      });
    }
  }

  return attempts;
}

// El backend calcula las placas del presupuesto siempre con la variante 0. "Recalcular
// distribucion" pide otras variantes solo para ver otro acomodo: si una variante llega a otra
// cantidad de placas se devuelve la variante 0, asi el plano nunca contradice a la constancia.
export function optimizeCutLayout(params: OptimizeCutLayoutParams): OptimizeCutLayoutResult {
  if (params.variant === 0) return optimizeCutLayoutForVariant(params);

  const base = optimizeCutLayoutForVariant({ ...params, variant: 0 });
  const alternative = optimizeCutLayoutForVariant(params);
  const sameOutcome =
    alternative.unplaced.length === base.unplaced.length && countUsedBoards(alternative.boards) === countUsedBoards(base.boards);
  return sameOutcome ? alternative : base;
}

export function countUsedBoards(boards: BoardPlan[]) {
  return boards.filter((board) => board.usedArea > 0).length;
}

export type OptimizerRow = {
  ancho: number | string;
  largo: number | string;
  cantidad: number | string;
  permiteRotar?: boolean | null;
  nombreProducto?: string | null;
  remark?: string | null;
  cantoLargo1Id?: string | null;
  cantoLargo2Id?: string | null;
  cantoAncho1Id?: string | null;
  cantoAncho2Id?: string | null;
  cantoLargo1Nombre?: string | null;
  cantoLargo2Nombre?: string | null;
  cantoAncho1Nombre?: string | null;
  cantoAncho2Nombre?: string | null;
  cantoLargo1?: boolean | null;
  cantoLargo2?: boolean | null;
  cantoAncho1?: boolean | null;
  cantoAncho2?: boolean | null;
};

function rowEdges(row: OptimizerRow): PieceEdges {
  return {
    top: row.cantoAncho1Nombre || (row.cantoAncho1 ? "Canto" : null),
    right: row.cantoLargo2Nombre || (row.cantoLargo2 ? "Canto" : null),
    bottom: row.cantoAncho2Nombre || (row.cantoAncho2 ? "Canto" : null),
    left: row.cantoLargo1Nombre || (row.cantoLargo1 ? "Canto" : null)
  };
}

// Arma las piezas de un material. Es la unica forma en que frontend y backend construyen la entrada
// del optimizador, para que ambos le pasen exactamente lo mismo. El grupo se arma con los ids de
// canto y no con los nombres: el formulario y la base pueden nombrar distinto al mismo canto.
export function buildPiecesFromRows(rows: OptimizerRow[], idPrefix: string): PieceInput[] {
  return rows.flatMap((row, rowIndex) =>
    Array.from({ length: Number(row.cantidad) || 0 }, (_, copyIndex) => {
      const width = Number(row.ancho);
      const height = Number(row.largo);
      const canRotate = Boolean(row.permiteRotar);
      const edges = rowEdges(row);
      const edgeIds = {
        top: row.cantoAncho1Id || (row.cantoAncho1 ? "canto" : null),
        right: row.cantoLargo2Id || (row.cantoLargo2 ? "canto" : null),
        bottom: row.cantoAncho2Id || (row.cantoAncho2 ? "canto" : null),
        left: row.cantoLargo1Id || (row.cantoLargo1 ? "canto" : null)
      };
      return {
        id: `${idPrefix}-${rowIndex}-${copyIndex}`,
        width,
        height,
        label: row.nombreProducto || row.remark || `Pieza ${rowIndex + 1}.${copyIndex + 1}`,
        colorIndex: rowIndex,
        canRotate,
        edges,
        area: width * height,
        groupKey: createPieceGroupKey({ width, height, canRotate, edges: edgeIds })
      };
    })
  );
}

function optimizeCutLayoutForVariant({
  pieces,
  usableBoardWidthMm,
  usableBoardHeightMm,
  settings,
  variant,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  candidateOrder
}: OptimizeCutLayoutParams): OptimizeCutLayoutResult {
  const overallDeadline = workClock() + timeBudgetMs * WORK_UNITS_PER_MS;
  const normalizedPieces = pieces.map(normalizePiece);
  const minimumPieceArea = normalizedPieces.reduce((minimum, piece) => Math.min(minimum, piece.area), Number.POSITIVE_INFINITY);
  const fitPieces = normalizedPieces.filter((piece) => pieceCanFitBoard(piece, usableBoardWidthMm, usableBoardHeightMm));
  const impossiblePieces = normalizedPieces.filter((piece) => !pieceCanFitBoard(piece, usableBoardWidthMm, usableBoardHeightMm));
  const kerf = settings.espesorSierraMm;
  const boardArea = usableBoardWidthMm * usableBoardHeightMm;
  const lowerBound = calculateLowerBound(fitPieces, usableBoardWidthMm, usableBoardHeightMm, kerf);
  const resolvedMinimumPieceArea = Number.isFinite(minimumPieceArea) ? minimumPieceArea : 0;
  const buildSeedFloor = (seedIndex: number) =>
    buildFloorCandidate(
      seedIndex === 0 ? "baseline" : `variant-${seedIndex}`,
      solveFirstFitComplete(pieces, usableBoardWidthMm, usableBoardHeightMm, kerf, seedIndex, candidateOrder, overallDeadline),
      boardArea,
      kerf
    );

  const baselineFloor = buildSeedFloor(0);
  let improvementRan = false;

  if (!baselineFloor.validation.valid) {
    logValidationErrors(`Piso first-fit invalido (${baselineFloor.label})`, baselineFloor.validation.errors);
  }

  const baselineBoardCount = baselineFloor.attempt.boardCount;
  const baselinePlacedAllPossiblePieces = baselineFloor.attempt.unplaced.length === impossiblePieces.length;

  // La etapa de mejora solo puede bajar de placas cuando el piso quedo a una placa de la cota
  // inferior. Si no es el caso, no hay nada que proteger y toda la exploracion de semillas usa
  // tiempo que de otro modo quedaria sin gastar.
  const boardCountCanDrop =
    baselinePlacedAllPossiblePieces && baselineBoardCount > 0 && baselineBoardCount - lowerBound === 1;
  const floorExplorationDeadline = boardCountCanDrop
    ? workClock() + Math.max(0, overallDeadline - workClock()) * FLOOR_EXPLORATION_SHARE
    : overallDeadline;

  // Se prueban las demas semillas y se rankean junto al piso base. Como el piso base nunca sale
  // de la lista y el ranking ordena por cantidad de placas, el conteo no puede subir.
  const requestedSeedIndex =
    ((variant % PRIMARY_VARIANT_SEEDS.length) + PRIMARY_VARIANT_SEEDS.length) % PRIMARY_VARIANT_SEEDS.length;
  // La semilla pedida va primero y se calcula si o si: en pedidos con muchas medidas distintas un
  // solo piso ya supera el presupuesto, y sin esto "Recalcular distribucion" no tendria alternativa.
  const seedIndexesToExplore = [
    ...(requestedSeedIndex > 0 ? [requestedSeedIndex] : []),
    ...PRIMARY_VARIANT_SEEDS.map((_, seedIndex) => seedIndex).filter(
      (seedIndex) => seedIndex > 0 && seedIndex !== requestedSeedIndex
    )
  ];
  const floorCandidates = [baselineFloor];

  for (const seedIndex of seedIndexesToExplore) {
    if (seedIndex !== requestedSeedIndex && workClock() >= floorExplorationDeadline) break;

    const seedFloor = buildSeedFloor(seedIndex);

    if (!seedFloor.validation.valid) {
      logValidationErrors(`Piso first-fit invalido (${seedFloor.label})`, seedFloor.validation.errors);
      continue;
    }
    if (seedFloor.attempt.unplaced.length > baselineFloor.attempt.unplaced.length) continue;

    floorCandidates.push(seedFloor);
  }

  const rankedFloors = [...floorCandidates].sort(compareValidatedAttempts);
  const bestFloor = rankedFloors[0];
  const interchangeableFloors: FloorCandidate[] = [];
  const seenFloorSignatures = new Set<string>();

  // Solo se rota entre pisos empatados en validez, piezas sin ubicar y cantidad de placas:
  // "Recalcular distribucion" cambia el acomodo, nunca el costo en placas.
  rankedFloors.forEach((candidate) => {
    if (candidate.validation.valid !== bestFloor.validation.valid) return;
    if (candidate.attempt.unplaced.length !== bestFloor.attempt.unplaced.length) return;
    if (candidate.attempt.boardCount !== bestFloor.attempt.boardCount) return;
    if (seenFloorSignatures.has(candidate.attempt.signature)) return;

    seenFloorSignatures.add(candidate.attempt.signature);
    interchangeableFloors.push(candidate);
  });

  // La variante 0 se queda con el mejor piso del ranking. Cada recalculo posterior busca el piso
  // de su propia semilla y, si esa semilla no empato en cantidad de placas, rota por el ranking.
  const selectedFloor =
    (requestedSeedIndex > 0 && interchangeableFloors.find((candidate) => candidate.floor.variant === requestedSeedIndex)) ||
    interchangeableFloors[requestedSeedIndex % interchangeableFloors.length];
  const floorBoardCount = selectedFloor.attempt.boardCount;
  const floorUnplaced = selectedFloor.attempt.unplaced;
  const floorGap = Math.max(0, floorBoardCount - lowerBound);
  // El orden ganador se toma del piso base para no alterar la busqueda que ya hacia esta etapa;
  // la semilla de diversificacion es la que pidio el usuario.
  const improvementOrder = baselineFloor.floor.candidateOrder || candidateOrder || "fit-first";
  const variantBase = resolveVariantSeed(variant);
  const candidateAttempts: OptimizationAttempt[] = [];

  if (floorUnplaced.length === impossiblePieces.length && floorBoardCount > 0 && floorGap <= 1) {
    for (
      let boardLimit = Math.max(1, lowerBound);
      boardLimit < floorBoardCount && workClock() < overallDeadline;
      boardLimit += 1
    ) {
      improvementRan = true;
      const remainingStages = floorBoardCount - boardLimit;
      const stageDeadline = calculateStageDeadline(overallDeadline, remainingStages);
      const attempts = runStrategies(
        fitPieces,
        boardLimit,
        usableBoardWidthMm,
        usableBoardHeightMm,
        resolvedMinimumPieceArea,
        variantBase,
        kerf,
        stageDeadline,
        improvementOrder
      );

      const validAttempts = attempts
        .map((attempt) => createValidatedAttempt(attempt, impossiblePieces, boardArea, kerf))
        .filter(({ validation }) => validation.valid)
        .map(({ attempt }) => attempt);

      if (!validAttempts.length) continue;

      const minimalAttempts = dedupeAttempts(validAttempts);
      const minimalBoardCount = minimalAttempts[0].boardCount;
      const bestAttempts = minimalAttempts.filter((attempt) => attempt.boardCount === minimalBoardCount);
      const selectedAttemptIndex = ((variantBase % bestAttempts.length) + bestAttempts.length) % bestAttempts.length;

      return {
        boards: bestAttempts[selectedAttemptIndex].boards,
        unplaced: impossiblePieces,
        attempts: bestAttempts,
        lowerBound,
        minimumPieceArea: resolvedMinimumPieceArea,
        floorBoardCount,
        improvementRan,
        improvementGained: floorBoardCount - bestAttempts[selectedAttemptIndex].boardCount
      };
    }
  }

  if (selectedFloor.validation.valid) {
    candidateAttempts.push(selectedFloor.attempt);
  }

  return {
    boards: selectedFloor.attempt.boards,
    unplaced: floorUnplaced,
    attempts: candidateAttempts,
    lowerBound,
    minimumPieceArea: resolvedMinimumPieceArea,
    floorBoardCount,
    improvementRan,
    improvementGained: 0
  };
}
