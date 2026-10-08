import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { FormulaInput } from "../FormulaInput";
import { formulaSyntaxError, type FormulaSuggestion, type ModuleDraft } from "../../lib/moduleEditor";
import { hardwareLabel, hardwareLineSummary } from "../../lib/hardware";
import type { ResolvedHardware } from "../../lib/moduleFormula";
import type { Hardware, HardwareType } from "../../types";

type Line = ModuleDraft["herrajes"][number];

/**
 * Pestaña Herrajes del editor (spec §12, DECISIONES 57): cada linea con su tipo, el modelo por defecto, la formula de
 * cantidad y, si el modelo va por medida, la formula de la medida que necesita. El resultado se ve con las medidas de
 * prueba de la pestaña Despiece, con el mismo calculo que usa la solicitud.
 */
export function HardwareTab({
  lines,
  setLines,
  resolved,
  hardware,
  types,
  suggestions,
  enabled
}: {
  lines: Line[];
  setLines: (update: (lines: Line[]) => Line[]) => void;
  /** El resultado de cada linea con las medidas de prueba (resolveModuleHardware). */
  resolved: ResolvedHardware[];
  hardware: Hardware[];
  types: HardwareType[];
  suggestions: FormulaSuggestion[];
  /** Si los herrajes estan habilitados en las solicitudes. */
  enabled: boolean;
}) {
  const byId = new Map(hardware.map((herraje) => [herraje.id, herraje]));
  const activeTypes = types.filter((tipo) => tipo.activo);
  const patch = (index: number, change: Partial<Line>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...change } : line)));
  const usados = new Set(lines.map((line) => line.herrajeId));

  return (
    <Stack spacing={2}>
      {!enabled && (
        <Alert severity="info">
          Los herrajes están apagados: se guardan con el módulo, pero las solicitudes no los calculan hasta prenderlos en{" "}
          <RouterLink to="/configuracion-herrajes">Configuración › Herrajes</RouterLink>.
        </Alert>
      )}
      {hardware.length === 0 && (
        <Alert severity="warning">
          Todavía no hay herrajes cargados. Cargalos en <RouterLink to="/configuracion-herrajes">Configuración › Herrajes</RouterLink>.
        </Alert>
      )}
      <Typography variant="body2" color="text.secondary">
        Cada línea es un herraje que lleva el módulo, con su modelo por defecto (el más usado o el más económico). En la solicitud se puede cambiar el modelo. Los resultados usan las medidas de prueba de
        la pestaña Despiece.
      </Typography>
      {lines.length === 0 && <Typography color="text.secondary">Este módulo no lleva herrajes.</Typography>}
      {lines.map((line, index) => {
        const modelo = byId.get(line.herrajeId);
        const tipoId = modelo?.tipoId ?? "";
        const opciones = hardware.filter((herraje) => herraje.tipoId === tipoId && (herraje.activo || herraje.id === line.herrajeId));
        const porMedida = Boolean(modelo?.linea && modelo.medidaMm !== null);
        const result = resolved[index];
        const cantidadError = formulaSyntaxError(line.formulaCantidad);
        const medidaError = line.formulaMedida ? formulaSyntaxError(line.formulaMedida) : null;
        const summary = result ? hardwareLineSummary(result, byId) : "";
        const conError = Boolean(result?.error) || !modelo;
        return (
          <Paper key={`${index}-${line.herrajeId}`} variant="outlined" component="section" aria-label={`Herraje ${index + 1}`} sx={{ p: 2, borderRadius: "10px", borderLeftWidth: 4, borderLeftColor: conError ? "error.main" : "primary.main" }}>
            <Stack spacing={1.5}>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "1fr 2fr auto" }, alignItems: "start" }}>
                <TextField
                  select
                  size="small"
                  label="Tipo"
                  value={tipoId}
                  onChange={(event) => {
                    // Al cambiar el tipo se elige su primer modelo activo que no este en otra linea.
                    const first = hardware.find((herraje) => herraje.tipoId === event.target.value && herraje.activo && !usados.has(herraje.id));
                    patch(index, { herrajeId: first?.id ?? "", formulaMedida: first?.linea && first.medidaMm !== null ? line.formulaMedida : null });
                  }}
                >
                  {activeTypes.map((tipo) => (
                    <MenuItem key={tipo.id} value={tipo.id}>
                      {tipo.nombre}
                    </MenuItem>
                  ))}
                </TextField>
                <TextField
                  select
                  size="small"
                  label="Modelo por defecto"
                  value={modelo ? line.herrajeId : ""}
                  onChange={(event) => {
                    const next = byId.get(event.target.value);
                    patch(index, { herrajeId: event.target.value, formulaMedida: next?.linea && next.medidaMm !== null ? line.formulaMedida : null });
                  }}
                  error={!modelo}
                  helperText={!modelo ? "Elegí el modelo" : modelo.activo ? " " : "Está inactivo: elegí otro para que el módulo se pueda pedir"}
                >
                  {opciones.map((herraje) => (
                    <MenuItem key={herraje.id} value={herraje.id} disabled={herraje.id !== line.herrajeId && usados.has(herraje.id)}>
                      {hardwareLabel(herraje)}
                    </MenuItem>
                  ))}
                </TextField>
                <Tooltip title="Quitar este herraje">
                  <IconButton aria-label={`Quitar el herraje ${index + 1}`} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: porMedida ? "1fr 1fr" : "1fr" } }}>
                <FormulaInput
                  id={`herraje-${index}-cantidad`}
                  label="Cantidad"
                  value={line.formulaCantidad}
                  onChange={(formulaCantidad) => patch(index, { formulaCantidad })}
                  suggestions={suggestions}
                  error={cantidadError}
                  helperText="Por ejemplo: PUERTAS.cant * 2"
                />
                {porMedida && (
                  <FormulaInput
                    id={`herraje-${index}-medida`}
                    label="Medida que necesita (mm)"
                    value={line.formulaMedida ?? ""}
                    onChange={(formulaMedida) => patch(index, { formulaMedida })}
                    suggestions={suggestions}
                    error={medidaError}
                    helperText={`De la línea ${modelo?.linea} se elige la más larga que entra. Vacía: queda el modelo por defecto.`}
                  />
                )}
              </Box>
              {summary && (
                <Typography variant="body2" fontWeight={700} color={result?.error ? "error" : "text.primary"} aria-label={`Resultado del herraje ${index + 1}`}>
                  {summary}
                </Typography>
              )}
            </Stack>
          </Paper>
        );
      })}
      <Box>
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          disabled={!hardware.some((herraje) => herraje.activo && !usados.has(herraje.id))}
          onClick={() => {
            const first = hardware.find((herraje) => herraje.activo && !usados.has(herraje.id));
            setLines((current) => [...current, { herrajeId: first?.id ?? "", formulaCantidad: "1", formulaMedida: null, orden: current.length + 1 }]);
          }}
        >
          Agregar herraje
        </Button>
      </Box>
    </Stack>
  );
}
