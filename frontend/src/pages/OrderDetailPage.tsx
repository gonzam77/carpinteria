import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import HistoryIcon from "@mui/icons-material/History";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import {
  Alert,
  type AlertColor,
  Box,
  Button,
  Chip,
  Divider,
  InputAdornment,
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
import { cuttingLaborCost, formatMoney } from "../lib/orderBudget";
import { buildWhatsappLink } from "../lib/whatsapp";
import { EstadoSolicitud, Material, Order } from "../types";
import { useErrorDialog } from "../context/ErrorDialogContext";
import { SectionHeading } from "../components/SectionHeading";

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
  const { showError } = useErrorDialog();
  const [notificationSeverity, setNotificationSeverity] = useState<AlertColor>("success");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [stockDialogOpen, setStockDialogOpen] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<EstadoSolicitud | null>(null);
  const [stockShortages, setStockShortages] = useState<StockShortage[]>([]);
  const [completionDialogOpen, setCompletionDialogOpen] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  /** Placas que da el plano en vivo. Null hasta que el optimizador termina un calculo. */
  const [livePlacas, setLivePlacas] = useState<number | null>(null);
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
      // En la ventana del medio (2026-10-13).
      showError({ title: "No se pudo actualizar el estado", message });
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

  // Unica forma de mover el snapshot: el presupuesto no se recalcula solo al abrir la pagina, asi
  // que un ajuste de valores en Materiales no le cambia el total a un pedido ya presupuestado.
  async function recalculateBudget() {
    if (!order) return;
    setRecalculating(true);
    try {
      await api.post(`/orders/${order.id}/recalcular-presupuesto`);
      await loadOrder();
      setNotificationSeverity("success");
      setNotification("Presupuesto recalculado con los precios y la configuración de hoy.");
    } catch (error) {
      const message = axios.isAxiosError<StatusChangeError>(error)
        ? error.response?.data?.message ?? "No se pudo recalcular el presupuesto."
        : "No se pudo recalcular el presupuesto.";
      showError({ title: "No se pudo recalcular el presupuesto", message });
    } finally {
      setRecalculating(false);
    }
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
        <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0.35, mt: 0.35, minHeight: 4 }}>
          {Array.from({ length: count }).map((_, index) => (
            <Box key={index} sx={{ width: 18, height: 3, borderRadius: "999px", bgcolor: "#1f1f1f" }} />
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Stack spacing={3}>
      {/* Volver siempre a la izquierda, arriba del titulo; las acciones de la solicitud a la derecha. */}
      <Box>
        <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(backTo)} sx={{ width: { xs: "100%", sm: "auto" } }}>
          Volver
        </Button>
      </Box>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" gap={2}>
        <div>
          <Stack direction="row" spacing={1.25} alignItems="center" flexWrap="wrap">
            <Typography variant="h4">{order.cliente}</Typography>
            <StatusChip size="small" status={order.estado} />
          </Stack>
          {order.observaciones && (
            <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary", mt: 0.5 }}>
              <NotesOutlinedIcon fontSize="small" aria-hidden />
              <Typography color="text.secondary">{order.observaciones}</Typography>
            </Stack>
          )}
          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ color: "text.secondary", mt: 0.5 }}>
            <PhoneOutlinedIcon fontSize="small" aria-hidden />
            <Typography color="text.secondary">
              Teléfono: {order.numeroContacto ?? order.usuario?.telefono ?? "Sin teléfono"}
            </Typography>
          </Stack>
        </div>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} useFlexGap sx={{ flexWrap: "wrap", width: { xs: "100%", md: "auto" } }}>
          {user?.rol === "ADMIN" ? (
            <Select
              size="small"
              value={order.estado}
              disabled={changingStatus}
              onChange={(event) => changeStatus(event.target.value as EstadoSolicitud)}
              inputProps={{ "aria-label": "Estado de la solicitud" }}
              startAdornment={
                <InputAdornment position="start" aria-hidden>
                  <FlagOutlinedIcon />
                </InputAdornment>
              }
              sx={{ minWidth: { sm: 180 }, width: { xs: "100%", sm: "auto" } }}
            >
              {estados.map((estado) => (
                <MenuItem key={estado} value={estado}>
                  {getStatusStyle(estado).label}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <StatusChip status={order.estado} />
          )}
          {user?.rol === "ADMIN" && (
            <Button color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={() => setDeleteOpen(true)} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Eliminar
            </Button>
          )}
          {/* Una solicitud de modulos tiene su detalle aparte: aca no se edita (el formulario de corte no la puede guardar). */}
          {canEditOrder(order.estado) && order.tipo !== "MODULOS" && (
            <Button variant="outlined" startIcon={<EditOutlinedIcon />} onClick={() => navigate(`/pedidos/${order.id}/editar`, { state: { returnTo: `/pedidos/${order.id}` } })} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Editar
            </Button>
          )}
          {user?.rol === "ADMIN" && (
            <Button variant="contained" startIcon={<FileDownloadOutlinedIcon />} onClick={exportOrder} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Exportar
            </Button>
          )}
        </Stack>
      </Stack>
      <Paper sx={{ borderRadius: "8px", overflow: "hidden" }}>
        <Box sx={{ px: { xs: 1.5, sm: 2 }, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <SectionHeading
            icon={<ViewInArOutlinedIcon />}
            title="Piezas solicitadas"
            action={
              <Chip
                color="primary"
                variant="outlined"
                label={`${order.detalles.length} piezas, ${order.detalles.reduce((total, detail) => total + Number(detail.cantidad || 0), 0)} unidades`}
                sx={{ fontWeight: 800 }}
              />
            }
          />
        </Box>
        <Box sx={{ overflowX: "auto" }}>
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
        </Box>
      </Paper>
      {/* El presupuesto es el snapshot congelado del pedido, el que vio el cliente en su constancia. El plano
          de abajo se recalcula con los precios y la configuracion de hoy y por eso no muestra importes: si se
          ajustaron valores despues de cargar el pedido, los dos numeros no coincidirian. */}
      <Paper sx={{ p: 2.5, borderRadius: "8px" }}>
        <SectionHeading
          icon={<RequestQuoteOutlinedIcon />}
          title="Presupuesto estimado"
          sx={{ mb: 1.5 }}
          action={
            user?.rol === "ADMIN" ? (
              <Button variant="outlined" startIcon={<RefreshIcon />} onClick={recalculateBudget} disabled={recalculating}>
                {recalculating ? "Recalculando..." : "Recalcular presupuesto"}
              </Button>
            ) : undefined
          }
        />
        {order.faltanteStock && (
          <Alert severity="warning" variant="outlined" sx={{ mb: 1.5 }}>
            Al presupuestar no había stock suficiente para todas las placas de esta solicitud.
          </Alert>
        )}
        <Stack spacing={1}>
          <Typography>Placas estimadas: {order.placasEstimadas}</Typography>
          <Typography>Costo placas: {formatMoney(order.costoPlacas)}</Typography>
          <Typography>Mano de obra de cortes: {formatMoney(cuttingLaborCost(order))}</Typography>
          <Typography>Costo material de canto: {formatMoney(order.costoMaterialCantos)}</Typography>
          <Typography>Costo pegado de canto: {formatMoney(order.costoPegadoCantos)}</Typography>
          <Typography>Total cantos (material + pegado): {formatMoney(order.costoCantos)}</Typography>
          <Typography color="text.secondary">Metros de canto estimados: {order.metrosCanto.toFixed(2)} m</Typography>
          <Divider sx={{ my: 0.5 }} />
          <Typography variant="h5" fontWeight={900}>
            {formatMoney(order.presupuestoEstimado)}
          </Typography>
        </Stack>
        {livePlacas !== null && livePlacas > 0 && livePlacas !== order.placasEstimadas && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1.5 }}>
            El plano actual da {livePlacas} placas contra {order.placasEstimadas} del presupuesto guardado
            {user?.rol === "ADMIN" ? "; recalculá si querés actualizarlo." : "."}
          </Typography>
        )}
      </Paper>
      {user?.rol === "ADMIN" && (
        <Paper sx={{ p: 2, borderRadius: "8px" }}>
          <CutOptimizer rows={order.detalles} materials={materials} autoCalculate hideCosts onBoardsCalculated={setLivePlacas} />
        </Paper>
      )}
      <Paper sx={{ p: 2.5, borderRadius: "8px" }}>
        <SectionHeading icon={<HistoryIcon />} title="Historial" sx={{ mb: 1.5 }} />
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
