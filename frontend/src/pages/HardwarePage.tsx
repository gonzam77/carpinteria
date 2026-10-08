import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  type AlertColor,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getModulesConfig, updateModulesConfig } from "../api/catalog";
import {
  adjustHardwareValues,
  createHardware,
  createHardwareType,
  deleteHardware,
  listHardware,
  listHardwareTypes,
  setHardwareActive,
  updateHardware,
  updateHardwareType
} from "../api/hardware";
import { moduleOrderError } from "../api/moduleOrders";
import { emptyHardwareForm, formatHardwarePrice, groupByType, HARDWARE_UNITS, hardwareToForm, readHardwareForm, type HardwareForm } from "../lib/hardware";
import type { Hardware, HardwareType, ModulesConfig } from "../types";

const unitLabel = (unidad: string) => HARDWARE_UNITS.find((item) => item.value === unidad)?.label ?? unidad;

/**
 * Configuracion › Herrajes (spec §12, DECISIONES 57): tipos (bisagra, corredera...) y modelos con su precio. Los que van
 * por medida llevan su linea y su medida. Solo ADMIN. Un interruptor prende los herrajes en las solicitudes de modulos.
 */
export function HardwarePage() {
  const [types, setTypes] = useState<HardwareType[]>([]);
  const [hardware, setHardware] = useState<Hardware[] | null>(null);
  const [config, setConfig] = useState<ModulesConfig | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [form, setForm] = useState<HardwareForm>(emptyHardwareForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newType, setNewType] = useState("");
  const [editingType, setEditingType] = useState<{ id: string; nombre: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [percentage, setPercentage] = useState("");
  const [feedback, setFeedback] = useState<{ message: string; severity: AlertColor; items?: string[] } | null>(null);
  const [busy, setBusy] = useState(false);

  const notify = (message: string, severity: AlertColor = "success", items: string[] = []) => setFeedback({ message, severity, items });
  const fail = (error: unknown, fallback: string) => {
    const apiError = moduleOrderError(error, fallback, true);
    notify(apiError.message, "error", apiError.items);
  };

  async function load() {
    const [loadedTypes, loadedHardware] = await Promise.all([listHardwareTypes(), listHardware(showInactive)]);
    setTypes(loadedTypes);
    setHardware(loadedHardware);
    setSelected((current) => current.filter((id) => loadedHardware.some((item) => item.id === id && item.activo)));
  }

  useEffect(() => {
    load().catch((error) => fail(error, "No se pudieron cargar los herrajes."));
    // Solo al entrar y al mostrar u ocultar los inactivos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showInactive]);

  useEffect(() => {
    getModulesConfig()
      .then(setConfig)
      .catch(() => undefined);
  }, []);

  const activeTypes = types.filter((tipo) => tipo.activo);
  const groups = useMemo(() => groupByType(hardware ?? []), [hardware]);
  const activeIds = (hardware ?? []).filter((item) => item.activo).map((item) => item.id);

  async function run(work: () => Promise<unknown>, success: string, fallback: string) {
    setBusy(true);
    setFeedback(null);
    try {
      await work();
      await load();
      notify(success);
      return true;
    } catch (error) {
      fail(error, fallback);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    if (!config) return;
    const { id: _id, ...rest } = config;
    setBusy(true);
    try {
      setConfig(await updateModulesConfig({ ...rest, herrajesHabilitados: enabled }));
      notify(enabled ? "Herrajes habilitados en las solicitudes de módulos." : "Herrajes deshabilitados: las solicitudes de módulos no los calculan.");
    } catch (error) {
      fail(error, "No se pudo cambiar la configuración.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const { problems, input } = readHardwareForm(form);
    if (!input) {
      notify("Hay datos para corregir.", "error", problems);
      return;
    }
    const ok = await run(
      () => (editingId ? updateHardware(editingId, input) : createHardware(input)),
      editingId ? `Herraje "${input.nombre}" guardado.` : `Herraje "${input.nombre}" creado.`,
      "No se pudo guardar el herraje."
    );
    if (ok) {
      setEditingId(null);
      setForm(emptyHardwareForm(input.tipoId));
    }
  }

  async function addType(event: FormEvent) {
    event.preventDefault();
    const nombre = newType.trim();
    if (nombre.length < 2) {
      notify("El nombre del tipo tiene que tener al menos 2 caracteres.", "error");
      return;
    }
    if (await run(() => createHardwareType(nombre), `Tipo "${nombre}" creado.`, "No se pudo crear el tipo.")) setNewType("");
  }

  async function renameType(event: FormEvent) {
    event.preventDefault();
    if (!editingType) return;
    const nombre = editingType.nombre.trim();
    if (await run(() => updateHardwareType(editingType.id, { nombre }), `Tipo "${nombre}" guardado.`, "No se pudo guardar el tipo.")) setEditingType(null);
  }

  async function adjust() {
    const value = Number(percentage.replace(",", "."));
    if (!selected.length || !Number.isFinite(value) || value <= -100) {
      notify("Elegí los herrajes y escribí un porcentaje mayor a -100.", "error");
      return;
    }
    if (await run(() => adjustHardwareValues(selected, value), `Precios ajustados un ${value.toLocaleString("es-AR")} % en ${selected.length} herrajes.`, "No se pudieron ajustar los precios.")) {
      setPercentage("");
      setSelected([]);
    }
  }

  const editRow = (herraje: Hardware) => {
    setEditingId(herraje.id);
    setForm(hardwareToForm(herraje));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Herrajes</Typography>
        <Typography color="text.secondary">
          Tipos y modelos de herrajes con su precio. En cada módulo del catálogo se eligen los que lleva y su modelo por defecto; en la solicitud se puede cambiar el modelo.
        </Typography>
      </Stack>
      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
          {feedback.items && feedback.items.length > 0 && (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {feedback.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px" }}>
        <FormControlLabel
          control={<Switch checked={Boolean(config?.herrajesHabilitados)} onChange={(event) => void toggleEnabled(event.target.checked)} disabled={!config || busy} />}
          label="Herrajes habilitados en las solicitudes de módulos"
        />
        <Typography variant="body2" color="text.secondary">
          {config?.herrajesHabilitados
            ? "Las solicitudes de módulos calculan sus herrajes y los suman al presupuesto."
            : "Apagados: se pueden cargar acá, pero las solicitudes no los calculan ni los cobran."}
        </Typography>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px" }}>
        <Typography variant="h6" gutterBottom>
          Tipos
        </Typography>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mb: 2 }} aria-label="Tipos de herraje">
          {types.length === 0 && <Typography color="text.secondary">Todavía no hay tipos: creá el primero (por ejemplo, Bisagra).</Typography>}
          {types.map((tipo) =>
            editingType?.id === tipo.id ? (
              <Stack key={tipo.id} component="form" direction="row" spacing={1} onSubmit={renameType}>
                <TextField size="small" label="Nombre del tipo" value={editingType.nombre} onChange={(event) => setEditingType({ ...editingType, nombre: event.target.value })} autoFocus />
                <Button type="submit" size="small" variant="contained" disabled={busy}>
                  Guardar
                </Button>
                <Button
                  size="small"
                  disabled={busy}
                  onClick={() =>
                    void run(() => updateHardwareType(tipo.id, { nombre: tipo.nombre, activo: !tipo.activo }), tipo.activo ? `Tipo "${tipo.nombre}" desactivado.` : `Tipo "${tipo.nombre}" activado.`, "No se pudo cambiar el tipo.").then(
                      (ok) => ok && setEditingType(null)
                    )
                  }
                >
                  {tipo.activo ? "Desactivar" : "Activar"}
                </Button>
                <Button size="small" onClick={() => setEditingType(null)}>
                  Cancelar
                </Button>
              </Stack>
            ) : (
              <Chip
                key={tipo.id}
                label={`${tipo.nombre} · ${tipo.herrajes}${tipo.activo ? "" : " · inactivo"}`}
                onClick={() => setEditingType({ id: tipo.id, nombre: tipo.nombre })}
                variant={tipo.activo ? "filled" : "outlined"}
                title="Tocá para cambiarle el nombre o desactivarlo"
              />
            )
          )}
        </Stack>
        <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={addType}>
          <TextField size="small" label="Tipo nuevo" placeholder="Bisagra, Corredera, Pata..." value={newType} onChange={(event) => setNewType(event.target.value)} />
          <Button type="submit" variant="outlined" startIcon={<AddIcon />} disabled={busy}>
            Agregar tipo
          </Button>
        </Stack>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px" }}>
        <Typography variant="h6" gutterBottom>
          {editingId ? "Editar herraje" : "Herraje nuevo"}
        </Typography>
        <Box
          component="form"
          onSubmit={submit}
          sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "1.2fr 2.2fr 1fr 1fr 1.2fr 1fr auto" } }}
        >
          <TextField select label="Tipo" value={form.tipoId} onChange={(event) => setForm({ ...form, tipoId: event.target.value })} required>
            {activeTypes.length === 0 && <MenuItem value="" disabled>Primero creá un tipo</MenuItem>}
            {activeTypes.map((tipo) => (
              <MenuItem key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Nombre del modelo" value={form.nombre} onChange={(event) => setForm({ ...form, nombre: event.target.value })} required />
          <TextField select label="Unidad" value={form.unidad} onChange={(event) => setForm({ ...form, unidad: event.target.value as HardwareForm["unidad"] })}>
            {HARDWARE_UNITS.map((unit) => (
              <MenuItem key={unit.value} value={unit.value}>
                {unit.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField label="Precio" value={form.valor} onChange={(event) => setForm({ ...form, valor: event.target.value })} required slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <TextField label="Línea" placeholder="Telescópica" value={form.linea} onChange={(event) => setForm({ ...form, linea: event.target.value })} helperText="Solo si va por medida" />
          <TextField label="Medida" value={form.medidaMm} onChange={(event) => setForm({ ...form, medidaMm: event.target.value })} helperText="En mm: el largo de la corredera, por ejemplo" slotProps={{ htmlInput: { inputMode: "decimal" } }} />
          <Stack direction="row" spacing={1} sx={{ pt: { lg: 0.75 } }}>
            <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={busy}>
              {editingId ? "Guardar" : "Crear"}
            </Button>
            {editingId && (
              <Button
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyHardwareForm(form.tipoId));
                }}
              >
                Cancelar
              </Button>
            )}
          </Stack>
        </Box>
      </Paper>

      <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "8px" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "center" }} sx={{ mb: 1.5 }}>
          <Typography variant="h6">Modelos</Typography>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
            <FormControlLabel control={<Switch checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />} label="Mostrar inactivos" />
            <TextField size="small" label="Porcentaje" placeholder="10 o -5" value={percentage} onChange={(event) => setPercentage(event.target.value)} sx={{ width: { sm: 120 } }} />
            <Button variant="contained" onClick={() => void adjust()} disabled={busy || !selected.length || percentage.trim() === ""}>
              Ajustar precios{selected.length ? ` (${selected.length})` : ""}
            </Button>
          </Stack>
        </Stack>
        {hardware === null ? (
          <Typography color="text.secondary">Cargando herrajes...</Typography>
        ) : hardware.length === 0 ? (
          <Typography color="text.secondary">Todavía no hay herrajes cargados. El listado lo pasa ROMA; mientras tanto se pueden cargar a mano.</Typography>
        ) : (
          <Box sx={{ overflowX: "auto" }}>
            <Table size="small" aria-label="Herrajes" sx={{ minWidth: 760 }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox">
                    <Checkbox
                      checked={activeIds.length > 0 && selected.length === activeIds.length}
                      indeterminate={selected.length > 0 && selected.length < activeIds.length}
                      onChange={(event) => setSelected(event.target.checked ? activeIds : [])}
                      inputProps={{ "aria-label": "Elegir todos los herrajes activos" }}
                    />
                  </TableCell>
                  <TableCell>Modelo</TableCell>
                  <TableCell>Línea</TableCell>
                  <TableCell align="right">Medida</TableCell>
                  <TableCell>Unidad</TableCell>
                  <TableCell align="right">Precio</TableCell>
                  <TableCell>Uso</TableCell>
                  <TableCell align="right" />
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group) => [
                  <TableRow key={`tipo-${group.tipo}`}>
                    <TableCell colSpan={8} sx={{ bgcolor: "background.default", fontWeight: 900 }}>
                      {group.tipo}
                    </TableCell>
                  </TableRow>,
                  ...group.herrajes.map((herraje) => (
                    <TableRow key={herraje.id} sx={{ opacity: herraje.activo ? 1 : 0.6 }}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selected.includes(herraje.id)}
                          disabled={!herraje.activo}
                          onChange={(event) => setSelected(event.target.checked ? [...selected, herraje.id] : selected.filter((id) => id !== herraje.id))}
                          inputProps={{ "aria-label": `Elegir ${herraje.nombre}` }}
                        />
                      </TableCell>
                      <TableCell>
                        {herraje.nombre}
                        {!herraje.activo && <Chip size="small" label="Inactivo" sx={{ ml: 1 }} />}
                      </TableCell>
                      <TableCell>{herraje.linea ?? "-"}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {herraje.medidaMm === null ? "-" : `${herraje.medidaMm.toLocaleString("es-AR")} mm`}
                      </TableCell>
                      <TableCell>{unitLabel(herraje.unidad)}</TableCell>
                      <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                        {formatHardwarePrice(herraje.valor)}
                      </TableCell>
                      <TableCell>
                        {herraje.usoModulos || herraje.usoSolicitudes ? `${herraje.usoModulos} módulos · ${herraje.usoSolicitudes} en solicitudes` : "Sin uso"}
                      </TableCell>
                      <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                        <Tooltip title="Editar">
                          <IconButton aria-label={`Editar ${herraje.nombre}`} onClick={() => editRow(herraje)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Button
                          size="small"
                          onClick={() => void run(() => setHardwareActive(herraje.id, !herraje.activo), herraje.activo ? `"${herraje.nombre}" desactivado.` : `"${herraje.nombre}" activado.`, "No se pudo cambiar el herraje.")}
                        >
                          {herraje.activo ? "Desactivar" : "Activar"}
                        </Button>
                        {herraje.canDeletePermanently && (
                          <Tooltip title="Borrar (nunca se usó)">
                            <IconButton
                              aria-label={`Borrar ${herraje.nombre}`}
                              onClick={() => void run(() => deleteHardware(herraje.id), `"${herraje.nombre}" borrado.`, "No se pudo borrar el herraje.")}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                ])}
              </TableBody>
            </Table>
          </Box>
        )}
      </Paper>
    </Stack>
  );
}
