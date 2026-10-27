import PrintOutlinedIcon from "@mui/icons-material/PrintOutlined";
import CheckIcon from "@mui/icons-material/Check";
import CloseIcon from "@mui/icons-material/Close";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import LocalShippingOutlinedIcon from "@mui/icons-material/LocalShippingOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import PaymentsOutlinedIcon from "@mui/icons-material/PaymentsOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";
import { useCompanySettings } from "../context/CompanySettingsContext";
import { Order } from "../types";
import { SectionHeading } from "./SectionHeading";

/** Un dato con su icono (cliente, contacto, fecha). */
function InfoLine({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <Stack direction="row" spacing={1.25} alignItems="flex-start">
      <Box aria-hidden sx={{ color: "primary.dark", display: "flex", pt: 0.25, "& svg": { fontSize: 20 } }}>
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {label}
        </Typography>
        {children}
      </Box>
    </Stack>
  );
}

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function cuttingLaborCost(order: Order) {
  const cost = order.costoManoObraCortes ?? (order.presupuestoEstimado - order.costoPlacas - order.costoCantos);
  return Math.abs(cost) < 0.01 ? 0 : cost;
}

/** Herrajes de una solicitud de modulos (DECISIONES 57): van aparte del presupuesto de placas y se suman al total. */
function hardwareCost(order: Order) {
  return order.costoHerrajes ?? 0;
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
  confirmLoading = false,
  errorMessage
}: {
  order: Order | null;
  open: boolean;
  onClose: () => void;
  onConfirm?: () => void | Promise<void>;
  confirmLabel?: string;
  confirmLoading?: boolean;
  /** Error de la pagina. Se muestra aca porque el modal tapa el de atras. */
  errorMessage?: string;
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
    const printableCuttingLaborCost = cuttingLaborCost(printableOrder);
    const printableHardware = hardwareCost(printableOrder);
    const title = `Constancia - ${printableOrder.cliente}`;
    const date = new Date(printableOrder.fechaCreacion).toLocaleDateString();

    openPrintWindow(
      title,
      `
        <div class="card">
          <h1 style="margin:0;">${companySettings.nombre}</h1>
          <div class="muted">Teléfono: ${companySettings.telefono || "-"}</div>
          <div class="muted">Email: ${companySettings.email || "-"}</div>
          <div class="section">
            <strong>Constancia de solicitud</strong><br />
            Cliente: ${printableOrder.cliente}<br />
            Contacto: ${printableOrder.numeroContacto ?? "-"}<br />
            Fecha: ${date}
          </div>
          <div class="section">
            <strong>Presupuesto estimado:</strong> ${formatMoney(printableOrder.presupuestoEstimado + printableHardware)}<br />
            <span class="muted">Placas: ${formatMoney(printableOrder.costoPlacas)} - Mano de obra de cortes: ${formatMoney(printableCuttingLaborCost)} - Material canto: ${formatMoney(printableOrder.costoMaterialCantos)} - Pegado canto: ${formatMoney(printableOrder.costoPegadoCantos)} - Total cantos (material + pegado): ${formatMoney(printableOrder.costoCantos)} (${printableOrder.metrosCanto.toFixed(2)} m)${printableHardware > 0 ? ` - Herrajes: ${formatMoney(printableHardware)}` : ""}</span>
          </div>
          <div class="section">
            <strong>Entrega estimada:</strong> "Observación: la entrega puede demorar algunos días adicionales según disponibilidad del material al momento de procesar la solicitud."
          </div>
          <div class="section">
            <strong>Condición de pago:</strong> El pago se realizará en el momento de la entrega.
          </div>
        </div>
      `
    );
  }

  return (
    <Dialog open={open} onClose={confirmLoading ? undefined : onClose} fullWidth maxWidth="lg">
      <DialogTitle>Constancia de solicitud</DialogTitle>
      <DialogContent>
        {/* Pegado arriba: el comprobante es largo y, si quedara dentro del area
            que scrollea, el error no se veria justo cuando el usuario esta
            abajo del todo mirando el boton de confirmar. */}
        {errorMessage && (
          <Alert severity="error" sx={{ position: "sticky", top: 0, zIndex: 2, mb: 2 }}>
            {errorMessage}
          </Alert>
        )}
        {/* Hubo quien vio la constancia, la imprimio y se fue creyendo que ya
            estaba guardada. */}
        {onConfirm && confirmLabel && !errorMessage && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Esta es una vista previa: todavía no se guardó. Para enviarla tocá <strong>{confirmLabel}</strong>.
          </Alert>
        )}
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
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary", mt: 0.75 }}>
                  <PhoneOutlinedIcon fontSize="small" aria-hidden />
                  <Typography color="text.secondary">Teléfono: {companySettings.telefono || "-"}</Typography>
                </Stack>
                <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary" }}>
                  <EmailOutlinedIcon fontSize="small" aria-hidden />
                  <Typography color="text.secondary">Email: {companySettings.email || "-"}</Typography>
                </Stack>
              </Box>
              <Paper variant="outlined" sx={{ p: 2, minWidth: { md: 280 }, borderRadius: "12px" }}>
                <Stack spacing={1.5}>
                  <InfoLine icon={<PersonOutlineIcon />} label="Cliente">
                    <Typography fontWeight={800}>{currentOrder.cliente}</Typography>
                  </InfoLine>
                  <InfoLine icon={<PhoneOutlinedIcon />} label="Contacto">
                    <Typography>{currentOrder.numeroContacto ?? "-"}</Typography>
                  </InfoLine>
                  <InfoLine icon={<EventOutlinedIcon />} label="Fecha">
                    <Typography>{new Date(currentOrder.fechaCreacion).toLocaleDateString()}</Typography>
                  </InfoLine>
                </Stack>
              </Paper>
            </Stack>

            {currentOrder.observaciones && (
              <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                <SectionHeading icon={<NotesOutlinedIcon />} title="Observaciones" sx={{ mb: 1 }} />
                <Typography color="text.secondary">{currentOrder.observaciones}</Typography>
              </Paper>
            )}

            <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "1.3fr 1fr" } }}>
              <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                <SectionHeading icon={<RequestQuoteOutlinedIcon />} title="Presupuesto estimado" sx={{ mb: 1.5 }} />
                <Stack spacing={1}>
                  <Typography>Placas estimadas: {currentOrder.placasEstimadas}</Typography>
                  <Typography>Costo placas: {formatMoney(currentOrder.costoPlacas)}</Typography>
                  <Typography>Mano de obra de cortes: {formatMoney(cuttingLaborCost(currentOrder))}</Typography>
                  <Typography>Costo material de canto: {formatMoney(currentOrder.costoMaterialCantos)}</Typography>
                  <Typography>Costo pegado de canto: {formatMoney(currentOrder.costoPegadoCantos)}</Typography>
                  <Typography>Total cantos (material + pegado): {formatMoney(currentOrder.costoCantos)}</Typography>
                  <Typography color="text.secondary">Metros de canto estimados: {currentOrder.metrosCanto.toFixed(2)} m</Typography>
                  {hardwareCost(currentOrder) > 0 && <Typography>Herrajes: {formatMoney(hardwareCost(currentOrder))}</Typography>}
                  <Divider sx={{ my: 0.5 }} />
                  <Stack
                    direction="row"
                    justifyContent="space-between"
                    alignItems="center"
                    spacing={1}
                    sx={{ p: 1.5, borderRadius: "10px", bgcolor: "primary.light", border: "1px solid", borderColor: "divider" }}
                  >
                    <Typography variant="subtitle2" color="text.secondary">
                      Total estimado
                    </Typography>
                    <Typography variant="h5" fontWeight={900} sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatMoney(currentOrder.presupuestoEstimado + hardwareCost(currentOrder))}
                    </Typography>
                  </Stack>
                </Stack>
              </Paper>

              <Stack spacing={2}>
                <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                  <SectionHeading icon={<LocalShippingOutlinedIcon />} title="Entrega estimada" />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                    Observación: la entrega puede demorar algunos días adicionales según disponibilidad del material al momento de procesar la solicitud.
                  </Typography>
                </Paper>

                <Paper variant="outlined" sx={{ p: 2, borderRadius: "12px" }}>
                  <SectionHeading icon={<PaymentsOutlinedIcon />} title="Condición de pago" sx={{ mb: 1 }} />
                  <Typography>El pago se realizará en el momento de la entrega.</Typography>
                </Paper>
              </Stack>
            </Box>
          </Stack>
        </Paper>
      </DialogContent>
      {/* Cerrar a la izquierda y Confirmar a la derecha; en el celular, apilados con el principal abajo. */}
      <DialogActions
        sx={{
          px: 3,
          pb: 2,
          gap: 1,
          flexDirection: { xs: "column", sm: "row" },
          alignItems: { xs: "stretch", sm: "center" },
          "& > :not(style) ~ :not(style)": { ml: 0 }
        }}
      >
        <Button startIcon={<CloseIcon />} onClick={onClose} disabled={confirmLoading} sx={{ mr: { sm: "auto" } }}>
          Cerrar
        </Button>
        <Button variant="outlined" startIcon={<PrintOutlinedIcon />} onClick={handlePrint} disabled={loading || Boolean(loadError)}>
          {/* En la vista previa "Guardar" al lado de "Confirmar" se leia como guardar la solicitud. */}
          {onConfirm ? "Imprimir / PDF" : "Imprimir / Guardar PDF"}
        </Button>
        {onConfirm && confirmLabel ? (
          <Button variant="contained" startIcon={<CheckIcon />} onClick={onConfirm} disabled={loading || Boolean(loadError) || confirmLoading}>
            {confirmLoading ? "Enviando..." : confirmLabel}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}


