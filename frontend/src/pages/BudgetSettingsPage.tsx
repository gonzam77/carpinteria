import SaveIcon from "@mui/icons-material/Save";
import { Alert, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../api/client";
import { BudgetSettings } from "../types";

export function BudgetSettingsPage() {
  const [form, setForm] = useState({
    manoObraCanto045Mm: "0",
    manoObraCanto1Mm: "0",
    manoObraCanto2Mm: "0",
    manoObraPlacaPorPlaca: "0"
  });
  const [message, setMessage] = useState("");

  useEffect(() => {
    api.get<BudgetSettings>("/budget-settings").then((response) => {
      setForm({
        manoObraCanto045Mm: String(response.data.manoObraCanto045Mm),
        manoObraCanto1Mm: String(response.data.manoObraCanto1Mm),
        manoObraCanto2Mm: String(response.data.manoObraCanto2Mm),
        manoObraPlacaPorPlaca: String(response.data.manoObraPlacaPorPlaca)
      });
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await api.put<BudgetSettings>("/budget-settings", {
      manoObraCanto045Mm: Number(form.manoObraCanto045Mm),
      manoObraCanto1Mm: Number(form.manoObraCanto1Mm),
      manoObraCanto2Mm: Number(form.manoObraCanto2Mm),
      manoObraPlacaPorPlaca: Number(form.manoObraPlacaPorPlaca)
    });
    setForm({
      manoObraCanto045Mm: String(response.data.manoObraCanto045Mm),
      manoObraCanto1Mm: String(response.data.manoObraCanto1Mm),
      manoObraCanto2Mm: String(response.data.manoObraCanto2Mm),
      manoObraPlacaPorPlaca: String(response.data.manoObraPlacaPorPlaca)
    });
    setMessage("Configuracion de presupuesto actualizada.");
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Configuracion de presupuesto</Typography>
        <Typography color="text.secondary">Define la mano de obra de pegado de cantos por espesor y el costo fijo por cada placa utilizada.</Typography>
      </Stack>
      {message && <Alert severity="success">{message}</Alert>}
      <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "8px" }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Pegado canto 0.45 mm"
              type="number"
              value={form.manoObraCanto045Mm}
              onChange={(event) => setForm((current) => ({ ...current, manoObraCanto045Mm: event.target.value }))}
              inputProps={{ step: "0.01", min: 0 }}
              required
            />
            <TextField
              fullWidth
              label="Pegado canto 1 mm"
              type="number"
              value={form.manoObraCanto1Mm}
              onChange={(event) => setForm((current) => ({ ...current, manoObraCanto1Mm: event.target.value }))}
              inputProps={{ step: "0.01", min: 0 }}
              required
            />
          </Stack>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <TextField
              fullWidth
              label="Pegado canto 2 mm"
              type="number"
              value={form.manoObraCanto2Mm}
              onChange={(event) => setForm((current) => ({ ...current, manoObraCanto2Mm: event.target.value }))}
              inputProps={{ step: "0.01", min: 0 }}
              required
            />
            <TextField
              fullWidth
              label="Mano de obra fija por placa utilizada"
              type="number"
              value={form.manoObraPlacaPorPlaca}
              onChange={(event) => setForm((current) => ({ ...current, manoObraPlacaPorPlaca: event.target.value }))}
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

