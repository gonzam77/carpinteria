import CalculateIcon from "@mui/icons-material/Calculate";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Alert, Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { BudgetSettings, Material, OptimizerSettings, OrderDetail } from "../types";

type PlacedPiece = {
  x: number;
  y: number;
  width: number;
  height: number;
  requestedWidth: number;
  requestedHeight: number;
  label: string;
  colorIndex: number;
  rotated: boolean;
  edges: {
    top?: string | null;
    right?: string | null;
    bottom?: string | null;
    left?: string | null;
  };
};

type FreeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoardPlan = {
  index: number;
  pieces: PlacedPiece[];
  freeRects: FreeRect[];
  usedArea: number;
};

type PieceInput = {
  width: number;
  height: number;
  label: string;
  colorIndex: number;
  canRotate: boolean;
  edges: PlacedPiece["edges"];
};

type PlacementOption = {
  boardIndex: number;
  rect: FreeRect;
  width: number;
  height: number;
  rotated: boolean;
  edges: PlacedPiece["edges"];
  waste: number;
  shortSideWaste: number;
  rotationPenalty: number;
  guillotinePenalty: number;
  axisPriority: number;
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

type GuillotineBoard = BoardPlan & {
  rowStrips: RowStrip[];
  columnStrips: ColumnStrip[];
};

type MaterialCutResult = {
  material: Material;
  boardWidthMm: number;
  boardHeightMm: number;
  usableBoardWidthMm: number;
  usableBoardHeightMm: number;
  totalArea: number;
  areaEstimatedBoards: number;
  optimizedBoards: BoardPlan[];
  boardCost: number;
  edgeMaterialCost: number;
  edgeLaborCost: number;
  edgeCost: number;
  edgeMeters: number;
  cutCost: number;
  cost: number;
  wastePercent: number;
  unplaced: string[];
};

function piecesFitBoard(board: BoardPlan, boardWidth: number, boardHeight: number) {
  return board.pieces.every(
    (piece) =>
      piece.x >= 0 &&
      piece.y >= 0 &&
      piece.width > 0 &&
      piece.height > 0 &&
      piece.x + piece.width <= boardWidth &&
      piece.y + piece.height <= boardHeight
  );
}

const DEFAULT_OPTIMIZER_SETTINGS: OptimizerSettings = {
  id: "default",
  espesorSierraMm: 4.3,
  perfiladoBordeMm: 10
};

const DEFAULT_BUDGET_SETTINGS: BudgetSettings = {
  id: "default",
  manoObraCanto045Mm: 0,
  manoObraCanto1Mm: 0,
  manoObraCanto2Mm: 0,
  manoObraPlacaPorPlaca: 0
};

const pieceColors = [
  { background: "#dbeafe", border: "#93c5fd" },
  { background: "#dcfce7", border: "#86efac" },
  { background: "#fef3c7", border: "#fcd34d" },
  { background: "#fce7f3", border: "#f9a8d4" },
  { background: "#ede9fe", border: "#c4b5fd" },
  { background: "#ccfbf1", border: "#5eead4" },
  { background: "#ffedd5", border: "#fdba74" },
  { background: "#e0f2fe", border: "#7dd3fc" },
  { background: "#f3e8ff", border: "#d8b4fe" },
  { background: "#ecfccb", border: "#bef264" },
  { background: "#fee2e2", border: "#fca5a5" },
  { background: "#e2e8f0", border: "#94a3b8" }
];

function resolveMaterialId(row: OrderDetail, materials: Material[]) {
  return row.materialId || materials.find((material) => material.nombre === row.material)?.id || "";
}

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function materialBoardWidthMm(material: Material) {
  return material.anchoPlaca ?? 0;
}

function materialBoardHeightMm(material: Material) {
  return material.altoPlaca ?? 0;
}

function usableBoardWidthMm(material: Material, settings: OptimizerSettings) {
  return Math.max(0, materialBoardWidthMm(material) - settings.perfiladoBordeMm * 2);
}

function usableBoardHeightMm(material: Material, settings: OptimizerSettings) {
  return Math.max(0, materialBoardHeightMm(material) - settings.perfiladoBordeMm * 2);
}

function createBoard(index: number, material: Material, settings: OptimizerSettings): BoardPlan {
  return {
    index,
    pieces: [],
    freeRects: [{ x: 0, y: 0, width: usableBoardWidthMm(material, settings), height: usableBoardHeightMm(material, settings) }],
    usedArea: 0
  };
}

function pieceLabel(row: OrderDetail, rowIndex: number, copyIndex: number) {
  return row.nombreProducto || row.remark || `Pieza ${rowIndex + 1}.${copyIndex + 1}`;
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

function collectPlacementOptions(board: BoardPlan, piece: PieceInput, boardIndex: number) {
  const orientations = [
    { width: piece.width, height: piece.height, rotated: false, edges: piece.edges },
    ...(piece.canRotate
      ? [
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
        ]
      : [])
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
        rotationPenalty: orientation.rotated ? 1 : 0,
        guillotinePenalty: Number(orientation.width !== rect.width) + Number(orientation.height !== rect.height),
        axisPriority: Math.min(rect.width - orientation.width, rect.height - orientation.height)
      }))
  );
}

