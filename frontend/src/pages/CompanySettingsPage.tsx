import SaveIcon from "@mui/icons-material/Save";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { useCompanySettings } from "../context/CompanySettingsContext";

export function CompanySettingsPage() {
  const { settings, updateSettings } = useCompanySettings();
  const [form, setForm] = useState({ nombre: "", telefono: "", email: "" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    setForm({
      nombre: settings.nombre,
      telefono: settings.telefono,
      email: settings.email
    });
  }, [settings]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await updateSettings({
      nombre: form.nombre.trim(),
      telefono: form.telefono.trim(),
      email: form.email.trim()
    });
    setForm({
      nombre: response.nombre,
      telefono: response.telefono,
      email: response.email
    });
    setMessage("Datos de contacto actualizados.");
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Datos de contacto de la empresa</Typography>
        <Typography color="text.secondary">Configura el nombre visible del panel y los datos de contacto que se imprimen en el comprobante de solicitud.</Typography>
      </Stack>
      {message && <Alert severity="success">{message}</Alert>}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "8px" }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <TextField fullWidth label="Nombre de la empresa" value={form.nombre} onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))} required />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField fullWidth label="Telefono" value={form.telefono} onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))} />
            <TextField fullWidth label="Email" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
          </Stack>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Guardar datos
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
