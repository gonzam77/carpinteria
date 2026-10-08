import { Autocomplete, Box, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { searchModuleOrderClients } from "../../api/moduleOrders";
import { clientSuggestionPatch, MAX_DIRECCION, MAX_REFERENCIA, type WizardDraft } from "../../lib/moduleOrderWizard";
import type { ModuleOrderClientSuggestion } from "../../types";

type ClientFields = Pick<WizardDraft, "cliente" | "numeroContacto" | "emailContacto" | "direccionEntrega" | "fechaEntrega" | "observaciones">;

/** Paso 1 (spec §9.2): cliente y entrega. La fecha es un dia AAAA-MM-DD, desde hoy en Argentina (DECISIONES 26). */
export function ClientStep({ value, onChange, today }: { value: ClientFields; onChange: (patch: Partial<ClientFields>) => void; today: string }) {
  // Clientes de solicitudes anteriores (por nombre o telefono), para no volver a escribirlos. Se busca un rato despues de
  // dejar de tipear, y una busqueda vieja se corta cuando se pide otra.
  const [options, setOptions] = useState<ModuleOrderClientSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    const query = value.cliente.trim();
    if (query.length < 2) {
      setOptions([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      searchModuleOrderClients(query, { signal: controller.signal })
        .then(setOptions)
        .catch(() => undefined)
        .finally(() => !controller.signal.aborted && setLoading(false));
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [value.cliente]);

  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
      <Typography component="h2" fontWeight={800} fontSize="1rem" gutterBottom>
        Cliente y entrega
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <Autocomplete
          freeSolo
          options={options}
          loading={loading}
          loadingText="Buscando clientes..."
          filterOptions={(items) => items}
          inputValue={value.cliente}
          onInputChange={(_event, text, reason) => reason !== "reset" && onChange({ cliente: text })}
          onChange={(_event, option) => {
            if (option && typeof option !== "string") onChange(clientSuggestionPatch(value, option));
          }}
          getOptionLabel={(option) => (typeof option === "string" ? option : option.cliente)}
          renderOption={({ key, ...props }, option) => (
            <li key={`${key}-${option.numeroContacto}`} {...props}>
              <Box>
                <Typography variant="body2" fontWeight={700}>
                  {option.cliente}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {[option.numeroContacto, option.emailContacto].filter(Boolean).join(" · ")}
                </Typography>
              </Box>
            </li>
          )}
          renderInput={(params) => <TextField {...params} label="Nombre o razón social" required helperText="Escribí el nombre o el teléfono para buscar un cliente de otra solicitud" />}
        />
        <TextField
          label="Teléfono"
          type="tel"
          value={value.numeroContacto}
          onChange={(event) => onChange({ numeroContacto: event.target.value })}
          required
          autoComplete="off"
          slotProps={{ htmlInput: { inputMode: "tel" } }}
        />
        <TextField
          label="Email"
          type="email"
          value={value.emailContacto}
          onChange={(event) => onChange({ emailContacto: event.target.value })}
          autoComplete="off"
          slotProps={{ htmlInput: { inputMode: "email" } }}
        />
        <TextField
          label="Dirección de entrega"
          value={value.direccionEntrega}
          onChange={(event) => onChange({ direccionEntrega: event.target.value })}
          autoComplete="off"
          slotProps={{ htmlInput: { maxLength: MAX_DIRECCION } }}
        />
        <TextField
          label="Fecha de entrega comprometida"
          type="date"
          value={value.fechaEntrega}
          onChange={(event) => onChange({ fechaEntrega: event.target.value })}
          required
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: today } }}
        />
        <TextField
          label="Referencia del trabajo"
          placeholder="Por ejemplo: Cocina completa"
          value={value.observaciones}
          onChange={(event) => onChange({ observaciones: event.target.value })}
          autoComplete="off"
          slotProps={{ htmlInput: { maxLength: MAX_REFERENCIA } }}
        />
      </Box>
    </Paper>
  );
}
