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
          <TextField fullWidth label="Password" type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required />
          <TextField fullWidth select label="Rol" value={form.rol} onChange={(event) => setForm({ ...form, rol: event.target.value as Rol })} sx={{ minWidth: { lg: 150 } }}>
            <MenuItem value="CARPINTERO">CARPINTERO</MenuItem>
            <MenuItem value="OPERARIO">OPERARIO</MenuItem>
            <MenuItem value="ADMIN">ADMIN</MenuItem>
          </TextField>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
            Crear Usuario
          </Button>
        </Stack>
      </Paper>
      <Paper sx={{ height: 520, borderRadius: "8px", overflowX: "auto", overflowY: "hidden" }}>
        <DataGrid rows={users} columns={columns} sx={{ minWidth: { xs: 720, md: "100%" } }} />
      </Paper>
    </Stack>
  );
}
