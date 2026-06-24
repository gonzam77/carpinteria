import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  Alert,
  type AlertColor,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Select,
  Snackbar,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography
} from "@mui/material";
import axios from "axios";
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CutOptimizer } from "../components/CutOptimizer";
import { DeleteOrderDialog } from "../components/DeleteOrderDialog";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { EstadoSolicitud, Material, Order } from "../types";

const estados: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA", "RECHAZADA"];

type StockShortage = {
  materialId: string;
  materialNombre: string;
  disponible: number;
  requerido: number;
  faltante: number;
};

type StatusChangeError = {
  message?: string;
  code?: string;
  details?: {
    stockShortages?: StockShortage[];
  };
};

function canEditOrder(estado: EstadoSolicitud) {
  return estado !== "EN_PROCESO" && estado !== "TERMINADA" && estado !== "ENTREGADA";
}

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [notification, setNotification] = useState("");
  const [notificationSeverity, setNotificationSeverity] = useState<AlertColor>("success");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EstadoSolicitud | null>(null);
  const [stockShortages, setStockShortages] = useState<StockShortage[]>([]);
  const { user } = useAuth();
  const navigate = useNavigate();

  async function loadOrder() {
    const response = await api.get<Order>(`/orders/${id}`);
    setOrder(response.data);
  }

  useEffect(() => {
    loadOrder();
  }, [id]);

  useEffect(() => {
    if (user?.rol !== "ADMIN") return;
    api.get<Material[]>("/materiales", { params: { incluirInactivos: true, tipo: "PLACA" } }).then((response) => setMaterials(response.data));
  }, [user]);

  async function exportOrder() {
    const response = await api.get("/orders/export", { params: { ids: id }, responseType: "blob" });
    const safeClientName = (order?.cliente || "pedido").replace(/[\\/:*?"<>|]/g, "").trim().replace(/\s+/g, "-");
    const orderDate = order?.fechaCreacion ? new Date(order.fechaCreacion).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    saveAs(response.data, `${safeClientName}-${orderDate}.xlsx`);
  }

  async function submitStatusChange(estado: EstadoSolicitud, forceWithoutStock = false) {
    setChangingStatus(true);
    try {
      await api.patch(`/orders/${id}/status`, { estado, forceWithoutStock });
      await loadOrder();
      setNotificationSeverity(forceWithoutStock ? "warning" : "success");
      setNotification(
        forceWithoutStock && estado === "EN_PROCESO"
          ? `Estado actualizado a ${getStatusStyle(estado).label} sin descontar stock por faltante.`
          : `Estado actualizado a ${getStatusStyle(estado).label}.`
      );
      setStockDialogOpen(false);
      setPendingStatus(null);
      setStockShortages([]);
    } catch (error) {
      if (
        !forceWithoutStock &&
        estado === "EN_PROCESO" &&
        axios.isAxiosError<StatusChangeError>(error) &&
        error.response?.data?.code === "STOCK_SHORTAGE_CONFIRMATION_REQUIRED"
      ) {
        setPendingStatus(estado);
        setStockShortages(error.response.data.details?.stockShortages ?? []);
        setStockDialogOpen(true);
        return;
      }

      const message = axios.isAxiosError<StatusChangeError>(error)
        ? error.response?.data?.message ?? "No se pudo actualizar el estado."
        : "No se pudo actualizar el estado.";
      setNotificationSeverity("error");
      setNotification(message);
    } finally {
      setChangingStatus(false);
    }
  }

  async function changeStatus(estado: EstadoSolicitud) {
    if (estado === order?.estado) return;
    await submitStatusChange(estado);
  }

  async function confirmStatusWithoutStock() {
    if (!pendingStatus) return;
    await submitStatusChange(pendingStatus, true);
  }

  async function deleteOrder() {
    if (!order) return;
    setDeleting(true);
    try {
      await api.delete(`/orders/${order.id}`);
      navigate(user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes", {
        state: { notification: "Solicitud eliminada correctamente." }
      });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (!order) return null;

  function cantoLabel(active: boolean, name?: string | null) {
    return active ? name || "Canto" : "";
  }

  function DimensionCell({ value, count }: { value: number | string; count: number }) {
    return (
      <Box sx={{ minWidth: 56 }}>
        <Typography variant="body2">{value}</Typography>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35, mt: 0.35, minHeight: 4 }}>
          {Array.from({ length: count }).map((_, index) => (
            <Box key={index} sx={{ width: 18, height: 3, borderRadius: "999px", bgcolor: "#1f1f1f" }} />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" gap={2}>
        <div>
          <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
            <Typography variant="h4">{order.cliente}</Typography>
            <StatusChip size="small" status={order.estado} />
          </Stack>
          <Typography color="text.secondary">{order.observaciones}</Typography>
          <Typography color="text.secondary">
            Telefono: {order.numeroContacto ?? order.usuario?.telefono ?? "Sin telefono"}
          </Typography>
        </div>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap", width: { xs: "100%", md: "auto" } }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes")} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Volver
          </Button>
          {user?.rol === "ADMIN" ? (
            <Select
              size="small"
              value={order.estado}
              disabled={changingStatus}
              onChange={(event) => changeStatus(event.target.value as EstadoSolicitud)}
              sx={{ minWidth: { sm: 150 }, width: { xs: "100%", sm: "auto" } }}
            >
              {estados.map((estado) => (
                <MenuItem key={estado} value={estado}>
                  {estado}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <StatusChip status={order.estado} />
          )}
          {user?.rol === "ADMIN" && (
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportOrder} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Exportar
            </Button>
          )}
          {user?.rol === "ADMIN" && (
            <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Eliminar
            </Button>
          )}
          {canEditOrder(order.estado) && (
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => navigate(`/pedidos/${order.id}/editar`, { state: { returnTo: `/pedidos/${order.id}` } })} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Editar
            </Button>
          )}
        </Stack>
      </Stack>
      <Paper sx={{ overflowX: "auto", borderRadius: "8px" }}>
        <Table size="small" sx={{ minWidth: 1180 }}>
          <TableHead>
            <TableRow>
              {["Codigo barra", "Material", "Largo", "Ancho", "Cantidad", "CL1", "CL2", "CA1", "CA2", "Rotar", "Centro", "Remark", "Cliente", "Producto"].map((header) => (
                <TableCell key={header} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {order.detalles.map((detail) => (
              <TableRow key={detail.id}>
                <TableCell>{detail.codigoBarra}</TableCell>
                <TableCell>{detail.material}</TableCell>
                <TableCell>
                  <DimensionCell value={detail.largo} count={Number(Boolean(detail.cantoLargo1)) + Number(Boolean(detail.cantoLargo2))} />
                </TableCell>
                <TableCell>
                  <DimensionCell value={detail.ancho} count={Number(Boolean(detail.cantoAncho1)) + Number(Boolean(detail.cantoAncho2))} />
                </TableCell>
                <TableCell>{detail.cantidad}</TableCell>
                <TableCell>{cantoLabel(detail.cantoLargo1, detail.cantoLargo1Nombre)}</TableCell>
                <TableCell>{cantoLabel(detail.cantoLargo2, detail.cantoLargo2Nombre)}</TableCell>
                <TableCell>{cantoLabel(detail.cantoAncho1, detail.cantoAncho1Nombre)}</TableCell>
                <TableCell>{cantoLabel(detail.cantoAncho2, detail.cantoAncho2Nombre)}</TableCell>
                <TableCell>{detail.permiteRotar ? "Si" : "No"}</TableCell>
                <TableCell>{detail.codigoBarraCentro}</TableCell>
                <TableCell>{detail.remark}</TableCell>
                <TableCell>{detail.nombreCliente || order.cliente}</TableCell>
                <TableCell>{detail.nombreProducto}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
      {user?.rol === "ADMIN" && (
        <Paper sx={{ p: 2, borderRadius: "8px" }}>
          <CutOptimizer rows={order.detalles} materials={materials} autoCalculate />
        </Paper>
      )}
      <Paper sx={{ p: 2.5, borderRadius: "8px" }}>
        <Typography variant="h6" gutterBottom>
          Historial
        </Typography>
        <Stack spacing={1}>
          {(order.historial ?? []).map((item) => (
            <Typography key={item.id} variant="body2">
              {new Date(item.fechaCreacion).toLocaleString()} - {item.usuario.nombre} {item.usuario.apellido}: {item.accion} {item.valorAnterior ? `${item.valorAnterior} -> ${item.valorNuevo}` : ""}
            </Typography>
          ))}
        </Stack>
      </Paper>
      <Dialog open={stockDialogOpen} onClose={() => !changingStatus && setStockDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Stock insuficiente</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Alert severity="warning" variant="outlined">
              No hay stock suficiente para pasar esta solicitud a En proceso. Puedes continuar de todos modos y el stock no se descontara.
            </Alert>
            <Stack spacing={1}>
              {stockShortages.map((item) => (
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
          <Button onClick={() => setStockDialogOpen(false)} disabled={changingStatus}>
            Cancelar
          </Button>
          <Button variant="contained" color="warning" onClick={confirmStatusWithoutStock} disabled={changingStatus}>
            Continuar sin descontar stock
          </Button>
        </DialogActions>
      </Dialog>
      <Snackbar
        open={Boolean(notification)}
        autoHideDuration={4200}
        onClose={() => setNotification("")}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ mt: 8 }}
      >
        <Alert
          severity={notificationSeverity}
          variant="filled"
          onClose={() => setNotification("")}
          sx={{
            alignItems: "center",
            background:
              notificationSeverity === "success"
                ? "linear-gradient(135deg, #21c383 0%, #23d6c8 100%)"
                : notificationSeverity === "warning"
                  ? "linear-gradient(135deg, #e6a117 0%, #ffcc4d 100%)"
                  : "linear-gradient(135deg, #d84b63 0%, #f07d62 100%)",
            borderRadius: "8px",
            boxShadow:
              notificationSeverity === "success"
                ? "0 18px 42px rgba(33, 195, 131, 0.28)"
                : notificationSeverity === "warning"
                  ? "0 18px 42px rgba(230, 161, 23, 0.28)"
                  : "0 18px 42px rgba(216, 75, 99, 0.28)",
            color: notificationSeverity === "warning" ? "#2b1a00" : undefined,
            fontWeight: 800
          }}
        >
          {notification}
        </Alert>
      </Snackbar>
      {user?.rol === "ADMIN" && <DeleteOrderDialog order={order} open={deleteOpen} loading={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={deleteOrder} />}
    </Stack>
  );
}
