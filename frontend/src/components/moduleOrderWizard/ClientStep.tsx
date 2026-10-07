import { Box, Paper, TextField, Typography } from "@mui/material";
import { MAX_DIRECCION, MAX_REFERENCIA, type WizardDraft } from "../../lib/moduleOrderWizard";

type ClientFields = Pick<WizardDraft, "cliente" | "numeroContacto" | "emailContacto" | "direccionEntrega" | "fechaEntrega" | "observaciones">;

/** Paso 1 (spec §9.2): cliente y entrega. La fecha es un dia AAAA-MM-DD, desde hoy en Argentina (DECISIONES 26). */
export function ClientStep({ value, onChange, today }: { value: ClientFields; onChange: (patch: Partial<ClientFields>) => void; today: string }) {
  return (
    <Paper sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "10px" }}>
      <Typography component="h2" fontWeight={800} fontSize="1rem" gutterBottom>
        Cliente y entrega
      </Typography>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
        <TextField
          label="Nombre o razón social"
          value={value.cliente}
          onChange={(event) => onChange({ cliente: event.target.value })}
          required
          autoComplete="off"
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
