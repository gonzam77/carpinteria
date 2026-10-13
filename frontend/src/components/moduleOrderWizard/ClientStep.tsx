import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import NotesOutlinedIcon from "@mui/icons-material/NotesOutlined";
import PersonSearchIcon from "@mui/icons-material/PersonSearch";
import PhoneOutlinedIcon from "@mui/icons-material/PhoneOutlined";
import PlaceOutlinedIcon from "@mui/icons-material/PlaceOutlined";
import { Autocomplete, Box, CircularProgress, Paper, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { searchModuleOrderClients } from "../../api/moduleOrders";
import { clientSuggestionPatch, MAX_DIRECCION, MAX_REFERENCIA, type WizardDraft } from "../../lib/moduleOrderWizard";
import type { ModuleOrderClientSuggestion } from "../../types";
import { fieldIcon } from "../fieldIcon";

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
      <Typography component="h2" fontWeight={800} fontSize="1rem" sx={{ mb: 2 }}>
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
          renderInput={(params) => (
            <TextField
              {...params}
              label="Nombre o razón social"
              required
              helperText="Escribí el nombre o el teléfono para buscar un cliente de otra solicitud"
              // El icono de buscar cliente a la izquierda; a la derecha, lo del Autocomplete (y una rueda mientras busca).
              slotProps={{
                input: {
                  ...params.InputProps,
                  startAdornment: fieldIcon(<PersonSearchIcon />).startAdornment,
                  endAdornment: (
                    <>
                      {loading && <CircularProgress color="inherit" size={18} aria-hidden />}
                      {params.InputProps.endAdornment}
                    </>
                  )
                }
              }}
            />
          )}
        />
        <TextField
          label="Teléfono"
          type="tel"
          value={value.numeroContacto}
          onChange={(event) => onChange({ numeroContacto: event.target.value })}
          required
          autoComplete="off"
          slotProps={{ input: fieldIcon(<PhoneOutlinedIcon />), htmlInput: { inputMode: "tel" } }}
        />
        <TextField
          label="Email"
          type="email"
          value={value.emailContacto}
          onChange={(event) => onChange({ emailContacto: event.target.value })}
          autoComplete="off"
          slotProps={{ input: fieldIcon(<EmailOutlinedIcon />), htmlInput: { inputMode: "email" } }}
        />
        <TextField
          label="Dirección de entrega"
          value={value.direccionEntrega}
          onChange={(event) => onChange({ direccionEntrega: event.target.value })}
          autoComplete="off"
          slotProps={{ input: fieldIcon(<PlaceOutlinedIcon />), htmlInput: { maxLength: MAX_DIRECCION } }}
        />
        <TextField
          label="Fecha de entrega comprometida"
          type="date"
          value={value.fechaEntrega}
          onChange={(event) => onChange({ fechaEntrega: event.target.value })}
          required
          slotProps={{ input: fieldIcon(<EventOutlinedIcon />), inputLabel: { shrink: true }, htmlInput: { min: today } }}
        />
        <TextField
          label="Referencia del trabajo"
          placeholder="Por ejemplo: Cocina completa"
          value={value.observaciones}
          onChange={(event) => onChange({ observaciones: event.target.value })}
          autoComplete="off"
          slotProps={{ input: fieldIcon(<NotesOutlinedIcon />), htmlInput: { maxLength: MAX_REFERENCIA } }}
        />
      </Box>
    </Paper>
  );
}
