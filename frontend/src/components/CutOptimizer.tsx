import CalculateIcon from "@mui/icons-material/Calculate";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Alert, Box, Button, Divider, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import {
  BoardPlan,
  FreeRect,
  PlacedPiece,
  calculateBoardUtilization,
  createPieceGroupKey,
  getLargestFreeRect,
  optimizeCutLayout
} from "../lib/cutOptimizer";
import { BudgetSettings, Material, OptimizerSettings, OrderDetail } from "../types";

type MaterialCutResult = {
  material: Material;
  boardWidthMm: number;
  boardHeightMm: number;
  usableBoardWidthMm: number;
  usableBoardHeightMm: number;
  minimumPieceArea: number;
  optimizedBoards: BoardPlan[];
  boardCost: number;
  edgeMaterialCost: number;
  edgeLaborCost: number;
  edgeCost: number;
  edgeMeters: number;
  cutCost: number;
  cost: number;
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

function formatMm(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
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

function pieceLabel(row: OrderDetail, rowIndex: number, copyIndex: number) {
  return row.nombreProducto || row.remark || `Pieza ${rowIndex + 1}.${copyIndex + 1}`;
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
      if (!materialRows.length) return null;

      const basePieces = materialRows.flatMap((row, rowIndex) =>
        Array.from({ length: Number(row.cantidad) }, (_, copyIndex) => {
          const width = Number(row.ancho);
          const height = Number(row.largo);
          const edges = resolvePieceEdges(row);
          return {
            id: `${material.id}-${rowIndex}-${copyIndex}`,
            width,
            height,
            label: pieceLabel(row, rowIndex, copyIndex),
            colorIndex: rowIndex,
            canRotate: Boolean(row.permiteRotar),
            edges,
            area: width * height,
            groupKey: createPieceGroupKey({ width, height, canRotate: Boolean(row.permiteRotar), edges })
          };
        })
      );

      if (!basePieces.length) return null;

      const boardWidthMm = materialBoardWidthMm(material);
      const boardHeightMm = materialBoardHeightMm(material);
      const usableWidthMm = usableBoardWidthMm(material, settings);
      const usableHeightMm = usableBoardHeightMm(material, settings);
      const optimization = optimizeCutLayout({
        pieces: basePieces,
        usableBoardWidthMm: usableWidthMm,
        usableBoardHeightMm: usableHeightMm,
        settings,
        variant
      });

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

      const boards = optimization.boards.filter((board) => board.usedArea > 0);
      const boardCost = boards.length * material.valor;
      const cutCost = boards.length * budgetSettings.manoObraPlacaPorPlaca;

      return {
        material,
        boardWidthMm,
        boardHeightMm,
        usableBoardWidthMm: usableWidthMm,
        usableBoardHeightMm: usableHeightMm,
        minimumPieceArea: optimization.minimumPieceArea,
        optimizedBoards: boards,
        boardCost,
        edgeMaterialCost: edgeSummary.materialCost,
        edgeLaborCost: edgeSummary.laborCost,
        edgeCost: edgeSummary.materialCost + edgeSummary.laborCost,
        edgeMeters: edgeSummary.meters,
        cutCost,
        cost: boardCost + edgeSummary.materialCost + edgeSummary.laborCost + cutCost,
        unplaced: optimization.unplaced.map((piece) => `${piece.label} (${piece.height}x${piece.width})`)
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
    zIndex: 4
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
    zIndex: 5,
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

function transformBoardRect(rect: Pick<FreeRect, "x" | "y" | "width" | "height">, boardWidthMm: number, profileMm: number) {
  const physicalX = rect.x + profileMm;
  const physicalY = rect.y + profileMm;

  return {
    x: physicalY,
    y: boardWidthMm - (physicalX + rect.width),
    width: rect.height,
    height: rect.width
  };
}

function freeRectLabel(rect: FreeRect) {
  return `${formatMm(rect.width)}x${formatMm(rect.height)} mm`;
}

function BoardPreview({
  board,
  material,
  settings,
  minimumUsefulAreaMm2
}: {
  board: BoardPlan;
  material: Material;
  settings: OptimizerSettings;
  minimumUsefulAreaMm2: number;
}) {
  const originalBoardWidthMm = materialBoardWidthMm(material);
  const originalBoardHeightMm = materialBoardHeightMm(material);
  const boardWidthMm = originalBoardHeightMm;
  const boardHeightMm = originalBoardWidthMm;
  const usableDisplayRect = transformBoardRect(
    { x: 0, y: 0, width: board.usableWidthMm, height: board.usableHeightMm },
    originalBoardWidthMm,
    settings.perfiladoBordeMm
  );

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
        <Box
          sx={{
            border: "1px solid",
            borderColor: "divider",
            width: { xs: 340, sm: 420, lg: 500 },
            maxWidth: "100%",
            aspectRatio: `${boardWidthMm} / ${boardHeightMm}`,
            position: "relative",
            bgcolor: "#fbfaf5",
            overflow: "hidden"
          }}
        >
          <Box
            sx={{
              position: "absolute",
              left: `${(usableDisplayRect.x / boardWidthMm) * 100}%`,
              top: `${(usableDisplayRect.y / boardHeightMm) * 100}%`,
              width: `${(usableDisplayRect.width / boardWidthMm) * 100}%`,
              height: `${(usableDisplayRect.height / boardHeightMm) * 100}%`,
              border: "2px dashed",
              borderColor: "rgba(35, 54, 33, 0.38)",
              bgcolor: "rgba(69, 104, 52, 0.04)",
              zIndex: 1
            }}
          />

          {board.freeRects.map((freeRect, index) => {
            const displayRect = transformBoardRect(freeRect, originalBoardWidthMm, settings.perfiladoBordeMm);
            const showLabel = freeRect.width * freeRect.height >= minimumUsefulAreaMm2;

            return (
              <Box
                key={`${freeRect.x}-${freeRect.y}-${freeRect.width}-${freeRect.height}-${index}`}
                sx={{
                  position: "absolute",
                  left: `${(displayRect.x / boardWidthMm) * 100}%`,
                  top: `${(displayRect.y / boardHeightMm) * 100}%`,
                  width: `${(displayRect.width / boardWidthMm) * 100}%`,
                  height: `${(displayRect.height / boardHeightMm) * 100}%`,
                  border: "1px dashed",
                  borderColor: "rgba(51, 65, 85, 0.28)",
                  backgroundImage: "repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.18) 0 8px, rgba(226, 232, 240, 0.12) 8px 16px)",
                  zIndex: 0,
                  overflow: "hidden"
                }}
              >
                {showLabel && (
                  <Box
                    sx={{
                      position: "absolute",
                      inset: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      textAlign: "center",
                      px: 0.75,
                      color: "text.secondary",
                      fontSize: 8,
                      fontWeight: 700,
                      lineHeight: 1.1
                    }}
                  >
                    {freeRectLabel(freeRect)}
                  </Box>
                )}
              </Box>
            );
          })}

          {board.pieces.map((piece) => {
            const color = pieceColors[piece.colorIndex % pieceColors.length];
            const displayRect = transformBoardRect(piece, originalBoardWidthMm, settings.perfiladoBordeMm);
            const displayEdges = rotateDisplayedEdges(piece.edges);

            return (
              <Box
                key={piece.id}
                sx={{
                  position: "absolute",
                  left: `${(displayRect.x / boardWidthMm) * 100}%`,
                  top: `${(displayRect.y / boardHeightMm) * 100}%`,
                  width: `${(displayRect.width / boardWidthMm) * 100}%`,
                  height: `${(displayRect.height / boardHeightMm) * 100}%`,
                  border: "1px solid",
                  borderColor: color.border,
                  bgcolor: color.background,
                  color: "#000000",
                  overflow: "hidden",
                  p: 0.5,
                  fontSize: 8,
                  lineHeight: 1.05,
                  zIndex: 3
                }}
              >
                {(["top", "right", "bottom", "left"] as const).map((side) =>
                  displayEdges[side] ? <Box key={`${piece.id}-${side}-line`} sx={edgeLineStyle(side)} /> : null
                )}
                {(["top", "right", "bottom", "left"] as const).map((side) =>
                  displayEdges[side] ? (
                    <Box key={`${piece.id}-${side}-label`} sx={edgeLabelStyle(side)}>
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
                    zIndex: 2
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

function boardLargestRemnantLabel(board: BoardPlan) {
  const largestFreeRect = getLargestFreeRect(board);
  return largestFreeRect ? freeRectLabel(largestFreeRect) : "Sin remanente";
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
        <Alert
          severity="warning"
          variant="outlined"
          role="alert"
          sx={{
            display: "flex",
            width: "100%",
            minWidth: 0,
            alignItems: "flex-start",
            borderRadius: 2,
            borderWidth: 2,
            borderColor: "warning.main",
            bgcolor: "warning.light",
            color: "#4b2d00",
            boxShadow: "0 10px 24px rgba(228, 185, 55, 0.22)",
            px: { xs: 1.25, sm: 2 },
            py: { xs: 1.25, sm: 1.5 },
            "& .MuiAlert-icon": {
              color: "warning.dark",
              flexShrink: 0,
              mt: 0.25,
              mr: { xs: 1, sm: 1.5 }
            },
            "& .MuiAlert-message": {
              width: "100%",
              minWidth: 0,
              overflowWrap: "anywhere"
            }
          }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 800, letterSpacing: 0.2 }}>
              Plano de cortes estimativo
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.35 }}>
              Este plano tiene un fin informativo y se utiliza para estimar la cantidad de tableros y los metros de tapacantos necesarios en cada optimizacion de cortes.
              La optimizacion final puede variar al ingresar la solicitud en la maquina de cortes.
            </Typography>
          </Box>
        </Alert>
        {results.map((result) => (
          <Box key={result.material.id}>
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={700}>
              {result.material.nombre} {result.material.espesorMm}mm - Placa {result.material.anchoPlaca}x{result.material.altoPlaca} mm
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Costo placas: {formatMoney(result.boardCost)} ({result.optimizedBoards.length} placas) - Mano de obra por cortes: {formatMoney(result.cutCost)} - Material canto: {formatMoney(result.edgeMaterialCost)} - Pegado canto: {formatMoney(result.edgeLaborCost)} - Total cantos: {formatMoney(result.edgeCost)} ({result.edgeMeters.toFixed(2)} m) - TOTAL: {formatMoney(result.cost)}
            </Typography>
            {result.unplaced.length > 0 && (
              <Alert
                severity="warning"
                sx={{
                  mt: 1,
                  width: "100%",
                  minWidth: 0,
                  "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" }
                }}
              >
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
                      Placa {boardIndex + 1} de {result.optimizedBoards.length} - Aprovechamiento {calculateBoardUtilization(board).toFixed(1)}% - Remanente mayor {boardLargestRemnantLabel(board)}
                    </Typography>
                    <BoardPreview
                      board={board}
                      material={result.material}
                      settings={settings}
                      minimumUsefulAreaMm2={result.minimumPieceArea}
                    />
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
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings | null>(null);
  const [budgetSettingsError, setBudgetSettingsError] = useState("");

  useEffect(() => {
    api
      .get<OptimizerSettings>("/optimizer-settings")
      .then((response) => setSettings(response.data))
      .catch(() => setSettings(DEFAULT_OPTIMIZER_SETTINGS));

    api
      .get<BudgetSettings>("/budget-settings")
      .then((response) => {
        setBudgetSettings(response.data);
        setBudgetSettingsError("");
      })
      .catch(() => {
        setBudgetSettings(null);
        setBudgetSettingsError("No se pudo cargar la configuracion de costos. El presupuesto no se calculara con tarifas en cero.");
      });
  }, []);

  function calculate(nextVariant = 0) {
    if (!budgetSettings) return;
    setVariant(nextVariant);
    setResults(calculateCuts(rows, materials, nextVariant, settings, budgetSettings));
  }

  useEffect(() => {
    setResults([]);
    setVariant(0);
    if (autoCalculate && rows.length && materials.length && budgetSettings) {
      setResults(calculateCuts(rows, materials, 0, settings, budgetSettings));
    }
  }, [autoCalculate, rows, materials, settings, budgetSettings]);

  return (
    <Stack spacing={2}>
      {budgetSettingsError && <Alert severity="error">{budgetSettingsError}</Alert>}
      {budgetSettings &&
        budgetSettings.manoObraPlacaPorPlaca === 0 &&
        budgetSettings.manoObraCanto045Mm === 0 &&
        budgetSettings.manoObraCanto1Mm === 0 &&
        budgetSettings.manoObraCanto2Mm === 0 && (
          <Alert severity="warning">
            Todas las tarifas de mano de obra estan configuradas en $0. Actualizalas desde Configuracion &gt; Presupuesto.
          </Alert>
        )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button type="button" variant="contained" startIcon={<CalculateIcon />} onClick={() => calculate(0)} disabled={!budgetSettings} sx={{ width: { xs: "100%", sm: "auto" } }}>
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
