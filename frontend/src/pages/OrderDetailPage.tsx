import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { Button, Chip, MenuItem, Paper, Select, Stack, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import { saveAs } from "file-saver";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/client";
import { CutOptimizer } from "../components/CutOptimizer";
import { useAuth } from "../context/AuthContext";
import { EstadoSolicitud, Material, Order } from "../types";

const estados: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA", "RECHAZADA"];

export function OrderDetailPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [materials, setMaterials] = useState<Material[]>([]);
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
    api.get<Material[]>("/materiales", { params: { incluirInactivos: true } }).then((response) => setMaterials(response.data));
  }, [user]);

  async function exportOrder() {
    const response = await api.get("/orders/export", { params: { ids: id }, responseType: "blob" });
    saveAs(response.data, `pedido-${id}.xlsx`);
  }

  async function changeStatus(estado: EstadoSolicitud) {
    await api.patch(`/orders/${id}/status`, { estado });
    loadOrder();
  }

  if (!order) return null;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} alignItems={{ md: "center" }} justifyContent="space-between" gap={2}>
        <div>
          <Typography variant="h4">{order.cliente}</Typography>
          <Typography color="text.secondary">{order.observaciones}</Typography>
          <Typography color="text.secondary">
            Telefono: {order.numeroContacto ?? order.usuario?.telefono ?? "Sin telefono"}
          </Typography>
        </div>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<ArrowBackIcon />} onClick={() => navigate(user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes")}>
            Volver
          </Button>
          {user?.rol === "ADMIN" ? (
            <Select size="small" value={order.estado} onChange={(event) => changeStatus(event.target.value as EstadoSolicitud)}>
              {estados.map((estado) => (
                <MenuItem key={estado} value={estado}>
                  {estado}
                </MenuItem>
              ))}
            </Select>
          ) : (
            <Chip label={order.estado} />
          )}
          {user?.rol === "ADMIN" && (
            <Button variant="outlined" startIcon={<DownloadIcon />} onClick={exportOrder}>
              Exportar
            </Button>
          )}
          {(user?.rol === "ADMIN" || order.estado === "PENDIENTE") && (
            <Button variant="contained" startIcon={<EditIcon />} onClick={() => navigate(`/pedidos/${order.id}/editar`, { state: { returnTo: `/pedidos/${order.id}` } })}>
              Editar
            </Button>
          )}
        </Stack>
      </Stack>
      <Paper sx={{ overflowX: "auto" }}>
        <Table size="small">
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
                <TableCell>{detail.cantoLargo1 ? "Canto" : ""}</TableCell>
                <TableCell>{detail.cantoLargo2 ? "Canto" : ""}</TableCell>
                <TableCell>{detail.cantoAncho1 ? "Canto" : ""}</TableCell>
                <TableCell>{detail.cantoAncho2 ? "Canto" : ""}</TableCell>
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
        <Paper sx={{ p: 2 }}>
          <CutOptimizer rows={order.detalles} materials={materials} autoCalculate />
        </Paper>
      )}
      <Paper sx={{ p: 2 }}>
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
    </Stack>
  );
}
