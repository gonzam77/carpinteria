import PrintIcon from "@mui/icons-material/Print";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { Material, OptimizerSettings, Order, OrderDetail } from "../types";

type FreeRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type BoardPlan = {
  freeRects: FreeRect[];
};

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

function createBoard(material: Material, settings: OptimizerSettings): BoardPlan {
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

function tryPlaceInBoard(board: BoardPlan, piece: { width: number; height: number; canRotate: boolean }, settings: OptimizerSettings) {
  const orientations = [
    { width: piece.width, height: piece.height },
    ...(piece.canRotate ? [{ width: piece.height, height: piece.width }] : [])
  ];

  const placements = board.freeRects.flatMap((rect) =>
    orientations
      .filter((orientation) => orientation.width <= rect.width && orientation.height <= rect.height)
      .map((orientation) => ({
        rect,
        ...orientation,
        waste: rect.width * rect.height - orientation.width * orientation.height,
        shortSideWaste: Math.min(rect.width - orientation.width, rect.height - orientation.height)
      }))
  );
  const placement = [...placements].sort((a, b) => a.waste - b.waste || a.shortSideWaste - b.shortSideWaste)[0];

  if (!placement) return false;

  const usedRect = {
    x: placement.rect.x,
    y: placement.rect.y,
    width: placement.width + (placement.rect.width > placement.width ? settings.espesorSierraMm : 0),
    height: placement.height + (placement.rect.height > placement.height ? settings.espesorSierraMm : 0)
  };
  board.freeRects = pruneFreeRects(board.freeRects.flatMap((rect) => splitFreeRect(rect, usedRect)));
  return true;
}

function calculateBoardsForMaterial(rows: OrderDetail[], material: Material, settings: OptimizerSettings) {
  const pieces = rows
    .flatMap((row) =>
      Array.from({ length: Number(row.cantidad || 0) }, () => ({
        width: Number(row.ancho),
        height: Number(row.largo),
        canRotate: Boolean(row.permiteRotar)
      }))
    )
    .sort((a, b) => b.width * b.height - a.width * a.height);

  if (!pieces.length) return 0;
  if (!usableBoardWidthMm(material, settings) || !usableBoardHeightMm(material, settings)) return Number.POSITIVE_INFINITY;

  const boards: BoardPlan[] = [];

  for (const piece of pieces) {
    const placed = boards.some((board) => tryPlaceInBoard(board, piece, settings));
    if (placed) continue;

    const board = createBoard(material, settings);
    if (tryPlaceInBoard(board, piece, settings)) {
      boards.push(board);
    } else {
      return Number.POSITIVE_INFINITY;
    }
  }

  return boards.length;
}

function calculateEdgeCost(row: OrderDetail, cantoById: Map<string, Material>) {
  const largoMeters = Number(row.largo || 0) / 1000;
  const anchoMeters = Number(row.ancho || 0) / 1000;
  const cantidad = Number(row.cantidad || 0);

  return [
    { id: row.cantoLargo1Id, meters: largoMeters },
    { id: row.cantoLargo2Id, meters: largoMeters },
    { id: row.cantoAncho1Id, meters: anchoMeters },
    { id: row.cantoAncho2Id, meters: anchoMeters }
  ].reduce(
    (total, edge) => {
      if (!edge.id) return total;
      const canto = cantoById.get(edge.id);
      if (!canto) return total;
      return {
        cost: total.cost + edge.meters * cantidad * canto.valor,
        meters: total.meters + edge.meters * cantidad
      };
    },
    { cost: 0, meters: 0 }
  );
}

function buildEstimate(order: Order, materials: Material[], settings: OptimizerSettings) {
  const placaMaterials = materials.filter((material) => material.tipo === "PLACA");
  const cantoById = new Map(materials.filter((material) => material.tipo === "CANTO").map((material) => [material.id, material]));

  const byMaterial = placaMaterials
    .map((material) => {
      const rows = order.detalles.filter((detail) => {
        const resolvedId = detail.materialId || placaMaterials.find((item) => item.nombre === detail.material)?.id;
        return resolvedId === material.id;
      });

      if (!rows.length) return null;

      const boards = calculateBoardsForMaterial(rows, material, settings);
      const edgeTotals = rows.reduce(
        (total, row) => {
          const current = calculateEdgeCost(row, cantoById);
          return { cost: total.cost + current.cost, meters: total.meters + current.meters };
        },
        { cost: 0, meters: 0 }
      );

      return {
        material,
        boards,
        boardCost: Number.isFinite(boards) ? boards * material.valor : 0,
        edgeCost: edgeTotals.cost,
        edgeMeters: edgeTotals.meters
      };
    })
    .filter(Boolean) as Array<{ material: Material; boards: number; boardCost: number; edgeCost: number; edgeMeters: number }>;

  const totalBoards = byMaterial.reduce((total, item) => total + (Number.isFinite(item.boards) ? item.boards : 0), 0);
  const totalBoardCost = byMaterial.reduce((total, item) => total + item.boardCost, 0);
  const totalEdgeCost = byMaterial.reduce((total, item) => total + item.edgeCost, 0);
  const totalEdgeMeters = byMaterial.reduce((total, item) => total + item.edgeMeters, 0);

  const shortages = byMaterial
    .filter((item) => Number.isFinite(item.boards) && (item.material.stockPlacas ?? 0) < item.boards)
    .map((item) => ({
      materialNombre: item.material.nombre,
      requerido: item.boards,
      disponible: item.material.stockPlacas ?? 0,
      faltante: item.boards - (item.material.stockPlacas ?? 0)
    }));

  return {
    byMaterial,
    totalBoards,
    totalBoardCost,
    totalEdgeCost,
    totalEdgeMeters,
    totalCost: totalBoardCost + totalEdgeCost,
    shortages,
    hasShortage: shortages.length > 0
  };
}

function cantoNames(row: OrderDetail) {
  return [row.cantoLargo1Nombre, row.cantoLargo2Nombre, row.cantoAncho1Nombre, row.cantoAncho2Nombre].filter(Boolean).join(" / ") || "Sin canto";
}

function openPrintWindow(title: string, html: string) {
  const printWindow = window.open("", "_blank", "width=980,height=760");
  if (!printWindow) return;

  printWindow.document.write(`
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; text-align: left; }
          th { background: #f3f4f6; }
          .muted { color: #6b7280; }
          .section { margin-top: 20px; }
          .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
        </style>
      </head>
      <body>
        ${html}
      </body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}

export function OrderReceiptDialog({
  order,
  open,
  onClose,
  materials,
  settings
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  materials: Material[];
  settings: OptimizerSettings;
}) {
  if (!order) return null;
  const currentOrder = order;

  const estimate = buildEstimate(currentOrder, materials, settings);

  function handlePrint() {
    const title = `Constancia - ${currentOrder.cliente}`;
    const date = new Date(currentOrder.fechaCreacion).toLocaleDateString();
    const rowsHtml = currentOrder.detalles
      .map(
        (detail) => `
          <tr>
            <td>${detail.material}</td>
            <td>${detail.largo} x ${detail.ancho} mm</td>
            <td>${detail.cantidad}</td>
            <td>${cantoNames(detail)}</td>
            <td>${detail.nombreProducto ?? detail.remark ?? "-"}</td>
          </tr>
        `
      )
      .join("");

    openPrintWindow(
      title,
      `
        <div class="card">
          <h1 style="margin:0;">ROMA</h1>
          <div class="muted">Telefono: 2664010101</div>
          <div class="section">
            <strong>Constancia de solicitud</strong><br />
            Cliente: ${currentOrder.cliente}<br />
            Contacto: ${currentOrder.numeroContacto ?? "-"}<br />
            Fecha: ${date}
          </div>
          <div class="section">
            <table>
              <thead>
                <tr>
                  <th>Material</th>
                  <th>Medida</th>
                  <th>Cantidad</th>
                  <th>Cantos</th>
                  <th>Producto</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
          <div class="section">
            <strong>Presupuesto estimado:</strong> ${formatMoney(estimate.totalCost)}<br />
            <span class="muted">Placas: ${formatMoney(estimate.totalBoardCost)} - Cantos: ${formatMoney(estimate.totalEdgeCost)} (${estimate.totalEdgeMeters.toFixed(2)} m)</span>
          </div>
          <div class="section">
            <strong>Entrega estimada:</strong> ${estimate.hasShortage ? "Por faltante de stock, anticipe una demora de 3 a 5 dias habiles." : "Con stock disponible, el plazo estimado es de 24 a 48 hs habiles."}
          </div>
          <div class="section">
            <strong>Condicion de pago:</strong> El pago se realizara en el momento de la entrega.
          </div>
        </div>
      `
    );
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>Constancia de solicitud</DialogTitle>
      <DialogContent>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: "12px", background: "linear-gradient(180deg, #fffef9 0%, #ffffff 100%)", border: "1px solid", borderColor: "divider" }}>
          <Stack spacing={3}>
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="overline" sx={{ color: "#8b5e3c", fontWeight: 900, letterSpacing: 1.2 }}>
                  Constancia de solicitud
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, lineHeight: 1 }}>
                  ROMA
                </Typography>
                <Typography color="text.secondary">Telefono: 2664010101</Typography>
              </Box>
              <Paper variant="outlined" sx={{ p: 2, minWidth: { md: 280 }, borderRadius: "12px" }}>
                <Typography variant="subtitle2" color="text.secondary">
                  Cliente
                </Typography>
                <Typography fontWeight={800}>{currentOrder.cliente}</Typography>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Contacto
                </Typography>
                <Typography>{currentOrder.numeroContacto ?? "-"}</Typography>
                <Typography variant="subtitle2" color="text.secondary" sx={{ mt: 1.5 }}>
                  Fecha
                </Typography>
                <Typography>{new Date(currentOrder.fechaCreacion).toLocaleDateString()}</Typography>
              </Paper>
            </Stack>

            <Box>
              <Typography variant="h6" sx={{ mb: 1.5 }}>
                Detalle de piezas
              </Typography>
              <Paper variant="outlined" sx={{ borderRadius: "12px", overflow: "hidden" }}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      {["Material", "Largo", "Ancho", "Cantidad", "Cantos", "Producto / Remark"].map((header) => (
                        <TableCell key={header} sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                          {header}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {currentOrder.detalles.map((detail, index) => (
                      <TableRow key={detail.id ?? index}>
                        <TableCell>{detail.material}</TableCell>
                        <TableCell>{detail.largo} mm</TableCell>
                        <TableCell>{detail.ancho} mm</TableCell>
                        <TableCell>{detail.cantidad}</TableCell>
                        <TableCell>{cantoNames(detail)}</TableCell>
                        <TableCell>{detail.nombreProducto || detail.remark || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Paper>
            </Box>

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr" } }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  Presupuesto estimado
                </Typography>
                <Stack spacing={1}>
                  <Typography>Placas estimadas: {estimate.totalBoards}</Typography>
                  <Typography>Costo placas: {formatMoney(estimate.totalBoardCost)}</Typography>
                  <Typography>Costo cantos: {formatMoney(estimate.totalEdgeCost)}</Typography>
                  <Typography color="text.secondary">Metros de canto estimados: {estimate.totalEdgeMeters.toFixed(2)} m</Typography>
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="h5" fontWeight={900}>
                    {formatMoney(estimate.totalCost)}
                  </Typography>
                </Stack>
              </Paper>

              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Entrega estimada
                  </Typography>
                  {estimate.hasShortage ? (
                    <Alert severity="warning" sx={{ alignItems: "flex-start" }}>
                      Hay faltante de stock para algunos materiales. Anticipe una demora estimada de 3 a 5 dias habiles.
                    </Alert>
                  ) : (
                    <Alert severity="success" sx={{ alignItems: "flex-start" }}>
                      Hay stock disponible para esta solicitud. El plazo estimado es de 24 a 48 hs habiles.
                    </Alert>
                  )}
                  {estimate.shortages.length > 0 && (
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Observacion: la entrega puede demorar algunos dias adicionales segun disponibilidad del material al momento de procesar la solicitud.
                    </Typography>
                  )}
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Condicion de pago
                  </Typography>
                  <Typography>El pago se realizara en el momento de la entrega.</Typography>
                </Paper>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="contained" startIcon={<PrintIcon />} onClick={handlePrint}>
          Imprimir / Guardar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
