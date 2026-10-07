import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
  type AlertColor,
  Box,
  Button,
  MenuItem,
  Paper,
  Select,
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
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CutOptimizer } from "../components/CutOptimizer";
import { DeleteOrderDialog } from "../components/DeleteOrderDialog";
import { ActionSnackbar, OrderCompletedDialog, StockShortageDialog, type StockShortage } from "../components/OrderStatusDialogs";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { buildWhatsappLink } from "../lib/whatsapp";
import { EstadoSolicitud, Material, Order } from "../types";

const estados: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA", "RECHAZADA"];

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
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // A donde vuelve: la pantalla que lo abrio o el listado de siempre.
  const returnTo = (location.state as { returnTo?: unknown } | null)?.returnTo;
  const backTo =
    typeof returnTo === "string" && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes";

  async function loadOrder() {
    const response = await api.get<Order>(`/orders/${id}`);
    setOrder(response.data);
  }

  useEffect(() => {
    loadOrder();
  }, [id]);

  // Una solicitud de modulos tiene su propio detalle en /modulos/:id (spec §9.3): un link viejo a /pedidos/:id se
  // corrige sin sumar un paso al historial (DECISIONES 43).
  useEffect(() => {
    // Solo con la solicitud de la URL: nunca se redirige por una que quedo de otra pantalla.
    if (order?.tipo === "MODULOS" && order.id === id) navigate(`/modulos/${order.id}`, { replace: true, state: location.state });
  }, [order, id]);

  useEffect(() => {
    if (user?.rol !== "ADMIN") return;
    api.get<Material[]>("/materiales", { params: { incluirInactivos: true } }).then((response) => setMaterials(response.data));
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
      const shouldPromptCompletion = estado === "TERMINADA" && order?.estado !== "TERMINADA";
      await api.patch(`/orders/${id}/status`, { estado, forceWithoutStock });
      await loadOrder();
      setNotificationSeverity(forceWithoutStock ? "warning" : "success");
      setNotification(
        forceWithoutStock
          ? `Estado actualizado a ${getStatusStyle(estado).label} sin descontar stock por faltante.`
          : `Estado actualizado a ${getStatusStyle(estado).label}.`
      );
      setStockDialogOpen(false);
      setPendingStatus(null);
      setStockShortages([]);
      if (shouldPromptCompletion) {
        setCompletionDialogOpen(true);
      }
    } catch (error) {
      if (
        // En proceso, terminado y entregado descuentan stock si el pedido todavia no lo tiene descontado.
        !forceWithoutStock &&
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
      navigate(backTo, {
        state: { notification: "Solicitud eliminada correctamente." }
      });
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (!order) return null;

  const whatsappLink = buildWhatsappLink(order.numeroContacto ?? order.usuario?.telefono, order.cliente, order.id.slice(0, 8).toUpperCase());

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
            Teléfono: {order.numeroContacto ?? order.usuario?.telefono ?? "Sin teléfono"}
          </Typography>
        </div>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap", width: { xs: "100%", md: "auto" } }}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)} sx={{ width: { xs: "100%", sm: "auto" } }}>
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
            <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Eliminar
            </Button>
          )}
          {/* Una solicitud de modulos tiene su detalle aparte: aca no se edita (el formulario de corte no la puede guardar). */}
          {canEditOrder(order.estado) && order.tipo !== "MODULOS" && (
            <Button variant="outlined" startIcon={<EditIcon />} onClick={() => navigate(`/pedidos/${order.id}/editar`, { state: { returnTo: `/pedidos/${order.id}` } })} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Editar
            </Button>
          )}
          {user?.rol === "ADMIN" && (
            <Button variant="contained" startIcon={<DownloadIcon />} onClick={exportOrder} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Exportar
            </Button>
          )}
        </Stack>
      </Stack>
      <Paper sx={{ overflowX: "auto", borderRadius: "8px" }}>
        <Table size="small" sx={{ minWidth: 920 }}>
          <TableHead>
            <TableRow>
              {["Material", "Largo", "Ancho", "Cantidad", "CL1", "CL2", "CA1", "CA2", "Rotar", "Cliente", "Producto"].map((header) => (
                <TableCell key={header} sx={{ fontWeight: 700, whiteSpace: "nowrap" }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {order.detalles.map((detail) => (
              <TableRow key={detail.id}>
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
                <TableCell>{detail.permiteRotar ? "Sí" : "No"}</TableCell>
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
      <StockShortageDialog
        open={stockDialogOpen}
        estadoLabel={pendingStatus ? getStatusStyle(pendingStatus).label : "ese estado"}
        shortages={stockShortages}
        busy={changingStatus}
        onCancel={() => setStockDialogOpen(false)}
        onConfirm={confirmStatusWithoutStock}
      />
      <OrderCompletedDialog open={completionDialogOpen} whatsappLink={whatsappLink} onClose={() => setCompletionDialogOpen(false)} />
      <ActionSnackbar message={notification} severity={notificationSeverity} onClose={() => setNotification("")} />
      {user?.rol === "ADMIN" && <DeleteOrderDialog order={order} open={deleteOpen} loading={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={deleteOrder} />}
    </Stack>
  );
}
