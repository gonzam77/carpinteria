import type { OptimizerSettings } from "../types";

const EPS_MM = 0.1;
const MIN_AREA_EPS_MM2 = 50;
const AREA_EPS_RATIO = 1e-4;

export const EPS = EPS_MM;

const ROUND_MM_FACTOR = 10;
const ROUND_AREA_FACTOR = 100;
const DEFAULT_TIME_BUDGET_MS = 300;
const GREEDY_VARIANTS = 6;
const BEAM_VARIANTS = 4;
const SEARCH_VARIANTS = 3;
const MAX_SEARCH_PIECES = 24;
const SEARCH_BRANCH_LIMIT = 6;
const BEAM_WIDTH = 24;
const BEAM_BRANCHES = 4;
const PRIMARY_VARIANT_SEEDS = [0, 1, 3, 8, 26];
const CANDIDATE_ORDERS = ["fit-first", "size-first"] as const;

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

type LayoutTreeNode =
  | {
      kind: "free";
      rect: FreeRect;
    }
  | {
      kind: "piece";
      rect: FreeRect;
      pieceId: string;
      rotated: boolean;
      canRotate: boolean;
    }
  | {
      kind: "split";
      rect: FreeRect;
      direction: CutDirection;
      kerfArea: number;
      children: LayoutTreeNode[];
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
  settings: OptimizerSettings;
  variant: number;
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
  kerfArea: number;
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
  tree: LayoutTreeNode;
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
    .sort((a, b) => a.key.localeCompare(b.key));
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

    if (mode === 1) return pieceB.area - pieceA.area || majorB - majorA || a.key.localeCompare(b.key);
    if (mode === 2) return pieceB.height - pieceA.height || pieceB.width - pieceA.width || pieceB.area - pieceA.area;
    if (mode === 3) return pieceB.width - pieceA.width || pieceB.height - pieceA.height || pieceB.area - pieceA.area;
    if (mode === 4) return minorB - minorA || majorB - majorA || pieceB.area - pieceA.area || a.key.localeCompare(b.key);
    if (mode === 5) return b.pieces.length - a.pieces.length || majorB - majorA || pieceB.area - pieceA.area || a.key.localeCompare(b.key);

    return majorB - majorA || pieceB.area - pieceA.area || b.pieces.length - a.pieces.length || a.key.localeCompare(b.key);
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
  if (candidateOrder === "size-first" && a.piece.area !== b.piece.area) return b.piece.area - a.piece.area;
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

  return a.piece.id.localeCompare(b.piece.id);
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
          const boardFreeRectsAfterPlacement = sortRects([...remainingFreeRects, ...split.freeRects]);
          const fitCount = nextRemaining.reduce(
            (total, candidateBucket) => total + countFittableUnitsForBucket(split.freeRects, candidateBucket, kerf),
            0
          );
          const blockedArea = split.freeRects
            .filter((freeRect) => !nextRemaining.some((candidateBucket) => bucketFitsAnyRect(candidateBucket, [freeRect])))
            .reduce((total, freeRect) => total + rectArea(freeRect), 0);
          const largestRectArea = split.freeRects.reduce((largest, freeRect) => Math.max(largest, rectArea(freeRect)), 0);
          const sameGroupStripeCapacity = split.freeRects.reduce(
            (capacity, freeRect) => capacity + countStripeCapacity(freeRect, orientation.width, orientation.height, kerf),
            0
          );
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
            kerfArea: split.kerfArea,
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
  board.kerfArea = roundArea(board.kerfArea + candidate.kerfArea);
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

  while (Date.now() <= deadline) {
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

function mergeFreeRectsForReport(freeRects: FreeRect[], kerfArea: number, kerf: number): MergedFreeRectsResult {
  const nextFreeRects = sortRects(freeRects.map((rect) => ({ ...rect })));
  let recoveredKerfArea = 0;
  let merged = true;

  while (merged) {
    merged = false;

    for (let index = 0; index < nextFreeRects.length && !merged; index += 1) {
      for (let otherIndex = index + 1; otherIndex < nextFreeRects.length; otherIndex += 1) {
        const merge = tryMergeFreeRects(nextFreeRects[index], nextFreeRects[otherIndex], kerf);
        if (!merge) continue;

        nextFreeRects.splice(otherIndex, 1);
        nextFreeRects.splice(index, 1, merge.rect);
        recoveredKerfArea = roundArea(recoveredKerfArea + merge.recoveredKerfArea);
        merged = true;
        break;
      }
    }
  }

  return {
    freeRects: sortRects(nextFreeRects),
    kerfArea: roundArea(Math.max(0, kerfArea - recoveredKerfArea))
  };
}

function finalizeBoardForReport(board: BoardPlan, kerf: number): BoardPlan {
  const reportedBoard = cloneBoard(board);
  const merged = mergeFreeRectsForReport(reportedBoard.freeRects, reportedBoard.kerfArea, kerf);
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
  return a.signature.localeCompare(b.signature);
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

  for (let index = 0; index < boardLimit && remaining.length && Date.now() <= deadline; index += 1) {
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
  candidateOrder?: CandidateOrder
) {
  const boardArea = usableBoardWidthMm * usableBoardHeightMm;
  const orders = candidateOrder ? [candidateOrder] : [...CANDIDATE_ORDERS];
  const selected = selectBestFirstFitResult(
    orders.map((order) => solveFirstFitCompleteForOrder(pieces, usableBoardWidthMm, usableBoardHeightMm, kerf, variant, order)),
    boardArea,
    kerf
  );

  return selected.result;
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

  return stateSignature(a.remaining, a.currentBoard, 0).localeCompare(stateSignature(b.remaining, b.currentBoard, 0));
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

  while (frontier.length && Date.now() <= deadline) {
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
    if (Date.now() > deadline) return null;

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

function createSubtreeFromPlacement(record: PlacementRecord, kerf: number): LayoutTreeNode {
  const rect = record.targetRect;
  const pieceRect = createRect(record.piece.x, record.piece.y, record.piece.width, record.piece.height);
  const rightGap = resolveGap(rect.width - record.piece.width, kerf);
  const bottomGap = resolveGap(rect.height - record.piece.height, kerf);
  const pieceNode: LayoutTreeNode = {
    kind: "piece",
    rect: pieceRect,
    pieceId: record.piece.id,
    rotated: record.piece.rotated,
    canRotate: record.piece.canRotate
  };

  const verticalNode: LayoutTreeNode = {
    kind: "split",
    rect: createRect(rect.x, rect.y, rect.width, record.piece.height),
    direction: "vertical",
    kerfArea: roundArea(rightGap.consumed * record.piece.height),
    children: [
      pieceNode,
      ...(rightGap.remainder > 0
        ? [
            {
              kind: "free" as const,
              rect: createRect(rect.x + record.piece.width + rightGap.consumed, rect.y, rightGap.remainder, record.piece.height)
            }
          ]
        : [])
    ]
  };

  const horizontalNode: LayoutTreeNode = {
    kind: "split",
    rect: createRect(rect.x, rect.y, record.piece.width, rect.height),
    direction: "horizontal",
    kerfArea: roundArea(bottomGap.consumed * record.piece.width),
    children: [
      pieceNode,
      ...(bottomGap.remainder > 0
        ? [
            {
              kind: "free" as const,
              rect: createRect(rect.x, rect.y + record.piece.height + bottomGap.consumed, record.piece.width, bottomGap.remainder)
            }
          ]
        : [])
    ]
  };

  if (record.direction === "horizontal") {
    return {
      kind: "split",
      rect,
      direction: "horizontal",
      kerfArea: roundArea(bottomGap.consumed * rect.width),
      children: [
        rightGap.remainder > 0 || rightGap.consumed > 0 ? verticalNode : pieceNode,
        ...(bottomGap.remainder > 0
          ? [{ kind: "free" as const, rect: createRect(rect.x, rect.y + record.piece.height + bottomGap.consumed, rect.width, bottomGap.remainder) }]
          : [])
      ]
    };
  }

  return {
    kind: "split",
    rect,
    direction: "vertical",
    kerfArea: roundArea(rightGap.consumed * rect.height),
    children: [
      bottomGap.remainder > 0 || bottomGap.consumed > 0 ? horizontalNode : pieceNode,
      ...(rightGap.remainder > 0
        ? [{ kind: "free" as const, rect: createRect(rect.x + record.piece.width + rightGap.consumed, rect.y, rightGap.remainder, rect.height) }]
        : [])
    ]
  };
}

function replaceFreeLeaf(node: LayoutTreeNode, targetRect: FreeRect, replacement: LayoutTreeNode): LayoutTreeNode | null {
  if (node.kind === "free") {
    return sameRect(node.rect, targetRect) ? replacement : null;
  }

  if (node.kind === "piece") return null;

  const replacedChildren = node.children.map((child) => replaceFreeLeaf(child, targetRect, replacement));
  const foundChildIndex = replacedChildren.findIndex(Boolean);
  if (foundChildIndex === -1) return null;

  return {
    ...node,
    children: node.children.map((child, index) => (index === foundChildIndex ? (replacedChildren[index] as LayoutTreeNode) : child))
  };
}

function validateTree(node: LayoutTreeNode, errors: string[]): number {
  if (node.kind === "free" || node.kind === "piece") return rectArea(node.rect);

  const orderedChildren =
    node.direction === "horizontal"
      ? [...node.children].sort((a, b) => a.rect.y - b.rect.y || a.rect.x - b.rect.x)
      : [...node.children].sort((a, b) => a.rect.x - b.rect.x || a.rect.y - b.rect.y);

  let childrenArea = 0;

  orderedChildren.forEach((child) => {
    if (child.rect.x < node.rect.x - EPS_MM || child.rect.y < node.rect.y - EPS_MM) {
      errors.push("Un nodo de corte quedó fuera del rectángulo padre.");
    }
    if (child.rect.x + child.rect.width > node.rect.x + node.rect.width + EPS_MM) {
      errors.push("Un nodo de corte excede el ancho del rectángulo padre.");
    }
    if (child.rect.y + child.rect.height > node.rect.y + node.rect.height + EPS_MM) {
      errors.push("Un nodo de corte excede el alto del rectángulo padre.");
    }
    childrenArea += validateTree(child, errors);
  });

  if (node.direction === "horizontal" && orderedChildren.length > 1) {
    const gap = orderedChildren[1].rect.y - (orderedChildren[0].rect.y + orderedChildren[0].rect.height);
    const expectedKerfArea = roundArea(Math.max(0, gap) * node.rect.width);
    if (!sameArea(expectedKerfArea, node.kerfArea)) {
      errors.push("El árbol de cortes horizontal no conserva el área de kerf.");
    }
  }

  if (node.direction === "vertical" && orderedChildren.length > 1) {
    const gap = orderedChildren[1].rect.x - (orderedChildren[0].rect.x + orderedChildren[0].rect.width);
    const expectedKerfArea = roundArea(Math.max(0, gap) * node.rect.height);
    if (!sameArea(expectedKerfArea, node.kerfArea)) {
      errors.push("El árbol de cortes vertical no conserva el área de kerf.");
    }
  }

  const totalArea = roundArea(childrenArea + node.kerfArea);
  if (!sameArea(totalArea, rectArea(node.rect))) {
    errors.push("El árbol de cortes no recompone el área del rectángulo padre.");
  }

  return totalArea;
}

function replayBoard(board: BoardPlan, kerf: number): ReplayResult {
  let tree: LayoutTreeNode = {
    kind: "free",
    rect: createRect(0, 0, board.usableWidthMm, board.usableHeightMm)
  };
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
    freeRects = sortRects([...freeRects.filter((freeRect) => !sameRect(freeRect, targetRect)), ...split.freeRects]);
    pieces.push(record.piece);
    kerfArea = roundArea(kerfArea + split.kerfArea);

    const replacement = createSubtreeFromPlacement(record, kerf);
    const nextTree = replaceFreeLeaf(tree, targetRect, replacement);
    if (!nextTree) {
      errors.push(`No se pudo reconstruir el árbol de cortes para la pieza ${record.piece.id}.`);
      return;
    }
    tree = nextTree;
  });

  validateTree(tree, errors);

  return {
    pieces,
    freeRects,
    kerfArea,
    tree,
    errors
  };
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
  const reportedReplay = mergeFreeRectsForReport(replay.freeRects, replay.kerfArea, kerf);

  const boardFreeRectSignature = sortRects(board.freeRects)
    .map((rect) => [rect.x, rect.y, rect.width, rect.height].join(":"))
    .join("|");
  const replayFreeRectSignature = sortRects(reportedReplay.freeRects)
    .map((rect) => [rect.x, rect.y, rect.width, rect.height].join(":"))
    .join("|");

  if (boardFreeRectSignature !== replayFreeRectSignature) {
    errors.push(`La placa ${board.index} no conserva los rectángulos libres al reconstruir el árbol.`);
  }

  if (!sameArea(reportedReplay.kerfArea, board.kerfArea)) {
    errors.push(`La placa ${board.index} no conserva el área consumida por kerf.`);
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

  const shouldLog = typeof process === "undefined" || process.env.NODE_ENV !== "production";
  if (shouldLog) {
    console.warn(`[cutOptimizer] ${context}`, errors);
  }
}

function calculateStageDeadline(overallDeadline: number, remainingStages: number) {
  const remainingMs = Math.max(0, overallDeadline - Date.now());
  if (remainingStages <= 1) return Date.now() + remainingMs;

  return Date.now() + Math.max(1, Math.floor(remainingMs / remainingStages));
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

  for (let attemptVariant = 0; attemptVariant < GREEDY_VARIANTS && Date.now() <= deadline; attemptVariant += 1) {
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

  for (let attemptVariant = 0; attemptVariant < BEAM_VARIANTS && Date.now() <= deadline; attemptVariant += 1) {
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
    for (let attemptVariant = 0; attemptVariant < SEARCH_VARIANTS && Date.now() <= deadline; attemptVariant += 1) {
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

export function optimizeCutLayout({
  pieces,
  usableBoardWidthMm,
  usableBoardHeightMm,
  settings,
  variant,
  timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  candidateOrder
}: OptimizeCutLayoutParams): OptimizeCutLayoutResult {
  const overallDeadline = Date.now() + timeBudgetMs;
  const normalizedPieces = pieces.map(normalizePiece);
  const minimumPieceArea = normalizedPieces.reduce((minimum, piece) => Math.min(minimum, piece.area), Number.POSITIVE_INFINITY);
  const fitPieces = normalizedPieces.filter((piece) => pieceCanFitBoard(piece, usableBoardWidthMm, usableBoardHeightMm));
  const impossiblePieces = normalizedPieces.filter((piece) => !pieceCanFitBoard(piece, usableBoardWidthMm, usableBoardHeightMm));
  const kerf = settings.espesorSierraMm;
  const boardArea = usableBoardWidthMm * usableBoardHeightMm;
  const lowerBound = calculateLowerBound(fitPieces, usableBoardWidthMm, usableBoardHeightMm, kerf);
  const resolvedMinimumPieceArea = Number.isFinite(minimumPieceArea) ? minimumPieceArea : 0;
  const baselineFloor = buildFloorCandidate(
    "baseline",
    solveFirstFitComplete(pieces, usableBoardWidthMm, usableBoardHeightMm, kerf, 0, candidateOrder),
    boardArea,
    kerf
  );
  const variantFloor =
    variant === 0
      ? null
      : buildFloorCandidate(
          `variant-${variant}`,
          solveFirstFitComplete(pieces, usableBoardWidthMm, usableBoardHeightMm, kerf, variant, candidateOrder),
          boardArea,
          kerf
        );
  const floorCandidates = [baselineFloor, ...(variantFloor ? [variantFloor] : [])];

  floorCandidates
    .filter(({ validation }) => !validation.valid)
    .forEach(({ label, validation }) => logValidationErrors(`Piso first-fit invalido (${label})`, validation.errors));

  const preferredVariantFloorCandidates = [variantFloor].filter(
    (candidate): candidate is typeof baselineFloor => candidate !== null
  );
  const preferredVariantFloor = preferredVariantFloorCandidates.sort(compareValidatedAttempts)[0] || null;
  const selectedFloor =
    preferredVariantFloor &&
    ((preferredVariantFloor.validation.valid && !baselineFloor.validation.valid) ||
      (preferredVariantFloor.validation.valid === baselineFloor.validation.valid &&
        preferredVariantFloor.attempt.unplaced.length <= baselineFloor.attempt.unplaced.length &&
        preferredVariantFloor.attempt.boardCount <= baselineFloor.attempt.boardCount))
      ? preferredVariantFloor
      : [...floorCandidates].sort(compareValidatedAttempts)[0];
  const floorBoards = selectedFloor?.attempt.boards || [];
  const floorBoardCount = floorBoards.length;
  const floorUnplaced = selectedFloor?.attempt.unplaced || [];
  const floorPlacedAllPossiblePieces = floorUnplaced.length === impossiblePieces.length;
  const candidateAttempts: OptimizationAttempt[] = [];
  const floorGap = Math.max(0, floorBoardCount - lowerBound);
  const winningFloorOrder = selectedFloor?.floor.candidateOrder || candidateOrder || "fit-first";
  const winningFloorVariant = selectedFloor?.floor.variant ?? 0;
  const winningVariantBase = resolveVariantSeed(winningFloorVariant);
  let improvementRan = false;

  if (floorPlacedAllPossiblePieces && floorBoardCount > 0 && floorGap <= 1) {
    for (
      let boardLimit = Math.max(1, lowerBound);
      boardLimit < floorBoardCount && Date.now() < overallDeadline;
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
        winningVariantBase,
        kerf,
        stageDeadline,
        winningFloorOrder
      );

      const validAttempts = attempts
        .map((attempt) => createValidatedAttempt(attempt, impossiblePieces, boardArea, kerf))
        .filter(({ validation }) => validation.valid)
        .map(({ attempt }) => attempt);

      if (!validAttempts.length) continue;

      const minimalAttempts = dedupeAttempts(validAttempts);
      const minimalBoardCount = minimalAttempts[0].boardCount;
      const bestAttempts = minimalAttempts.filter((attempt) => attempt.boardCount === minimalBoardCount);
      const selectedAttemptIndex = ((winningVariantBase % bestAttempts.length) + bestAttempts.length) % bestAttempts.length;

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

  if (selectedFloor?.validation.valid) {
    candidateAttempts.push(selectedFloor.attempt);
  }

  return {
    boards: floorBoards,
    unplaced: floorUnplaced,
    attempts: candidateAttempts,
    lowerBound,
    minimumPieceArea: resolvedMinimumPieceArea,
    floorBoardCount,
    improvementRan,
    improvementGained: 0
  };
}
