import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import RefreshIcon from "@mui/icons-material/Refresh";
import SaveIcon from "@mui/icons-material/Save";
import { Alert, Box, Button, CircularProgress, Paper, Skeleton, Stack, Step, StepLabel, Stepper, Typography } from "@mui/material";
import axios from "axios";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getModule, getModulesConfig, listModuleCategories, listModules } from "../api/catalog";
import { api } from "../api/client";
import { createModuleOrder, getModuleOrder, listModuleOrders, moduleOrderError, previewModuleOrder, type ModuleOrderApiError } from "../api/moduleOrders";
import { ensureSession } from "../api/session";
import { ClientStep } from "../components/moduleOrderWizard/ClientStep";
import { ModulePickerStep, type Seleccion } from "../components/moduleOrderWizard/ModulePickerStep";
import { ReviewStep, type PreviewStatus } from "../components/moduleOrderWizard/ReviewStep";
import { UnitsStep, useUnitValidations } from "../components/moduleOrderWizard/UnitsStep";
import { useAuth } from "../context/AuthContext";
import { draftScope, useFormDraft } from "../hooks/useFormDraft";
import type { RoundingMode } from "../lib/moduleFormula";
import {
  activeEdges,
  activePlates,
  applyColorsToAll,
  orderSignature,
  reconcileUnit,
  copyMeasuresToSameModel,
  defaultDeliveryDate,
  describeAge,
  hasWizardContent,
  linePayload,
  newAltaKey,
  reconcileUnits,
  restoreWizardDraft,
  syncUnits,
  todayInArgentina,
  validateClient,
  validateUnit,
  withAvailableColors,
  normalizeOverrides,
  withEdgeChoice,
  withoutEdgeOverride,
  type DefaultColors,
  type SentMark,
  type UnitCheckContext,
  type UnitValidation,
  type WizardDraft,
  type WizardUnit
} from "../lib/moduleOrderWizard";
import type { LadoCanto, Material, ModuleCategory, ModuleDefinition, ModuleListItem, ModuleOrder, ModuleOrderPreview, ModulesConfig } from "../types";

