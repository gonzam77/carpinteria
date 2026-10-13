import AddIcon from "@mui/icons-material/Add";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ErrorOutlineRoundedIcon from "@mui/icons-material/ErrorOutlineRounded";
import EventOutlinedIcon from "@mui/icons-material/EventOutlined";
import FilterAltOffOutlinedIcon from "@mui/icons-material/FilterAltOffOutlined";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import LabelOutlinedIcon from "@mui/icons-material/LabelOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import NotificationsActiveOutlinedIcon from "@mui/icons-material/NotificationsActiveOutlined";
import RateReviewOutlinedIcon from "@mui/icons-material/RateReviewOutlined";
import RoundedCornerIcon from "@mui/icons-material/RoundedCorner";
import SaveIcon from "@mui/icons-material/Save";
import SearchIcon from "@mui/icons-material/Search";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Switch,
  TextField,
  Typography
} from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  catalogErrorMessage,
  createModuleCategory,
  duplicateModule,
  getModulesConfig,
  listModuleCategories,
  listModules,
  setModuleActive,
  updateModuleCategory,
  updateModulesConfig
} from "../api/catalog";
import { api } from "../api/client";
import { SectionHeading } from "../components/SectionHeading";
import { fieldIcon } from "../components/fieldIcon";
import { MetricGrid, MetricTile } from "../components/MetricTile";
import { ModuleCard, ModuleCardAction } from "../components/ModuleCard";
import { ModuleObservationsDialog } from "../components/ModuleObservationsDialog";
import { countByCategory, filterModules, modulesToReview } from "../lib/moduleCatalog";
import type { Material, ModuleCategory, ModuleListItem, ModulesConfig } from "../types";
import { useErrorDialog } from "../context/ErrorDialogContext";

type Feedback = { severity: "success" | "error" | "warning"; message: string } | null;

// Un color por categoria, en el orden de las categorias (tonos calidos de la marca y otros que se distinguen bien).
const CATEGORY_COLORS = ["#f28c28", "#2f6f8f", "#24663f", "#8a5a9e", "#b4432f", "#a16807", "#3b7d7a", "#5d544c"];

