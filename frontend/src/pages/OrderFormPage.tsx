import SaveIcon from "@mui/icons-material/Save";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CloseIcon from "@mui/icons-material/Close";
import CalculateIcon from "@mui/icons-material/Calculate";
import { Alert, Box, Button, Divider, Paper, Stack, Step, StepLabel, Stepper, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { createEmptyDetail, OrderItemsTable } from "../components/OrderItemsTable";
import { useAuth } from "../context/AuthContext";
import { Material, Order, OrderDetail } from "../types";

function resolveMaterialId(row: OrderDetail, materials: Material[]) {
  return row.materialId || materials.find((material) => material.nombre === row.material)?.id || "";
}

function validateRows(rows: OrderDetail[], materials: Material[]) {
  for (const row of rows) {
    if (!resolveMaterialId(row, materials) || !row.largo || !row.ancho || !row.cantidad) return "Complete material, largo, ancho y cantidad de cada pieza.";
    if (Number.isNaN(Number(row.largo)) || Number.isNaN(Number(row.ancho))) return "Largo y ancho deben ser numericos.";
    if (Number(row.cantidad) <= 0) return "La cantidad debe ser mayor a cero.";
  }
  return "";
}

function fillClientFields(rows: OrderDetail[], numeroCliente: string, nombreCliente: string) {
  return rows.map((row) => ({
    ...row,
    numeroCliente: row.numeroCliente || numeroCliente,
    nombreCliente: row.nombreCliente || nombreCliente
  }));
}

type PlacedPiece = {
  x: number;
  y: number;
  width: number;
  height: number;
  requestedWidth: number;
  requestedHeight: number;
  label: string;
  rotated: boolean;
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

type MaterialCutResult = {
  material: Material;
  boardWidthMm: number;
  boardHeightMm: number;
  totalArea: number;
  areaEstimatedBoards: number;
  optimizedBoards: BoardPlan[];
  cost: number;
  usagePercent: number;
  wastePercent: number;
  unplaced: string[];
};

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function createBoard(index: number, material: Material): BoardPlan {
  return {
    index,
    pieces: [],
    freeRects: [{ x: 0, y: 0, width: materialBoardWidthMm(material), height: materialBoardHeightMm(material) }],
    usedArea: 0
  };
}

function materialBoardWidthMm(material: Material) {
  return material.anchoPlaca * 10;
}

function materialBoardHeightMm(material: Material) {
  return material.altoPlaca * 10;
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

  if (used.y > rect.y) {
    nextRects.push({ x: rect.x, y: rect.y, width: rect.width, height: used.y - rect.y });
  }
  if (usedBottom < rectBottom) {
    nextRects.push({ x: rect.x, y: usedBottom, width: rect.width, height: rectBottom - usedBottom });
  }
  if (used.x > rect.x) {
    nextRects.push({ x: rect.x, y: rect.y, width: used.x - rect.x, height: rect.height });
  }
  if (usedRight < rectRight) {
    nextRects.push({ x: usedRight, y: rect.y, width: rectRight - usedRight, height: rect.height });
  }

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

function tryPlaceInBoard(board: BoardPlan, piece: { width: number; height: number; label: string; canRotate: boolean }, variant: number) {
  const orientations = [
    { width: piece.width, height: piece.height, rotated: false },
    ...(piece.canRotate ? [{ width: piece.height, height: piece.width, rotated: true }] : [])
  ];

  const placements = board.freeRects
    .flatMap((rect, rectIndex) =>
      orientations
        .filter((orientation) => orientation.width <= rect.width && orientation.height <= rect.height)
        .map((orientation) => ({
          rect,
          rectIndex,
          ...orientation,
          waste: rect.width * rect.height - orientation.width * orientation.height,
          shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height)
        }))
    );
  const placement = sortPlacements(placements, variant)[0];

  if (!placement) return false;

  const usedRect = { x: placement.rect.x, y: placement.rect.y, width: placement.width, height: placement.height };
  board.pieces.push({
    ...usedRect,
    requestedWidth: piece.width,
    requestedHeight: piece.height,
    label: piece.label,
    rotated: placement.rotated
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

function calculateCuts(rows: OrderDetail[], materials: Material[], variant: number) {
  return materials
    .map((material) => {
      const materialRows = rows.filter((row) => resolveMaterialId(row, materials) === material.id);
      const pieces = sortPieces(
        materialRows.flatMap((row, rowIndex) =>
          Array.from({ length: Number(row.cantidad) }, (_, copyIndex) => ({
            width: Number(row.ancho),
            height: Number(row.largo),
            label: pieceLabel(row, rowIndex, copyIndex),
            canRotate: Boolean(row.permiteRotar)
          }))
        ),
        variant
      );

      if (!pieces.length) return null;

      const boardWidthMm = materialBoardWidthMm(material);
      const boardHeightMm = materialBoardHeightMm(material);
      const boardArea = boardWidthMm * boardHeightMm;
      const totalArea = pieces.reduce((total, piece) => total + piece.width * piece.height, 0);
      const boards: BoardPlan[] = [];
      const unplaced: string[] = [];

      for (const piece of pieces) {
        const placed = boards.some((board) => tryPlaceInBoard(board, piece, variant));
        if (placed) continue;

        const board = createBoard(boards.length + 1, material);
        if (tryPlaceInBoard(board, piece, variant)) {
          boards.push(board);
        } else {
          unplaced.push(`${piece.label} (${piece.height}x${piece.width})`);
        }
      }

      const optimizedArea = boards.length * boardArea;
      const usagePercent = optimizedArea ? (totalArea / optimizedArea) * 100 : 0;

      return {
        material,
        boardWidthMm,
        boardHeightMm,
        totalArea,
        areaEstimatedBoards: Math.ceil(totalArea / boardArea),
        optimizedBoards: boards,
        cost: boards.length * material.valor,
        usagePercent,
        wastePercent: optimizedArea ? 100 - usagePercent : 0,
        unplaced
      };
    })
    .filter(Boolean) as MaterialCutResult[];
}

function BoardPreview({ board, material }: { board: BoardPlan; material: Material }) {
  const boardWidthMm = materialBoardWidthMm(material);
  const boardHeightMm = materialBoardHeightMm(material);

  return (
    <Box>
      <Typography variant="caption" color="text.secondary">
        Placa {material.anchoPlaca}x{material.altoPlaca} cm ({boardWidthMm}x{boardHeightMm} mm)
      </Typography>
      <Box sx={{ border: "1px solid", borderColor: "divider", width: 310, aspectRatio: `${boardWidthMm} / ${boardHeightMm}`, position: "relative", bgcolor: "background.default", mt: 0.5 }}>
        <Box sx={{ position: "absolute", top: 4, right: 6, fontSize: 10, color: "text.secondary", bgcolor: "rgba(255,255,255,0.75)", px: 0.5 }}>
          {boardWidthMm} mm
        </Box>
        <Box sx={{ position: "absolute", bottom: 4, left: 6, fontSize: 10, color: "text.secondary", bgcolor: "rgba(255,255,255,0.75)", px: 0.5 }}>
          {boardHeightMm} mm
        </Box>
        {board.pieces.map((piece, index) => (
          <Box
            key={`${piece.label}-${index}`}
            sx={{
              position: "absolute",
              left: `${(piece.x / boardWidthMm) * 100}%`,
              top: `${(piece.y / boardHeightMm) * 100}%`,
              width: `${(piece.width / boardWidthMm) * 100}%`,
              height: `${(piece.height / boardHeightMm) * 100}%`,
              border: "1px solid",
              borderColor: "primary.dark",
              bgcolor: "primary.light",
              color: "primary.contrastText",
              overflow: "hidden",
              p: 0.5,
              fontSize: 10,
              lineHeight: 1.1
            }}
          >
            <strong>{piece.label}</strong>
            {piece.rotated ? " (R)" : ""}
            <br />
            {piece.requestedHeight}x{piece.requestedWidth} mm
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function CutResults({ results }: { results: MaterialCutResult[] }) {
  const totalBoards = results.reduce((total, result) => total + result.optimizedBoards.length, 0);
  const totalCost = results.reduce((total, result) => total + result.cost, 0);
  const totalArea = results.reduce((total, result) => total + result.totalArea, 0);
  const totalBoardArea = results.reduce((total, result) => total + result.optimizedBoards.length * result.boardWidthMm * result.boardHeightMm, 0);
  const totalUsage = totalBoardArea ? (totalArea / totalBoardArea) * 100 : 0;

  return (
    <Paper sx={{ p: 2 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="h6">Calculo de placas</Typography>
          <Typography color="text.secondary">
            Placas necesarias: {totalBoards} · Costo material: {formatMoney(totalCost)} · Aprovechamiento: {totalUsage.toFixed(1)}% · Desperdicio: {(100 - totalUsage).toFixed(1)}%
          </Typography>
        </Box>
        {results.map((result) => (
          <Box key={result.material.id}>
            <Divider sx={{ mb: 2 }} />
            <Typography fontWeight={700}>
              {result.material.nombre} {result.material.espesorMm}mm · Placa {result.material.anchoPlaca}x{result.material.altoPlaca} cm
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Placas estimadas por area: {result.areaEstimatedBoards} · Placas optimizadas: {result.optimizedBoards.length} · Costo: {formatMoney(result.cost)} · Aprovechamiento: {result.usagePercent.toFixed(1)}% · Desperdicio: {result.wastePercent.toFixed(1)}%
            </Typography>
            {result.unplaced.length > 0 && (
              <Alert severity="warning" sx={{ mt: 1 }}>
                Hay piezas que no entran en una placa: {result.unplaced.join(", ")}
              </Alert>
            )}
            <Stack direction="row" spacing={2} sx={{ mt: 2, overflowX: "auto", pb: 1 }}>
              {result.optimizedBoards.map((board) => (
                <Box key={board.index} sx={{ minWidth: 310 }}>
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

export function OrderFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const [cliente, setCliente] = useState(`${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim());
  const [telefono, setTelefono] = useState(user?.telefono ?? "");
  const [observaciones, setObservaciones] = useState("");
  const [rows, setRows] = useState<OrderDetail[]>([createEmptyDetail()]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [cutResults, setCutResults] = useState<MaterialCutResult[]>([]);
  const [optimizerVariant, setOptimizerVariant] = useState(0);
  const [error, setError] = useState("");
  const [step, setStep] = useState(0);
  const returnTo = (location.state as { returnTo?: string } | null)?.returnTo ?? (id ? `/pedidos/${id}` : user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes");

  useEffect(() => {
    setCliente((currentCliente) => currentCliente || `${user?.nombre ?? ""} ${user?.apellido ?? ""}`.trim());
    setTelefono(user?.telefono ?? "");
  }, [user]);

  useEffect(() => {
    api.get<Material[]>("/materiales").then((response) => setMaterials(response.data));
  }, []);

  useEffect(() => {
    if (!id) return;
    api.get<Order>(`/orders/${id}`).then((response) => {
      setCliente(response.data.cliente);
      setTelefono(response.data.numeroContacto ?? user?.telefono ?? "");
      setObservaciones(response.data.observaciones ?? "");
      setRows(response.data.detalles);
    });
  }, [id, user]);

  async function nextStep() {
    setError("");
    if (step === 0) {
      if (!cliente || !telefono) {
        setError("Complete cliente y telefono de contacto.");
        return;
      }
      setRows((currentRows) => fillClientFields(currentRows, telefono, cliente));
    }
    if (step === 1) {
      const rowError = validateRows(rows, materials);
      if (rowError) {
        setError(rowError);
        return;
      }
    }
    setStep((current) => current + 1);
  }

  function calculateBoards(nextVariant = optimizerVariant) {
    setError("");
    const rowError = validateRows(rows, materials);
    if (rowError) {
      setError(rowError);
      return;
    }

    setOptimizerVariant(nextVariant);
    setCutResults(calculateCuts(rows, materials, nextVariant));
  }

  function recalculateBoards() {
    calculateBoards(optimizerVariant + 1);
  }

  function updateRows(nextRows: OrderDetail[]) {
    setRows(nextRows);
    setOptimizerVariant(0);
    setCutResults([]);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const rowError = validateRows(rows, materials);
    if (rowError) {
      setError(rowError);
      return;
    }

    const payload = {
      cliente,
      numeroContacto: telefono,
      observaciones,
      detalles: rows.map((row) => ({
        ...row,
        materialId: resolveMaterialId(row, materials),
        codigoBarra: row.codigoBarra ?? "",
        largo: Number(row.largo),
        ancho: Number(row.ancho),
        cantidad: Number(row.cantidad)
      }))
    };

    const response = id ? await api.put(`/orders/${id}`, payload) : await api.post("/orders", payload);
    navigate(user?.rol === "ADMIN" ? `/pedidos/${response.data.id}` : "/mis-solicitudes");
  }

  return (
    <Stack spacing={3} component="form" onSubmit={handleSubmit}>
      <Typography variant="h4">{id ? "Editar solicitud" : "Nueva solicitud de corte"}</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <Stepper activeStep={step} sx={{ maxWidth: 760 }}>
        {["Datos", "Cortes", "Resumen"].map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      {step === 0 && (
        <Paper sx={{ p: 2 }}>
          <Stack spacing={2}>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Cliente" value={cliente} onChange={(event) => setCliente(event.target.value)} required fullWidth />
              <TextField label="Telefono de contacto" value={telefono} onChange={(event) => setTelefono(event.target.value)} required fullWidth />
            </Stack>
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField label="Observaciones" value={observaciones} onChange={(event) => setObservaciones(event.target.value)} fullWidth />
            </Stack>
          </Stack>
        </Paper>
      )}
      {step === 1 && (
        <Stack spacing={2}>
          <OrderItemsTable rows={rows} setRows={updateRows} materials={materials} defaultDetailValues={{ numeroCliente: telefono, nombreCliente: cliente }} />
          <Button type="button" variant="contained" startIcon={<CalculateIcon />} onClick={() => calculateBoards(0)} sx={{ alignSelf: "flex-start" }}>
            Calcular placas
          </Button>
          {cutResults.length > 0 && (
            <Button type="button" variant="outlined" startIcon={<CalculateIcon />} onClick={recalculateBoards} sx={{ alignSelf: "flex-start" }}>
              Recalcular distribucion
            </Button>
          )}
          {cutResults.length > 0 && <CutResults results={cutResults} />}
        </Stack>
      )}
      {step === 2 && (
        <Paper sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Box>
              <Typography variant="h6">Datos de contacto</Typography>
              <Typography>{cliente} - {telefono}</Typography>
            </Box>
            <Box>
              <Typography variant="h6">Cortes solicitados</Typography>
              <Typography>{rows.length} filas, {rows.reduce((total, row) => total + Number(row.cantidad || 0), 0)} piezas en total</Typography>
            </Box>
            {cutResults.length > 0 && <CutResults results={cutResults} />}
            {observaciones && <Typography color="text.secondary">{observaciones}</Typography>}
          </Stack>
        </Paper>
      )}
      <Stack direction="row" spacing={1}>
        {id && (
          <Button variant="outlined" startIcon={<CloseIcon />} onClick={() => navigate(returnTo)}>
            Cancelar
          </Button>
        )}
        {step > 0 && (
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => setStep((current) => current - 1)}>
            Volver
          </Button>
        )}
        {step < 2 ? (
          <Button type="button" variant="contained" endIcon={<ArrowForwardIcon />} onClick={nextStep}>
            Continuar
          </Button>
        ) : (
          <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
            Enviar solicitud
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
