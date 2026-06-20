import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from "@mui/material";
import { Order } from "../types";

export function DeleteOrderDialog({
  order,
  open,
  loading = false,
  onCancel,
  onConfirm
}: {
  order: Order | null;
  open: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onClose={loading ? undefined : onCancel} fullWidth maxWidth="xs">
      <DialogTitle>Eliminar solicitud</DialogTitle>
      <DialogContent>
        <DialogContentText>
          Esta accion eliminara la solicitud
          {order?.cliente ? ` de ${order.cliente}` : ""} de forma permanente.
        </DialogContentText>
        <DialogContentText sx={{ mt: 1.5 }}>
          Si la solicitud estaba en proceso, el stock reservado se devolvera automaticamente. ¿Deseas continuar?
        </DialogContentText>
      </DialogContent>
      <DialogActions>
        <Button onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button color="error" variant="contained" onClick={onConfirm} disabled={loading}>
          {loading ? "Eliminando..." : "Si, eliminar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
