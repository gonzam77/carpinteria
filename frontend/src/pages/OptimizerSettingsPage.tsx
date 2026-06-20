import SaveIcon from "@mui/icons-material/Save";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { OptimizerSettings } from "../types";

export function OptimizerSettingsPage() {
  const [form, setForm] = useState({ espesorSierraMm: "4.3" });
  const [perfiladoBordeMm, setPerfiladoBordeMm] = useState(10);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<OptimizerSettings>("/optimizer-settings").then((response) => {
      setForm({ espesorSierraMm: String(response.data.espesorSierraMm) });
      setPerfiladoBordeMm(response.data.perfiladoBordeMm);
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await api.put<OptimizerSettings>("/optimizer-settings", { espesorSierraMm: Number(form.espesorSierraMm) });
    setForm({ espesorSierraMm: String(response.data.espesorSierraMm) });
    setPerfiladoBordeMm(response.data.perfiladoBordeMm);
    setMessage("Configuracion del optimizador actualizada.");
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Configuracion del optimizador</Typography>
        <Typography color="text.secondary">Ajusta el espesor de sierra usado por el calculo de cortes. El perfilado de placa se mantiene fijo en 10 mm por lado.</Typography>
      </Stack>
      {message && <Alert severity="success">{message}</Alert>}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "8px" }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Espesor de sierra mm"
              type="number"
              value={form.espesorSierraMm}
              onChange={(event) => setForm({ espesorSierraMm: event.target.value })}
              inputProps={{ step: "0.1", min: 0.1 }}
              required
            />
            <TextField fullWidth label="Perfilado por borde mm" value={perfiladoBordeMm} disabled helperText="Se descuentan 10 mm por cada lado de la placa." />
          </Stack>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Guardar configuracion
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
