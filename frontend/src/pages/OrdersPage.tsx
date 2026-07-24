import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import DescriptionIcon from "@mui/icons-material/Description";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, GridColDef, GridRowSelectionModel } from "@mui/x-data-grid";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import { DeleteOrderDialog } from "../components/DeleteOrderDialog";
import { OrderReceiptDialog } from "../components/OrderReceiptDialog";
import { StatusChip } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { EstadoSolicitud, Order } from "../types";

const statusOptions: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA", "RECHAZADA"];

function canEditOrder(estado: EstadoSolicitud) {
  return estado !== "EN_PROCESO" && estado !== "TERMINADA" && estado !== "ENTREGADA";
}

function getValidStatus(value: string | null): EstadoSolicitud | "" {
  return statusOptions.includes(value as EstadoSolicitud) ? (value as EstadoSolicitud) : "";
}

function formatMoney(value: number) {
  return value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });
}

function normalizeWhatsappPhone(phone?: string | null) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("549")) return digits;
  if (digits.startsWith("54")) {
    const rest = digits.slice(2);
    return rest.startsWith("9") ? digits : `549${rest}`;
  }
  const withoutLeadingZero = digits.replace(/^0+/, "");
  return `549${withoutLeadingZero}`;
}

function buildWhatsappLink(order: Order) {
  const phone = normalizeWhatsappPhone(order.numeroContacto);
  if (!phone) return "";

  const orderLabel = order.id.slice(0, 8).toUpperCase();
  const message = `Hola ${order.cliente}, te avisamos que tu pedido ${orderLabel} ya esta listo para retirar. Cuando quieras podes pasar a buscarlo. Si necesitas coordinar horario o tenes alguna consulta, escribinos por este medio.`;
  return `https://api.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;
}

export function OrdersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<EstadoSolicitud | "">(() => getValidStatus(searchParams.get("estado")));
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [orderToPreview, setOrderToPreview] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  async function loadOrders(nextStatus = status) {
    const response = await api.get<Order[]>("/orders", { params: { search, estado: nextStatus || undefined, desde: from, hasta: to } });
    setOrders(response.data);
  }

  useEffect(() => {
    const nextStatus = getValidStatus(searchParams.get("estado"));
    setStatus(nextStatus);
    loadOrders(nextStatus);
  }, [searchParams]);

  function applyFilters() {
    const nextParams = new URLSearchParams(searchParams);
    if (status) nextParams.set("estado", status);
    else nextParams.delete("estado");
    setSearchParams(nextParams);
    loadOrders();
  }

  function handleStatusChange(nextStatus: EstadoSolicitud | "") {
    setStatus(nextStatus);
    const nextParams = new URLSearchParams(searchParams);
    if (nextStatus) nextParams.set("estado", nextStatus);
    else nextParams.delete("estado");
    setSearchParams(nextParams);
  }

  async function exportOrders(ids: string[]) {
    const response = await api.get("/orders/export", { params: { ids: ids.join(",") }, responseType: "blob" });
    saveAs(response.data, "pedidos-carpinteria.xlsx");
  }

  async function deleteOrder(order: Order) {
    setDeleting(true);
    try {
      await api.delete(`/orders/${order.id}`);
      await loadOrders();
    } finally {
      setDeleting(false);
      setOrderToDelete(null);
    }
  }

  const columns = useMemo<GridColDef<Order>[]>(
    () => [
      {
        field: "acciones",
        headerName: "Acciones",
        width: 260,
        sortable: false,
        headerClassName: "orders-actions-column",
        cellClassName: "orders-actions-column",
        renderCell: ({ row }) => {
          const whatsappLink = buildWhatsappLink(row);
          const canNotifyByWhatsapp = Boolean(whatsappLink);

          return (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", gap: 0.5 }}>
              <Tooltip title="Ver">
                <IconButton onClick={() => navigate(`/pedidos/${row.id}`)}>
                  <VisibilityIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="Comprobante">
                <IconButton onClick={() => setOrderToPreview(row)}>
                  <DescriptionIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title={canNotifyByWhatsapp ? "Avisar por WhatsApp" : "La solicitud no tiene telefono de contacto"}>
                <span>
                  <IconButton
                    sx={{ color: canNotifyByWhatsapp ? "#25D366" : undefined }}
                    disabled={!canNotifyByWhatsapp}
                    onClick={() => {
                      if (!whatsappLink) return;
                      window.open(whatsappLink, "_blank", "noopener,noreferrer");
                    }}
                  >
                    <WhatsAppIcon />
                  </IconButton>
                </span>
              </Tooltip>
              <Box sx={{ width: 40, display: "flex", justifyContent: "center" }}>
                {canEditOrder(row.estado) ? (
                  <Tooltip title="Editar">
                    <IconButton onClick={() => navigate(`/pedidos/${row.id}/editar`, { state: { returnTo: user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes" } })}>
                      <EditIcon />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </Box>
              <Box sx={{ width: 40, display: "flex", justifyContent: "center" }}>
                {user?.rol === "ADMIN" ? (
                  <Tooltip title="Eliminar">
                    <IconButton color="error" onClick={() => setOrderToDelete(row)}>
                      <DeleteIcon />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </Box>
            </Box>
          );
        }
      },
      { field: "cliente", headerName: "Cliente", flex:1, minWidth: 190 },
      { field: "estado", headerName: "Estado", width: 150, renderCell: ({ value }) => <StatusChip size="small" status={value as EstadoSolicitud} /> },
      { field: "fechaCreacion", headerName: "Fecha", width: 190, valueGetter: (_, row) => new Date(row.fechaCreacion).toLocaleDateString("es-AR", {day:"2-digit",month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit",}) },
      { field: "piezas", headerName: "Piezas", width: 100, valueGetter: (_, row) => row.detalles.reduce((total, detail) => total + Number(detail.cantidad || 0), 0) },
      { field: "presupuestoEstimado", headerName: "Total estimado", width: 170, valueFormatter: (value) => formatMoney(Number(value ?? 0)) },
      // { field: "usuario", headerName: "Carpintero", width: 180, valueGetter: (_, row) => (row.usuario ? `${row.usuario.nombre} ${row.usuario.apellido}` : "") }
    ],
    [navigate, user]
  );

  return (
    <Stack spacing={2.5}>
      <Stack spacing={0.5}>
        <Typography variant="h4">{user?.rol === "ADMIN" ? "Solicitudes recibidas" : "Mis solicitudes"}</Typography>
        <Typography color="text.secondary">Seguimiento de pedidos, filtros rapidos y exportacion de cortes.</Typography>
      </Stack>
      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px", overflow: "hidden" }}>
        <Stack
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          useFlexGap
          sx={{
            alignItems: { lg: "center" },
            flexWrap: "wrap",
            "& .MuiTextField-root": { flex: { lg: "1 1 150px" }, minWidth: { lg: 150 } }
          }}
        >
          <TextField fullWidth label="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ flex: { lg: "2 1 220px" } }} />
          <TextField fullWidth select label="Estado" value={status} onChange={(event) => handleStatusChange(event.target.value as EstadoSolicitud | "")} sx={{ minWidth: { lg: 160 } }}>
            <MenuItem value="">Todos</MenuItem>
            {statusOptions.map((option) => (
              <MenuItem key={option} value={option}>
                {option}
              </MenuItem>
            ))}
          </TextField>
          <TextField fullWidth label="Desde" type="date" value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField fullWidth label="Hasta" type="date" value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="outlined" onClick={applyFilters} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
            Filtrar
          </Button>
          {user?.rol === "ADMIN" && (
            <Button sx={{ color: "#fff", flexShrink: 0, width: { xs: "100%", sm: "auto" } }} variant="contained" startIcon={<DownloadIcon />} disabled={!selection.length} onClick={() => exportOrders(selection as string[])}>
              Exportar seleccion
            </Button>
          )}
        </Stack>
      </Paper>
      <Paper sx={{ height: { xs: 520, md: 560 }, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
        <DataGrid
          rows={orders}
          columns={columns}
          checkboxSelection
          onRowSelectionModelChange={setSelection}
          disableRowSelectionOnClick
          sx={{
            minWidth: { xs: 980, md: "100%" },
            "& .orders-actions-column": {
              position: "sticky",
              right: 0,
              zIndex: 2,
              bgcolor: "background.paper"
            },
            "& .MuiDataGrid-columnHeader.orders-actions-column": {
              zIndex: 4
            },
            "& .MuiDataGrid-cell.orders-actions-column": {
              zIndex: 3
            }
          }}
        />
      </Paper>
      <DeleteOrderDialog order={orderToDelete} open={Boolean(orderToDelete)} loading={deleting} onCancel={() => setOrderToDelete(null)} onConfirm={() => orderToDelete && deleteOrder(orderToDelete)} />
      <OrderReceiptDialog order={orderToPreview} open={Boolean(orderToPreview)} onClose={() => setOrderToPreview(null)} />
    </Stack>
  );
}
