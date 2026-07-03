import SaveIcon from "@mui/icons-material/Save";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { BudgetSettings } from "../types";

export function BudgetSettingsPage() {
  const [form, setForm] = useState({ manoObraCantoPorMetro: "0", manoObraCortePorPieza: "0" });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<BudgetSettings>("/budget-settings").then((response) => {
      setForm({
        manoObraCantoPorMetro: String(response.data.manoObraCantoPorMetro),
        manoObraCortePorPieza: String(response.data.manoObraCortePorPieza)
      });
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await api.put<BudgetSettings>("/budget-settings", {
      manoObraCantoPorMetro: Number(form.manoObraCantoPorMetro),
      manoObraCortePorPieza: Number(form.manoObraCortePorPieza)
    });
    setForm({
      manoObraCantoPorMetro: String(response.data.manoObraCantoPorMetro),
      manoObraCortePorPieza: String(response.data.manoObraCortePorPieza)
    });
    setMessage("Configuracion de presupuesto actualizada.");
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Configuracion de presupuesto</Typography>
        <Typography color="text.secondary">Define la mano de obra global que se suma al presupuesto: por metro de canto y por pieza cortada.</Typography>
      </Stack>
      {message && <Alert severity="success">{message}</Alert>}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "8px" }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Mano de obra de canto por metro"
              type="number"
              value={form.manoObraCantoPorMetro}
              onChange={(event) => setForm((current) => ({ ...current, manoObraCantoPorMetro: event.target.value }))}
              inputProps={{ step: "0.01", min: 0 }}
              required
            />
            <TextField
              fullWidth
              label="Mano de obra de corte por pieza"
              type="number"
              value={form.manoObraCortePorPieza}
              onChange={(event) => setForm((current) => ({ ...current, manoObraCortePorPieza: event.target.value }))}
              inputProps={{ step: "0.01", min: 0 }}
              required
            />
          </Stack>
          <Button type="submit" variant="contained" startIcon={<SaveIcon />} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Guardar configuracion
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
