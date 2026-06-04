import SaveIcon from "@mui/icons-material/Save";
import { Button, MenuItem, Paper, Stack, TextField, Typography } from "@mui/material";
import { DataGrid, GridColDef } from "@mui/x-data-grid";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { Rol, User } from "../types";

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState({ nombre: "", apellido: "", email: "", password: "", rol: "CARPINTERO" as Rol });

  async function loadUsers() {
    const response = await api.get<User[]>("/users");
    setUsers(response.data);
  }

  useEffect(() => {
    loadUsers();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    await api.post("/users", form);
    setForm({ nombre: "", apellido: "", email: "", password: "", rol: "CARPINTERO" });
    loadUsers();
  }

  const columns = useMemo<GridColDef<User>[]>(
    () => [
      { field: "nombre", headerName: "Nombre", flex: 1 },
      { field: "apellido", headerName: "Apellido", flex: 1 },
      { field: "email", headerName: "Email", flex: 1.5 },
      { field: "rol", headerName: "Rol", width: 150 }
    ],
    []
  );

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Gestion de usuarios</Typography>
      <Paper sx={{ p: 2 }}>
        <Stack component="form" onSubmit={submit} direction={{ xs: "column", md: "row" }} spacing={2}>
          <TextField label="Nombre" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
          <TextField label="Apellido" value={form.apellido} onChange={(event) => setForm({ ...form, apellido: event.target.value })} required />
          <TextField label="Email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          <TextField label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <TextField select label="Rol" value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value as Rol })} sx={{ minWidth: 150 }}>
            <MenuItem value="CARPINTERO">CARPINTERO</MenuItem>
            <MenuItem value="ADMIN">ADMIN</MenuItem>
          </TextField>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />}>
            Crear Usuario
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ height: 520 }}>
        <DataGrid rows={users} columns={columns} />
      </Paper>
    </Stack>
  );
}
