import PrintIcon from "@mui/icons-material/Print";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { Order, OrderDetail } from "../types";

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
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
  onConfirm,
  confirmLabel,
  confirmLoading = false
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  confirmLoading?: boolean;
}) {
  const { settings: companySettings } = useCompanySettings();
  const [loadedOrder, setLoadedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || !order?.id) {
      setLoadedOrder(null);
      setLoadError("");
      setLoading(false);
      return;
    }

    if (order.id === "preview") {
      setLoadedOrder(order);
      setLoadError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError("");

    api
      .get<Order>(`/orders/${order.id}`)
      .then((response) => {
        if (cancelled) return;
        setLoadedOrder(response.data);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("No se pudo cargar la constancia actualizada de la solicitud.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, order]);

  const currentOrder = loadedOrder ?? order;
  if (!currentOrder) return null;

  function handlePrint() {
    if (!currentOrder) return;
    const printableOrder = currentOrder;
    const title = `Constancia - ${printableOrder.cliente}`;
    const date = new Date(printableOrder.fechaCreacion).toLocaleDateString();
    const rowsHtml = printableOrder.detalles
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
          <h1 style="margin:0;">${companySettings.nombre}</h1>
          <div class="muted">Telefono: ${companySettings.telefono || "-"}</div>
          <div class="muted">Email: ${companySettings.email || "-"}</div>
          <div class="section">
            <strong>Constancia de solicitud</strong><br />
            Cliente: ${printableOrder.cliente}<br />
            Contacto: ${printableOrder.numeroContacto ?? "-"}<br />
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
            <strong>Presupuesto estimado:</strong> ${formatMoney(printableOrder.presupuestoEstimado)}<br />
            <span class="muted">Placas: ${formatMoney(printableOrder.costoPlacas)} - Cantos: ${formatMoney(printableOrder.costoCantos)} (${printableOrder.metrosCanto.toFixed(2)} m)</span>
          </div>
          <div class="section">
            <strong>Entrega estimada:</strong> ${printableOrder.faltanteStock ? "Por faltante de stock, anticipe una demora de 3 a 5 dias habiles." : "Con stock disponible, el plazo estimado es de 24 a 48 hs habiles."}
          </div>
          <div class="section">
            <strong>Condicion de pago:</strong> El pago se realizara en el momento de la entrega.
          </div>
        </div>
      `
    );
  }

  return (
    <Dialog open={open} onClose={confirmLoading ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>Constancia de solicitud</DialogTitle>
      <DialogContent>
        <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: "12px", background: "linear-gradient(180deg, #fffef9 0%, #ffffff 100%)", border: "1px solid", borderColor: "divider" }}>
          <Stack spacing={3}>
            {loadError && <Alert severity="error">{loadError}</Alert>}
            {loading && <Alert severity="info">Actualizando constancia desde la base de datos...</Alert>}
            <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" spacing={2}>
              <Box>
                <Typography variant="overline" sx={{ color: "#8b5e3c", fontWeight: 900, letterSpacing: 1.2 }}>
                  Constancia de solicitud
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 900, lineHeight: 1 }}>
                  {companySettings.nombre}
                </Typography>
                <Typography color="text.secondary">Telefono: {companySettings.telefono || "-"}</Typography>
                <Typography color="text.secondary">Email: {companySettings.email || "-"}</Typography>
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

            {currentOrder.observaciones && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                <Typography variant="h6" sx={{ mb: 1 }}>
                  Observaciones
                </Typography>
                <Typography color="text.secondary">{currentOrder.observaciones}</Typography>
              </Paper>
            )}

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr" } }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                <Typography variant="h6" sx={{ mb: 1.5 }}>
                  Presupuesto estimado
                </Typography>
                <Stack spacing={1}>
                  <Typography>Placas estimadas: {currentOrder.placasEstimadas}</Typography>
                  <Typography>Costo placas: {formatMoney(currentOrder.costoPlacas)}</Typography>
                  <Typography>Costo cantos: {formatMoney(currentOrder.costoCantos)}</Typography>
                  <Typography color="text.secondary">Metros de canto estimados: {currentOrder.metrosCanto.toFixed(2)} m</Typography>
                  <Divider sx={{ my: 0.5 }} />
                  <Typography variant="h5" fontWeight={900}>
                    {formatMoney(currentOrder.presupuestoEstimado)}
                  </Typography>
                </Stack>
              </Paper>

              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                  <Typography variant="h6" sx={{ mb: 1 }}>
                    Entrega estimada
                  </Typography>
                  {currentOrder.faltanteStock ? (
                    <Alert severity="warning" sx={{ alignItems: "flex-start" }}>
                      Hay faltante de stock para algunos materiales. Anticipe una demora estimada de 3 a 5 dias habiles.
                    </Alert>
                  ) : (
                    <Alert severity="success" sx={{ alignItems: "flex-start" }}>
                      Hay stock disponible para esta solicitud. El plazo estimado es de 24 a 48 hs habiles.
                    </Alert>
                  )}
                  {currentOrder.faltanteStock && (
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
        <Button onClick={onClose} disabled={confirmLoading}>Cerrar</Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} disabled={loading || Boolean(loadError)}>
          Imprimir / Guardar PDF
        </Button>
        {onConfirm && confirmLabel ? (
          <Button variant="contained" onClick={onConfirm} disabled={loading || Boolean(loadError) || confirmLoading}>
            {confirmLoading ? "Enviando..." : confirmLabel}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}