function tryPlaceInBoards(boards: BoardPlan[], piece: PieceInput, variant: number, settings: OptimizerSettings) {
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
  board.pieces.push({
    x: placement.rect.x,
    y: placement.rect.y,
    width: placement.width,
    height: placement.height,
    requestedWidth: piece.width,
    requestedHeight: piece.height,
    label: piece.label,
    colorIndex: piece.colorIndex,
    rotated: placement.rotated,
    edges: placement.edges
  });
  board.usedArea += placement.width * placement.height;
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

function scoreBoards(boards: BoardPlan[], boardArea: number) {
  const boardCount = boards.length;
  const usedArea = boards.reduce((total, board) => total + board.usedArea, 0);
  const rotatedCount = boards.reduce((total, board) => total + board.pieces.reduce((pieceTotal, piece) => pieceTotal + Number(piece.rotated), 0), 0);
  const wastePercent = boardCount && boardArea ? Math.max(0, 100 - (usedArea / (boardCount * boardArea)) * 100) : 0;
  return { boardCount, usedArea, wastePercent, rotatedCount };
}

function createGuillotineBoard(index: number): GuillotineBoard {
  return {
    index,
    pieces: [],
    freeRects: [],
    usedArea: 0,
    rowStrips: [],
    columnStrips: []
  };
}

function candidateOrientations(piece: PieceInput) {
  return [
    { width: piece.width, height: piece.height, rotated: false, edges: piece.edges },
    ...(piece.canRotate
      ? [
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
        ]
      : [])
  ];
}

function chooseRowPlacement(board: GuillotineBoard, piece: PieceInput, boardWidth: number, boardHeight: number, kerf: number) {
  const placements = candidateOrientations(piece).flatMap((orientation) => {
    const existingRows = board.rowStrips.flatMap((row, rowIndex) => {
      if (orientation.height > row.height) return [];
      const x = row.usedWidth === 0 ? 0 : row.usedWidth + kerf;
      if (x + orientation.width > boardWidth) return [];
      return [
        {
          type: "existing" as const,
          rowIndex,
          x,
          y: row.y,
          width: orientation.width,
          height: orientation.height,
          rotated: orientation.rotated,
          edges: orientation.edges,
          stripPenalty: row.height - orientation.height
        }
      ];
    });

    const lastRow = board.rowStrips[board.rowStrips.length - 1];
    const y = lastRow ? lastRow.y + lastRow.height + kerf : 0;
    const newRow =
      y + orientation.height <= boardHeight
        ? [
            {
              type: "new" as const,
              rowIndex: board.rowStrips.length,
              x: 0,
              y,
              width: orientation.width,
              height: orientation.height,
              rotated: orientation.rotated,
              edges: orientation.edges,
              stripPenalty: 0
            }
          ]
        : [];

    return [...existingRows, ...newRow];
  });

  return placements.sort((a, b) => {
    if (a.type !== b.type) return a.type === "existing" ? -1 : 1;
    return (
      Number(a.rotated) - Number(b.rotated) ||
      a.stripPenalty - b.stripPenalty ||
      a.y - b.y ||
      a.x - b.x ||
      b.width - a.width
    );
  })[0];
}

function chooseColumnPlacement(board: GuillotineBoard, piece: PieceInput, boardWidth: number, boardHeight: number, kerf: number) {
  const placements = candidateOrientations(piece).flatMap((orientation) => {
    const existingColumns = board.columnStrips.flatMap((column, columnIndex) => {
      if (orientation.width > column.width) return [];
      const y = column.usedHeight === 0 ? 0 : column.usedHeight + kerf;
      if (y + orientation.height > boardHeight) return [];
      return [
        {
          type: "existing" as const,
          columnIndex,
          x: column.x,
          y,
          width: orientation.width,
          height: orientation.height,
          rotated: orientation.rotated,
          edges: orientation.edges,
          stripPenalty: column.width - orientation.width
        }
      ];
    });

    const lastColumn = board.columnStrips[board.columnStrips.length - 1];
    const x = lastColumn ? lastColumn.x + lastColumn.width + kerf : 0;
    const newColumn =
      x + orientation.width <= boardWidth
        ? [
            {
              type: "new" as const,
              columnIndex: board.columnStrips.length,
              x,
              y: 0,
              width: orientation.width,
              height: orientation.height,
              rotated: orientation.rotated,
              edges: orientation.edges,
              stripPenalty: 0
            }
          ]
        : [];

    return [...existingColumns, ...newColumn];
  });

  return placements.sort((a, b) => {
    if (a.type !== b.type) return a.type === "existing" ? -1 : 1;
    return (
      Number(a.rotated) - Number(b.rotated) ||
      a.stripPenalty - b.stripPenalty ||
      a.x - b.x ||
      a.y - b.y ||
      b.height - a.height
    );
  })[0];
}

function placePieceGuillotine(board: GuillotineBoard, piece: PieceInput, axis: GuillotineAxis, boardWidth: number, boardHeight: number, kerf: number) {
  const placement = axis === "rows" ? chooseRowPlacement(board, piece, boardWidth, boardHeight, kerf) : chooseColumnPlacement(board, piece, boardWidth, boardHeight, kerf);
  if (!placement) return false;

  board.pieces.push({
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    requestedWidth: piece.width,
    requestedHeight: piece.height,
    label: piece.label,
    colorIndex: piece.colorIndex,
    rotated: placement.rotated,
    edges: placement.edges
  });
  board.usedArea += placement.width * placement.height;

  if (axis === "rows") {
    const rowPlacement = placement as Extract<typeof placement, { rowIndex: number }>;
    if (placement.type === "new") {
      board.rowStrips.push({ y: placement.y, height: placement.height, usedWidth: placement.width });
    } else {
      board.rowStrips[rowPlacement.rowIndex].usedWidth = placement.x + placement.width;
    }
  } else {
    const columnPlacement = placement as Extract<typeof placement, { columnIndex: number }>;
    if (placement.type === "new") {
      board.columnStrips.push({ x: placement.x, width: placement.width, usedHeight: placement.height });
    } else {
      board.columnStrips[columnPlacement.columnIndex].usedHeight = placement.y + placement.height;
    }
  }

  return true;
}

function runGuillotineLayout(pieces: PieceInput[], material: Material, settings: OptimizerSettings, axis: GuillotineAxis, sortVariant: number) {
  const boardWidth = usableBoardWidthMm(material, settings);
  const boardHeight = usableBoardHeightMm(material, settings);
  const boardArea = boardWidth * boardHeight;
  const orderedPieces = sortPieces(pieces, sortVariant);
  const boards: GuillotineBoard[] = [];
  const unplaced: string[] = [];

  for (const piece of orderedPieces) {
    const placedInExistingBoard = boards.some((board) => placePieceGuillotine(board, piece, axis, boardWidth, boardHeight, settings.espesorSierraMm));
    if (placedInExistingBoard) continue;

    const board = createGuillotineBoard(boards.length + 1);
    if (placePieceGuillotine(board, piece, axis, boardWidth, boardHeight, settings.espesorSierraMm)) {
      boards.push(board);
    } else {
      unplaced.push(`${piece.label} (${piece.height}x${piece.width})`);
    }
  }

  return {
    boards,
    unplaced,
    score: scoreBoards(boards, boardArea)
  };
}

function resolvePieceEdges(row: OrderDetail) {
  return {
    top: row.cantoAncho1Nombre || (row.cantoAncho1 ? "Canto" : null),
    right: row.cantoLargo2Nombre || (row.cantoLargo2 ? "Canto" : null),
    bottom: row.cantoAncho2Nombre || (row.cantoAncho2 ? "Canto" : null),
    left: row.cantoLargo1Nombre || (row.cantoLargo1 ? "Canto" : null)
  };
}

function calculateRowEdgeCost(row: OrderDetail, cantoById: Map<string, Material>, budgetSettings: BudgetSettings) {
  const largoMeters = Number(row.largo || 0) / 1000;
  const anchoMeters = Number(row.ancho || 0) / 1000;
  const cantidad = Number(row.cantidad || 0);

  const edges = [
    { id: row.cantoLargo1Id, meters: largoMeters },
    { id: row.cantoLargo2Id, meters: largoMeters },
    { id: row.cantoAncho1Id, meters: anchoMeters },
    { id: row.cantoAncho2Id, meters: anchoMeters }
  ];

  return edges.reduce(
    (total, edge) => {
      if (!edge.id) return total;
      const canto = cantoById.get(edge.id);
      if (!canto) return total;
      const laborCostPerMeter =
        canto.espesorMm === 0.45 ? budgetSettings.manoObraCanto045Mm : canto.espesorMm === 1 ? budgetSettings.manoObraCanto1Mm : canto.espesorMm === 2 ? budgetSettings.manoObraCanto2Mm : 0;
      return {
        materialCost: total.materialCost + edge.meters * cantidad * canto.valor,
        laborCost: total.laborCost + edge.meters * cantidad * laborCostPerMeter,
        meters: total.meters + edge.meters * cantidad
      };
    },
    { materialCost: 0, laborCost: 0, meters: 0 }
  );
}

function calculateCuts(rows: OrderDetail[], materials: Material[], variant: number, settings: OptimizerSettings, budgetSettings: BudgetSettings) {
  const cantoById = new Map(materials.filter((material) => material.tipo === "CANTO").map((material) => [material.id, material]));

  return materials
    .filter((material) => material.tipo === "PLACA" && material.anchoPlaca && material.altoPlaca)
    .map((material) => {
      const materialRows = rows.filter((row) => resolveMaterialId(row, materials) === material.id);
      const basePieces = materialRows.flatMap((row, rowIndex) =>
        Array.from({ length: Number(row.cantidad) }, (_, copyIndex) => ({
          width: Number(row.ancho),
          height: Number(row.largo),
          label: pieceLabel(row, rowIndex, copyIndex),
          colorIndex: rowIndex,
          canRotate: Boolean(row.permiteRotar),
          edges: resolvePieceEdges(row)
        }))
      );

      if (!basePieces.length) return null;

      const boardWidthMm = materialBoardWidthMm(material);
      const boardHeightMm = materialBoardHeightMm(material);
      const usableWidthMm = usableBoardWidthMm(material, settings);
      const usableHeightMm = usableBoardHeightMm(material, settings);
      const boardArea = usableWidthMm * usableHeightMm;
      const totalArea = basePieces.reduce((total, piece) => total + piece.width * piece.height, 0);
      const attempts = ["rows", "columns"].flatMap((axis) =>
        Array.from({ length: 6 }, (_, attemptVariant) => {
          const result = runGuillotineLayout(basePieces, material, settings, axis as GuillotineAxis, attemptVariant);
          const invalidBoardLayout = result.boards.some((board) => !piecesFitBoard(board, usableWidthMm, usableHeightMm));
          return {
            axis,
            variant: attemptVariant,
            boards: result.boards,
            unplaced: invalidBoardLayout ? basePieces.map((piece) => `${piece.label} (${piece.height}x${piece.width})`) : result.unplaced,
            score: result.score,
            invalidBoardLayout
          };
        })
      ).sort((a, b) => {
        if (a.invalidBoardLayout !== b.invalidBoardLayout) return Number(a.invalidBoardLayout) - Number(b.invalidBoardLayout);
        if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length - b.unplaced.length;
        if (a.score.boardCount !== b.score.boardCount) return a.score.boardCount - b.score.boardCount;
        if (a.score.rotatedCount !== b.score.rotatedCount) return a.score.rotatedCount - b.score.rotatedCount;
        if (a.score.wastePercent !== b.score.wastePercent) return a.score.wastePercent - b.score.wastePercent;
        return b.score.usedArea - a.score.usedArea;
      });

      const selectedAttempt = attempts[variant % attempts.length];
      const boards = selectedAttempt.boards;
      const unplaced = selectedAttempt.unplaced;
      const optimizedArea = boards.length * boardArea;
      const boardCost = boards.length * material.valor;
      const edgeSummary = materialRows.reduce(
        (total, row) => {
          const edgeTotals = calculateRowEdgeCost(row, cantoById, budgetSettings);
          return {
            materialCost: total.materialCost + edgeTotals.materialCost,
            laborCost: total.laborCost + edgeTotals.laborCost,
            meters: total.meters + edgeTotals.meters
          };
        },
        { materialCost: 0, laborCost: 0, meters: 0 }
      );
      const cutCost = boards.length * budgetSettings.manoObraPlacaPorPlaca;

      return {
        material,
        boardWidthMm,
        boardHeightMm,
        usableBoardWidthMm: usableWidthMm,
        usableBoardHeightMm: usableHeightMm,
        totalArea,
        areaEstimatedBoards: Math.ceil(totalArea / boardArea),
        optimizedBoards: boards,
        boardCost,
        edgeMaterialCost: edgeSummary.materialCost,
        edgeLaborCost: edgeSummary.laborCost,
        edgeCost: edgeSummary.materialCost + edgeSummary.laborCost,
        edgeMeters: edgeSummary.meters,
        cutCost,
        cost: boardCost + edgeSummary.materialCost + edgeSummary.laborCost + cutCost,
        wastePercent: optimizedArea ? Math.max(0, 100 - (totalArea / optimizedArea) * 100) : 0,
        unplaced
      };
    })
    .filter(Boolean) as MaterialCutResult[];
}

function edgeLineStyle(side: "top" | "right" | "bottom" | "left") {
  const common = {
    position: "absolute" as const,
    bgcolor: "#000000",
    color: "#000000",
    fontSize: 8,
    fontWeight: 700,
    lineHeight: 1,
    zIndex: 2
  };

  if (side === "top") return { ...common, top: 5, left: "18%", width: "64%", height: 4, borderRadius: "999px" };
  if (side === "bottom") return { ...common, bottom: 5, left: "18%", width: "64%", height: 4, borderRadius: "999px" };
  if (side === "left") return { ...common, top: "18%", left: 5, width: 4, height: "64%", borderRadius: "999px" };
  return { ...common, top: "18%", right: 5, width: 4, height: "64%", borderRadius: "999px" };
}

function edgeLabelStyle(side: "top" | "right" | "bottom" | "left") {
  const common = {
    position: "absolute" as const,
    color: "#000000",
    fontSize: 9,
    fontWeight: 700,
    lineHeight: 1.05,
    zIndex: 3,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap" as const,
    maxWidth: "70%"
  };

  if (side === "top") return { ...common, top: 12, left: "50%", transform: "translateX(-50%)" };
  if (side === "bottom") return { ...common, bottom: 12, left: "50%", transform: "translateX(-50%)" };
  if (side === "left") return { ...common, top: "50%", left: 12, transform: "translateY(-50%) rotate(-90deg)", transformOrigin: "left center", maxWidth: "none" };
  return { ...common, top: "50%", right: 12, transform: "translateY(-50%) rotate(90deg)", transformOrigin: "right center", maxWidth: "none" };
}

function rotateDisplayedEdges(edges: PlacedPiece["edges"]): PlacedPiece["edges"] {
  return {
    top: edges.left,
    right: edges.top,
    bottom: edges.right,
    left: edges.bottom
  };
}

function BoardPreview({ board, material }: { board: BoardPlan; material: Material }) {
  const originalBoardWidthMm = materialBoardWidthMm(material);
  const originalBoardHeightMm = materialBoardHeightMm(material);
  const boardWidthMm = originalBoardHeightMm;
  const boardHeightMm = originalBoardWidthMm;

  return (
    <Box sx={{ px: 3, pt: 2, pb: 1 }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.75, textAlign: "center" }}>
        {boardWidthMm} mm
      </Typography>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ writingMode: "vertical-rl", transform: "rotate(180deg)", flexShrink: 0 }}
        >
          {boardHeightMm} mm
        </Typography>
        <Box sx={{ border: "1px solid", borderColor: "divider", width: { xs: 340, sm: 420, lg: 500 }, maxWidth: "100%", aspectRatio: `${boardWidthMm} / ${boardHeightMm}`, position: "relative", bgcolor: "background.default" }}>
        {board.pieces.map((piece, index) => {
          const color = pieceColors[piece.colorIndex % pieceColors.length];
          const displayX = piece.y;
          const displayY = originalBoardWidthMm - (piece.x + piece.width);
          const displayWidth = piece.height;
          const displayHeight = piece.width;
          const displayEdges = rotateDisplayedEdges(piece.edges);

          return (
            <Box
              key={`${piece.label}-${index}`}
              sx={{
                position: "absolute",
                left: `${(displayX / boardWidthMm) * 100}%`,
                top: `${(displayY / boardHeightMm) * 100}%`,
                width: `${(displayWidth / boardWidthMm) * 100}%`,
                height: `${(displayHeight / boardHeightMm) * 100}%`,
                border: "1px solid",
                borderColor: color.border,
                bgcolor: color.background,
                color: "#000000",
                overflow: "hidden",
                p: 0.5,
                fontSize: 8,
                lineHeight: 1.05
              }}
            >
              {(["top", "right", "bottom", "left"] as const).map((side) =>
                displayEdges[side] ? <Box key={`${side}-line`} sx={edgeLineStyle(side)} /> : null
              )}
              {(["top", "right", "bottom", "left"] as const).map((side) =>
                displayEdges[side] ? (
                  <Box key={`${side}-label`} sx={edgeLabelStyle(side)}>
                    {displayEdges[side]}
                  </Box>
                ) : null
              )}
              <Box
                sx={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  px: 1.25,
                  py: 1.5,
                  zIndex: 1
                }}
              >
                <Box>
                  <Box sx={{ fontSize: 8, fontWeight: 700, lineHeight: 1.05 }}>
                    {piece.label}
                    {piece.rotated ? " (R)" : ""}
                  </Box>
                  <Box sx={{ fontSize: 7, lineHeight: 1.05 }}>
                    {piece.requestedHeight}x{piece.requestedWidth} mm
                  </Box>
                </Box>
              </Box>
            </Box>
          );
        })}
        </Box>
      </Box>
    </Box>
  );
}

