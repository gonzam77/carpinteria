import AddBoxOutlinedIcon from "@mui/icons-material/AddBoxOutlined";
import AddCircleOutlineIcon from "@mui/icons-material/AddCircleOutline";
import AddIcon from "@mui/icons-material/Add";
import AttachMoneyIcon from "@mui/icons-material/AttachMoney";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import CloseIcon from "@mui/icons-material/Close";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import EditNoteIcon from "@mui/icons-material/EditNote";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LinearScaleIcon from "@mui/icons-material/LinearScale";
import ListAltOutlinedIcon from "@mui/icons-material/ListAltOutlined";
import PercentIcon from "@mui/icons-material/Percent";
import SaveIcon from "@mui/icons-material/Save";
import StraightenIcon from "@mui/icons-material/Straighten";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
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
import { alpha } from "@mui/material/styles";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getFormulaReferences, getModulesConfig, updateModulesConfig } from "../api/catalog";
import { SectionHeading } from "../components/SectionHeading";
import { fieldIcon } from "../components/fieldIcon";
import { FormulaInput } from "../components/FormulaInput";
import { catalogSuggestions } from "../lib/formulaHelp";
import { formulaSyntaxError, type FormulaSuggestion } from "../lib/moduleEditor";
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
import { useErrorDialog } from "../context/ErrorDialogContext";

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
  // Los nombres del catalogo para la ayuda de las formulas por defecto: todavia no hay un modulo elegido (2026-10-13).
  const [formulaNames, setFormulaNames] = useState<FormulaSuggestion[]>(() => catalogSuggestions({ medidas: [], piezas: [] }));
  useEffect(() => {
    getFormulaReferences()
      .then((referencias) => setFormulaNames(catalogSuggestions(referencias)))
      .catch(() => undefined);
  }, []);

  const { showError } = useErrorDialog();
  // Los errores en la ventana del medio (2026-10-13); los avisos de exito quedan arriba.
  const notify = (message: string, severity: AlertColor = "success", items: string[] = []) =>
    severity === "error" ? showError({ title: "No se pudo completar la acción", message, items }) : setFeedback({ message, severity, items });
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

  const enabled = Boolean(config?.herrajesHabilitados);
  const enabledColor = enabled ? "#24663f" : "#6f6760";
  const activeCount = (hardware ?? []).filter((item) => item.activo).length;

  return (
    <Stack spacing={3}>
      <Stack spacing={1}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={{ xs: 1.5, md: 3 }} justifyContent="space-between" alignItems={{ xs: "stretch", md: "flex-start" }}>
          <Stack spacing={0.5} sx={{ minWidth: 0 }}>
            <Typography variant="h4">Herrajes</Typography>
            <Typography color="text.secondary">
              Tipos y modelos de herrajes con su precio. En cada módulo del catálogo se eligen los que lleva y su modelo por defecto; en la solicitud se puede cambiar el modelo.
            </Typography>
          </Stack>
          {/* El interruptor general en el encabezado (2026-10-13): no ocupa una tarjeta entera. */}
          <Box
            sx={{
              flexShrink: 0,
              alignSelf: { md: "center" },
              maxWidth: { md: 500 },
              pl: 1,
              pr: 2,
              py: 0.75,
              borderRadius: "14px",
              border: "1px solid",
              borderColor: alpha(enabledColor, 0.28),
              bgcolor: alpha(enabledColor, 0.06),
              transition: "background-color 160ms ease, border-color 160ms ease"
            }}
          >
            <FormControlLabel
              control={<Switch checked={enabled} onChange={(event) => void toggleEnabled(event.target.checked)} disabled={!config || busy} />}
              label={
                <Box>
                  <Typography sx={{ fontWeight: 800, fontSize: "0.9rem", lineHeight: 1.3 }}>Herrajes habilitados en las solicitudes de módulos</Typography>
                  <Typography variant="caption" sx={{ display: "block", lineHeight: 1.35, color: enabled ? enabledColor : "text.secondary" }}>
                    {enabled ? "Las solicitudes de módulos calculan sus herrajes y los suman al presupuesto." : "Apagados: se pueden cargar acá, pero las solicitudes no los calculan ni los cobran."}
                  </Typography>
                </Box>
              }
              sx={{ m: 0, alignItems: "center", gap: 0.5 }}
            />
          </Box>
        </Stack>
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

      <Paper component="section" aria-labelledby="herrajes-tipos" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "14px" }}>
        <SectionHeading
          id="herrajes-tipos"
          sx={{ mb: 2 }}
          icon={<CategoryOutlinedIcon />}
          title="Tipos"
          subtitle="Tocá un tipo para cambiarle el nombre o desactivarlo."
          action={
            <Stack component="form" direction={{ xs: "column", sm: "row" }} spacing={1} onSubmit={addType} sx={{ flexShrink: 0 }}>
              <TextField
                size="small"
                label="Tipo nuevo"
                placeholder="Bisagra, Corredera, Pata..."
                value={newType}
                onChange={(event) => setNewType(event.target.value)}
                slotProps={{ input: fieldIcon(<AddCircleOutlineIcon />) }}
                sx={{ width: { sm: 260 } }}
              />
              <Button type="submit" variant="outlined" startIcon={<AddIcon />} disabled={busy}>
                Agregar tipo
              </Button>
            </Stack>
          }
        />
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" alignItems="center" aria-label="Tipos de herraje">
          {types.length === 0 && <Typography color="text.secondary">Todavía no hay tipos: creá el primero (por ejemplo, Bisagra).</Typography>}
          {types.map((tipo) =>
            editingType?.id === tipo.id ? (
              <Stack
                key={tipo.id}
                component="form"
                direction={{ xs: "column", sm: "row" }}
                spacing={1}
                onSubmit={renameType}
                sx={{ p: 1, borderRadius: "12px", border: "1px solid", borderColor: alpha("#f28c28", 0.35), bgcolor: alpha("#f28c28", 0.05), width: { xs: "100%", sm: "auto" } }}
              >
                <TextField
                  size="small"
                  label="Nombre del tipo"
                  value={editingType.nombre}
                  onChange={(event) => setEditingType({ ...editingType, nombre: event.target.value })}
                  slotProps={{ input: fieldIcon(<CategoryOutlinedIcon />) }}
                  autoFocus
                />
                <Button type="submit" size="small" variant="contained" startIcon={<SaveIcon />} disabled={busy}>
                  Guardar
                </Button>
                <Button
                  size="small"
                  color={tipo.activo ? "error" : "success"}
                  startIcon={tipo.activo ? <ToggleOffOutlinedIcon /> : <ToggleOnOutlinedIcon />}
                  disabled={busy}
                  onClick={() =>
                    void run(() => updateHardwareType(tipo.id, { nombre: tipo.nombre, activo: !tipo.activo }), tipo.activo ? `Tipo "${tipo.nombre}" desactivado.` : `Tipo "${tipo.nombre}" activado.`, "No se pudo cambiar el tipo.").then(
                      (ok) => ok && setEditingType(null)
                    )
                  }
                >
                  {tipo.activo ? "Desactivar" : "Activar"}
                </Button>
                <Button size="small" startIcon={<CloseIcon />} onClick={() => setEditingType(null)}>
                  Cancelar
                </Button>
              </Stack>
            ) : (
              <Chip
                key={tipo.id}
                icon={<LabelOutlinedIcon />}
                label={`${tipo.nombre} · ${tipo.herrajes}${tipo.activo ? "" : " · inactivo"}`}
                onClick={() => setEditingType({ id: tipo.id, nombre: tipo.nombre })}
                variant="outlined"
                title="Tocá para cambiarle el nombre o desactivarlo"
                sx={{
                  height: 34,
                  borderRadius: "10px",
                  fontWeight: 700,
                  px: 0.5,
                  bgcolor: tipo.activo ? alpha("#f28c28", 0.07) : "transparent",
                  borderColor: tipo.activo ? alpha("#f28c28", 0.3) : "divider",
                  borderStyle: tipo.activo ? "solid" : "dashed",
                  color: tipo.activo ? "text.primary" : "text.secondary",
                  "& .MuiChip-icon": { color: tipo.activo ? "primary.dark" : "text.disabled", fontSize: 18 },
                  "&:hover": { bgcolor: alpha("#f28c28", 0.14) }
                }}
              />
            )
          )}
        </Stack>
      </Paper>

      <Paper component="section" aria-labelledby="herrajes-formulario" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "14px", ...(editingId ? { borderColor: alpha("#f28c28", 0.55), boxShadow: `0 0 0 3px ${alpha("#f28c28", 0.12)}` } : {}) }}>
        <SectionHeading
          id="herrajes-formulario"
          sx={{ mb: 2 }}
          icon={editingId ? <EditNoteIcon /> : <AddBoxOutlinedIcon />}
          title={editingId ? "Editar herraje" : "Herraje nuevo"}
          subtitle={editingId ? `Estás cambiando "${form.nombre || "el herraje"}". Guardá o cancelá.` : "Cargá el modelo, su precio y, si va por medida, su línea y su medida."}
        />
        <Box component="form" onSubmit={submit} sx={{ display: "grid", gap: 2, alignItems: "start", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr", lg: "repeat(12, minmax(0, 1fr))" } }}>
          <TextField
            select
            label="Tipo"
            value={form.tipoId}
            onChange={(event) => setForm({ ...form, tipoId: event.target.value })}
            required
            slotProps={{
              input: fieldIcon(<CategoryOutlinedIcon />),
              select: {
                displayEmpty: true,
                renderValue: (value) =>
                  types.find((tipo) => tipo.id === value)?.nombre ?? (
                    <Box component="span" sx={{ color: "text.disabled" }}>
                      Elegí un tipo
                    </Box>
                  )
              }
            }}
            sx={{ gridColumn: { lg: "span 3" } }}
          >
            {activeTypes.length === 0 && (
              <MenuItem value="" disabled>
                Primero creá un tipo
              </MenuItem>
            )}
            {activeTypes.map((tipo) => (
              <MenuItem key={tipo.id} value={tipo.id}>
                {tipo.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Nombre del modelo"
            value={form.nombre}
            onChange={(event) => setForm({ ...form, nombre: event.target.value })}
            required
            slotProps={{ input: fieldIcon(<LabelOutlinedIcon />) }}
            sx={{ gridColumn: { lg: "span 5" } }}
          />
          <TextField
            select
            label="Unidad"
            value={form.unidad}
            onChange={(event) => setForm({ ...form, unidad: event.target.value as HardwareForm["unidad"] })}
            slotProps={{ input: fieldIcon(<Inventory2OutlinedIcon />) }}
            sx={{ gridColumn: { lg: "span 2" } }}
          >
            {HARDWARE_UNITS.map((unit) => (
              <MenuItem key={unit.value} value={unit.value}>
                {unit.label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Precio"
            value={form.valor}
            onChange={(event) => setForm({ ...form, valor: event.target.value })}
            required
            slotProps={{ input: fieldIcon(<AttachMoneyIcon />), htmlInput: { inputMode: "decimal" } }}
            sx={{ gridColumn: { lg: "span 2" } }}
          />
          <TextField
            label="Línea"
            placeholder="Telescópica"
            value={form.linea}
            onChange={(event) => setForm({ ...form, linea: event.target.value })}
            helperText="Solo si va por medida (por ejemplo, correderas)."
            slotProps={{ input: fieldIcon(<LinearScaleIcon />) }}
            sx={{ gridColumn: { lg: "span 6" } }}
          />
          <TextField
            label="Medida"
            value={form.medidaMm}
            onChange={(event) => setForm({ ...form, medidaMm: event.target.value })}
            helperText="En mm: el largo de la corredera, por ejemplo."
            slotProps={{ input: fieldIcon(<StraightenIcon />), htmlInput: { inputMode: "decimal" } }}
            sx={{ gridColumn: { lg: "span 6" } }}
          />
          {/* Formulas por defecto (punto 2): se precargan al agregar el herraje a un modulo y ahi se pueden cambiar. */}
          <FormulaInput
            id="herraje-formula-cantidad"
            label="Cantidad por defecto (fórmula)"
            kind="herraje-cantidad"
            scope="catalog"
            value={form.formulaCantidad}
            onChange={(formulaCantidad) => setForm({ ...form, formulaCantidad })}
            suggestions={formulaNames}
            error={form.formulaCantidad.trim() ? formulaSyntaxError(form.formulaCantidad) : null}
            helperText="Opcional. Por ejemplo PUERTAS.cant * 2. Se precarga al agregarlo a un módulo; ahí se puede cambiar."
            sx={{ gridColumn: { lg: "span 6" } }}
          />
          <FormulaInput
            id="herraje-formula-medida"
            label="Medida por defecto (fórmula)"
            kind="herraje-medida"
            scope="catalog"
            value={form.formulaMedida}
            onChange={(formulaMedida) => setForm({ ...form, formulaMedida })}
            suggestions={formulaNames}
            error={form.formulaMedida.trim() ? formulaSyntaxError(form.formulaMedida) : null}
            helperText="Opcional. Por ejemplo PROFUNDIDAD - 50. Para los que van por medida: la que necesita el módulo, en mm."
            sx={{ gridColumn: { lg: "span 6" } }}
          />
          <Stack direction="row" spacing={1} justifyContent="flex-end" sx={{ gridColumn: "1 / -1", pt: 0.5, borderTop: "1px solid", borderColor: "divider" }}>
            {editingId && (
              <Button
                startIcon={<CloseIcon />}
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyHardwareForm(form.tipoId));
                }}
                sx={{ mt: 1.5 }}
              >
                Cancelar
              </Button>
            )}
            <Button type="submit" variant="contained" startIcon={<SaveIcon />} disabled={busy} sx={{ mt: 1.5 }}>
              {editingId ? "Guardar" : "Crear"}
            </Button>
          </Stack>
        </Box>
      </Paper>

      <Paper component="section" aria-labelledby="herrajes-registrados" sx={{ p: { xs: 2, sm: 2.5 }, borderRadius: "14px" }}>
        <SectionHeading
          id="herrajes-registrados"
          sx={{ mb: 2 }}
          icon={<ListAltOutlinedIcon />}
          title="Herrajes registrados"
          subtitle={
            hardware && hardware.length
              ? `${hardware.length} ${hardware.length === 1 ? "modelo" : "modelos"}${showInactive ? ` · ${activeCount} activos` : ""}. Elegí los que quieras y ajustá su precio en un porcentaje.`
              : undefined
          }
          action={
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }} sx={{ flexShrink: 0 }}>
              <FormControlLabel control={<Switch checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />} label="Mostrar inactivos" sx={{ mr: { sm: 1 } }} />
              <TextField
                size="small"
                label="Porcentaje"
                placeholder="10 o -5"
                value={percentage}
                onChange={(event) => setPercentage(event.target.value)}
                slotProps={{ input: fieldIcon(<PercentIcon />), htmlInput: { inputMode: "decimal" } }}
                sx={{ width: { sm: 150 } }}
              />
              <Button variant="contained" startIcon={<TrendingUpIcon />} onClick={() => void adjust()} disabled={busy || !selected.length || percentage.trim() === ""}>
                Ajustar precios{selected.length ? ` (${selected.length})` : ""}
              </Button>
            </Stack>
          }
        />
        {hardware === null ? (
          <Typography color="text.secondary">Cargando herrajes...</Typography>
        ) : hardware.length === 0 ? (
          <Stack alignItems="center" spacing={1} sx={{ py: 4, color: "text.secondary", textAlign: "center" }}>
            <Inventory2OutlinedIcon sx={{ fontSize: 36, color: alpha("#6f6760", 0.6) }} />
            <Typography color="text.secondary">Todavía no hay herrajes cargados. El listado lo pasa ROMA; mientras tanto se pueden cargar a mano.</Typography>
          </Stack>
        ) : (
          <Box sx={{ overflowX: "auto", border: "1px solid", borderColor: "divider", borderRadius: "12px" }}>
            <Table size="small" aria-label="Herrajes" sx={{ minWidth: 820, "& td, & th": { px: 1.5 }, "& tbody tr:last-of-type td": { borderBottom: 0 } }}>
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" sx={{ pl: "8px !important" }}>
                    <Checkbox
                      checked={activeIds.length > 0 && selected.length === activeIds.length}
                      indeterminate={selected.length > 0 && selected.length < activeIds.length}
                      onChange={(event) => setSelected(event.target.checked ? activeIds : [])}
                      inputProps={{ "aria-label": "Elegir todos los herrajes activos" }}
                    />
                  </TableCell>
                  <TableCell>Modelo</TableCell>
                  <TableCell>Línea</TableCell>
                  <TableCell>Medida</TableCell>
                  <TableCell>Unidad</TableCell>
                  <TableCell>Precio</TableCell>
                  <TableCell>Uso</TableCell>
                  <TableCell>Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {groups.map((group) => [
                  <TableRow key={`tipo-${group.tipo}`} sx={{ "&:hover": { bgcolor: "transparent !important" } }}>
                    <TableCell colSpan={8} sx={{ bgcolor: "#fbf6ef", py: 0.9, textAlign: "left", borderLeft: "3px solid", borderLeftColor: "primary.main" }}>
                      <Stack direction="row" spacing={1} alignItems="center">
                        <CategoryOutlinedIcon aria-hidden sx={{ fontSize: 17, color: "primary.dark" }} />
                        <Typography component="span" sx={{ fontWeight: 900, fontSize: "0.86rem" }}>
                          {group.tipo}
                        </Typography>
                        <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                          {group.herrajes.length} {group.herrajes.length === 1 ? "modelo" : "modelos"}
                        </Typography>
                      </Stack>
                    </TableCell>
                  </TableRow>,
                  ...group.herrajes.map((herraje) => (
                    <TableRow key={herraje.id} selected={selected.includes(herraje.id)} sx={{ "& td": { color: herraje.activo ? undefined : "text.secondary" } }}>
                      <TableCell padding="checkbox" sx={{ pl: "8px !important" }}>
                        <Checkbox
                          checked={selected.includes(herraje.id)}
                          disabled={!herraje.activo}
                          onChange={(event) => setSelected(event.target.checked ? [...selected, herraje.id] : selected.filter((id) => id !== herraje.id))}
                          inputProps={{ "aria-label": `Elegir ${herraje.nombre}` }}
                        />
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" useFlexGap flexWrap="wrap">
                          <Typography component="span" sx={{ fontWeight: 700, fontSize: "0.875rem" }}>
                            {herraje.nombre}
                          </Typography>
                          {!herraje.activo && <Chip size="small" label="Inactivo" variant="outlined" sx={{ height: 20, fontSize: "0.7rem", fontWeight: 700 }} />}
                        </Stack>
                      </TableCell>
                      <TableCell>{herraje.linea ?? <Muted>-</Muted>}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{herraje.medidaMm === null ? <Muted>-</Muted> : `${herraje.medidaMm.toLocaleString("es-AR")} mm`}</TableCell>
                      <TableCell>
                        <Chip size="small" label={unitLabel(herraje.unidad)} sx={{ height: 22, fontWeight: 700, fontSize: "0.72rem", bgcolor: "#f3ece3", color: "#5d544c" }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 800, whiteSpace: "nowrap" }}>{formatHardwarePrice(herraje.valor)}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        {herraje.usoModulos || herraje.usoSolicitudes ? (
                          `${herraje.usoModulos} módulos · ${herraje.usoSolicitudes} en solicitudes`
                        ) : (
                          <Muted>Sin uso</Muted>
                        )}
                      </TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>
                        <Stack direction="row" spacing={0.25} justifyContent="center">
                          <Tooltip title="Editar">
                            <IconButton size="small" aria-label={`Editar ${herraje.nombre}`} onClick={() => editRow(herraje)} sx={{ color: "primary.dark" }}>
                              <EditOutlinedIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={herraje.activo ? "Desactivar" : "Activar"}>
                            <IconButton
                              size="small"
                              aria-label={`${herraje.activo ? "Desactivar" : "Activar"} ${herraje.nombre}`}
                              disabled={busy}
                              sx={{ color: herraje.activo ? "#b4432f" : "#24663f" }}
                              onClick={() =>
                                void run(() => setHardwareActive(herraje.id, !herraje.activo), herraje.activo ? `"${herraje.nombre}" desactivado.` : `"${herraje.nombre}" activado.`, "No se pudo cambiar el herraje.")
                              }
                            >
                              {herraje.activo ? <ToggleOffOutlinedIcon fontSize="small" /> : <ToggleOnOutlinedIcon fontSize="small" />}
                            </IconButton>
                          </Tooltip>
                          {herraje.canDeletePermanently && (
                            <Tooltip title="Borrar (nunca se usó)">
                              <IconButton
                                size="small"
                                aria-label={`Borrar ${herraje.nombre}`}
                                disabled={busy}
                                sx={{ color: "#96382b" }}
                                onClick={() => void run(() => deleteHardware(herraje.id), `"${herraje.nombre}" borrado.`, "No se pudo borrar el herraje.")}
                              >
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
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

/** Un dato vacio de la grilla, en gris. */
function Muted({ children }: { children: string }) {
  return (
    <Typography component="span" variant="body2" sx={{ color: "text.disabled" }}>
      {children}
    </Typography>
  );
}
