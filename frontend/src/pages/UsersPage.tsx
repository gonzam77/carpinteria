import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import { Button, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Rol, User } from "../types";

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
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      nombre: form.nombre,
      apellido: form.apellido,
      email: form.email,
      telefono: form.telefono,
      rol: form.rol,
      ...(form.password ? { password: form.password } : {})
    };

    if (editingId) {
      await api.put(`/users/${editingId}`, payload);
    } else {
      await api.post("/users", { ...payload, password: form.password });
    }

    resetForm();
    await loadUsers();
  }

  const columns = useMemo<GridColDef<User>[]>(
    () => [
      { field: "nombre", headerName: "Nombre", flex: 1 },
      { field: "apellido", headerName: "Apellido", flex: 1 },
      { field: "email", headerName: "Email", flex: 1.5 },
      { field: "telefono", headerName: "Telefono", flex: 1, valueGetter: (_value, row) => row.telefono ?? "-" },
      { field: "rol", headerName: "Rol", width: 150 },
      {
        field: "acciones",
        headerName: "",
        width: 80,
        sortable: false,
        renderCell: ({ row }) => (
          <Tooltip title="Editar">
            <IconButton onClick={() => editUser(row)}>
              <EditIcon />
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
        <Typography variant="h4">Gestion de usuarios</Typography>
        <Typography color="text.secondary">Alta y administracion de perfiles con acceso al sistema.</Typography>
      </Stack>
      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px", overflow: "hidden" }}>
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
          <TextField fullWidth label="Nombre" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
          <TextField fullWidth label="Apellido" value={form.apellido} onChange={(event) => setForm({ ...form, apellido: event.target.value })} required />
          <TextField fullWidth label="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required sx={{ flex: { lg: "1.5 1 220px" } }} />
          <TextField fullWidth label="Telefono" value={form.telefono} onChange={(event) => setForm({ ...form, telefono: event.target.value })} />
          <TextField fullWidth label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required={!editingId} placeholder={editingId ? "Opcional al editar" : ""} />
          <TextField fullWidth select label="Rol" value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value as Rol })} sx={{ minWidth: { lg: 150 } }}>
            <MenuItem value="CARPINTERO">CARPINTERO</MenuItem>
            <MenuItem value="OPERARIO">OPERARIO</MenuItem>
            <MenuItem value="ADMIN">ADMIN</MenuItem>
          </TextField>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
            {editingId ? "Guardar" : "Crear Usuario"}
          </Button>
          {editingId && (
            <Button type="button" variant="outlined" onClick={resetForm} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
              Cancelar
            </Button>
          )}
        </Stack>
      </Paper>
      <Paper sx={{ height: 520, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
        <DataGrid rows={users} columns={columns} disableRowSelectionOnClick sx={{ minWidth: { xs: 860, md: "100%" } }} />
      </Paper>
    </Stack>
  );
}
