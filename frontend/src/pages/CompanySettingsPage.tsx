import SaveIcon from "@mui/icons-material/Save";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import StorefrontOutlinedIcon from "@mui/icons-material/StorefrontOutlined";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { fieldIcon } from "../components/fieldIcon";
import { SectionHeading } from "../components/SectionHeading";
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
        <Typography color="text.secondary">Configurá el nombre visible del panel y los datos de contacto que se imprimen en el comprobante de solicitud.</Typography>
      </Stack>
      {message && <Alert severity="success">{message}</Alert>}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "8px" }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <SectionHeading icon={<BusinessOutlinedIcon />} title="Empresa" subtitle="Se muestran en el panel y en el comprobante de cada solicitud." />
          <TextField
            fullWidth
            label="Nombre de la empresa"
            value={form.nombre}
            onChange={(event) => setForm((current) => ({ ...current, nombre: event.target.value }))}
            required
            slotProps={{ input: fieldIcon(<StorefrontOutlinedIcon />) }}
          />
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Teléfono"
              value={form.telefono}
              onChange={(event) => setForm((current) => ({ ...current, telefono: event.target.value }))}
              slotProps={{ input: fieldIcon(<PhoneOutlinedIcon />) }}
            />
            <TextField
              fullWidth
              label="Email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
              slotProps={{ input: fieldIcon(<EmailOutlinedIcon />) }}
            />
          </Stack>
          <Stack direction="row" justifyContent="flex-end">
            <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ width: { xs: "100%", sm: "auto" } }}>
              Guardar datos
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Stack>
  );
}
