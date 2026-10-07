import CalculateIcon from "@mui/icons-material/Calculate";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, Typography } from "@mui/material";
import axios from "axios";
import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { BoardPlan, FreeRect, PlacedPiece, calculateBoardUtilization, getLargestFreeRect } from "../lib/cutOptimizer";
import { computeOrderEstimate, type EstimateTotals } from "../lib/orderEstimate";
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
  /** false si alguna pieza no entra en la placa o la placa no tiene medidas: no se muestra costo. */
  entra: boolean;
  unplaced: string[];
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

function resolveMaterialId(row: OrderDetail, plates: Material[]) {
  return row.materialId || plates.find((material) => material.nombre === row.material)?.id || "";
}

const EDGE_ID_FIELDS = ["cantoLargo1Id", "cantoLargo2Id", "cantoAncho1Id", "cantoAncho2Id"] as const;

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function formatMm(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

type CutCalculation = {
  results: MaterialCutResult[];
  totalBoards: number;
  totals: EstimateTotals;
  /** Lo que haria rechazar la solicitud en el backend. Si hay alguno, no se muestra ningun costo. */
  errores: string[];
};

// Placas y costos salen de la misma funcion que usa el backend para la constancia, el listado de
// materiales y el stock (lib/orderEstimate.ts): para las mismas filas, el plano muestra los mismos numeros.
// Lo que el backend rechazaria (placas o cantos no disponibles, medidas no enteras, piezas que no entran)
// se muestra como error y sin costo, en lugar de calcular un costo parcial.
function calculateCuts(rows: OrderDetail[], materials: Material[], variant: number, settings: OptimizerSettings, budgetSettings: BudgetSettings): CutCalculation {
  const plates = materials.filter((material) => material.tipo === "PLACA");
  const cantos = materials.filter((material) => material.tipo === "CANTO");
  const plateIndex = new Map(plates.map((plate, index) => [plate.id, index]));
  const cantoIds = new Set(cantos.map((canto) => canto.id));
  const preparedRows = rows.map((row) => ({ ...row, materialId: resolveMaterialId(row, plates) }));
  const errores: string[] = [];

  const withoutPlate = preparedRows.filter((row) => !plateIndex.has(row.materialId));
  if (withoutPlate.length) {
    const names = [...new Set(withoutPlate.map((row) => row.material || "sin placa"))].join(", ");
    errores.push(`Hay ${withoutPlate.length} pieza(s) con una placa que no está disponible (inactiva o eliminada): ${names}. Elegí otra placa para poder guardar la solicitud.`);
  }
  const withoutCanto = preparedRows.filter((row) => EDGE_ID_FIELDS.some((field) => row[field] && !cantoIds.has(row[field] as string)));
  if (withoutCanto.length) {
    errores.push(`Hay ${withoutCanto.length} pieza(s) con un canto que no está disponible (inactivo o eliminado). Elegí otro canto para poder guardar la solicitud.`);
  }
  const notWhole = preparedRows.filter((row) => [row.largo, row.ancho, row.cantidad].some((value) => !Number.isInteger(Number(value)) || Number(value) <= 0));
  if (notWhole.length) {
    errores.push("El largo, el ancho y la cantidad de cada pieza tienen que ser números enteros mayores a 0.");
  }

  const estimate = computeOrderEstimate({
    rows: preparedRows.filter((row) => plateIndex.has(row.materialId)),
    plates,
    cantos,
    optimizerSettings: settings,
    budgetSettings,
    variant
  });
  errores.push(...estimate.errores.map((error) => error.mensaje));

  const results = estimate.porMaterial
    .filter((item) => item.placa && item.piezas > 0)
    .sort((a, b) => (plateIndex.get(a.materialId) ?? 0) - (plateIndex.get(b.materialId) ?? 0))
    .map((item): MaterialCutResult => {
      const material = plates[plateIndex.get(item.materialId) as number];
      return {
        material,
        boardWidthMm: material.anchoPlaca ?? 0,
        boardHeightMm: material.altoPlaca ?? 0,
        usableBoardWidthMm: item.usableBoardWidthMm,
        usableBoardHeightMm: item.usableBoardHeightMm,
        minimumPieceArea: item.minimumPieceArea,
        optimizedBoards: item.boards,
        boardCost: item.costoPlacasCentavos / 100,
        edgeMaterialCost: item.costoMaterialCantosCentavos / 100,
        edgeLaborCost: item.costoPegadoCantosCentavos / 100,
        edgeCost: (item.costoMaterialCantosCentavos + item.costoPegadoCantosCentavos) / 100,
        edgeMeters: item.mmCanto / 1000,
        cutCost: item.costoManoObraCortesCentavos / 100,
        cost: item.totalCentavos / 100,
        entra: item.entra,
        unplaced: item.unplaced.map((piece) => `${piece.label} (${piece.height}x${piece.width})`)
      };
    });

  return { results, totalBoards: estimate.totales.placasEstimadas, totals: estimate.totales, errores };
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
  const originalBoardWidthMm = material.anchoPlaca ?? 0;
  const originalBoardHeightMm = material.altoPlaca ?? 0;
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

function CutResults({ calculation, settings, hideCosts = false }: { calculation: CutCalculation; settings: OptimizerSettings; hideCosts?: boolean }) {
  const { results, totalBoards, totals, errores } = calculation;
  const hasErrors = errores.length > 0;

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, overflow: "hidden" }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">Optimizador de cortes</Typography>
          <Typography color="text.secondary">
            Placas necesarias: {totalBoards}
            {hideCosts ? "" : ` - Costo estimado: ${hasErrors ? "no se puede calcular hasta corregir los errores" : formatMoney(totals.presupuestoEstimado)}`}
          </Typography>
          {!hasErrors && !hideCosts && (
            <Typography variant="body2" color="text.secondary">
              Placas: {formatMoney(totals.costoPlacas)} - Mano de obra por cortes: {formatMoney(totals.costoManoObraCortes)} - Material canto: {formatMoney(totals.costoMaterialCantos)} - Pegado canto: {formatMoney(totals.costoPegadoCantos)} ({totals.metrosCanto.toFixed(2)} m de canto)
            </Typography>
          )}
        </Box>
        {errores.map((error) => (
          <Alert key={error} severity="error" sx={{ "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}>
            {error}
          </Alert>
        ))}
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
              Este plano tiene un fin informativo y se utiliza para estimar la cantidad de tableros y los metros de tapacantos necesarios en cada optimización de cortes.
              La optimización final puede variar al ingresar la solicitud en la máquina de cortes.
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
              {hideCosts
                ? `${result.optimizedBoards.length} placas en el acomodo`
                : result.entra && !hasErrors
                ? <>Costo placas: {formatMoney(result.boardCost)} ({result.optimizedBoards.length} placas) - Mano de obra por cortes: {formatMoney(result.cutCost)} - Material canto: {formatMoney(result.edgeMaterialCost)} - Pegado canto: {formatMoney(result.edgeLaborCost)} - Total cantos: {formatMoney(result.edgeCost)} ({result.edgeMeters.toFixed(2)} m) - TOTAL: {formatMoney(result.cost)}</>
                : `${result.optimizedBoards.length} placas en el acomodo - sin costo hasta corregir los errores`}
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
                  Deslizá para ver
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

/**
 * Plano de cortes con el optimizador compartido. hideCosts oculta los importes: lo usa el asistente de modulos, donde
 * el presupuesto oficial es el de la vista previa del servidor (DECISIONES R3). Por defecto se ve igual que siempre.
 */
export function CutOptimizer({
  rows,
  materials,
  autoCalculate = false,
  hideCosts = false
}: {
  rows: OrderDetail[];
  materials: Material[];
  autoCalculate?: boolean;
  hideCosts?: boolean;
}) {
  const [calculation, setCalculation] = useState<CutCalculation | null>(null);
  const results = calculation?.results ?? [];
  const [variant, setVariant] = useState(0);
  // Sin la configuracion real (sierra y perfilado) no se calcula: con valores por defecto el plano podia
  // mostrar otras placas que la constancia.
  const [settings, setSettings] = useState<OptimizerSettings | null>(null);
  const [settingsError, setSettingsError] = useState("");
  const [budgetSettings, setBudgetSettings] = useState<BudgetSettings | null>(null);
  const [budgetSettingsError, setBudgetSettingsError] = useState("");

  useEffect(() => {
    api
      .get<OptimizerSettings>("/optimizer-settings")
      .then((response) => {
        setSettings(response.data);
        setSettingsError("");
      })
      .catch((error) => {
        setSettings(null);
        setSettingsError(
          axios.isAxiosError(error) && error.response?.status === 401
            ? "Tu sesión expiró. Volvé a ingresar para calcular el plano de cortes."
            : "No se pudo traer la configuración del optimizador (sierra y perfilado). Revisá la conexión e intentá de nuevo."
        );
      });

    api
      .get<BudgetSettings>("/budget-settings")
      .then((response) => {
        setBudgetSettings(response.data);
        setBudgetSettingsError("");
      })
      .catch((error) => {
        setBudgetSettings(null);
        // El mensaje anterior culpaba a los costos de los materiales, que no
        // intervienen en este endpoint, y mandaba a revisar donde no estaba el
        // problema. Casi siempre es la sesion.
        setBudgetSettingsError(
          axios.isAxiosError(error) && error.response?.status === 401
            ? "Tu sesión expiró. Volvé a ingresar para calcular el presupuesto."
            : "No se pudo contactar al servidor para traer las tarifas de mano de obra. Revisá la conexión e intentá de nuevo."
        );
      });
  }, []);

  // Con muchas piezas el calculo ocupa el navegador unos segundos: primero se muestra "calculando" y despues se calcula.
  // Si cambian las filas mientras tanto, el calculo pendiente se descarta.
  const [calculating, setCalculating] = useState(false);
  const calculationToken = useRef(0);

  function calculate(nextVariant = 0) {
    if (!settings || !budgetSettings || calculating) return;
    const token = ++calculationToken.current;
    setCalculating(true);
    window.requestAnimationFrame(() =>
      window.setTimeout(() => {
        if (calculationToken.current !== token) return;
        try {
          setVariant(nextVariant);
          setCalculation(calculateCuts(rows, materials, nextVariant, settings, budgetSettings));
        } finally {
          setCalculating(false);
        }
      }, 0)
    );
  }

  useEffect(() => {
    calculationToken.current += 1;
    setCalculating(false);
    setCalculation(null);
    setVariant(0);
    if (autoCalculate && rows.length && materials.length && settings && budgetSettings) {
      setCalculation(calculateCuts(rows, materials, 0, settings, budgetSettings));
    }
  }, [autoCalculate, rows, materials, settings, budgetSettings]);

  return (
    <Stack spacing={2}>
      {settingsError && <Alert severity="error">{settingsError}</Alert>}
      {budgetSettingsError && <Alert severity="error">{budgetSettingsError}</Alert>}
      {!hideCosts &&
        budgetSettings &&
        budgetSettings.manoObraPlacaPorPlaca === 0 &&
        budgetSettings.manoObraCanto045Mm === 0 &&
        budgetSettings.manoObraCanto1Mm === 0 &&
        budgetSettings.manoObraCanto2Mm === 0 && (
          <Alert severity="warning">
            Todas las tarifas de mano de obra están configuradas en $0. Actualizalas desde Configuración &gt; Presupuesto.
          </Alert>
        )}
      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        <Button
          type="button"
          variant="contained"
          startIcon={calculating ? <CircularProgress size={16} color="inherit" /> : <CalculateIcon />}
          onClick={() => calculate(0)}
          disabled={!settings || !budgetSettings}
          // Mientras calcula no se deshabilita del todo: el boton conserva el foco del teclado (calculate ignora los clicks).
          aria-disabled={calculating || undefined}
          sx={{ width: { xs: "100%", sm: "auto" } }}
        >
          {calculating ? "Calculando..." : "Optimizar cortes"}
        </Button>
        {results.length > 0 && (
          <Button type="button" variant="outlined" startIcon={<CalculateIcon />} onClick={() => calculate(variant + 1)} aria-disabled={calculating || undefined} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Recalcular distribución
          </Button>
        )}
      </Stack>
      {calculation && settings && (results.length > 0 || calculation.errores.length > 0) && <CutResults calculation={calculation} settings={settings} hideCosts={hideCosts} />}
    </Stack>
  );
}