function CutResults({ results, settings }: { results: MaterialCutResult[]; settings: OptimizerSettings }) {
  const totalBoards = results.reduce((total, result) => total + result.optimizedBoards.length, 0);
  const totalCost = results.reduce((total, result) => total + result.cost, 0);

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">Optimizador de cortes</Typography>
          <Typography color="text.secondary">
            Placas necesarias: {totalBoards} - Costo estimado: {formatMoney(totalCost)}
          </Typography>
        </Box>
        {results.map((result) => (
          <Box key={result.material.id}>
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={700}>
              {result.material.nombre} {result.material.espesorMm}mm - Placa {result.material.anchoPlaca}x{result.material.altoPlaca} mm
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Area util placa: {result.usableBoardWidthMm}x{result.usableBoardHeightMm} mm - Costo placas: {formatMoney(result.boardCost)} ({result.optimizedBoards.length} placas) - Mano de obra por cortes: {formatMoney(result.cutCost)} - Material canto: {formatMoney(result.edgeMaterialCost)} - Pegado canto: {formatMoney(result.edgeLaborCost)} - Total cantos: {formatMoney(result.edgeCost)} ({result.edgeMeters.toFixed(2)} m) - TOTAL: {formatMoney(result.cost)}
            </Typography>
            {result.unplaced.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Hay piezas que no entran en una placa: {result.unplaced.join(", ")}
              </Alert>
            )}
            <Box sx={{ mt: 2, position: "relative" }}>
              {result.optimizedBoards.length > 1 && (
                <Box
                  sx={{
                    display: { xs: "flex", sm: "none" },
                    alignItems: "center",
                    gap: 0.25,
                    position: "absolute",
                    top: 6,
                    right: 0,
                    zIndex: 2,
                    px: 0.75,
                    py: 0.25,
                    borderRadius: "999px",
                    bgcolor: "rgba(23, 32, 58, 0.88)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    pointerEvents: "none"
                  }}
                >
                  Desliza para ver 
                  <KeyboardArrowRightIcon sx={{ fontSize: 16 }} />
                </Box>
              )}
              <Stack
                direction="row"
                spacing={2}
                sx={{
                  overflowX: "auto",
                  overflowY: "hidden",
                  pb: 1,
                  width: "100%",
                  touchAction: "pan-x",
                  WebkitOverflowScrolling: "touch"
                }}
              >
                {result.optimizedBoards.map((board, boardIndex) => (
                  <Box key={board.index} sx={{ minWidth: { xs: 340, sm: 420, lg: 500 } }}>
                    <Typography variant="body2" fontWeight={700} gutterBottom>
                      Placa {boardIndex + 1} de {result.optimizedBoards.length}
                    </Typography>
                    <BoardPreview board={board} material={result.material} />
                  </Box>
                ))}
              </Stack>
            </Box>
          </Box>
        ))}
      </Stack>
    </Paper>
  );
}

