import CalculateIcon from "@mui/icons-material/Calculate";
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

function sortPlacements<T extends { waste: number; shortSideWaste: number; rect: FreeRect; width: number; height: number }>(placements: T[], variant: number) {
  const mode = variant % 4;
  return [...placements].sort((a, b) => {
    if (mode === 1) return a.rect.y - b.rect.y || a.rect.x - b.rect.x || a.shortSideWaste - b.shortSideWaste;
    if (mode === 2) return a.shortSideWaste - b.shortSideWaste || a.waste - b.waste;
    if (mode === 3) return b.width - a.width || b.height - a.height || a.waste - b.waste;
    return a.waste - b.waste || a.shortSideWaste - b.shortSideWaste;
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
        shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height)
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
  const mode = variant % 3;
  return [...pieces].sort((a, b) => {
    if (mode === 1) return Math.max(b.width, b.height) - Math.max(a.width, a.height) || b.width * b.height - a.width * a.height;
    if (mode === 2) return b.height - a.height || b.width - a.width;
    return b.width * b.height - a.width * a.height;
  });
}

function scoreBoards(boards: BoardPlan[], boardArea: number) {
  const boardCount = boards.length;
  const usedArea = boards.reduce((total, board) => total + board.usedArea, 0);
  const wastePercent = boardCount && boardArea ? Math.max(0, 100 - (usedArea / (boardCount * boardArea)) * 100) : 0;
  return { boardCount, usedArea, wastePercent };
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
      const attempts = Array.from({ length: 12 }, (_, attemptVariant) => {
        const pieces = sortPieces(basePieces, attemptVariant);
        const boards: BoardPlan[] = [];
        const unplaced: string[] = [];

        for (const piece of pieces) {
          if (tryPlaceInBoards(boards, piece, attemptVariant, settings)) continue;

          const board = createBoard(boards.length + 1, material, settings);
          if (tryPlaceInBoards([board], piece, attemptVariant, settings)) {
            boards.push(board);
          } else {
            unplaced.push(`${piece.label} (${piece.height}x${piece.width})`);
          }
        }

        const score = scoreBoards(boards, boardArea);
        return { variant: attemptVariant, boards, unplaced, score };
      }).sort((a, b) => {
        if (a.unplaced.length !== b.unplaced.length) return a.unplaced.length - b.unplaced.length;
        if (a.score.boardCount !== b.score.boardCount) return a.score.boardCount - b.score.boardCount;
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

function BoardPreview({ board, material }: { board: BoardPlan; material: Material }) {
  const boardWidthMm = materialBoardWidthMm(material);
  const boardHeightMm = materialBoardHeightMm(material);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Placa {material.anchoPlaca}x{material.altoPlaca} mm
      </Typography>
      <Box sx={{ border: "1px solid", borderColor: "divider", width: { xs: 340, sm: 420, lg: 500 }, maxWidth: "100%", aspectRatio: `${boardWidthMm} / ${boardHeightMm}`, position: "relative", bgcolor: "background.default", mt: 0.5 }}>
        <Box sx={{ position: "absolute", top: 4, right: 6, fontSize: 10, color: "text.secondary", bgcolor: "rgba(255,255,255,0.75)", px: 0.5 }}>{boardWidthMm} mm</Box>
        <Box sx={{ position: "absolute", bottom: 4, left: 6, fontSize: 10, color: "text.secondary", bgcolor: "rgba(255,255,255,0.75)", px: 0.5 }}>{boardHeightMm} mm</Box>
        {board.pieces.map((piece, index) => {
          const color = pieceColors[piece.colorIndex % pieceColors.length];

          return (
            <Box
              key={`${piece.label}-${index}`}
              sx={{
                position: "absolute",
                left: `${(piece.x / boardWidthMm) * 100}%`,
                top: `${(piece.y / boardHeightMm) * 100}%`,
                width: `${(piece.width / boardWidthMm) * 100}%`,
                height: `${(piece.height / boardHeightMm) * 100}%`,
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
                piece.edges[side] ? <Box key={`${side}-line`} sx={edgeLineStyle(side)} /> : null
              )}
              {(["top", "right", "bottom", "left"] as const).map((side) =>
                piece.edges[side] ? (
                  <Box key={`${side}-label`} sx={edgeLabelStyle(side)}>
                    {piece.edges[side]}
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
              Area util placa: {result.usableBoardWidthMm}x{result.usableBoardHeightMm} mm - Costo placas: {formatMoney(result.boardCost)} ({result.optimizedBoards.length} placas) - Material canto: {formatMoney(result.edgeMaterialCost)} - Pegado canto: {formatMoney(result.edgeLaborCost)} - Total cantos: {formatMoney(result.edgeCost)} ({result.edgeMeters.toFixed(2)} m) - Mano de obra por cortes: {formatMoney(result.cutCost)} - Total: {formatMoney(result.cost)}
            </Typography>
            {result.unplaced.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Hay piezas que no entran en una placa: {result.unplaced.join(", ")}
              </Alert>
            )}
            <Stack direction="row" spacing={2} sx={{ mt: 2, overflowX: "auto", pb: 1, width: "100%" }}>
              {result.optimizedBoards.map((board) => (
                <Box key={board.index} sx={{ minWidth: { xs: 340, sm: 420, lg: 500 } }}>
                  <Typography variant="body2" fontWeight={700} gutterBottom>
                    Placa {board.index}
                  </Typography>
                  <BoardPreview board={board} material={result.material} />
                </Box>
              ))}
            </Stack>
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
