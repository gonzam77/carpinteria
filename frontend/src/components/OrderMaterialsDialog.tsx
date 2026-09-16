import PrintIcon from "@mui/icons-material/Print";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { Order, OrderMaterialsSummary } from "../types";

function formatThickness(value: number) {
  return `${Number(value.toFixed(2)).toLocaleString("es-AR", { maximumFractionDigits: 2 })} mm`;
}

function boardSize(anchoPlaca: number | null, altoPlaca: number | null) {
  if (!anchoPlaca || !altoPlaca) return "-";
  return `${anchoPlaca} x ${altoPlaca} mm`;
}

export function OrderMaterialsDialog({ order, open, onClose }: { order: Order | null; open: boolean; onClose: () => void }) {
  const { settings: companySettings } = useCompanySettings();
  const [summary, setSummary] = useState<OrderMaterialsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (!open || !order?.id) {
      setSummary(null);
      setLoadError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setLoadError("");

    api
      .get<OrderMaterialsSummary>(`/orders/${order.id}/materiales`)
      .then((response) => {
        if (cancelled) return;
        setSummary(response.data);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error?.response?.data?.message ?? "No se pudo calcular el listado de materiales de la solicitud.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, order]);

  function handlePrint() {
    if (!order || !summary) return;

    const printWindow = window.open("", "_blank", "width=900,height=720");
    if (!printWindow) return;

    const placasRows = summary.placas
      .map(
        (placa) => `
          <tr>
            <td>${placa.nombre}</td>
            <td>${boardSize(placa.anchoPlaca, placa.altoPlaca)}</td>
            <td>${formatThickness(placa.espesorMm)}</td>
            <td>${placa.placas}</td>
            <td>${placa.stockPlacas ?? "-"}</td>
            <td>${placa.faltantePlacas > 0 ? placa.faltantePlacas : "-"}</td>
          </tr>
        `
      )
      .join("");

    const cantosRows = summary.cantos
      .map(
        (canto) => `
          <tr>
            <td>${canto.nombre}</td>
            <td>${formatThickness(canto.espesorMm)}</td>
            <td>${canto.metros.toFixed(2)} m</td>
          </tr>
        `
      )
      .join("");

    const emptyPlacasRow = '<tr><td colspan="6">Sin placas</td></tr>';
    const emptyCantosRow = '<tr><td colspan="3">Sin cantos</td></tr>';

    printWindow.document.write(`
      <html>
        <head>
          <title>Listado de materiales - ${order.cliente}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 24px; color: #111827; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            th, td { border: 1px solid #d1d5db; padding: 8px 10px; font-size: 12px; text-align: left; }
            th { background: #f3f4f6; }
            .muted { color: #6b7280; margin-top: 6px; }
            .section { margin-top: 20px; }
            .card { border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 style="margin:0;">${companySettings.nombre}</h1>
            <div class="section">
              <strong>Listado de materiales a comprar</strong><br />
              Cliente: ${order.cliente}<br />
              Solicitud: ${order.id.slice(0, 8).toUpperCase()}<br />
              Fecha: ${new Date(order.fechaCreacion).toLocaleDateString()}
            </div>
            <div class="section">
              <strong>Placas necesarias</strong>
              <table>
                <thead>
                  <tr><th>Material</th><th>Medida</th><th>Espesor</th><th>Placas</th><th>Stock</th><th>Faltante</th></tr>
                </thead>
                <tbody>${placasRows || emptyPlacasRow}</tbody>
              </table>
              <div class="muted">Total de placas: ${summary.totalPlacas}</div>
            </div>
            <div class="section">
              <strong>Cantos solicitados</strong>
              <table>
                <thead>
                  <tr><th>Canto</th><th>Espesor</th><th>Metros necesarios</th></tr>
                </thead>
                <tbody>${cantosRows || emptyCantosRow}</tbody>
              </table>
              <div class="muted">Total de metros de canto: ${summary.totalMetrosCanto.toFixed(2)} m</div>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Listado de materiales{order ? ` - ${order.cliente}` : ""}</DialogTitle>
      <DialogContent>
        <Stack spacing={3} sx={{ mt: 1 }}>
          {loadError && <Alert severity="error">{loadError}</Alert>}
          {loading && (
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CircularProgress size={20} />
              <Typography color="text.secondary">Calculando placas y cantos necesarios...</Typography>
            </Stack>
          )}

          {summary && (
            <>
              <Box>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">Placas necesarias</Typography>
                  <Chip size="small" label={`${summary.totalPlacas} placas`} />
                </Stack>
                <Paper variant="outlined" sx={{ borderRadius: "12px", overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {["Material", "Medida placa", "Espesor", "Piezas", "Placas", "Stock", "Faltante"].map((header) => (
                          <TableCell key={header} sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                            {header}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.placas.map((placa) => (
                        <TableRow key={placa.materialId}>
                          <TableCell>{placa.nombre}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{boardSize(placa.anchoPlaca, placa.altoPlaca)}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{formatThickness(placa.espesorMm)}</TableCell>
                          <TableCell>{placa.piezas}</TableCell>
                          <TableCell sx={{ fontWeight: 800 }}>{placa.placas}</TableCell>
                          <TableCell>{placa.stockPlacas ?? "-"}</TableCell>
                          <TableCell>
                            {placa.faltantePlacas > 0 ? <Chip size="small" color="error" label={`Faltan ${placa.faltantePlacas}`} /> : "-"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {!summary.placas.length && (
                        <TableRow>
                          <TableCell colSpan={7}>La solicitud no tiene placas cargadas.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Paper>
              </Box>

              <Box>
                <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 1.5 }}>
                  <Typography variant="h6">Cantos solicitados</Typography>
                  <Chip size="small" label={`${summary.totalMetrosCanto.toFixed(2)} m`} />
                </Stack>
                <Paper variant="outlined" sx={{ borderRadius: "12px", overflowX: "auto" }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {["Canto", "Espesor", "Metros necesarios"].map((header) => (
                          <TableCell key={header} sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>
                            {header}
                          </TableCell>
                        ))}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {summary.cantos.map((canto) => (
                        <TableRow key={canto.cantoId}>
                          <TableCell>{canto.nombre}</TableCell>
                          <TableCell sx={{ whiteSpace: "nowrap" }}>{formatThickness(canto.espesorMm)}</TableCell>
                          <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{canto.metros.toFixed(2)} m</TableCell>
                        </TableRow>
                      ))}
                      {!summary.cantos.length && (
                        <TableRow>
                          <TableCell colSpan={3}>La solicitud no tiene cantos solicitados.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Paper>
              </Box>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="outlined" startIcon={<PrintIcon />} onClick={handlePrint} disabled={loading || !summary}>
          Imprimir / Guardar PDF
        </Button>
      </DialogActions>
    </Dialog>
  );
}
