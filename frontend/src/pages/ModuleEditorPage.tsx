import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import SaveIcon from "@mui/icons-material/Save";
import {
  Alert,
  AlertTitle,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Skeleton,
  Stack,
  Tab,
  Tabs,
  Typography
} from "@mui/material";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { catalogErrorMessage, createModule, deleteModule, getModule, getModulesConfig, listModuleCategories, updateModule } from "../api/catalog";
import { api } from "../api/client";
import type { ModuleImageInfo } from "../api/moduleImages";
import { GeneralTab } from "../components/moduleEditor/GeneralTab";
import { ParametersTab } from "../components/moduleEditor/ParametersTab";
import { PiecesTab } from "../components/moduleEditor/PiecesTab";
import { ProfilesTab } from "../components/moduleEditor/ProfilesTab";
import { useUnsavedChangesGuard } from "../hooks/useUnsavedChangesGuard";
import {
  codeFromName,
  copyProfileEdges,
  dependentsOf,
  draftFromDefinition,
  draftToInput,
  fitWarnings,
  formatMm,
  formulaSuggestions,
  identifierProblem,
  newModuleDraft,
  removeProfileEdges,
  renameEverywhere,
  type DraftParameter,
  type DraftPiece,
  type FitPiece,
  type ModuleDraft
} from "../lib/moduleEditor";
import { evaluateModuleDefinition, type RoundingMode } from "../lib/moduleFormula";
import type { Material, ModuleCategory, ModuleDefinition, ModuleProfile, ModulesConfig, OptimizerSettings } from "../types";

type Feedback = { severity: "success" | "error" | "info"; message: string } | null;
type Confirm = { title: string; message: string; confirmLabel: string; action: () => void | Promise<void> } | null;

const TABS = ["General", "Medidas", "Despiece y cantos", "Perfiles de canto"];

