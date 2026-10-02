import AddIcon from "@mui/icons-material/Add";
import CategoryOutlinedIcon from "@mui/icons-material/CategoryOutlined";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import {
  Alert,
  Box,
  Button,
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
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  catalogErrorMessage,
  createModuleCategory,
  duplicateModule,
  listModuleCategories,
  listModules,
  setModuleActive,
  updateModuleCategory
} from "../api/catalog";
import { ModuleCard } from "../components/ModuleCard";
import type { ModuleCategory, ModuleListItem } from "../types";

type Feedback = { severity: "success" | "error" | "warning"; message: string } | null;

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Paper variant="outlined" sx={{ px: 2, py: 1.25, borderRadius: "10px", minWidth: 150 }}>
      <Typography variant="h5" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums" }}>
        {value}
      </Typography>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
    </Paper>
  );
}

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
      setError(catalogErrorMessage(saveError, "No se pudo guardar la categoria."));
    }
  }

  async function add() {
    setError("");
    try {
      await createModuleCategory({ nombre: newName.trim(), orden: categories.length + 1 });
      setNewName("");
      onChanged();
    } catch (saveError) {
      setError(catalogErrorMessage(saveError, "No se pudo crear la categoria."));
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Categorias de modulos</DialogTitle>
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
                sx={{ flex: 1 }}
              />
              <TextField
                size="small"
                label="Orden"
                type="number"
                value={category.orden}
                onChange={(event) => setDrafts((current) => current.map((item, i) => (i === index ? { ...item, orden: Number(event.target.value) } : item)))}
                sx={{ width: 90 }}
              />
              <FormControlLabel
                control={<Switch checked={category.activo} onChange={(event) => setDrafts((current) => current.map((item, i) => (i === index ? { ...item, activo: event.target.checked } : item)))} />}
                label="Activa"
              />
              <Button size="small" onClick={() => save(drafts[index])}>
                Guardar
              </Button>
            </Stack>
          ))}
          <Stack direction="row" spacing={1}>
            <TextField size="small" label="Nueva categoria" value={newName} onChange={(event) => setNewName(event.target.value)} sx={{ flex: 1 }} />
            <Button variant="outlined" startIcon={<AddIcon />} onClick={add} disabled={newName.trim().length < 2}>
              Agregar
            </Button>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cerrar</Button>
      </DialogActions>
    </Dialog>
  );
}

export function ModuleCatalogPage() {
  const navigate = useNavigate();
  const [modules, setModules] = useState<ModuleListItem[] | null>(null);
  const [categories, setCategories] = useState<ModuleCategory[]>([]);
  const [categoriaId, setCategoriaId] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [items, cats] = await Promise.all([listModules({ categoriaId: categoriaId || undefined, search: search.trim() || undefined, incluirInactivos: showInactive }), listModuleCategories()]);
      setModules(items);
      setCategories(cats);
    } catch (error) {
      setModules([]);
      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo cargar el catalogo de modulos.") });
    }
  }, [categoriaId, search, showInactive]);

  useEffect(() => {
    const timer = window.setTimeout(load, search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  const metrics = useMemo(
    () => ({
      modulos: modules?.length ?? 0,
      piezas: (modules ?? []).reduce((total, module) => total + module.piezas, 0),
      observaciones: (modules ?? []).reduce((total, module) => total + module.cantidadObservaciones, 0)
    }),
    [modules]
  );

  async function duplicate(module: ModuleListItem) {
    setBusyId(module.id);
    try {
      const copy = await duplicateModule(module.id);
      setFeedback({ severity: "success", message: `Se creo "${copy.nombre}" (${copy.codigo}), inactivo. Revisalo y activalo cuando este listo.` });
      setShowInactive(true);
      await load();
    } catch (error) {
      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo duplicar el modulo.") });
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(module: ModuleListItem) {
    setBusyId(module.id);
    try {
      await setModuleActive(module.id, !module.activo);
      setFeedback({ severity: "success", message: module.activo ? `"${module.nombre}" quedo inactivo: no aparece al cargar solicitudes.` : `"${module.nombre}" quedo activo.` });
      await load();
    } catch (error) {
      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo cambiar el estado del modulo.") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "flex-end" }}>
        <Stack spacing={0.5}>
          <Typography variant="h4">Catalogo de modulos</Typography>
          <Typography color="text.secondary">Los muebles que se pueden pedir a medida: medidas, piezas, formulas y cantos de cada uno.</Typography>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<CategoryOutlinedIcon />} onClick={() => setCategoriesOpen(true)}>
            Categorias
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/configuracion-modulos/nuevo")}>
            Nuevo modulo
          </Button>
        </Stack>
      </Stack>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
        <Metric label="Modulos" value={metrics.modulos} />
        <Metric label="Piezas con formula" value={metrics.piezas} />
        <Metric label="Observaciones para revisar" value={metrics.observaciones} />
      </Stack>

      <Paper sx={{ p: 2, borderRadius: "10px" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} alignItems={{ md: "center" }}>
          <TextField select size="small" label="Categoria" value={categoriaId} onChange={(event) => setCategoriaId(event.target.value)} sx={{ minWidth: 220 }}>
            <MenuItem value="">Todas</MenuItem>
            {categories.map((category) => (
              <MenuItem key={category.id} value={category.id}>
                {category.nombre}
              </MenuItem>
            ))}
          </TextField>
          <TextField size="small" label="Buscar por nombre o codigo" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ flex: 1 }} />
          <FormControlLabel control={<Switch checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} />} label="Mostrar inactivos" />
        </Stack>
      </Paper>

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {modules === null
          ? Array.from({ length: 8 }, (_, index) => <Skeleton key={index} variant="rounded" height={290} />)
          : modules.map((module) => (
              <ModuleCard
                key={module.id}
                module={module}
                onClick={() => navigate(`/configuracion-modulos/${module.id}`)}
                actions={
                  <>
                    <Button size="small" startIcon={<EditIcon />} onClick={() => navigate(`/configuracion-modulos/${module.id}`)}>
                      Editar
                    </Button>
                    <Button size="small" startIcon={<ContentCopyIcon />} onClick={() => duplicate(module)} disabled={busyId === module.id}>
                      Duplicar
                    </Button>
                    <Button
                      size="small"
                      color={module.activo ? "warning" : "success"}
                      startIcon={module.activo ? <ToggleOffOutlinedIcon /> : <ToggleOnOutlinedIcon />}
                      onClick={() => toggleActive(module)}
                      disabled={busyId === module.id}
                    >
                      {module.activo ? "Desactivar" : "Activar"}
                    </Button>
                  </>
                }
              />
            ))}
      </Box>
      {modules !== null && modules.length === 0 && (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: "10px" }}>
          <Typography color="text.secondary" gutterBottom>
            {search || categoriaId ? "No hay modulos que coincidan con el filtro." : "Todavia no hay modulos en el catalogo."}
          </Typography>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/configuracion-modulos/nuevo")}>
            Cargar el primero
          </Button>
        </Paper>
      )}

      <CategoriesDialog open={categoriesOpen} onClose={() => setCategoriesOpen(false)} categories={categories} onChanged={load} />
    </Stack>
  );
}