const STEPS = ["Cliente y entrega", "Elegir módulos", "Medidas y colores", "Revisar despiece"];
/** Espera antes de recalcular despues de cambiar un canto: no se calcula en cada click (PLAN P12). */
const RECALC_DELAY_MS = 700;
/** Un alta que termino fuera de la pantalla se muestra al volver solo si es reciente. */
const CREATED_AWAY_MAX_MS = 10 * 60_000;
/** Errores de la vista previa que pueden venir de un catalogo o materiales que cambiaron con el asistente abierto. */
const CATALOG_ERRORS = new Set(["MODULE_NOT_AVAILABLE", "MODULE_FORMULA_ERRORS", "MODULE_MATERIAL_INVALID"]);
const EMPTY_DEFAULTS: DefaultColors = { colorEsqueletoId: "", colorFrentesId: "" };
const money = (value: number) => value.toLocaleString("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

type CatalogData = { modules: ModuleListItem[]; categories: ModuleCategory[]; config: ModulesConfig };

/**
 * Un alta sigue en curso aunque se salga de la pantalla: el pedido no se corta. Para no crear dos veces la misma
 * solicitud, al volver (en esta pestana) se espera ese alta y se muestra su resultado en lugar de ofrecer el borrador.
 */
let createInFlight: { userId: string; promise: Promise<ModuleOrder> } | null = null;
let createdWhileAway: { userId: string; order: ModuleOrder; at: number } | null = null;

/** Problemas de una tarjeta, en una linea, para la lista de "Revisar despiece". */
function unitProblems(index: number, nombre: string, validation: UnitValidation | undefined) {
  const detalle = [
    ...(validation?.faltantes.length ? [`falta elegir ${validation.faltantes.join(", ")}`] : []),
    ...Object.entries(validation?.porMedida ?? {}).map(([clave, mensajes]) => `${clave}: ${mensajes.join(", ")}`),
    ...(validation?.generales ?? [])
  ];
  return `Módulo ${index + 1} (${nombre}): ${detalle.join("; ")}.`;
}

/** Asistente "Nueva solicitud de modulos" (spec §9.2), en /modulos/nueva. Solo ADMIN. */
export function ModuleOrderWizardPage() {
  // "Cargar otra solicitud" vuelve a montar el asistente: el borrador queda cerrado despues de crear (useFormDraft).
  const [session, setSession] = useState(0);
  return <ModuleOrderWizard key={session} onRestart={() => setSession((value) => value + 1)} />;
}

function ModuleOrderWizard({ onRestart }: { onRestart: () => void }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userId = user?.id ?? "";
  const scope = draftScope(user?.id);

  // ---------------------------------------------------------------- datos del catalogo
  const [data, setData] = useState<CatalogData | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [definitions, setDefinitions] = useState<Map<string, ModuleDefinition>>(new Map());
  /** Materiales al dia: se vuelven a traer al revisar el despiece y con cada vista previa. */
  const [materials, setMaterials] = useState<Material[]>([]);

  // ---------------------------------------------------------------- lo que carga la persona
  const [cliente, setCliente] = useState("");
  const [numeroContacto, setNumeroContacto] = useState("");
  const [emailContacto, setEmailContacto] = useState("");
  const [direccionEntrega, setDireccionEntrega] = useState("");
  const [fechaEntrega, setFechaEntrega] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [selecciones, setSelecciones] = useState<Seleccion[]>([]);
  const [units, setUnits] = useState<WizardUnit[]>([]);
  const [defaults, setDefaults] = useState<DefaultColors>(EMPTY_DEFAULTS);
  const [step, setStep] = useState(0);
  const [enviado, setEnviado] = useState<SentMark | null>(null);

  // ---------------------------------------------------------------- vista previa y alta
  const [preview, setPreview] = useState<ModuleOrderPreview | null>(null);
  const [previewStatus, setPreviewStatus] = useState<PreviewStatus>("idle");
  const [previewError, setPreviewError] = useState<ModuleOrderApiError | null>(null);
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);
  const [createError, setCreateError] = useState<ModuleOrderApiError | null>(null);
  const [created, setCreated] = useState<ModuleOrder | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [avisos, setAvisos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [waitingPrevious, setWaitingPrevious] = useState(() => Boolean(createInFlight && createInFlight.userId === userId));

  const today = todayInArgentina();
  const redondeo = (data?.config.redondeo ?? "REDONDEAR") as RoundingMode;
  // Para el canto por defecto de cada lado, como el servidor: el de la placa de la pieza (DECISIONES 45).
  const edgeContext = useMemo(() => ({ cantos: activeEdges(materials), configFondoId: data?.config.materialFondoId ?? null }), [materials, data]);
  // Lo que el servidor revisa de los materiales, para que el paso 3 no diga "Listo" en algo que se va a rechazar.
  const checkContext: UnitCheckContext = useMemo(
    () => ({ activePlateIds: new Set(activePlates(materials).map((material) => material.id)), configFondoId: data?.config.materialFondoId ?? null }),
    [materials, data]
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadError("");
    Promise.all([listModules(), listModuleCategories(), getModulesConfig(), api.get<Material[]>("/materiales")])
      .then(([modules, categories, config, materialsResponse]) => {
        if (cancelled) return;
        setData({ modules, categories: categories.filter((category) => category.activo), config });
        setMaterials(materialsResponse.data);
        // Precarga, no sincronizacion: si ya hay una fecha (borrador recuperado), no se pisa.
        setFechaEntrega((current) => current || defaultDeliveryDate(config.diasEntregaDefecto));
      })
      .catch((error) => {
        if (cancelled) return;
        if (axios.isAxiosError(error) && error.response?.status === 401) setLoadError("Tu sesión expiró. Volvé a ingresar para cargar la solicitud.");
        else if (axios.isAxiosError(error) && !error.response) setLoadError("No se pudo cargar el catálogo de módulos: revisá la conexión e intentá de nuevo.");
        else setLoadError("No se pudo cargar el catálogo de módulos. Intentá de nuevo en un momento.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadAttempt]);

  // ---------------------------------------------------------------- borrador (useFormDraft, spec §9.2)
  const snapshot: WizardDraft = useMemo(
    () => ({ cliente, numeroContacto, emailContacto, direccionEntrega, fechaEntrega, observaciones, selecciones, units, defaults, step, enviado }),
    [cliente, numeroContacto, emailContacto, direccionEntrega, fechaEntrega, observaciones, selecciones, units, defaults, step, enviado]
  );
  const { pendingDraft, draftSavedAt, restoreDraft, dismissDraft, clearDraft, saveNow } = useFormDraft<WizardDraft>(scope ? `${scope}modules:new` : null, snapshot, {
    ready: Boolean(data) && !waitingPrevious,
    worthSaving: hasWizardContent(snapshot) && !created
  });
  const recoverable = !waitingPrevious && pendingDraft && hasWizardContent(pendingDraft) ? pendingDraft : null;
  const draftModules = recoverable && Array.isArray(recoverable.selecciones) ? recoverable.selecciones.reduce((sum, item) => sum + (Number(item?.cantidad) || 0), 0) : 0;
  useEffect(() => {
    if (pendingDraft && !hasWizardContent(pendingDraft)) dismissDraft();
  }, [pendingDraft, dismissDraft]);

  // Un alta que sigue en curso desde un montaje anterior (o que termino mientras no se estaba en la pantalla).
  useEffect(() => {
    if (createdWhileAway && createdWhileAway.userId === userId) {
      const { order, at } = createdWhileAway;
      createdWhileAway = null;
      setWaitingPrevious(false);
      if (Date.now() - at <= CREATED_AWAY_MAX_MS) {
        clearDraft();
        setCreated(order);
      }
      return;
    }
    const pending = createInFlight;
    // Si el alta anterior ya termino (con error) entre el primer dibujo y este momento, no hay nada que esperar.
    if (!pending || pending.userId !== userId) {
      setWaitingPrevious(false);
      return;
    }
    let alive = true;
    setWaitingPrevious(true);
    pending.promise
      .then((order) => {
        if (!alive) return;
        createdWhileAway = null;
        clearDraft();
        setCreated(order);
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setWaitingPrevious(false);
      });
    return () => {
      alive = false;
    };
    // Solo al montar: es lo que quedo de un montaje anterior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lo ultimo que se mostro, para las funciones que siguen trabajando despues de un await (vista previa, revision).
  const latest = useRef({ units, definitions, selecciones, materials, cliente, numeroContacto });
  latest.current = { units, definitions, selecciones, materials, cliente, numeroContacto };

  /**
   * Trae las definiciones que faltan de `ids` (con sus piezas y perfiles), sobre `base`. Las que el catalogo ya no tiene
   * (404) vuelven en `removed`; si falla la conexion, `failed`.
   */
  const loadDefinitions = useCallback(async (ids: string[], base: Map<string, ModuleDefinition>) => {
    const missing = [...new Set(ids)].filter((id) => !base.has(id));
    const removed: string[] = [];
    let failed = false;
    if (!missing.length) return { defs: base, removed, failed };
    const loaded = await Promise.all(
      missing.map((id) =>
        getModule(id).catch((error) => {
          if (axios.isAxiosError(error) && error.response?.status === 404) removed.push(id);
          else failed = true;
          return null;
        })
      )
    );
    const defs = new Map(base);
    loaded.forEach((definition) => definition && defs.set(definition.id, definition));
    setDefinitions(defs);
    return { defs, removed, failed };
  }, []);

  async function applyDraft() {
    if (!data || !recoverable || creatingRef.current) return;
    const raw = recoverable;
    setBusy(true);
    try {
      const activeIds = new Set(data.modules.map((module) => module.id));
      const ids = (Array.isArray(raw.selecciones) ? raw.selecciones : []).map((item) => item?.moduloId).filter((id): id is string => typeof id === "string" && activeIds.has(id));
      const { defs, failed } = await loadDefinitions(ids, definitions);
      if (creatingRef.current) return;
      // Sin conexion no se recupera a medias: el borrador sigue ofrecido para intentar de nuevo.
      if (failed) {
        setErrors(["No se pudo cargar algún módulo del borrador. Revisá la conexión e intentá de nuevo."]);
        return;
      }
      restoreDraft();
      dropPreview();
      setPreview(null);
      setPreviewStatus("idle");
      setPreviewError(null);
      setCreateError(null);
      const { draft, avisos: restoreAvisos } = restoreWizardDraft(raw, {
        definitions: defs,
        materials,
        today,
        defaultFecha: defaultDeliveryDate(data.config.diasEntregaDefecto)
      });
      setCliente(draft.cliente);
      setNumeroContacto(draft.numeroContacto);
      setEmailContacto(draft.emailContacto);
      setDireccionEntrega(draft.direccionEntrega);
      setFechaEntrega(draft.fechaEntrega);
      setObservaciones(draft.observaciones);
      setSelecciones(draft.selecciones);
      setUnits(draft.units);
      setDefaults(draft.defaults);
      setStep(draft.step);
      setEnviado(draft.enviado);
      setAvisos([
        ...restoreAvisos,
        ...(draft.enviado ? ["Esta solicitud se estaba creando cuando se cerró la pantalla: al crearla se revisa primero si ya quedó cargada."] : [])
      ]);
      setErrors([]);
    } finally {
      setBusy(false);
    }
  }

  // ---------------------------------------------------------------- vista previa (paso 4)
  // Una sola vista previa a la vez: el servidor la calcula entera aunque el navegador la corte, y el optimizador ocupa
  // su unico hilo (PLAN P12). Los cambios de canto esperan una pausa corta; si llegan cambios mientras se calcula, o se
  // vuelve a pedir (volver y avanzar, 409), al terminar se calcula una sola vez mas con todo. Una respuesta que llega con
  // cambios posteriores se muestra, pero no habilita crear.
  const inFlight = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const recalcTimer = useRef<number | null>(null);
  const recalcPending = useRef(false);
  const edits = useRef(0);
  const previewSeq = useRef(0);
  const sendPreviewRef = useRef<() => Promise<void>>(async () => undefined);
  const catalogCheckRef = useRef<() => Promise<void>>(async () => undefined);

  const clearRecalcTimer = () => {
    if (recalcTimer.current) window.clearTimeout(recalcTimer.current);
    recalcTimer.current = null;
  };

  /** Se deja de esperar lo que esta en curso (se salio del paso 4): su respuesta se ignora, pero no se corta. */
  const dropPreview = useCallback(() => {
    generation.current += 1;
    if (recalcTimer.current) window.clearTimeout(recalcTimer.current);
    recalcTimer.current = null;
    recalcPending.current = false;
  }, []);
  useEffect(
    () => () => {
      dropPreview();
      inFlight.current?.abort();
    },
    [dropPreview]
  );

  async function sendPreview() {
    const controller = new AbortController();
    inFlight.current = controller;
    const gen = generation.current;
    const sentEdits = edits.current;
    const seq = ++previewSeq.current;
    const current = () => generation.current === gen;
    const outdated = () => edits.current !== sentEdits || recalcPending.current;
    setPreviewStatus("loading");
    setPreviewError(null);
    const { units: currentUnits, definitions: defs, cliente: name, numeroContacto: phone } = latest.current;
    try {
      if (!(await ensureSession())) {
        if (current() && !outdated()) {
          setPreviewStatus("error");
          setPreviewError({ message: "Tu sesión expiró. Volvé a ingresar para continuar: la solicitud sigue cargada.", items: [] });
        }
        return;
      }
      const modulos = currentUnits.map((unit) => linePayload(unit, defs.get(unit.moduloId)!));
      const result = await previewModuleOrder({ cliente: name.trim(), numeroContacto: phone.trim(), modulos }, { signal: controller.signal });
      if (!current()) return;
      setPreview(result);
      // Materiales al dia para el plano y los avisos de cantos: si se cargo un canto en otra pestana, que se vea.
      api
        .get<Material[]>("/materiales")
        .then((response) => previewSeq.current === seq && mounted.current && setMaterials(response.data))
        .catch(() => undefined);
      if (outdated()) return;
      setPreviewStatus("ready");
      // Un aviso de "espera" o un error viejo ya no vale; el de MODULE_CHANGED queda hasta el proximo intento.
      setCreateError((value) => (value?.code === "MODULE_CHANGED" ? value : null));
      // El catalogo cambio despues de traer las definiciones: se revisa contra la version nueva.
      if (result.modulos.some((item) => defs.get(item.moduloId) && defs.get(item.moduloId)!.version !== item.version)) void catalogCheckRef.current();
    } catch (error) {
      if (controller.signal.aborted || !current() || outdated()) return;
      // Queda la ultima vista previa buena a la vista: se puede volver atras un canto desde la tabla.
      const problem = moduleOrderError(error, "No se pudo calcular la solicitud.");
      setPreviewError(problem);
      setPreviewStatus("error");
      if (problem.code && CATALOG_ERRORS.has(problem.code)) void catalogCheckRef.current();
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
      if (recalcPending.current && mounted.current) {
        recalcPending.current = false;
        void sendPreviewRef.current();
      }
    }
  }
  sendPreviewRef.current = sendPreview;

  /** Pide una vista previa con lo que hay ahora; si hay una en curso, se calcula al terminar esa. */
  function requestPreview() {
    clearRecalcTimer();
    if (inFlight.current) {
      recalcPending.current = true;
      setPreviewStatus("loading");
      return;
    }
    void sendPreview();
  }
  const requestPreviewRef = useRef(requestPreview);
  requestPreviewRef.current = requestPreview;

  function schedulePreview() {
    edits.current += 1;
    clearRecalcTimer();
    setPreviewStatus("stale");
    recalcTimer.current = window.setTimeout(() => {
      recalcTimer.current = null;
      requestPreviewRef.current();
    }, RECALC_DELAY_MS);
  }

  /**
   * Vuelve a traer del catalogo las definiciones de los modulos elegidos y los materiales, y limpia las tarjetas contra
   * eso (modulos que ya no estan, medidas, piezas y perfiles que cambiaron, colores que ya no sirven), con avisos.
   * Devuelve si hay algo para revisar en el paso 3, o null si no se pudo revisar (conexion).
   */
  async function refreshCatalog() {
    const { units: currentUnits, definitions: previous, selecciones: currentSel } = latest.current;
    const ids = [...new Set(currentSel.map((item) => item.moduloId))];
    let fresh: Map<string, ModuleDefinition | null>;
    let freshMaterials: Material[];
    let freshConfig: ModulesConfig;
    try {
      const [entries, materialsResponse, config] = await Promise.all([
        Promise.all(
          ids.map(async (id) => {
            try {
              return [id, await getModule(id)] as const;
            } catch (error) {
              if (axios.isAxiosError(error) && error.response?.status === 404) return [id, null] as const;
              throw error;
            }
          })
        ),
        api.get<Material[]>("/materiales"),
        getModulesConfig()
      ]);
      fresh = new Map<string, ModuleDefinition | null>(entries);
      freshMaterials = materialsResponse.data;
      freshConfig = config;
    } catch {
      return null;
    }
    // La configuracion del catalogo (fondo por defecto, redondeo) tambien pudo cambiar.
    setData((current) => (current ? { ...current, config: freshConfig } : current));
    // Que cambio, mirando lo que habia al empezar (para avisar); la limpieza se aplica sobre lo que haya al terminar,
    // para no pisar un cambio de canto hecho mientras se revisaba.
    const reconciled = reconcileUnits(currentUnits, fresh, previous);
    const coloresLimpios = reconciled.units.some((unit) => withAvailableColors(unit, fresh.get(unit.moduloId)!, freshMaterials).changed);
    const removedIds = new Set(ids.filter((id) => !fresh.get(id)?.activo));
    const clean = (list: WizardUnit[]) =>
      list.flatMap((unit) => {
        const definition = fresh.get(unit.moduloId);
        if (definition === undefined) return [unit];
        if (!definition || !definition.activo) return [];
        return [withAvailableColors(reconcileUnit(unit, definition, previous.get(unit.moduloId)), definition, freshMaterials).unit];
      });
    // Sobre lo que haya al terminar (se pudo elegir o cargar algo mientras tanto): se agrega lo nuevo y se saca lo quitado.
    const mergeDefs = (current: Map<string, ModuleDefinition>) => {
      const next = new Map(current);
      fresh.forEach((definition, id) => {
        if (definition && definition.activo) next.set(id, definition);
        else next.delete(id);
      });
      return next;
    };
    const keepSel = (list: Seleccion[]) => list.filter((item) => !removedIds.has(item.moduloId));
    const nuevas = ids
      .filter((id) => fresh.get(id) && previous.get(id) && fresh.get(id)!.version !== previous.get(id)!.version)
      .map((id) => fresh.get(id)!.nombre)
      .filter((nombre) => !reconciled.cambiados.includes(nombre));
    const unitsChanged = reconciled.quitados.length > 0 || reconciled.cambiados.length > 0 || coloresLimpios;
    setDefinitions(mergeDefs);
    setMaterials(freshMaterials);
    if (unitsChanged) setUnits(clean);
    if (removedIds.size) setSelecciones(keepSel);
    const nextSel = keepSel(latest.current.selecciones);
    latest.current = {
      ...latest.current,
      units: unitsChanged ? clean(latest.current.units) : latest.current.units,
      definitions: mergeDefs(latest.current.definitions),
      selecciones: nextSel,
      materials: freshMaterials
    };
    const notes = [
      ...reconciled.quitados.map((nombre) => `Se quitó ${nombre}: ya no está en el catálogo o está inactivo.`),
      ...reconciled.cambiados.map((nombre) => `${nombre} cambió en el catálogo: revisá sus medidas y cantos.`),
      ...nuevas.map((nombre) => `Se usa la versión nueva de ${nombre} del catálogo.`),
      ...(coloresLimpios ? ["Algunos colores o fondos ya no están disponibles: elegilos de nuevo."] : [])
    ];
    if (notes.length) setAvisos(notes);
    return { needsReview: unitsChanged, empty: nextSel.length === 0, config: freshConfig };
  }

  /** Vuelve al paso 3 (o al 2 si no queda ningun modulo) para revisar lo que cambio en el catalogo. */
  function backToUnits(empty: boolean) {
    dropPreview();
    setPreview(null);
    setPreviewStatus("idle");
    setPreviewError(null);
    setStep(empty ? 1 : 2);
  }

  // Si algo cambio en las tarjetas se vuelve al paso 3 con los avisos. Si no, queda lo que se ve: con un error, el error;
  // con una version nueva que no cambia las tarjetas, la vista previa ya la uso.
  // Si mientras tanto se salio del paso 4, no se mueve a nadie de paso: lo que cambio se ve igual en el paso 3.
  catalogCheckRef.current = async () => {
    const gen = generation.current;
    const refresh = await refreshCatalog();
    if (mounted.current && refresh && generation.current === gen && (refresh.needsReview || refresh.empty)) backToUnits(refresh.empty);
  };

  // ---------------------------------------------------------------- pasos
  const validations = useUnitValidations(units, definitions, redondeo, checkContext);
  const errorsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!errors.length) return;
    // La lista aparece arriba: se la trae a la vista y se le da el foco, para que no parezca que el boton no anda.
    errorsRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    errorsRef.current?.focus({ preventScroll: true });
  }, [errors]);
  const avisosRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!avisos.length || errors.length) return;
    // Igual con los avisos (por ejemplo, el catalogo cambio al tocar "Revisar despiece"): que se vean.
    avisosRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    avisosRef.current?.focus({ preventScroll: true });
    // Solo cuando aparecen avisos nuevos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avisos]);
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [step]);

  async function next() {
    setErrors([]);
    setAvisos([]);
    if (step === 0) {
      const problems = validateClient({ cliente, numeroContacto, emailContacto, direccionEntrega, observaciones, fechaEntrega }, today);
      if (problems.length) return setErrors(problems);
      return setStep(1);
    }
    if (step === 1) {
      if (!selecciones.length) return setErrors(["Elegí al menos un módulo."]);
      if (!data) return;
      setBusy(true);
      try {
        let defs = definitions;
        const removed = new Set<string>();
        const pendientes = () => latest.current.selecciones.map((item) => item.moduloId).filter((id) => !defs.has(id) && !removed.has(id));
        // Lo que se elige mientras se cargan las definiciones tambien cuenta: despues de cada carga se mira lo elegido de
        // nuevo, hasta que no falte ninguna.
        for (let round = 0; round < 5 && pendientes().length; round += 1) {
          const loaded = await loadDefinitions(pendientes(), defs);
          defs = loaded.defs;
          loaded.removed.forEach((id) => removed.add(id));
          if (loaded.failed) return setErrors(["No se pudo cargar algún módulo elegido. Revisá la conexión e intentá de nuevo."]);
        }
        if (pendientes().length) return setErrors(["No se pudo cargar algún módulo elegido. Revisá la conexión e intentá de nuevo."]);
        if (removed.size) {
          setSelecciones((list) => list.filter((item) => !removed.has(item.moduloId)));
          setAvisos(["Se quitó algún módulo elegido: ya no está en el catálogo."]);
        }
        const elegidas = latest.current.selecciones.filter((item) => !removed.has(item.moduloId));
        if (!elegidas.length) return setErrors(["Elegí al menos un módulo."]);
        setUnits((current) => syncUnits(current, elegidas, defs, defaults, latest.current.materials));
        setStep(2);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 2) {
      setBusy(true);
      try {
        // Antes de calcular se revisa contra el catalogo y los materiales de ahora (el servidor arma con la definicion
        // actual, DECISIONES 25): si algo cambio, se avisa aca.
        const refresh = await refreshCatalog();
        if (!mounted.current) return;
        if (!refresh) return setErrors(["No se pudo revisar el catálogo y los materiales. Revisá la conexión e intentá de nuevo."]);
        if (refresh.empty) return setStep(1);
        if (refresh.needsReview) return;
        const { units: currentUnits, definitions: defs, materials: currentMaterials } = latest.current;
        const freshContext: UnitCheckContext = {
          activePlateIds: new Set(activePlates(currentMaterials).map((material) => material.id)),
          configFondoId: refresh.config.materialFondoId
        };
        const freshRedondeo = refresh.config.redondeo as RoundingMode;
        const problems = currentUnits
          .map((unit, index) => {
            const definition = defs.get(unit.moduloId)!;
            const validation = validateUnit(unit, definition, freshRedondeo, freshContext);
            return validation.ok ? null : unitProblems(index, definition.nombre, validation);
          })
          .filter((problem): problem is string => problem !== null);
        if (problems.length) return setErrors(problems);
        setStep(3);
        setPreview(null);
        setCreateError(null);
        requestPreview();
      } finally {
        setBusy(false);
      }
    }
  }

  function back() {
    setErrors([]);
    setCreateError(null);
    if (step === 3) {
      dropPreview();
      setPreview(null);
      setPreviewStatus("idle");
      setPreviewError(null);
    }
    setStep((current) => Math.max(0, current - 1));
  }

  /** La solicitud de un intento de alta, por su clave, si entro (DECISIONES 40). */
  async function findByKey(clave: string) {
    const rows = await listModuleOrders({ clave });
    return rows[0] ? getModuleOrder(rows[0].id) : null;
  }

  function finishCreated(order: ModuleOrder) {
    clearDraft();
    setEnviado(null);
    setCreated(order);
  }

  async function create() {
    // Un ref y no el estado: un segundo click antes del re-render no crea dos solicitudes.
    if (creatingRef.current) return;
    setCreateError(null);
    if (!preview || previewStatus !== "ready") {
      // El detalle del error se repite aca: el aviso de la vista previa queda arriba, lejos del boton.
      setCreateError(
        previewStatus === "error"
          ? { message: "Todavía no se puede crear: corregí lo que dice el aviso del despiece.", items: previewError ? [previewError.message, ...previewError.items] : [] }
          : { message: "Esperá a que termine el cálculo para crear la solicitud.", items: [] }
      );
      return;
    }
    // Con un borrador anterior ofrecido y sin decidir, la marca de envio no tendria donde guardarse (DECISIONES 36).
    if (recoverable) {
      setCreateError({
        message: "Antes de crear, decidí qué hacer con la solicitud sin terminar que se ofrece arriba: Descartar la borra y seguís con lo que ves; Recuperar reemplaza lo que ves por esa.",
        items: []
      });
      return;
    }
    creatingRef.current = true;
    setCreating(true);
    let mark: SentMark | null = null;
    let reused = false;
    try {
      if (!(await ensureSession())) {
        setCreateError({ message: "Tu sesión expiró. Volvé a ingresar: tu solicitud sigue cargada.", items: [] });
        return;
      }
      // Si mientras se volvia a ingresar se salio de la pantalla, no se manda nada: el borrador queda como estaba.
      if (!mounted.current) return;
      const modulos = units.map((unit, index) => linePayload(unit, definitions.get(unit.moduloId)!, preview.modulos[index]?.version));
      const body = {
        cliente: cliente.trim(),
        numeroContacto: numeroContacto.trim(),
        emailContacto: emailContacto.trim() || null,
        direccionEntrega: direccionEntrega.trim() || null,
        fechaEntrega,
        observaciones: observaciones.trim() || null,
        modulos
      };
      // La huella no lleva las versiones: si solo cambio el catalogo, sigue siendo lo que se cargo.
      const firma = orderSignature({ ...body, modulos: modulos.map(({ version: _version, ...line }) => line) });
      mark = enviado;
      // Un intento anterior quedo sin respuesta y despues se cambio algo: primero se mira si ese intento entro.
      if (mark && mark.firma !== firma) {
        let found: ModuleOrder | null;
        try {
          found = await findByKey(mark.clave);
        } catch {
          setCreateError({ message: "No se pudo revisar si la solicitud que se mandó antes quedó cargada. Revisá la conexión e intentá de nuevo.", items: [] });
          return;
        }
        if (!mounted.current) return;
        if (found) {
          // Quedo cargada con los datos de antes: no se muestra como si fuera esta ni se crea otra sin avisar.
          setEnviado(null);
          setCreateError({
            message: `La solicitud M-${found.numero} ya había quedado cargada con los datos que se mandaron antes. Revisala: si tocás Crear solicitud otra vez, se crea una nueva con lo que ves ahora.`,
            items: [],
            code: "ALREADY_CREATED",
            details: { id: found.id, numero: found.numero }
          });
          return;
        }
        mark = null;
      }
      // Lo mismo que un intento sin respuesta: se manda con la misma clave y, si ya habia entrado, el servidor devuelve esa.
      if (!mark) {
        mark = { clave: newAltaKey(), firma };
        setEnviado(mark);
      } else reused = true;
      // La marca va al borrador en el momento: si se sale de la pantalla enseguida, tiene que quedar que se mando.
      saveNow({ ...snapshot, enviado: mark });
      const promise = createModuleOrder({ ...body, claveAlta: mark.clave });
      createInFlight = { userId, promise };
      let order: ModuleOrder;
      try {
        order = await promise;
      } finally {
        if (createInFlight?.promise === promise) createInFlight = null;
      }
      if (!mounted.current) {
        // Se salio de la pantalla mientras se creaba: el proximo montaje muestra el resultado.
        createdWhileAway = { userId, order, at: Date.now() };
        clearDraft();
        return;
      }
      finishCreated(order);
    } catch (error) {
      if (!mounted.current) return;
      const problem = moduleOrderError(error, "No se pudo crear la solicitud.", true);
      // Sin respuesta o con un error del servidor (5xx) no se sabe si entro: la marca queda y reintentar es seguro.
      if (mark && (problem.noResponse || (problem.status ?? 0) >= 500)) {
        let found: ModuleOrder | null = null;
        let checked = true;
        try {
          found = await findByKey(mark.clave);
        } catch {
          checked = false;
        }
        if (!mounted.current) return;
        if (found) {
          finishCreated(found);
          return;
        }
        setCreateError({
          message: checked
            ? "No llegó la respuesta del servidor y la solicitud todavía no aparece. Tocá Crear solicitud de nuevo: si ya había quedado cargada, se muestra esa y no se crea otra."
            : "No llegó la respuesta del servidor y no se pudo revisar si quedó cargada. Cuando vuelva la conexión, tocá Crear solicitud: si ya había quedado cargada, se muestra esa y no se crea otra.",
          items: []
        });
        return;
      }
      // Un rechazo del servidor (datos, version, permisos): esta llamada no escribio nada. Si se reintentaba un alta sin
      // respuesta, esa pudo haber entrado: se busca antes de borrar la marca.
      if (mark && reused) {
        const found = await findByKey(mark.clave).catch(() => null);
        if (!mounted.current) return;
        if (found) {
          finishCreated(found);
          return;
        }
      }
      setEnviado(null);
      setCreateError(problem);
      // El catalogo cambio desde la vista previa: se revisa y se vuelve a calcular con las versiones nuevas (DECISIONES 25).
      if (problem.code === "MODULE_CHANGED") {
        const refresh = await refreshCatalog();
        if (!mounted.current) return;
        if (refresh && (refresh.needsReview || refresh.empty)) backToUnits(refresh.empty);
        else requestPreview();
      }
    } finally {
      creatingRef.current = false;
      if (mounted.current) setCreating(false);
    }
  }

  // Al corregir algo, la lista de problemas del ultimo "Siguiente" ya no vale: las tarjetas marcan lo que falta en vivo.
  const editUnits = (update: (current: WizardUnit[]) => WizardUnit[]) => {
    setUnits(update);
    setErrors([]);
  };
  const updateUnit = (uid: string, patch: Partial<WizardUnit>) =>
    editUnits((current) =>
      current.map((unit) => {
        if (unit.uid !== uid) return unit;
        const next = { ...unit, ...patch };
        const definition = definitions.get(unit.moduloId);
        // Con otro perfil, color o fondo, un canto elegido a mano que quedo igual al de por defecto deja de ser un cambio.
        return definition ? normalizeOverrides(next, definition, edgeContext) : next;
      })
    );

  const onEdgeChange = (uid: string, codigo: string, lado: LadoCanto, cantoId: string | null) => {
    if (creatingRef.current) return;
    const unit = latest.current.units.find((item) => item.uid === uid);
    const definition = unit ? definitions.get(unit.moduloId) : undefined;
    if (!unit || !definition) return;
    const next = withEdgeChoice(unit, definition, codigo, lado, cantoId, edgeContext);
    // Si no cambio nada, no hay nada que recalcular.
    if (next === unit) return;
    setUnits((list) => list.map((item) => (item.uid === uid ? next : item)));
    schedulePreview();
  };
  const onResetPiece = (uid: string, codigo: string) => {
    if (creatingRef.current) return;
    const unit = latest.current.units.find((item) => item.uid === uid);
    if (!unit) return;
    const next = withoutEdgeOverride(unit, codigo);
    if (next === unit) return;
    setUnits((list) => list.map((item) => (item.uid === uid ? next : item)));
    schedulePreview();
  };

  // ---------------------------------------------------------------- pantalla
  const successRef = useRef<HTMLHeadingElement | null>(null);
  useEffect(() => {
    if (!created) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
    successRef.current?.focus();
  }, [created]);

  // El exito y la espera de un alta anterior no necesitan el catalogo: se muestran antes de que cargue.
  if (created) {
    return (
      <Stack spacing={3}>
        <Paper role="status" sx={{ p: { xs: 2.5, sm: 3 }, borderRadius: "10px" }}>
          <Stack spacing={2} alignItems="flex-start">
            <Stack direction="row" spacing={1.5} alignItems="center">
              <CheckCircleOutlineIcon color="primary" sx={{ fontSize: 40 }} />
              <Box>
                <Typography ref={successRef} tabIndex={-1} variant="h4" component="h1" sx={{ outline: "none" }}>
                  Solicitud M-{created.numero} creada
                </Typography>
                <Typography color="text.secondary">
                  {created.cliente} · entrega {created.fechaEntrega?.split("-").reverse().join("/")} · {created.modulos.length}{" "}
                  {created.modulos.length === 1 ? "módulo" : "módulos"}
                </Typography>
              </Box>
            </Stack>
            <Typography>
              {created.placasEstimadas} {created.placasEstimadas === 1 ? "placa" : "placas"} · presupuesto estimado {money(created.presupuestoConHerrajes)}
            </Typography>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ width: { xs: "100%", sm: "auto" } }}>
              {/* Hasta que exista el detalle de modulos (F5.1), el estado, el stock y el Excel se manejan desde el detalle comun. */}
              <Button variant="contained" onClick={() => navigate(`/modulos/${created.id}`, { state: { returnTo: "/modulos" } })} sx={{ width: { xs: "100%", sm: "auto" } }}>
                Ver la solicitud
              </Button>
              <Button variant="outlined" onClick={onRestart} sx={{ width: { xs: "100%", sm: "auto" } }}>
                Cargar otra solicitud
              </Button>
            </Stack>
          </Stack>
        </Paper>
      </Stack>
    );
  }

  if (waitingPrevious) {
    return (
      <Stack spacing={2}>
        <Typography variant="h4">Nueva solicitud de módulos</Typography>
        <Alert severity="info" icon={<CircularProgress size={20} />} role="status">
          Se está terminando de crear la solicitud que mandaste antes de salir de la pantalla. Esperá unos segundos: no hace falta cargarla de nuevo.
        </Alert>
      </Stack>
    );
  }

  if (loadError) {
    return (
      <Stack spacing={2} alignItems="flex-start">
        <Alert severity="error" sx={{ alignSelf: "stretch" }}>
          {loadError}
        </Alert>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
          <Button variant="contained" startIcon={<RefreshIcon />} onClick={() => setLoadAttempt((value) => value + 1)}>
            Reintentar
          </Button>
          <Button startIcon={<ArrowBackIcon />} onClick={() => navigate("/modulos")}>
            Volver al listado
          </Button>
        </Stack>
      </Stack>
    );
  }
  if (!data) {
    return (
      <Stack spacing={2}>
        <Skeleton variant="text" width={360} height={56} />
        <Skeleton variant="rounded" height={48} />
        <Skeleton variant="rounded" height={320} />
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4" component="h1">
          Nueva solicitud de módulos
        </Typography>
        <Typography color="text.secondary">Elegí los muebles del catálogo, sus medidas y colores, y revisá el despiece antes de crear la solicitud.</Typography>
      </Stack>

      {errors.length > 0 && (
        <Alert ref={errorsRef} tabIndex={-1} severity="error" onClose={() => setErrors([])} sx={{ "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}>
          {errors.length === 1 ? (
            errors[0]
          ) : (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {errors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}
      {avisos.length > 0 && (
        <Alert ref={avisosRef} tabIndex={-1} severity="warning" onClose={() => setAvisos([])}>
          {avisos.length === 1 ? (
            avisos[0]
          ) : (
            <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
              {avisos.map((aviso, index) => (
                <li key={index}>{aviso}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}
      {recoverable && (
        <Alert
          severity="info"
          action={
            <Stack direction="row" spacing={1}>
              <Button color="inherit" size="small" onClick={() => void applyDraft()} disabled={busy || creating}>
                Recuperar
              </Button>
              <Button color="inherit" size="small" onClick={dismissDraft} disabled={busy || creating}>
                Descartar
              </Button>
            </Stack>
          }
        >
          Tenés una solicitud sin terminar ({draftModules === 1 ? "1 módulo" : `${draftModules} módulos`}, guardada {describeAge(draftSavedAt ?? Date.now())}).
          {recoverable.enviado ? " Se estaba creando cuando se cerró la pantalla: al crearla se revisa primero si ya quedó cargada." : ""}
        </Alert>
      )}

      <Stepper activeStep={step} sx={{ maxWidth: 900, overflowX: "auto", pb: 0.5, width: "100%", "& .MuiStepLabel-label": { fontSize: { xs: 12, sm: 14 } } }}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {step === 0 && (
        <ClientStep
          value={{ cliente, numeroContacto, emailContacto, direccionEntrega, fechaEntrega, observaciones }}
          today={today}
          onChange={(patch) => {
            if (patch.cliente !== undefined) setCliente(patch.cliente);
            if (patch.numeroContacto !== undefined) setNumeroContacto(patch.numeroContacto);
            if (patch.emailContacto !== undefined) setEmailContacto(patch.emailContacto);
            if (patch.direccionEntrega !== undefined) setDireccionEntrega(patch.direccionEntrega);
            if (patch.fechaEntrega !== undefined) setFechaEntrega(patch.fechaEntrega);
            if (patch.observaciones !== undefined) setObservaciones(patch.observaciones);
          }}
        />
      )}
      {step === 1 && (
        <ModulePickerStep
          modules={data.modules}
          categories={data.categories}
          selecciones={selecciones}
          onChange={(value) => {
            setSelecciones(value);
            setErrors([]);
          }}
        />
      )}
      {step === 2 && (
        <UnitsStep
          units={units}
          definitions={definitions}
          validations={validations}
          materials={materials}
          configFondoId={data.config.materialFondoId}
          defaults={defaults}
          onDefaultsChange={(patch) => setDefaults((current) => ({ ...current, ...patch }))}
          onApplyDefaults={() => editUnits((current) => applyColorsToAll(current, defaults, definitions, materials))}
          onUnitChange={updateUnit}
          onCopyMeasures={(uid) => editUnits((current) => copyMeasuresToSameModel(current, uid))}
        />
      )}
      {step === 3 && (
        <ReviewStep
          preview={preview}
          status={previewStatus}
          error={previewError}
          units={units}
          definitions={definitions}
          materials={materials}
          edgeContext={edgeContext}
          planMaterials={materials}
          herrajesHabilitados={data.config.herrajesHabilitados}
          locked={creating}
          onEdgeChange={onEdgeChange}
          onResetPiece={onResetPiece}
          onRecalculate={() => requestPreview()}
        />
      )}

      {createError && (
        <Alert
          severity="error"
          onClose={() => setCreateError(null)}
          action={
            createError.code === "ALREADY_CREATED" && typeof createError.details?.id === "string" ? (
              <Button color="inherit" size="small" onClick={() => navigate(`/modulos/${createError.details!.id as string}`, { state: { returnTo: "/modulos" } })}>
                Ver M-{String(createError.details.numero)}
              </Button>
            ) : undefined
          }
          sx={{ "& .MuiAlert-message": { minWidth: 0, overflowWrap: "anywhere" } }}
        >
          {createError.message}
          {createError.items.length > 0 && (
            <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
              {createError.items.map((item, index) => (
                <li key={index}>{item}</li>
              ))}
            </Box>
          )}
        </Alert>
      )}

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
        {step > 0 && (
          <Button type="button" variant="outlined" startIcon={<ArrowBackIcon />} onClick={back} disabled={creating || busy} sx={{ width: { xs: "100%", sm: "auto" } }}>
            Volver
          </Button>
        )}
        {step < 3 && (
          <Button
            type="button"
            variant="contained"
            endIcon={busy ? <CircularProgress size={16} color="inherit" /> : <ArrowForwardIcon />}
            onClick={() => void next()}
            disabled={busy}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {step === 2 ? "Revisar despiece" : "Siguiente"}
          </Button>
        )}
        {step === 3 && (
          <Button
            type="button"
            variant="contained"
            startIcon={creating ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
            onClick={() => void create()}
            disabled={creating || busy}
            sx={{ width: { xs: "100%", sm: "auto" } }}
          >
            {creating ? "Creando..." : "Crear solicitud"}
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
