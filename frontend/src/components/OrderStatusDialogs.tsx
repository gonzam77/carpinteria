import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { Alert, type AlertColor, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Snackbar, Stack, Typography } from "@mui/material";

// Dialogos y aviso del cambio de estado de una solicitud: los usan el detalle de corte y el de modulos.

export type StockShortage = {
  materialId: string;
  materialNombre: string;
  disponible: number;
  requerido: number;
  faltante: number;
};

/** No alcanza el stock para pasar a un estado que lo descuenta: se puede seguir sin descontar. */
export function StockShortageDialog({
  open,
  estadoLabel,
  shortages,
  busy,
  onCancel,
  onConfirm
}: {
  open: boolean;
  estadoLabel: string;
  shortages: StockShortage[];
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={() => !busy && onCancel()} fullWidth maxWidth="sm">
      <DialogTitle>Stock insuficiente</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Alert severity="warning" variant="outlined">
            No hay stock suficiente para pasar esta solicitud a {estadoLabel}. Podés continuar de todos modos y el stock no se descontará.
          </Alert>
          <Stack spacing={1}>
            {shortages.map((item) => (
              <Box key={item.materialId} sx={{ p: 1.25, border: "1px solid #f3d27a", borderRadius: "8px", bgcolor: "#fff8e6" }}>
                <Typography variant="subtitle2">{item.materialNombre}</Typography>
                <Typography variant="body2" color="text.secondary">
                  Disponible: {item.disponible} placas. Requerido: {item.requerido}. Faltante: {item.faltante}.
                </Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onCancel} disabled={busy}>
          Cancelar
        </Button>
        <Button variant="contained" color="warning" onClick={onConfirm} disabled={busy}>
          Continuar sin descontar stock
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Recien terminada: ofrece avisarle al cliente por WhatsApp. */
export function OrderCompletedDialog({ open, whatsappLink, onClose }: { open: boolean; whatsappLink: string; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Pedido terminado</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 0.5 }}>
          <Alert severity="success" variant="outlined">
            La solicitud ya fue marcada como terminada.
          </Alert>
          <Box
            sx={{
              p: 2,
              borderRadius: "10px",
              border: "1px solid rgba(33, 195, 131, 0.2)",
              background: "linear-gradient(135deg, rgba(33, 195, 131, 0.08) 0%, rgba(35, 214, 200, 0.12) 100%)"
            }}
          >
            <Typography variant="subtitle1" fontWeight={800}>
              Avisar al cliente
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
              Podés enviarle un WhatsApp para avisarle que el pedido ya está terminado y lo puede pasar a retirar.
            </Typography>
            {!whatsappLink && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1.25 }}>
                Esta solicitud no tiene un teléfono de contacto disponible.
              </Typography>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5 }}>
        <Button onClick={onClose}>Cerrar</Button>
        <Button
          variant="contained"
          startIcon={<WhatsAppIcon />}
          disabled={!whatsappLink}
          onClick={() => {
            if (!whatsappLink) return;
            window.open(whatsappLink, "_blank", "noopener,noreferrer");
          }}
          sx={{
            bgcolor: "#25D366",
            color: "#fff",
            "&:hover": { bgcolor: "#1ebe5a" },
            "&.Mui-disabled": {
              bgcolor: "rgba(37, 211, 102, 0.28)",
              color: "rgba(255, 255, 255, 0.8)"
            }
          }}
        >
          Avisar por WhatsApp
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** El aviso arriba a la derecha que confirma lo hecho (o el error). */
export function ActionSnackbar({ message, severity, onClose }: { message: string; severity: AlertColor; onClose: () => void }) {
  return (
    <Snackbar open={Boolean(message)} autoHideDuration={4200} onClose={onClose} anchorOrigin={{ vertical: "top", horizontal: "right" }} sx={{ mt: 8 }}>
      <Alert
        severity={severity}
        variant="filled"
        onClose={onClose}
        sx={{
          alignItems: "center",
          background:
            severity === "success"
              ? "linear-gradient(135deg, #21c383 0%, #23d6c8 100%)"
              : severity === "warning"
                ? "linear-gradient(135deg, #e6a117 0%, #ffcc4d 100%)"
                : "linear-gradient(135deg, #d84b63 0%, #f07d62 100%)",
          borderRadius: "8px",
          boxShadow:
            severity === "success"
              ? "0 18px 42px rgba(33, 195, 131, 0.28)"
              : severity === "warning"
                ? "0 18px 42px rgba(230, 161, 23, 0.28)"
                : "0 18px 42px rgba(216, 75, 99, 0.28)",
          color: severity === "warning" ? "#2b1a00" : undefined,
          fontWeight: 800
        }}
      >
        {message}
      </Alert>
    </Snackbar>
  );
}
