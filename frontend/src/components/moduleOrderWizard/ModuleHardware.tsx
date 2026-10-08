import RestartAltIcon from "@mui/icons-material/RestartAlt";
import { Box, Button, MenuItem, Paper, Table, TableBody, TableCell, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { formatHardwarePrice, hardwareLabel } from "../../lib/hardware";
import { toCentavos } from "../../lib/orderEstimate";
import type { Hardware, OrderHardware, PlannedHardware } from "../../types";

const unidad = (cantidad: number, unidad: string) => (unidad === "unidad" ? `${cantidad}` : `${cantidad} ${unidad === "par" ? (cantidad === 1 ? "par" : "pares") : unidad === "juego" ? (cantidad === 1 ? "juego" : "juegos") : "m"}`);
const subtotal = (item: { cantidad: number; valorUnitario: number }) => (toCentavos(item.valorUnitario) * item.cantidad) / 100;
const mm = (value: number) => `${Number(value.toFixed(2)).toLocaleString("es-AR")} mm`;

/** Por que va ese modelo, en palabras (DECISIONES 57). */
function reason(item: PlannedHardware) {
  if (item.eleccion === "ELEGIDO") return "Elegido a mano";
  if (item.eleccion === "POR_MEDIDA" && item.medidaNecesaria !== null) return `Por medida: necesita ${mm(item.medidaNecesaria)}`;
  if (item.eleccion === "MAS_CHICO") return item.medidaNecesaria !== null ? `Necesita ${mm(item.medidaNecesaria)} y ninguna entra: va la más chica. Revisalo.` : "No se pudo calcular la medida: va la más chica. Revisalo.";
  return "";
}

/**
 * Herrajes de un modulo en el paso 4 del asistente (DECISIONES 57): lo que calculo el servidor, una linea por herraje con
 * un solo modelo, y un selector para elegir otro del mismo tipo. "Volver" deja el que corresponde.
 */
export function ModuleHardwareCard({
  posicion,
  herrajes,
  models,
  locked,
  onChange
}: {
  posicion: number;
  herrajes: PlannedHardware[];
  /** Todos los modelos (para el selector se usan los activos del mismo tipo). */
  models: Hardware[];
  locked: boolean;
  onChange: (defaultId: string, chosenId: string | null) => void;
}) {
  if (!herrajes.length) return null;
  const byId = new Map(models.map((model) => [model.id, model]));
  const total = herrajes.reduce((sum, item) => sum + toCentavos(item.valorUnitario) * item.cantidad, 0) / 100;
  return (
    <Paper variant="outlined" component="section" aria-label={`Herrajes del módulo ${posicion}`} sx={{ borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, display: "flex", justifyContent: "space-between", gap: 1, bgcolor: "background.default" }}>
        <Typography component="h4" fontWeight={800} fontSize="0.95rem">
          Herrajes del módulo {posicion}
        </Typography>
        <Typography variant="body2" fontWeight={700}>
          {formatHardwarePrice(total)}
        </Typography>
      </Box>
      <Box sx={{ overflowX: "auto" }}>
        <Table size="small" sx={{ minWidth: 640 }}>
          <TableHead>
            <TableRow>
              <TableCell>Tipo</TableCell>
              <TableCell align="right">Cant.</TableCell>
              <TableCell>Modelo</TableCell>
              <TableCell align="right">Precio</TableCell>
              <TableCell align="right">Subtotal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {herrajes.map((item) => {
              const defecto = byId.get(item.herrajeDefectoId);
              const opciones = models.filter((model) => model.tipoId === defecto?.tipoId && (model.activo || model.id === item.herrajeId));
              const nota = reason(item);
              return (
                <TableRow key={item.herrajeDefectoId}>
                  <TableCell>{item.tipo ?? "-"}</TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {unidad(item.cantidad, item.unidad)}
                  </TableCell>
                  <TableCell sx={{ minWidth: 260 }}>
                    <TextField
                      select
                      size="small"
                      fullWidth
                      value={item.herrajeId}
                      disabled={locked || opciones.length < 2}
                      onChange={(event) => onChange(item.herrajeDefectoId, event.target.value)}
                      // Sin label visible: el nombre va en el combobox, no en el input oculto.
                      slotProps={{ select: { SelectDisplayProps: { "aria-label": `Modelo de ${item.tipo ?? "herraje"} del módulo ${posicion}` } } }}
                      helperText={nota || " "}
                      error={item.eleccion === "MAS_CHICO"}
                    >
                      {(opciones.length ? opciones : [{ id: item.herrajeId, nombre: item.nombre, medidaMm: item.medidaMm, activo: true }]).map((model) => (
                        <MenuItem key={model.id} value={model.id}>
                          {hardwareLabel(model)}
                        </MenuItem>
                      ))}
                    </TextField>
                    {item.eleccion === "ELEGIDO" && (
                      <Button size="small" startIcon={<RestartAltIcon />} onClick={() => onChange(item.herrajeDefectoId, null)} disabled={locked}>
                        Volver al que corresponde
                      </Button>
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {formatHardwarePrice(item.valorUnitario)}
                  </TableCell>
                  <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {formatHardwarePrice(subtotal(item))}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Box>
    </Paper>
  );
}

/** Herrajes guardados de un modulo de la solicitud, para leer (detalle). */
export function OrderHardwareList({ titulo, herrajes }: { titulo: string; herrajes: OrderHardware[] }) {
  if (!herrajes.length) return null;
  const total = herrajes.reduce((sum, item) => sum + toCentavos(item.valorUnitario) * item.cantidad, 0) / 100;
  return (
    <Box component="section" aria-label={titulo} sx={{ px: 2, pb: 2 }}>
      <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, py: 1 }}>
        <Typography component="h4" fontWeight={800} fontSize="0.95rem">
          Herrajes
        </Typography>
        <Typography variant="body2" fontWeight={700}>
          {formatHardwarePrice(total)}
        </Typography>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Tipo</TableCell>
            <TableCell align="right">Cant.</TableCell>
            <TableCell>Modelo</TableCell>
            <TableCell align="right">Precio</TableCell>
            <TableCell align="right">Subtotal</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {herrajes.map((item) => (
            <TableRow key={item.id}>
              <TableCell>{item.tipo ?? "-"}</TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                {unidad(item.cantidad, item.unidad)}
              </TableCell>
              <TableCell>
                {item.nombre}
                {item.origen === "EDITADO" && (
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    (elegido a mano)
                  </Typography>
                )}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {formatHardwarePrice(item.valorUnitario)}
              </TableCell>
              <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                {formatHardwarePrice(subtotal(item))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
