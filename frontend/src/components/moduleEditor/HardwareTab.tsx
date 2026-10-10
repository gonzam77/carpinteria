import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { Alert, Box, Chip, IconButton, ListSubheader, MenuItem, Paper, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import { FormulaInput } from "../FormulaInput";
import { formulaSyntaxError, type FormulaSuggestion, type ModuleDraft } from "../../lib/moduleEditor";
import { hardwareLabel, hardwareMeasureNote } from "../../lib/hardware";
import type { ResolvedHardware } from "../../lib/moduleFormula";
import type { Hardware, HardwareType } from "../../types";

type Line = ModuleDraft["herrajes"][number];

/** Las formulas que trae un modelo al agregarlo (las por defecto de Configuracion › Herrajes, o cantidad 1). */
const defaultsOf = (model: Hardware | undefined) => ({ formulaCantidad: model?.formulaCantidadDefecto ?? "1", formulaMedida: model?.formulaMedidaDefecto ?? null });
/** La linea tiene las formulas por defecto de ese modelo (nadie las cambio): al cambiar de modelo se toman las del nuevo. */
const hasDefaultsOf = (line: Line, model: Hardware | undefined) => {
  const defaults = defaultsOf(model);
  return line.formulaCantidad.trim() === defaults.formulaCantidad.trim() && (line.formulaMedida ?? "").trim() === (defaults.formulaMedida ?? "").trim();
};

/**
 * Pestaña Herrajes del editor (spec §12, DECISIONES 57), con el formato del despiece: una tarjeta por herraje con su
 * tipo, el modelo por defecto y el resultado, y abajo la formula de la cantidad y la de la medida que necesita. Al
 * elegir un modelo se precargan sus formulas por defecto (Configuracion › Herrajes), que se pueden cambiar aca: por
 * ejemplo, la medida de una corredera con la pieza del cajon (INT_CAJON.largo). El resultado usa las medidas de
 * prueba de la pestaña Despiece, con el mismo calculo que la solicitud.
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
  const usados = new Set(lines.map((line) => line.herrajeId));
  const patch = (index: number, change: Partial<Line>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...change } : line)));
  const move = (index: number, delta: number) =>
    setLines((current) => {
      const next = [...current];
      const [line] = next.splice(index, 1);
      next.splice(index + delta, 0, line);
      return next;
    });
  /**
   * Cambiar el modelo de una linea: si sus formulas eran las por defecto del anterior y el nuevo tiene las suyas, toma
   * las del nuevo. Si alguien las cambio, o el nuevo no tiene (otra medida de la misma corredera), quedan las de la linea.
   */
  const changeModel = (index: number, nextId: string) => {
    const line = lines[index];
    const next = byId.get(nextId);
    const nextHasDefaults = Boolean(next?.formulaCantidadDefecto || next?.formulaMedidaDefecto);
    patch(index, { herrajeId: nextId, ...(nextHasDefaults && hasDefaultsOf(line, byId.get(line.herrajeId)) ? defaultsOf(next) : {}) });
  };
  // Para agregar: los modelos activos que el modulo todavia no tiene, agrupados por tipo.
  const disponibles = hardware.filter((herraje) => herraje.activo && !usados.has(herraje.id));
  const tiposDisponibles = activeTypes.filter((tipo) => disponibles.some((herraje) => herraje.tipoId === tipo.id));

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
        Cada herraje lleva su fórmula de cantidad y, si va por medida, la de la medida que necesita. Pueden usar las medidas y las piezas del módulo (por ejemplo,{" "}
        <Box component="code">PUERTAS.cant * 2</Box> o <Box component="code">INT_CAJON.largo - 10</Box>). Al elegir el modelo se precargan sus fórmulas por defecto. Los resultados
        usan las medidas de prueba de la pestaña Despiece.
      </Typography>
      {lines.length === 0 && (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center", borderRadius: "10px" }}>
          <Typography color="text.secondary">Este módulo no lleva herrajes.</Typography>
        </Paper>
      )}
      {lines.map((line, index) => {
        const modelo = byId.get(line.herrajeId);
        const tipoId = modelo?.tipoId ?? "";
        const opciones = hardware.filter((herraje) => herraje.tipoId === tipoId && (herraje.activo || herraje.id === line.herrajeId));
        const porMedida = Boolean(modelo?.linea && modelo.medidaMm !== null);
        const result = resolved[index];
        const cantidadError = formulaSyntaxError(line.formulaCantidad);
        const medidaError = line.formulaMedida ? formulaSyntaxError(line.formulaMedida) : null;
        // El chip: cantidad × el modelo que va (por medida puede ser otro de la linea). El porque de la medida va al pie.
        const elegido = result?.elegidoId ? byId.get(result.elegidoId) : undefined;
        const chip = result?.error ? "Con error" : result && elegido ? `${result.cantidad ?? "?"} × ${elegido.nombre}` : modelo ? "Sin calcular" : "Elegí el modelo";
        const measureNote = result ? hardwareMeasureNote(result) : null;
        const conError = Boolean(result?.error) || !modelo;
        const status = conError ? "error" : result?.cantidad ? "ok" : "off";
        return (
          <Paper
            key={`${index}-${line.herrajeId}`}
            variant="outlined"
            component="section"
            aria-label={`Herraje ${index + 1}`}
            sx={{
              p: { xs: 1.5, sm: 2 },
              borderRadius: "10px",
              borderColor: status === "error" ? "error.light" : "divider",
              borderLeftWidth: 4,
              borderLeftColor: status === "error" ? "error.main" : status === "ok" ? "success.main" : "divider"
            }}
          >
            <Stack spacing={1.25}>
              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="flex-start">
                <Typography fontWeight={800} color="text.secondary" sx={{ pt: 1, minWidth: 24, fontVariantNumeric: "tabular-nums" }}>
                  {index + 1}
                </Typography>
                <TextField
                  select
                  size="small"
                  label="Tipo"
                  value={tipoId}
                  onChange={(event) => {
                    // Al cambiar el tipo se elige su primer modelo activo que no este en otra linea.
                    const first = hardware.find((herraje) => herraje.tipoId === event.target.value && herraje.activo && !usados.has(herraje.id));
                    changeModel(index, first?.id ?? "");
                  }}
                  sx={{ width: { xs: "100%", sm: 200 } }}
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
                  onChange={(event) => changeModel(index, event.target.value)}
                  error={!modelo}
                  helperText={!modelo ? "Elegí el modelo" : modelo.activo ? "Se puede cambiar en la solicitud" : "Está inactivo: elegí otro para que el módulo se pueda pedir"}
                  sx={{ width: { xs: "100%", sm: 300 } }}
                >
                  {opciones.map((herraje) => (
                    <MenuItem key={herraje.id} value={herraje.id} disabled={herraje.id !== line.herrajeId && usados.has(herraje.id)}>
                      {hardwareLabel(herraje)}
                    </MenuItem>
                  ))}
                </TextField>
                <Box sx={{ flex: 1 }} />
                <Stack direction="row" alignItems="center" spacing={0.5} sx={{ ml: { xs: "auto", sm: 0 } }}>
                  <Chip
                    color={status === "error" ? "error" : status === "ok" ? "success" : "default"}
                    variant={status === "off" ? "outlined" : "filled"}
                    label={chip}
                    title={result?.error ?? "Con las medidas de prueba"}
                    aria-label={`Resultado del herraje ${index + 1}`}
                    sx={{ fontWeight: 700, maxWidth: { xs: 220, sm: 360 } }}
                  />
                  <IconButton size="small" aria-label={`Subir el herraje ${index + 1}`} disabled={index === 0} onClick={() => move(index, -1)}>
                    <ArrowUpwardIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton size="small" aria-label={`Bajar el herraje ${index + 1}`} disabled={index === lines.length - 1} onClick={() => move(index, 1)}>
                    <ArrowDownwardIcon fontSize="inherit" />
                  </IconButton>
                  <Tooltip title="Quitar este herraje">
                    <IconButton size="small" color="error" aria-label={`Quitar el herraje ${index + 1}`} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Stack>
              </Stack>
              <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" } }}>
                <FormulaInput
                  id={`herraje-${index}-cantidad`}
                  label="Cantidad"
                  value={line.formulaCantidad}
                  onChange={(formulaCantidad) => patch(index, { formulaCantidad })}
                  suggestions={suggestions}
                  error={cantidadError}
                  helperText="Por ejemplo: PUERTAS.cant * 2 · 0 = no va"
                />
                <FormulaInput
                  id={`herraje-${index}-medida`}
                  label="Medida que necesita (mm)"
                  value={line.formulaMedida ?? ""}
                  onChange={(formulaMedida) => patch(index, { formulaMedida: formulaMedida.trim() ? formulaMedida : null })}
                  suggestions={suggestions}
                  error={medidaError}
                  helperText={
                    measureNote ??
                    (porMedida
                      ? `De la línea ${modelo?.linea} se elige la más larga que entra. Vacía: queda el modelo por defecto.`
                      : "Solo se usa con modelos por medida (con línea, como las correderas). Ej.: INT_CAJON.largo - 10")
                  }
                />
              </Box>
              {result?.error && (
                <Alert severity="error" sx={{ py: 0 }}>
                  {result.error}
                </Alert>
              )}
            </Stack>
          </Paper>
        );
      })}
      <Box>
        <TextField
          select
          size="small"
          label="Agregar herraje"
          value=""
          disabled={disponibles.length === 0}
          onChange={(event) => {
            const model = byId.get(event.target.value);
            if (!model) return;
            setLines((current) => [...current, { herrajeId: model.id, ...defaultsOf(model), orden: current.length + 1 }]);
          }}
          helperText={disponibles.length ? "Elegí el modelo: se agrega con sus fórmulas por defecto." : "No quedan modelos activos para agregar."}
          sx={{ width: { xs: "100%", sm: 360 } }}
        >
          {tiposDisponibles.flatMap((tipo) => [
            <ListSubheader key={`tipo-${tipo.id}`}>{tipo.nombre}</ListSubheader>,
            ...disponibles
              .filter((herraje) => herraje.tipoId === tipo.id)
              .map((herraje) => (
                <MenuItem key={herraje.id} value={herraje.id}>
                  {hardwareLabel(herraje)}
                </MenuItem>
              ))
          ])}
        </TextField>
      </Box>
    </Stack>
  );
}
