import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Alert, Button, MenuItem, Paper, Select, Snackbar, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
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

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [notification, setNotification] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  async function changeStatus(estado: EstadoSolicitud) {
    if (estado === order?.estado) return;

    await api.patch(`/orders/${id}/status`, { estado });
    await loadOrder();
    setNotification(`Estado actualizado a ${getStatusStyle(estado).label}.`);
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
            <Select size="small" value={order.estado} onChange={(event) => changeStatus(event.target.value as EstadoSolicitud)} sx={{ minWidth: { sm: 150 }, width: { xs: "100%", sm: "auto" } }}>
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
          <Button color="error" variant="outlined" startIcon={<DeleteIcon />} onClick={() => setDeleteOpen(true)} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Eliminar
          </Button>
          {(user?.rol === "ADMIN" || order.estado === "PENDIENTE") && (
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
                <TableCell>{detail.largo}</TableCell>
                <TableCell>{detail.ancho}</TableCell>
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
      <Snackbar
        open={Boolean(notification)}
        autoHideDuration={4200}
        onClose={() => setNotification("")}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ mt: 8 }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setNotification("")}
          sx={{
            alignItems: "center",
            background: "linear-gradient(135deg, #21c383 0%, #23d6c8 100%)",
            borderRadius: "8px",
            boxShadow: "0 18px 42px rgba(33, 195, 131, 0.28)",
            fontWeight: 800
          }}
        >
          {notification}
        </Alert>
      </Snackbar>
      <DeleteOrderDialog order={order} open={deleteOpen} loading={deleting} onCancel={() => setDeleteOpen(false)} onConfirm={deleteOrder} />
    </Stack>
  );
}