/** ABM minimo de categorias (spec §6.3). */
function CategoriesDialog({ open, onClose, categories, onChanged }: { open: boolean; onClose: () => void; categories: ModuleCategory[]; onChanged: () => void }) {
  const [drafts, setDrafts] = useState<ModuleCategory[]>([]);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setDrafts(categories.map((category) => ({ ...category })));
      setNewName("");
      setError("");
    }
  }, [open, categories]);

  async function save(category: ModuleCategory) {
    setError("");
    try {
      await updateModuleCategory(category.id, { nombre: category.nombre, orden: category.orden, activo: category.activo });
      onChanged();
    } catch (saveError) {
      setError(catalogErrorMessage(saveError, "No se pudo guardar la categoría."));
    }
  }

  async function add() {
    setError("");
    try {
      await createModuleCategory({ nombre: newName.trim(), orden: categories.length + 1 });
      setNewName("");
      onChanged();
    } catch (saveError) {
      setError(catalogErrorMessage(saveError, "No se pudo crear la categoría."));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Categorías de módulos</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {drafts.map((category, index) => (
            <Stack key={category.id} direction={{ xs: "column", sm: "row" }} spacing={1} alignItems={{ sm: "center" }}>
              <TextField
                size="small"
                label="Nombre"
                value={category.nombre}
                onChange={(event) => setDrafts((current) => current.map((item, i) => (i === index ? { ...item, nombre: event.target.value } : item)))}
                slotProps={{ input: fieldIcon(<LabelOutlinedIcon />) }}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Orden"
                type="number"
                value={category.orden}
                onChange={(event) => setDrafts((current) => current.map((item, i) => (i === index ? { ...item, orden: Number(event.target.value) } : item)))}
                slotProps={{ input: fieldIcon(<FormatListNumberedIcon />) }}
                sx={{ width: { sm: 120 } }}
              />
              <FormControlLabel
                control={<Switch checked={category.activo} onChange={(event) => setDrafts((current) => current.map((item, i) => (i === index ? { ...item, activo: event.target.checked } : item)))} />}
                label="Activa"
              />
              <Button size="small" startIcon={<SaveIcon />} onClick={() => save(drafts[index])}>
                Guardar
              </Button>
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              label="Nueva categoría"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              slotProps={{ input: fieldIcon(<CategoryOutlinedIcon />) }}
              sx={{ flex: 1 }}
            />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={add} disabled={newName.trim().length < 2}>
              Agregar
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<CloseIcon />} onClick={onClose}>
          Cerrar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Configuracion del catalogo (ConfiguracionModulos): material de fondo por defecto, redondeo de las medidas y
 * plazos de entrega. El redondeo cambia las medidas de todas las piezas que se calculen desde ahora.
 */
function ConfigDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (message: string) => void }) {
  const [config, setConfig] = useState<ModulesConfig | null>(null);
  const [placas, setPlacas] = useState<Material[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setConfig(null);
    setError("");
    Promise.all([getModulesConfig(), api.get<Material[]>("/materiales", { params: { incluirInactivos: true } })])
      .then(([cfg, materials]) => {
        setConfig(cfg);
        setPlacas(materials.data.filter((material) => material.tipo === "PLACA" && (material.activo || material.id === cfg.materialFondoId)));
      })
      .catch((loadError) => setError(catalogErrorMessage(loadError, "No se pudo cargar la configuración.")));
  }, [open]);

  async function save() {
    if (!config) return;
    setSaving(true);
    setError("");
    try {
      const { id: _id, ...data } = config;
      await updateModulesConfig(data);
      onSaved("Configuración del catálogo guardada.");
      onClose();
    } catch (saveError) {
      setError(catalogErrorMessage(saveError, "No se pudo guardar la configuración."));
    } finally {
      setSaving(false);
    }
  }

  const days = (value: string) => Math.max(0, Math.round(Number(value) || 0));
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Configuración del catálogo</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          {error && <Alert severity="error">{error}</Alert>}
          {!config ? (
            <Skeleton variant="rounded" height={220} />
          ) : (
            <>
              <TextField
                select
                label="Material de fondo por defecto"
                value={config.materialFondoId ?? ""}
                onChange={(event) => setConfig({ ...config, materialFondoId: event.target.value || null })}
                slotProps={{ select: { displayEmpty: true }, inputLabel: { shrink: true }, input: fieldIcon(<LayersOutlinedIcon />) }}
                helperText="Para las piezas que van en fondo, salvo que el módulo tenga uno propio. Por ejemplo, fibrofácil blanco de 3 mm."
              >
                <MenuItem value="">Sin configurar</MenuItem>
                {placas.map((material) => (
                  <MenuItem key={material.id} value={material.id}>
                    {material.nombre.trim()} · {material.espesorMm.toLocaleString("es-AR")} mm{material.activo ? "" : " (inactiva)"}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                select
                label="Redondeo de las medidas"
                value={config.redondeo}
                onChange={(event) => setConfig({ ...config, redondeo: event.target.value as ModulesConfig["redondeo"] })}
                slotProps={{ input: fieldIcon(<RoundedCornerIcon />) }}
                helperText="Las fórmulas pueden dar decimales; la máquina corta en mm enteros. Se redondea solo el resultado final de cada pieza. Pendiente de confirmar con ROMA."
              >
                <MenuItem value="REDONDEAR">Al mm más cercano (412,5 → 413)</MenuItem>
                <MenuItem value="TRUNCAR">Siempre hacia abajo (412,9 → 412)</MenuItem>
              </TextField>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
                <TextField
                  label="Días de entrega por defecto"
                  type="number"
                  value={config.diasEntregaDefecto}
                  onChange={(event) => setConfig({ ...config, diasEntregaDefecto: days(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0, max: 365 }, input: fieldIcon(<EventOutlinedIcon />) }}
                  fullWidth
                />
                <TextField
                  label="Avisar días antes del vencimiento"
                  type="number"
                  value={config.diasAvisoVencimiento}
                  onChange={(event) => setConfig({ ...config, diasAvisoVencimiento: days(event.target.value) })}
                  slotProps={{ htmlInput: { min: 0, max: 60 }, input: fieldIcon(<NotificationsActiveOutlinedIcon />) }}
                  fullWidth
                />
              </Stack>
            </>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button startIcon={<CloseIcon />} onClick={onClose}>
          Cancelar
        </Button>
        <Button variant="contained" startIcon={<SaveIcon />} onClick={save} disabled={!config || saving}>
          Guardar
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/**
 * Cuantos modulos hay de cada categoria (2026-10-13): una barra con la proporcion y una ficha por categoria. Tocar una
 * ficha filtra el listado por esa categoria; tocarla de nuevo lo vuelve a mostrar entero.
 */
function CategoryBreakdown({
  items,
  total,
  selected,
  onSelect
}: {
  items: Array<{ id: string; nombre: string; cantidad: number }>;
  total: number;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const colorOf = (index: number) => CATEGORY_COLORS[index % CATEGORY_COLORS.length];
  const percent = (count: number) => (total ? Math.round((count / total) * 100) : 0);
  return (
    <Paper sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "14px" }} component="section" aria-labelledby="catalogo-por-categoria">
      <SectionHeading
        id="catalogo-por-categoria"
        sx={{ mb: 2 }}
        icon={<CategoryOutlinedIcon />}
        title="Módulos por categoría"
        subtitle="Tocá una categoría para ver solo sus módulos."
        action={
          selected ? (
            <Button size="small" startIcon={<FilterAltOffOutlinedIcon />} onClick={() => onSelect("")} sx={{ alignSelf: { xs: "flex-start", md: "center" } }}>
              Ver todas
            </Button>
          ) : undefined
        }
      />
      {total > 0 && (
        <Box aria-hidden sx={{ display: "flex", height: 8, borderRadius: "999px", overflow: "hidden", bgcolor: "#f1e9de", mb: 1.75, gap: "2px" }}>
          {items.map((item, index) =>
            item.cantidad ? (
              <Box key={item.id} sx={{ flex: item.cantidad, bgcolor: colorOf(index), opacity: selected && selected !== item.id ? 0.3 : 1, transition: "opacity 160ms ease" }} />
            ) : null
          )}
        </Box>
      )}
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.25 }}>
        {items.map((item, index) => {
          const color = colorOf(index);
          const active = selected === item.id;
          return (
            <ButtonBase
              key={item.id}
              onClick={() => onSelect(active ? "" : item.id)}
              aria-pressed={active}
              aria-label={`${item.nombre}: ${item.cantidad} ${item.cantidad === 1 ? "módulo" : "módulos"}`}
              sx={{
                flex: "1 1 140px",
                minWidth: 0,
                justifyContent: "flex-start",
                textAlign: "left",
                gap: 1.25,
                px: 1.5,
                py: 1.1,
                borderRadius: "12px",
                border: "1px solid",
                borderColor: active ? alpha(color, 0.65) : "divider",
                bgcolor: active ? alpha(color, 0.09) : "background.paper",
                boxShadow: active ? `0 0 0 1px ${alpha(color, 0.35)}` : "none",
                transition: "border-color 160ms ease, background-color 160ms ease, transform 140ms ease",
                "&:hover": { borderColor: alpha(color, 0.55), bgcolor: alpha(color, 0.06), transform: "translateY(-1px)" },
                "&.Mui-focusVisible": { outline: `2px solid ${color}`, outlineOffset: 1 },
                "@media (prefers-reduced-motion: reduce)": { "&:hover": { transform: "none" } }
              }}
            >
              <Box aria-hidden sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: color, flexShrink: 0 }} />
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Typography noWrap title={item.nombre} sx={{ fontSize: "0.82rem", fontWeight: 700, color: "text.secondary", lineHeight: 1.3 }}>
                  {item.nombre}
                </Typography>
                <Stack direction="row" spacing={0.75} alignItems="baseline">
                  <Typography sx={{ fontSize: "1.3rem", fontWeight: 900, lineHeight: 1.15, fontVariantNumeric: "tabular-nums" }}>{item.cantidad}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                    {percent(item.cantidad)} %
                  </Typography>
                </Stack>
              </Box>
            </ButtonBase>
          );
        })}
      </Box>
    </Paper>
  );
}

export function ModuleCatalogPage() {
  const navigate = useNavigate();
  // Todo el catalogo (con o sin los inactivos): las metricas lo cuentan entero y el filtro se aplica aca (2026-10-13).
  const [modules, setModules] = useState<ModuleListItem[] | null>(null);
  const [categories, setCategories] = useState<ModuleCategory[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  // Los errores en la ventana del medio (2026-10-13); los avisos de exito quedan arriba.
  const { showError } = useErrorDialog();
  useEffect(() => {
    if (feedback?.severity !== "error") return;
    showError({ title: "No se pudo completar la acción", message: feedback.message });
    setFeedback(null);
  }, [feedback, showError]);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);
  const [observationsOpen, setObservationsOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [items, cats] = await Promise.all([listModules({ incluirInactivos: showInactive }), listModuleCategories()]);
      setModules(items);
      setCategories(cats);
    } catch (error) {
      setModules([]);
      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo cargar el catálogo de módulos.") });
    }
  }, [showInactive]);

  useEffect(() => {
    void load();
  }, [load]);

  const all = useMemo(() => modules ?? [], [modules]);
  const visible = useMemo(() => filterModules(all, { categoriaId, search }), [all, categoriaId, search]);
  const byCategory = useMemo(() => countByCategory(all, categories), [all, categories]);
  const toReview = useMemo(() => modulesToReview(all), [all]);
  const totalObservations = toReview.reduce((sum, item) => sum + item.lines.length, 0);
  const withErrors = all.filter((module) => module.estadoFormulas === "CON_ERRORES").length;
  const inactive = all.filter((module) => !module.activo).length;

  async function duplicate(module: ModuleListItem) {
    setBusyId(module.id);
    try {
      const copy = await duplicateModule(module.id);
      setFeedback({ severity: "success", message: `Se creó "${copy.nombre}" (${copy.codigo}), inactivo. Revisalo y activalo cuando esté listo.` });
      setShowInactive(true);
      await load();
    } catch (error) {
      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo duplicar el módulo.") });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(module: ModuleListItem) {
    setBusyId(module.id);
    try {
      await setModuleActive(module.id, !module.activo);
      setFeedback({ severity: "success", message: module.activo ? `"${module.nombre}" quedó inactivo: no aparece al cargar solicitudes.` : `"${module.nombre}" quedó activo.` });
      await load();
    } catch (error) {
      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo cambiar el estado del módulo.") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "flex-end" }}>
        <Stack spacing={0.5}>
          <Typography variant="h4">Catálogo de módulos</Typography>
          <Typography color="text.secondary">Los muebles que se pueden pedir a medida: medidas, piezas, fórmulas y cantos de cada uno.</Typography>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ flexShrink: 0 }}>
          <Button variant="outlined" startIcon={<SettingsOutlinedIcon />} onClick={() => setConfigOpen(true)}>
            Configuración
          </Button>
          <Button variant="outlined" startIcon={<CategoryOutlinedIcon />} onClick={() => setCategoriesOpen(true)}>
            Categorías
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/configuracion-modulos/nuevo")}>
            Nuevo módulo
          </Button>
        </Stack>
      </Stack>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      <MetricGrid min={220} sx={{ gridTemplateColumns: { xs: "1fr", sm: "repeat(auto-fit, minmax(220px, 1fr))" } }}>
        <MetricTile
          icon={<ViewModuleOutlinedIcon />}
          label="Módulos"
          value={modules === null ? "…" : all.length}
          hint={showInactive ? `${all.length - inactive} ${all.length - inactive === 1 ? "activo" : "activos"} · ${inactive} ${inactive === 1 ? "inactivo" : "inactivos"}` : "Activos, listos para pedir"}
        />
        <MetricTile
          icon={<RateReviewOutlinedIcon />}
          label="Observaciones para revisar"
          value={modules === null ? "…" : totalObservations}
          tone={totalObservations ? "warning" : "success"}
          hint={toReview.length ? `En ${toReview.length} ${toReview.length === 1 ? "módulo" : "módulos"} · tocá para verlas` : "Nada pendiente"}
          onClick={() => setObservationsOpen(true)}
        />
        <MetricTile
          icon={<ErrorOutlineRoundedIcon />}
          label="Con errores en las fórmulas"
          value={modules === null ? "…" : withErrors}
          tone={withErrors ? "error" : "success"}
          hint={withErrors ? "Alguna fórmula no se puede calcular" : "Todas las fórmulas calculan"}
        />
      </MetricGrid>

      {modules !== null && byCategory.length > 0 && <CategoryBreakdown items={byCategory} total={all.length} selected={categoriaId} onSelect={setCategoriaId} />}

      <Paper sx={{ p: 2, borderRadius: "14px" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField
            select
            size="small"
            label="Categoría"
            value={categoriaId}
            onChange={(event) => setCategoriaId(event.target.value)}
            slotProps={{ input: fieldIcon(<CategoryOutlinedIcon />), select: { displayEmpty: true }, inputLabel: { shrink: true } }}
            sx={{ minWidth: 240 }}
          >
            <MenuItem value="">Todas</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            size="small"
            label="Buscar por nombre o código"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{ input: fieldIcon(<SearchIcon />) }}
            sx={{ flex: 1 }}
          />
          <FormControlLabel control={<Switch checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />} label="Mostrar inactivos" sx={{ flexShrink: 0, mr: 0 }} />
        </Stack>
      </Paper>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 270px), 1fr))" }}>
        {modules === null
          ? Array.from({ length: 8 }, (_, index) => <Skeleton key={index} variant="rounded" height={320} sx={{ borderRadius: "14px" }} />)
          : visible.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                onClick={() => navigate(`/configuracion-modulos/${module.id}`)}
                actionsBar
                actions={
                  <>
                    <ModuleCardAction icon={<EditOutlinedIcon />} label="Editar" onClick={() => navigate(`/configuracion-modulos/${module.id}`)} />
                    <ModuleCardAction icon={<ContentCopyIcon />} label="Duplicar" onClick={() => duplicate(module)} disabled={busyId === module.id} />
                    <ModuleCardAction
                      icon={module.activo ? <ToggleOffOutlinedIcon /> : <ToggleOnOutlinedIcon />}
                      label={module.activo ? "Desactivar" : "Activar"}
                      tone={module.activo ? "error" : "success"}
                      onClick={() => toggleActive(module)}
                      disabled={busyId === module.id}
                    />
                  </>
                }
              />
            ))}
      </Box>
      {modules !== null && visible.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: "14px" }}>
          <Typography color="text.secondary" gutterBottom>
            {search || categoriaId ? "No hay módulos que coincidan con el filtro." : "Todavía no hay módulos en el catálogo."}
          </Typography>
          {search || categoriaId ? (
            <Button
              variant="outlined"
              startIcon={<FilterAltOffOutlinedIcon />}
              onClick={() => {
                setSearch("");
                setCategoriaId("");
              }}
            >
              Ver todos
            </Button>
          ) : (
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/configuracion-modulos/nuevo")}>
              Cargar el primero
            </Button>
          )}
        </Paper>
      )}

      <ConfigDialog open={configOpen} onClose={() => setConfigOpen(false)} onSaved={(message) => setFeedback({ severity: "success", message })} />
      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} categories={categories} onChanged={load} />
      <ModuleObservationsDialog
        open={observationsOpen}
        onClose={() => setObservationsOpen(false)}
        items={toReview}
        onEdit={(id) => {
          setObservationsOpen(false);
          navigate(`/configuracion-modulos/${id}`);
        }}
      />
    </Stack>
  );
}
