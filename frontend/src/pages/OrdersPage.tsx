import DownloadIcon from "@mui/icons-material/Download";
import EditIcon from "@mui/icons-material/Edit";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { Button, Chip, IconButton, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, GridColDef, GridRowSelectionModel } from "@mui/x-data-grid";
import { saveAs } from "file-saver";
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { Order } from "../types";

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  const navigate = useNavigate();
  const { user } = useAuth();

  async function loadOrders() {
    const response = await api.get<Order[]>("/orders", { params: { search, desde: from, hasta: to } });
    setOrders(response.data);
  }

  useEffect(() => {
    loadOrders();
  }, []);

  async function exportOrders(ids: string[]) {
    const response = await api.get("/orders/export", { params: { ids: ids.join(",") }, responseType: "blob" });
    saveAs(response.data, "pedidos-carpinteria.xlsx");
  }

  const columns = useMemo<GridColDef<Order>[]>(
    () => [
      { field: "cliente", headerName: "Cliente/Obra", flex: 1, minWidth: 180 },
      { field: "estado", headerName: "Estado", width: 140, renderCell: ({ value }) => <Chip size="small" label={value} /> },
      { field: "fechaCreacion", headerName: "Fecha", width: 150, valueGetter: (_, row) => new Date(row.fechaCreacion).toLocaleDateString() },
      { field: "piezas", headerName: "Piezas", width: 100, valueGetter: (_, row) => row.detalles.length },
      { field: "usuario", headerName: "Carpintero", width: 180, valueGetter: (_, row) => (row.usuario ? `${row.usuario.nombre} ${row.usuario.apellido}` : "") },
      {
        field: "acciones",
        headerName: "",
        width: 150,
        sortable: false,
        renderCell: ({ row }) => (
          <>
            <Tooltip title="Ver">
              <IconButton onClick={() => navigate(`/pedidos/${row.id}`)}>
                <VisibilityIcon />
              </IconButton>
            </Tooltip>
            {(user?.rol === "ADMIN" || row.estado === "PENDIENTE") && (
              <Tooltip title="Editar">
              <IconButton onClick={() => navigate(`/pedidos/${row.id}/editar`, { state: { returnTo: user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes" } })}>
                <EditIcon />
              </IconButton>
              </Tooltip>
            )}
          </>
        )
      }
    ],
    [navigate, user]
  );

  return (
    <Stack spacing={2}>
      <Typography variant="h4">{user?.rol === "ADMIN" ? "Solicitudes recibidas" : "Mis solicitudes"}</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="Buscar" value={search} onChange={(event) => setSearch(event.target.value)} />
          <TextField label="Desde" type="date" value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
          <TextField label="Hasta" type="date" value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
          <Button variant="outlined" onClick={loadOrders}>
            Filtrar
          </Button>
          {user?.rol === "ADMIN" && (
            <Button variant="contained" startIcon={<DownloadIcon />} disabled={!selection.length} onClick={() => exportOrders(selection as string[])}>
              Exportar seleccion
            </Button>
          )}
        </Stack>
      </Paper>
      <Paper sx={{ height: 560 }}>
        <DataGrid rows={orders} columns={columns} checkboxSelection onRowSelectionModelChange={setSelection} disableRowSelectionOnClick />
      </Paper>
    </Stack>
  );
}
