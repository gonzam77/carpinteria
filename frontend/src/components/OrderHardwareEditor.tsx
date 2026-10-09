import AutorenewIcon from "@mui/icons-material/Autorenew";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import {
  Alert,
  Box,
  Button,
  IconButton,
  ListSubheader,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { formatHardwarePrice, hardwareLabel } from "../lib/hardware";
import { newHardwareKey, resolveEditLines, type EditHardwareLine } from "../lib/moduleOrderHardwareEdit";
import type { ComparableHardware } from "../lib/moduleOrderChanges";
import { toCentavos } from "../lib/orderEstimate";
import type { Hardware, ModuleOrder, OrderHardware } from "../types";
import { hardwareQuantityText } from "./moduleOrderWizard/ModuleHardware";

const ORIGEN: Record<string, string> = { EDITADO: "Modificado a mano", MANUAL: "Agregado a mano" };

/**
 * Herrajes en la edicion de una solicitud de modulos (F6.4, DECISIONES 57). Editar las piezas no los recalcula: se
 * ajustan aca (cantidad, modelo del mismo tipo, quitar y agregar) o con "Recalcular herrajes", que trae lo del catalogo.
 * Los precios son los guardados mientras no cambie el modelo; uno nuevo va con el de hoy (como el PUT).
 */
export function OrderHardwareEditor({
  modulos,
  saved,
  lines,
  models,
  catalog,
  recalculating,
  recalcMessage,
  onChange,
  onRecalculate
}: {
  modulos: ModuleOrder["modulos"];
  saved: OrderHardware[];
  lines: EditHardwareLine[];
  models: Hardware[];
  catalog: ComparableHardware[];
  recalculating: boolean;
  recalcMessage: { severity: "success" | "error"; text: string } | null;
  onChange: (lines: EditHardwareLine[]) => void;
  onRecalculate: () => void;
}) {
  const { byLine, costo } = resolveEditLines(saved, lines, models, catalog);
  const byId = new Map(models.map((model) => [model.id, model]));
  const savedById = new Map(saved.map((item) => [item.id, item]));
  const activos = models.filter((model) => model.activo);
  // Para agregar: los activos agrupados por tipo.
  const tipos = [...new Set(activos.map((model) => model.tipo?.nombre ?? "Sin tipo"))].sort((a, b) => a.localeCompare(b, "es"));
  const update = (key: string, patch: Partial<EditHardwareLine>) => onChange(lines.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  return (
    <Paper variant="outlined" component="section" aria-label="Herrajes" sx={{ borderRadius: "10px", overflow: "hidden" }}>
      <Box sx={{ px: 2, py: 1.25, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1, bgcolor: "background.default" }}>
        <Box>
          <Typography variant="h6">Herrajes</Typography>
          <Typography variant="body2" color="text.secondary">
            Cambiar las piezas no los recalcula: ajustalos acá o recalculalos con lo del catálogo.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Typography fontWeight={800}>{formatHardwarePrice(costo)}</Typography>
          <Button variant="outlined" startIcon={<AutorenewIcon />} onClick={onRecalculate} disabled={recalculating}>
            {recalculating ? "Recalculando..." : "Recalcular herrajes"}
          </Button>
        </Stack>
      </Box>
      {recalcMessage && (
        <Alert severity={recalcMessage.severity} role="status" sx={{ mx: 2, mt: 1.5 }}>
          {recalcMessage.text}
        </Alert>
      )}
      <Stack spacing={2} sx={{ p: 2 }}>
        {modulos.map((modulo) => {
          const items = lines.map((line, index) => ({ line, index })).filter(({ line }) => line.pedidoModuloId === modulo.id);
          const subtotal = items.reduce((sum, { index }) => sum + (byLine[index].row ? toCentavos(byLine[index].row!.valorUnitario) * byLine[index].row!.cantidad : 0), 0) / 100;
          return (
            <Box key={modulo.id} component="section" aria-label={`Herrajes del módulo ${modulo.posicion}`}>
              <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1, mb: 0.5 }}>
                <Typography component="h4" fontWeight={800} fontSize="0.95rem">
                  Módulo {modulo.posicion} · {modulo.nombreModulo}
                </Typography>
                {items.length > 0 && (
                  <Typography variant="body2" fontWeight={700}>
                    {formatHardwarePrice(subtotal)}
                  </Typography>
                )}
              </Box>
              {items.length > 0 ? (
                <Box sx={{ overflowX: "auto" }}>
                  <Table size="small" sx={{ minWidth: 720 }}>
                    <TableHead>
                      <TableRow>
                        <TableCell>Tipo</TableCell>
                        <TableCell sx={{ width: 120 }}>Cant.</TableCell>
                        <TableCell>Modelo</TableCell>
                        <TableCell align="right">Precio</TableCell>
                        <TableCell align="right">Subtotal</TableCell>
                        <TableCell sx={{ width: 48 }} />
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {items.map(({ line, index }, position) => {
                        const numero = position + 1;
                        const { row, problem } = byLine[index];
                        const previous = line.id ? savedById.get(line.id) : undefined;
                        const current = line.herrajeId ? byId.get(line.herrajeId) : undefined;
                        // Del mismo tipo que el modelo de la linea: los activos y el que tiene (aunque este inactivo).
                        const opciones = current ? models.filter((model) => model.tipoId === current.tipoId && (model.activo || model.id === current.id)) : [];
                        const tipo = row?.tipo ?? previous?.tipo ?? current?.tipo?.nombre ?? "-";
                        const nota = problem ?? (row ? ORIGEN[row.origen] : undefined) ?? " ";
                        return (
                          <TableRow key={line.key}>
                            <TableCell>{tipo}</TableCell>
                            <TableCell>
                              <TextField
                                size="small"
                                type="number"
                                value={Number.isFinite(line.cantidad) && line.cantidad !== 0 ? line.cantidad : ""}
                                onChange={(event) => update(line.key, { cantidad: event.target.value === "" ? 0 : Number(event.target.value) })}
                                slotProps={{ htmlInput: { min: 1, max: 9999, step: 1, "aria-label": `Cantidad del herraje ${numero} del módulo ${modulo.posicion}` } }}
                                helperText={row ? hardwareQuantityText(row.cantidad, row.unidad).replace(/^\d+\s*/, "") || " " : " "}
                              />
                            </TableCell>
                            <TableCell sx={{ minWidth: 260 }}>
                              {current ? (
                                <TextField
                                  select
                                  size="small"
                                  fullWidth
                                  value={current.id}
                                  disabled={opciones.length < 2}
                                  onChange={(event) => update(line.key, { herrajeId: event.target.value })}
                                  slotProps={{ select: { SelectDisplayProps: { "aria-label": `Modelo del herraje ${numero} del módulo ${modulo.posicion}` } } }}
                                  helperText={nota}
                                  error={Boolean(problem)}
                                >
                                  {opciones.map((model) => (
                                    <MenuItem key={model.id} value={model.id}>
                                      {/* Uno guardado con el mismo modelo se ve con su nombre guardado. */}
                                      {previous && previous.herrajeId === model.id ? previous.nombre : hardwareLabel(model)}
                                    </MenuItem>
                                  ))}
                                </TextField>
                              ) : (
                                <Box>
                                  <Typography>{previous?.nombre ?? "-"}</Typography>
                                  <Typography variant="caption" color={problem ? "error" : "text.secondary"}>
                                    {problem ?? "El modelo ya no está en Configuración › Herrajes: queda como se guardó."}
                                  </Typography>
                                </Box>
                              )}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                              {row ? formatHardwarePrice(row.valorUnitario) : "-"}
                            </TableCell>
                            <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                              {row ? formatHardwarePrice((toCentavos(row.valorUnitario) * row.cantidad) / 100) : "-"}
                            </TableCell>
                            <TableCell>
                              <Tooltip title="Quitar">
                                <IconButton
                                  aria-label={`Quitar el herraje ${numero} del módulo ${modulo.posicion}`}
                                  onClick={() => onChange(lines.filter((item) => item.key !== line.key))}
                                >
                                  <DeleteOutlineIcon />
                                </IconButton>
                              </Tooltip>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </Box>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Este módulo no tiene herrajes.
                </Typography>
              )}
              {activos.length > 0 && (
                <TextField
                  select
                  size="small"
                  value=""
                  label="Agregar herraje"
                  onChange={(event) =>
                    event.target.value &&
                    onChange([...lines, { key: newHardwareKey(), id: null, pedidoModuloId: modulo.id, herrajeId: event.target.value, cantidad: 1 }])
                  }
                  slotProps={{ select: { SelectDisplayProps: { "aria-label": `Agregar herraje al módulo ${modulo.posicion}` } } }}
                  sx={{ mt: 1, minWidth: 280 }}
                >
                  {tipos.flatMap((tipo) => [
                    <ListSubheader key={`tipo-${tipo}`}>{tipo}</ListSubheader>,
                    ...activos
                      .filter((model) => (model.tipo?.nombre ?? "Sin tipo") === tipo)
                      .map((model) => (
                        <MenuItem key={model.id} value={model.id}>
                          {hardwareLabel(model)} · {formatHardwarePrice(model.valor)}
                        </MenuItem>
                      ))
                  ])}
                </TextField>
              )}
            </Box>
          );
        })}
      </Stack>
    </Paper>
  );
}
