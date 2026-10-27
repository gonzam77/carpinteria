import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import BadgeOutlinedIcon from "@mui/icons-material/BadgeOutlined";
import CarpenterOutlinedIcon from "@mui/icons-material/CarpenterOutlined";
import CloseIcon from "@mui/icons-material/Close";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import EngineeringOutlinedIcon from "@mui/icons-material/EngineeringOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import PersonAddAltOutlinedIcon from "@mui/icons-material/PersonAddAltOutlined";
import PersonOutlineIcon from "@mui/icons-material/PersonOutline";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import SaveIcon from "@mui/icons-material/Save";
import { Alert, Button, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import axios from "axios";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { fieldIcon } from "../components/fieldIcon";
import { MetricGrid, MetricTile } from "../components/MetricTile";
import { SectionHeading } from "../components/SectionHeading";
import { Rol, User } from "../types";

/** El rol como se lee en pantalla (el valor que se guarda no cambia). */
const rolLabels: Record<Rol, string> = { ADMIN: "Administrador", CARPINTERO: "Carpintero", OPERARIO: "Operario" };

type UserForm = {
  nombre: string;
  apellido: string;
  email: string;
  telefono: string;
  password: string;
  rol: Rol;
};

const emptyForm: UserForm = {
  nombre: "",
  apellido: "",
  email: "",
  telefono: "",
  password: "",
  rol: "CARPINTERO"
};

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formError, setFormError] = useState("");

  async function loadUsers() {
    const response = await api.get<User[]>("/users");
    setUsers(response.data);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  function editUser(user: User) {
    setEditingId(user.id);
    setForm({
      nombre: user.nombre,
      apellido: user.apellido,
      email: user.email,
      telefono: user.telefono ?? "",
      password: "",
      rol: user.rol
    });
  }

  function resetForm() {
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setFormError("");
    const payload = {
      nombre: form.nombre,
      apellido: form.apellido,
      email: form.email,
      telefono: form.telefono,
      rol: form.rol,
      ...(form.password ? { password: form.password } : {})
    };

    try {
      if (editingId) {
        await api.put(`/users/${editingId}`, payload);
      } else {
        await api.post("/users", { ...payload, password: form.password });
      }
    } catch (error) {
      // Sin este catch el 409 de email duplicado quedaba como promesa
      // rechazada: el usuario apretaba Crear Usuario y no pasaba nada visible.
      setFormError(
        axios.isAxiosError<{ message?: string }>(error)
          ? error.response?.data?.message ?? "No se pudo guardar el usuario."
          : "No se pudo guardar el usuario."
      );
      return;
    }

    resetForm();
    await loadUsers();
  }

  const columns = useMemo<GridColDef<User>[]>(
    () => [
      { field: "nombre", headerName: "Nombre", flex: 1 },
      { field: "apellido", headerName: "Apellido", flex: 1 },
      { field: "email", headerName: "Email", flex: 1.5 },
      { field: "telefono", headerName: "Teléfono", flex: 1, valueGetter: (_value, row) => row.telefono ?? "-" },
      { field: "rol", headerName: "Rol", width: 150, valueFormatter: (value: Rol) => rolLabels[value] ?? value },
      {
        field: "acciones",
        headerName: "Acciones",
        width: 110,
        sortable: false,
        renderCell: ({ row }) => (
          <Tooltip title="Editar">
            <IconButton aria-label="Editar" onClick={() => editUser(row)}>
              <EditOutlinedIcon />
            </IconButton>
          </Tooltip>
        )
      }
    ],
    []
  );

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Gestión de usuarios</Typography>
        <Typography color="text.secondary">Alta y administración de perfiles con acceso al sistema.</Typography>
      </Stack>
      <MetricGrid>
        <MetricTile icon={<GroupOutlinedIcon />} label="Usuarios" value={users.length} />
        <MetricTile icon={<AdminPanelSettingsOutlinedIcon />} label="Administradores" value={users.filter((user) => user.rol === "ADMIN").length} tone="neutral" />
        <MetricTile icon={<CarpenterOutlinedIcon />} label="Carpinteros" value={users.filter((user) => user.rol === "CARPINTERO").length} tone="neutral" />
        <MetricTile icon={<EngineeringOutlinedIcon />} label="Operarios" value={users.filter((user) => user.rol === "OPERARIO").length} tone="neutral" />
      </MetricGrid>
      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px", overflow: "hidden" }}>
        <SectionHeading
          icon={editingId ? <EditOutlinedIcon /> : <PersonAddAltOutlinedIcon />}
          title={editingId ? "Editar usuario" : "Nuevo usuario"}
          subtitle={editingId ? "Dejá la contraseña vacía para no cambiarla." : "Los datos con los que la persona entra al sistema."}
          sx={{ mb: 2 }}
        />
        <Stack
          component="form"
          onSubmit={submit}
          direction={{ xs: "column", lg: "row" }}
          spacing={2}
          useFlexGap
          sx={{
            alignItems: { lg: "center" },
            flexWrap: "wrap",
            "& .MuiTextField-root": { flex: { lg: "1 1 170px" }, minWidth: { lg: 160 } }
          }}
        >
          <TextField fullWidth label="Nombre" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required slotProps={{ input: fieldIcon(<PersonOutlineIcon />) }} />
          <TextField fullWidth label="Apellido" value={form.apellido} onChange={(event) => setForm({ ...form, apellido: event.target.value })} required slotProps={{ input: fieldIcon(<BadgeOutlinedIcon />) }} />
          <TextField
            fullWidth
            label="Email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            required
            sx={{ flex: { lg: "1.5 1 220px" } }}
            slotProps={{ input: fieldIcon(<EmailOutlinedIcon />) }}
          />
          <TextField fullWidth label="Teléfono" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} slotProps={{ input: fieldIcon(<PhoneOutlinedIcon />) }} />
          <TextField
            fullWidth
            label="Contraseña"
            type="password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            required={!editingId}
            placeholder={editingId ? "Opcional al editar" : ""}
            slotProps={{ input: fieldIcon(<LockOutlinedIcon />) }}
          />
          <TextField
            fullWidth
            select
            label="Rol"
            value={form.rol}
            onChange={(event) => setForm({ ...form, rol: event.target.value as Rol })}
            sx={{ minWidth: { lg: 170 } }}
            slotProps={{ input: fieldIcon(<AdminPanelSettingsOutlinedIcon />) }}
          >
            <MenuItem value="CARPINTERO">{rolLabels.CARPINTERO}</MenuItem>
            <MenuItem value="OPERARIO">{rolLabels.OPERARIO}</MenuItem>
            <MenuItem value="ADMIN">{rolLabels.ADMIN}</MenuItem>
          </TextField>
          {/* Cancelar a la izquierda y Guardar a la derecha (en el celular, apilados con el principal abajo). */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ flexShrink: 0, ml: { lg: "auto" }, justifyContent: "flex-end" }}>
            {editingId && (
              <Button type="button" variant="outlined" startIcon={<CloseIcon />} onClick={resetForm} sx={{ width: { xs: "100%", sm: "auto" } }}>
                Cancelar
              </Button>
            )}
            <Button type="submit" variant="contained" startIcon={editingId ? <SaveIcon /> : <PersonAddAltOutlinedIcon />} sx={{ width: { xs: "100%", sm: "auto" } }}>
              {editingId ? "Guardar" : "Crear Usuario"}
            </Button>
          </Stack>
        </Stack>
        {formError && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setFormError("")}>
            {formError}
          </Alert>
        )}
      </Paper>
      <Paper sx={{ height: 520, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
        <DataGrid rows={users} columns={columns} disableRowSelectionOnClick sx={{ minWidth: { xs: 860, md: "100%" } }} />
      </Paper>
    </Stack>
  );
}