/** Editor de un modulo del catalogo (spec §6.2): /configuracion-modulos/nuevo y /configuracion-modulos/:id. */
export function ModuleEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [definition, setDefinition] = useState<ModuleDefinition | null>(null);
  const [draft, setDraft] = useState<ModuleDraft | null>(null);
  const [baseline, setBaseline] = useState("");
  const [imagen, setImagen] = useState<ModuleImageInfo | null>(null);
  const [categories, setCategories] = useState<ModuleCategory[]>([]);
  const [config, setConfig] = useState<ModulesConfig | null>(null);
  const [placas, setPlacas] = useState<Material[]>([]);
  const [optimizer, setOptimizer] = useState<OptimizerSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(0);
  const [testValues, setTestValues] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [codeTouched, setCodeTouched] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>(null);
  // Al crear se navega a /:id con el modulo ya cargado: no hace falta volver a pedirlo.
  const justCreated = useRef<string | null>(null);

  const applyDefinition = useCallback((module: ModuleDefinition) => {
    const next = draftFromDefinition(module);
    setDefinition(module);
    setDraft(next);
    setBaseline(JSON.stringify(draftToInput(next)));
    setImagen(module.imagen);
    return next;
  }, []);

  useEffect(() => {
    if (id && justCreated.current === id) {
      justCreated.current = null;
      return;
    }
    let cancelled = false;
    setDraft(null);
    setLoadError("");
    setFeedback(null);
    setServerErrors([]);
    setCodeTouched(false);
    Promise.all([
      id ? getModule(id) : Promise.resolve(null),
      listModuleCategories(),
      getModulesConfig(),
      api.get<Material[]>("/materiales", { params: { incluirInactivos: true } }),
      api.get<OptimizerSettings>("/optimizer-settings")
    ])
      .then(([module, cats, cfg, materials, optimizerSettings]) => {
        if (cancelled) return;
        setCategories(cats);
        setConfig(cfg);
        setPlacas(materials.data.filter((material) => material.tipo === "PLACA"));
        setOptimizer(optimizerSettings.data);
        if (module) applyDefinition(module);
        else {
          const loaded = newModuleDraft(cats.find((category) => category.activo)?.id ?? "");
          setDefinition(null);
          setImagen(null);
          setDraft(loaded);
          setBaseline(JSON.stringify(draftToInput(loaded)));
        }
        setTestValues({});
      })
      .catch((error) => {
        if (!cancelled) setLoadError(catalogErrorMessage(error, "No se pudo cargar el modulo."));
      });
    return () => {
      cancelled = true;
    };
  }, [id, applyDefinition]);

  const input = useMemo(() => (draft ? draftToInput(draft) : null), [draft]);
  const dirty = Boolean(input) && JSON.stringify(input) !== baseline;
  const guard = useUnsavedChangesGuard(dirty);
  const redondeo = (config?.redondeo ?? "REDONDEAR") as RoundingMode;

  // Mismo motor y mismo redondeo que la API y el armado de solicitudes (DECISIONES R6).
  const evaluation = useMemo(() => (input ? evaluateModuleDefinition(input, testValues, redondeo) : null), [input, testValues, redondeo]);
  const defaults = useMemo(() => (input ? evaluateModuleDefinition(input, {}, redondeo) : null), [input, redondeo]);
  const suggestions = useMemo(() => (draft ? formulaSuggestions(draft) : []), [draft]);

  // Encaje en las placas en las que se puede cortar cada pieza, con la funcion del optimizador (DECISIONES R2).
  const fit = useMemo(() => {
    if (!input || !evaluation || !optimizer) return { warnings: [], general: [] as string[] };
    const espesor = Number(input.espesorDisenoMm);
    const design = placas.filter((material) => material.activo && material.espesorMm === espesor);
    const fondoId = input.materialFondoId ?? config?.materialFondoId ?? null;
    const fondo = placas.find((material) => material.id === fondoId);
    const roles = new Set(input.piezas.map((pieza) => pieza.rol));
    const general: string[] = [];
    if ((roles.has("ESQUELETO") || roles.has("FRENTE")) && !design.length) {
      general.push(`No hay placas de ${formatMm(espesor)} mm activas: al cargar una solicitud no se va a poder elegir el color de esqueleto ni el de frentes.`);
    }
    if (roles.has("FONDO") && !fondo) general.push("Hay piezas que van en fondo y no hay material de fondo: elegilo en General, o para todos los modulos en Catalogo de modulos > Configuracion.");
    const byCode = new Map(input.piezas.map((pieza) => [pieza.codigo, pieza]));
    const pieces: FitPiece[] = evaluation.piezas.flatMap((result) => {
      const pieza = byCode.get(result.codigo);
      if (!pieza) return [];
      const fijo = placas.find((material) => material.id === pieza.materialFijoId);
      const candidatas = pieza.rol === "FONDO" ? (fondo ? [fondo] : []) : pieza.rol === "FIJO" ? (fijo ? [fijo] : []) : design;
      return [{ codigo: result.codigo, nombre: result.nombre, largo: result.largo, ancho: result.ancho, permiteRotar: pieza.permiteRotar, placas: candidatas }];
    });
    return { warnings: fitWarnings(pieces, optimizer), general };
  }, [input, evaluation, optimizer, placas, config]);

  const tabProblems = useMemo(() => {
    if (!draft || !evaluation || !defaults) return [0, 0, 0, 0];
    const names = [...draft.parametros.map((param) => param.clave), ...draft.piezas.map((pieza) => pieza.codigo)];
    const claves = new Set(draft.parametros.map((param) => param.clave.toUpperCase()));
    const general = (draft.nombre.trim().length < 2 ? 1 : 0) + (identifierProblem(draft.codigo, [draft.codigo]) ? 1 : 0) + (draft.categoriaId ? 0 : 1);
    const medidas =
      draft.parametros.filter((param) => identifierProblem(param.clave, names) || !param.etiqueta.trim()).length +
      defaults.errores.filter((error) => claves.has(error.ref.toUpperCase())).length;
    const piezas =
      draft.piezas.filter((pieza) => identifierProblem(pieza.codigo, names) || !pieza.nombre.trim() || (pieza.rol === "FIJO" && !pieza.materialFijoId)).length +
      evaluation.errores.filter((error) => !claves.has(error.ref.toUpperCase())).length;
    const perfiles = draft.perfiles.filter((perfil) => !perfil.nombre.trim()).length;
    return [general, medidas, piezas, perfiles];
  }, [draft, evaluation, defaults]);

  const save = useCallback(async () => {
    if (!input || saving) return;
    setSaving(true);
    setServerErrors([]);
    setFeedback(null);
    try {
      if (id) {
        const saved = await updateModule(id, input);
        applyDefinition(saved);
        setFeedback({ severity: "success", message: `Cambios guardados. "${saved.nombre}" esta en la version ${saved.version}.` });
      } else {
        const saved = await createModule(input);
        applyDefinition(saved);
        justCreated.current = saved.id;
        navigate(`/configuracion-modulos/${saved.id}`, { replace: true, state: { notification: `Modulo "${saved.nombre}" creado.` } });
      }
    } catch (error) {
      const data = (error as { response?: { data?: { message?: string; details?: { errores?: string[] } } } })?.response?.data;
      setServerErrors(data?.details?.errores ?? []);
      setFeedback({ severity: "error", message: data?.message ?? "No se pudo guardar el modulo. Revisa la conexion e intenta de nuevo." });
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  }, [applyDefinition, id, input, navigate, saving]);

  // Ctrl+S / Cmd+S guarda.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty || !id) void save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [dirty, id, save]);

  if (loadError) {
    return (
      <Stack spacing={2}>
        <Alert severity="error">{loadError}</Alert>
        <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/configuracion-modulos")} sx={{ alignSelf: "flex-start" }}>
          Volver al catalogo
        </Button>
      </Stack>
    );
  }
  if (!draft || !input || !evaluation || !defaults || !config) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={320} height={56} />
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={360} />
      </Stack>
    );
  }

  const update = (patch: Partial<ModuleDraft>) =>
    setDraft((current) => {
      if (!current) return current;
      const next = { ...current, ...patch };
      if (!id && !codeTouched && patch.nombre !== undefined) next.codigo = codeFromName(patch.nombre);
      return next;
    });
  const setParametros = (change: (parametros: DraftParameter[]) => DraftParameter[]) =>
    setDraft((current) => (current ? { ...current, parametros: change(current.parametros) } : current));
  const setPiezas = (change: (piezas: DraftPiece[]) => DraftPiece[]) => setDraft((current) => (current ? { ...current, piezas: change(current.piezas) } : current));
  const setPerfiles = (change: (perfiles: ModuleProfile[]) => ModuleProfile[]) =>
    setDraft((current) => (current ? { ...current, perfiles: change(current.perfiles) } : current));

  function rename(from: string, to: string) {
    if (!draft || !to.trim() || from === to) return;
    const { draft: next, cambiadas } = renameEverywhere(draft, from, to);
    setDraft(next);
    setTestValues((values) => {
      if (!(from in values)) return values;
      const { [from]: value, ...rest } = values;
      return { ...rest, [to]: value };
    });
    if (cambiadas) setFeedback({ severity: "info", message: `Se actualizaron ${cambiadas} ${cambiadas === 1 ? "formula que usaba" : "formulas que usaban"} ${from}: ahora usan ${to}.` });
  }

  function askRemove(kind: "medida" | "pieza", index: number) {
    if (!draft) return;
    const name = kind === "medida" ? draft.parametros[index].clave : draft.piezas[index].codigo;
    const remove = () => (kind === "medida" ? setParametros((items) => items.filter((_, i) => i !== index)) : setPiezas((items) => items.filter((_, i) => i !== index)));
    const dependents = dependentsOf(draft, name);
    if (!dependents.length) return remove();
    setConfirm({
      title: `Quitar ${kind === "medida" ? "la medida" : "la pieza"} ${name}`,
      message: `La ${dependents.length === 1 ? "usa" : "usan"} ${dependents.join(", ")}. Si la quitas, esas formulas van a dar error hasta que las corrijas.`,
      confirmLabel: "Quitar igual",
      action: remove
    });
  }

  const cantosB = draft.piezas.reduce((total, pieza) => total + pieza.cantos.filter((canto) => canto.perfilOrden === 2).length, 0);
  const activeErrors = input.activo ? [...(input.piezas.length ? [] : [{ ref: "Piezas", mensaje: "Un modulo activo necesita al menos una pieza" }]), ...defaults.errores] : [];

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", md: "row" }} spacing={2} justifyContent="space-between" alignItems={{ md: "flex-end" }}>
        <Stack spacing={0.75}>
          <Button size="small" startIcon={<ArrowBackIcon />} onClick={() => guard.requestLeave("/configuracion-modulos")} sx={{ alignSelf: "flex-start" }}>
            Catalogo de modulos
          </Button>
          <Typography variant="h4">{id ? draft.nombre.trim() || "Modulo sin nombre" : "Nuevo modulo"}</Typography>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Chip size="small" color={draft.activo ? "success" : "default"} label={draft.activo ? "Activo" : "Inactivo"} />
            {definition && <Chip size="small" variant="outlined" label={`Version ${definition.version}`} />}
            {definition?.tienePedidos && <Chip size="small" variant="outlined" label="Usado en solicitudes" />}
            {dirty && <Chip size="small" color="warning" label="Cambios sin guardar" />}
          </Stack>
        </Stack>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          {definition && !definition.tienePedidos && (
            <Button
              color="error"
              variant="outlined"
              startIcon={<DeleteOutlineIcon />}
              onClick={() =>
                setConfirm({
                  title: `Eliminar "${definition.nombre}"`,
                  message: "Se borra del catalogo con sus medidas, piezas, cantos e imagen. No se puede deshacer. Si solo queres que no aparezca al cargar, desactivalo.",
                  confirmLabel: "Eliminar",
                  action: async () => {
                    try {
                      await deleteModule(definition.id);
                      navigate("/configuracion-modulos", { state: { notification: `Modulo "${definition.nombre}" eliminado.` } });
                    } catch (error) {
                      setFeedback({ severity: "error", message: catalogErrorMessage(error, "No se pudo eliminar el modulo.") });
                    }
                  }
                })
              }
            >
              Eliminar
            </Button>
          )}
          {dirty && definition && (
            <Button
              onClick={() => {
                applyDefinition(definition);
                setServerErrors([]);
                setFeedback(null);
              }}
            >
              Descartar cambios
            </Button>
          )}
          <Button variant="contained" startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />} disabled={saving || (Boolean(id) && !dirty)} onClick={save}>
            {id ? "Guardar cambios" : "Crear modulo"}
          </Button>
        </Stack>
      </Stack>

      {feedback && (
        <Alert severity={feedback.severity} onClose={() => setFeedback(null)}>
          {feedback.message}
          {serverErrors.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {serverErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}
      {activeErrors.length > 0 && (
        <Alert severity="warning">
          <AlertTitle>Asi no se puede guardar activo</AlertTitle>
          Con los valores por defecto hay {activeErrors.length} {activeErrors.length === 1 ? "error" : "errores"}
          {": "}
          {activeErrors
            .slice(0, 4)
            .map((error) => `${error.ref}: ${error.mensaje}`)
            .join(" · ")}
          {activeErrors.length > 4 ? " · ..." : ""}. Corregilos o desactiva el modulo para guardarlo como borrador.
        </Alert>
      )}

      <Paper sx={{ borderRadius: "10px", px: 1 }}>
        <Tabs value={tab} onChange={(_, value: number) => setTab(value)} variant="scrollable" allowScrollButtonsMobile aria-label="Secciones del modulo">
          {TABS.map((label, index) => (
            <Tab
              key={label}
              id={`modulo-tab-${index}`}
              aria-controls={`modulo-panel-${index}`}
              label={
                <Stack direction="row" spacing={0.75} alignItems="center">
                  <span>{label}</span>
                  {index === 1 && <Chip size="small" label={draft.parametros.length} sx={{ height: 20 }} />}
                  {index === 2 && <Chip size="small" label={draft.piezas.length} sx={{ height: 20 }} />}
                  {tabProblems[index] > 0 && <Chip size="small" color="error" label={`${tabProblems[index]} con error`} sx={{ height: 20 }} />}
                </Stack>
              }
            />
          ))}
        </Tabs>
      </Paper>

      <Box role="tabpanel" id={`modulo-panel-${tab}`} aria-labelledby={`modulo-tab-${tab}`}>
        {tab === 0 && (
          <GeneralTab
            draft={draft}
            update={update}
            categories={categories}
            placas={placas}
            config={config}
            codeLocked={Boolean(definition?.tienePedidos)}
            importNotes={definition?.observaciones ?? null}
            onCodeEdited={() => setCodeTouched(true)}
            moduleId={definition?.id ?? null}
            imagen={imagen}
            onImageChanged={setImagen}
          />
        )}
        {tab === 1 && (
          <ParametersTab draft={draft} setParametros={setParametros} suggestions={suggestions} defaults={defaults} onRename={rename} onRemove={(index) => askRemove("medida", index)} />
        )}
        {tab === 2 && (
          <PiecesTab
            draft={draft}
            setPiezas={setPiezas}
            suggestions={suggestions}
            evaluation={evaluation}
            testValues={testValues}
            setTestValue={(clave, value) =>
              setTestValues((values) => {
                const param = draft.parametros.find((item) => item.clave.toUpperCase() === clave);
                const { [clave]: _old, ...rest } = values;
                if (value === null) return { ...rest, [clave]: Number.NaN };
                return param && value === param.valorDefecto ? rest : { ...rest, [clave]: value };
              })
            }
            resetTestValues={() => setTestValues({})}
            placas={placas}
            warnings={fit.warnings}
            generalWarnings={fit.general}
            onRename={rename}
            onRemove={(index) => askRemove("pieza", index)}
          />
        )}
        {tab === 3 && (
          <ProfilesTab
            draft={draft}
            setPerfiles={setPerfiles}
            onAddB={() => setPerfiles((perfiles) => [...perfiles, { orden: 2, nombre: "Economico", descripcion: null, predeterminado: false }])}
            onRemoveB={() => {
              const remove = () =>
                setDraft((current) =>
                  current
                    ? {
                        ...current,
                        perfiles: current.perfiles.filter((perfil) => perfil.orden !== 2).map((perfil) => ({ ...perfil, predeterminado: true })),
                        piezas: removeProfileEdges(current.piezas, 2)
                      }
                    : current
                );
              if (!cantosB) return remove();
              setConfirm({ title: "Quitar el Perfil B", message: `Se borran sus ${cantosB} lados con canto.`, confirmLabel: "Quitar", action: remove });
            }}
            onCopyAToB={() => {
              const copy = () => setPiezas((piezas) => copyProfileEdges(piezas, 1, 2));
              if (!cantosB) return copy();
              setConfirm({ title: "Copiar Perfil A a B", message: `Los ${cantosB} lados con canto del Perfil B se reemplazan por los del Perfil A.`, confirmLabel: "Copiar", action: copy });
            }}
          />
        )}
      </Box>

      {dirty && (
        <Paper
          elevation={6}
          sx={{ position: "sticky", bottom: 16, zIndex: 5, p: 1.5, borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2 }}
        >
          <Typography variant="body2" fontWeight={700}>
            Hay cambios sin guardar
          </Typography>
          <Button variant="contained" size="small" startIcon={<SaveIcon />} disabled={saving} onClick={save}>
            {id ? "Guardar cambios" : "Crear modulo"}
          </Button>
        </Paper>
      )}

      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)} maxWidth="xs" fullWidth>
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent>
          <DialogContentText>{confirm?.message}</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancelar</Button>
          <Button
            color="error"
            variant="contained"
            onClick={async () => {
              const action = confirm?.action;
              setConfirm(null);
              await action?.();
            }}
          >
            {confirm?.confirmLabel}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={guard.leaving} onClose={guard.cancelLeave} maxWidth="xs" fullWidth>
        <DialogTitle>Hay cambios sin guardar</DialogTitle>
        <DialogContent>
          <DialogContentText>Si salis ahora, se pierden los cambios de este modulo.</DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={guard.cancelLeave}>Seguir editando</Button>
          <Button color="error" onClick={guard.confirmLeave}>
            Salir sin guardar
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}