export function CutOptimizer({ rows, materials, autoCalculate = false }: { rows: OrderDetail[]; materials: Material[]; autoCalculate?: boolean }) {
  const [results, setResults] = useState<MaterialCutResult[]>([]);
  const [variant, setVariant] = useState(0);
  const [settings, setSettings] = useState<OptimizerSettings>(DEFAULT_OPTIMIZER_SETTINGS);
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings>(DEFAULT_BUDGET_SETTINGS);

  useEffect(() => {
    api
      .get<OptimizerSettings>("/optimizer-settings")
      .then((response) => setSettings(response.data))
      .catch(() => setSettings(DEFAULT_OPTIMIZER_SETTINGS));

    api
      .get<BudgetSettings>("/budget-settings")
      .then((response) => setBudgetSettings(response.data))
      .catch(() => setBudgetSettings(DEFAULT_BUDGET_SETTINGS));
  }, []);

  function calculate(nextVariant = 0) {
    setVariant(nextVariant);
    setResults(calculateCuts(rows, materials, nextVariant, settings, budgetSettings));
  }

  useEffect(() => {
    setResults([]);
    setVariant(0);
    if (autoCalculate && rows.length && materials.length) {
      setResults(calculateCuts(rows, materials, 0, settings, budgetSettings));
    }
  }, [autoCalculate, rows, materials, settings, budgetSettings]);

  return (
    <Stack spacing={2}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button type="button" variant="contained" startIcon={<CalculateIcon />} onClick={() => calculate(0)} sx={{ width: { xs: "100%", sm: "auto" } }}>
          Optimizar cortes
        </Button>
        {results.length > 0 && (
          <Button type="button" variant="outlined" startIcon={<CalculateIcon />} onClick={() => calculate(variant + 1)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Recalcular distribucion
          </Button>
        )}
      </Stack>
      {results.length > 0 && <CutResults results={results} settings={settings} />}
    </Stack>
  );
}
