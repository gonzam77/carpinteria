import AddIcon from "@mui/icons-material/Add";
import DownloadIcon from "@mui/icons-material/Download";
import RefreshIcon from "@mui/icons-material/Refresh";
import VisibilityIcon from "@mui/icons-material/Visibility";
import { Alert, Box, Button, CircularProgress, IconButton, LinearProgress, MenuItem, Paper, Skeleton, Stack, TextField, Tooltip, Typography } from "@mui/material";
import {
  DataGrid,
  GridLoadingOverlay,
  GridOverlay,
  gridRowCountSelector,
  useGridApiContext,
  useGridApiRef,
  useGridSelector,
  type DataGridProps,
  type GridColDef,
  type GridLoadingOverlayProps,
  type GridRowSelectionModel,
  type GridSlotProps
} from "@mui/x-data-grid";
import { saveAs } from "file-saver";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocation, useNavigate, useNavigationType, useSearchParams } from "react-router-dom";
import { getModulesConfig } from "../api/catalog";
import { api } from "../api/client";
import { listModuleOrders, moduleOrderError, type ModuleOrderApiError } from "../api/moduleOrders";
import { DeliveryChip } from "../components/DeliveryChip";
import { StatusChip, getStatusStyle } from "../components/StatusChip";
import { useTodayInArgentina } from "../hooks/useTodayInArgentina";
import {
  apiFilters,
  deliverySortKey,
  deliveryStatus,
  DIAS_SEMANA,
  EMPTY_FILTERS,
  exportErrorMessage,
  exportFileName,
  exportProblem,
  filtersFromParams,
  filtersProblem,
  filtersToParams,
  formatCreatedDay,
  formatDay,
  hasActiveFilters,
  isUsableDay,
  moduleOrderIndicators,
  resultsAnnouncement,
  STATUS_ORDER,
  type ListFilters
} from "../lib/moduleOrdersList";
import type { EstadoSolicitud, ModuleOrderListItem } from "../types";

// Lo que la grilla le pasa al aviso de "sin filas" de este listado.
declare module "@mui/x-data-grid" {
  interface NoRowsOverlayPropsOverrides {
    motivo?: "sin-resultados" | "error";
    onClear?: (event: MouseEvent<HTMLButtonElement>) => void;
  }
}

/** Espera antes de buscar mientras se escribe: no se pide en cada tecla. */
const SEARCH_DELAY_MS = 300;
/**
 * Espera antes de aplicar una fecha: cada digito del dia o del mes ya forma una fecha valida (el "2" de "28"), y
 * aplicarla filtraria por un dia que nadie eligio. Con Enter o al salir del campo con el teclado se aplica enseguida.
 */
const DATE_DELAY_MS = 600;
/** La marca de los cambios de la URL que hace esta pantalla: cualquier otro cambio (el menu, atras) manda. */
const OWN_FILTERS_STATE = { filtrosPropios: true };
/** La entrada del historial en la que esta el navegador. React Router guarda su clave; la primera al cargar no tiene. */
const currentHistoryEntry = () => (window.history.state as { key?: string } | null)?.key ?? "default";
/** El contorno del foco del teclado en la grilla. */
/** Sin filas: la misma lista siempre, para que la grilla no reciba algo nuevo en cada dibujo. */
const NO_ROWS: ModuleOrderListItem[] = [];

type DateField = "desde" | "hasta";

/** Solo para lectores de pantalla (sin dependencias nuevas). En px: en sx, `width: 1` seria el 100%. */
const visuallyHidden = {
  position: "absolute",
  width: "1px",
  height: "1px",
  m: "-1px",
  p: 0,
  border: 0,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap"
} as const;

function Indicator({ label, value, hint, alert = false, unavailable = false }: { label: string; value: number | null; hint?: string; alert?: boolean; unavailable?: boolean }) {
  return (
    <Paper
      variant="outlined"
      sx={{ px: 2, py: 1.5, borderRadius: "10px", ...(alert ? { borderColor: "#efb1a6", bgcolor: "#fdf1ee" } : {}) }}
    >
      {value !== null ? (
        // Un numero grande, no un encabezado: el encabezado de la pantalla es el h1.
        <Typography variant="h5" component="div" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums", color: alert ? "#96382b" : "text.primary" }}>
          {value}
        </Typography>
      ) : unavailable ? (
        // Sin el listado no hay numeros: un guion quieto, no un esqueleto que parece cargar.
        <Typography variant="h5" component="div" fontWeight={800} color="text.disabled">
          <span aria-hidden="true">—</span>
          <Box component="span" sx={visuallyHidden}>
            sin datos
          </Box>
        </Typography>
      ) : (
        <Skeleton variant="text" width={48} height={36} />
      )}
      <Typography variant="body2" fontWeight={700} color={alert ? "#96382b" : "text.secondary"}>
        {label}
      </Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
}

function ErrorAlert({ error, onRetry }: { error: ModuleOrderApiError; onRetry: () => void }) {
  return (
    <Alert
      severity="error"
      action={
        <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
          Reintentar
        </Button>
      }
    >
      {error.message}
      {error.items.length > 0 && (
        <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5 }}>
          {error.items.map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </Box>
      )}
    </Alert>
  );
}

/**
 * La grilla sin filas: sin resultados para los filtros (con "Limpiar filtros") o un error (el aviso de arriba tiene
 * "Reintentar"). Va dentro de la grilla, que queda montada: asi no se pierden el orden, las filas por pagina ni los
 * anchos que acomodo el usuario. Arriba, debajo de los encabezados: centrado quedaria fuera de la pantalla en una notebook.
 */
function ListNoRowsOverlay({ motivo, onClear, ...props }: GridSlotProps["noRowsOverlay"]) {
  return (
    <GridOverlay {...props} sx={{ alignItems: "flex-start", pt: 3 }}>
      <Stack spacing={1.5} alignItems="center" sx={{ px: 2, textAlign: "center" }}>
        {motivo === "error" ? (
          <Typography color="text.secondary">No se pudo cargar el listado. Revisá el aviso de arriba.</Typography>
        ) : (
          <>
            <Typography fontWeight={800}>No hay solicitudes que coincidan con los filtros</Typography>
            <Button variant="outlined" onClick={onClear}>
              Limpiar filtros
            </Button>
          </>
        )}
      </Stack>
    </GridOverlay>
  );
}

/** Mientras carga: sobre las filas anteriores, una barra con nombre; sin filas, el esqueleto de la grilla. */
function ListLoadingOverlay(props: GridLoadingOverlayProps) {
  const apiRef = useGridApiContext();
  const rowCount = useGridSelector(apiRef, gridRowCountSelector);
  if (rowCount === 0) return <GridLoadingOverlay {...props} />;
  const { variant: _variant, noRowsVariant: _noRowsVariant, style, ...other } = props;
  return (
    <GridOverlay {...other} style={{ display: "block", ...style }}>
      <LinearProgress aria-label="Buscando solicitudes" />
    </GridOverlay>
  );
}

/**
 * La grilla del listado, con su propia referencia: si se desmonta (sin ninguna solicitud se ve el aviso de catalogo
 * vacio), la proxima arranca de cero. Un resultado de otros filtros (`shownKey`) se muestra desde la primera pagina y
 * arriba de todo: si no, abriria en la pagina o a la altura del anterior y esconderia las mas urgentes. Uno de los mismos
 * filtros (Reintentar, o volver a los que se veian antes de que llegue otro) queda donde estaba.
 */
function ModuleOrdersGrid({ shownKey, ...props }: DataGridProps<ModuleOrderListItem> & { shownKey: string | null }) {
  const apiRef = useGridApiRef();
  const lastShownKey = useRef<string | null>(null);
  // Antes de dibujarse, para que no se vea en el lugar viejo. El primero ya esta en la primera pagina y arriba.
  useLayoutEffect(() => {
    if (shownKey === null || shownKey === lastShownKey.current) return;
    const first = lastShownKey.current === null;
    lastShownKey.current = shownKey;
    if (first) return;
    apiRef.current.setPage(0);
    apiRef.current.scroll({ top: 0 });
  }, [shownKey, apiRef]);
  return <DataGrid apiRef={apiRef} {...props} />;
}

/** Listado de solicitudes de modulos (spec §9.1), en /modulos. Solo ADMIN. */
export function ModuleOrdersPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const [searchParams, setSearchParams] = useSearchParams();
  // Los filtros viven en la URL: al volver del detalle (o con atras) se ven los mismos.
  const filters = useMemo(() => filtersFromParams(searchParams), [searchParams]);
  // Los ultimos filtros pedidos. React Router aplica el cambio de la URL en una transicion: hasta que llega, `filters`
  // muestra los anteriores, y un cambio armado sobre ellos (la busqueda que espera la pausa, o dos cambios seguidos)
  // devolveria los filtros viejos (por ejemplo, los que se acaban de limpiar). DECISIONES 42.
  const requested = useRef(filters);
  // Lo que se escribe en la busqueda y en las fechas: el campo lo muestra al instante y a la URL va despues de una
  // pausa (una fecha, ademas, solo completa). Si el campo dependiera de la URL, que llega en una transicion, React le
  // volveria a poner el valor viejo mientras se escribe.
  const [searchText, setSearchText] = useState(filters.search);
  const [desdeText, setDesdeText] = useState(filters.desde);
  const [hastaText, setHastaText] = useState(filters.hasta);
  // La pausa de las fechas arranca con el "change" del navegador (una fecha completa escrita o elegida), no con cada
  // "input": recorrer el calendario con las flechas cambia el campo pero no elige nada. `dateCheck` vuelve a revisar los
  // campos cuando el navegador los cambia sin avisar (al borrar segmentos de una fecha ya incompleta).
  const [dateCommit, setDateCommit] = useState(0);
  const [dateCheck, setDateCheck] = useState(0);
  // La entrada del historial que esta pantalla conoce: la ultima que sincronizo o la que dejo ella misma. Una pausa que
  // termina despues de una navegacion ajena (el menu, atras, una fila) no tiene que reescribir la entrada nueva.
  const knownEntry = useRef(location.key);
  // Las navegaciones ajenas que tomo la pantalla. Un cambio armado antes de la ultima (una pausa que termina despues) no
  // se aplica: entre que la sincronizacion de abajo toma la URL nueva y que los campos se vuelven a dibujar, la pausa
  // leeria lo escrito antes.
  const foreignNavigations = useRef(0);
  const searchInput = useRef<HTMLInputElement>(null);
  const desdeInput = useRef<HTMLInputElement>(null);
  const hastaInput = useRef<HTMLInputElement>(null);
  const filtersRegion = useRef<HTMLDivElement>(null);
  // Si hay un boton del mouse o un dedo apoyado: una fecha no se aplica al salir del campo de esa forma (ver onDateBlur).
  const pointerDown = useRef(false);
  // El aviso de resultados (role=status) habla recien despues de que se toca un filtro, no al entrar.
  const userFiltered = useRef(false);
  // Lo que muestra la grilla: un pedido por cada estado de los filtros, tambien sin filtros (clave "{}"), asi al limpiar
  // llega la lista de nuevo y no una vieja. Se guarda con la clave de los filtros que lo trajeron: mientras llega el de
  // otros, la grilla sigue mostrando lo anterior con la barra de carga.
  const [result, setResult] = useState<{ key: string; orders: ModuleOrderListItem[] } | null>(null);
  const [resultError, setResultError] = useState<ModuleOrderApiError | null>(null);
  // Todas las solicitudes, para los indicadores (que no cambian con los filtros): salen del resultado sin filtros, o de
  // un pedido aparte si la pantalla se abre con filtros.
  const [all, setAll] = useState<ModuleOrderListItem[] | null>(null);
  const [allError, setAllError] = useState<ModuleOrderApiError | null>(null);
  const [aviso, setAviso] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [selection, setSelection] = useState<GridRowSelectionModel>([]);
  // Los anchos que acomoda el usuario: las columnas se rearman a la medianoche y la grilla los perderia.
  const [widths, setWidths] = useState<Record<string, number>>({});
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const today = useTodayInArgentina();
  const active = hasActiveFilters(filters);
  const problem = filtersProblem(filters);
  const filtersKey = JSON.stringify(apiFilters(filters));

  const setFilters = (patch: Partial<ListFilters>, armedAt = foreignNavigations.current) => {
    // Si el navegador ya esta en otra entrada que esta pantalla todavia no vio, o si el cambio se armo antes de la ultima
    // navegacion ajena, no se toca: manda la URL de esa navegacion, que la sincronizacion de abajo trae a los campos.
    if (currentHistoryEntry() !== knownEntry.current || armedAt !== foreignNavigations.current) return;
    requested.current = { ...requested.current, ...patch };
    userFiltered.current = true;
    setSearchParams(filtersToParams(requested.current), { replace: true, state: OWN_FILTERS_STATE });
    knownEntry.current = currentHistoryEntry();
  };

  // El aviso de vencimiento de la configuracion. Si no llega, el semaforo usa 3 dias: no deja sin listado.
  useEffect(() => {
    let current = true;
    getModulesConfig()
      .then((config) => {
        if (current) setAviso(config.diasAvisoVencimiento);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [reload]);

  // Los indicadores aparte, mientras hay filtros y falta la lista completa: al abrir con filtros, o si la lista sin
  // filtros se corto o fallo antes de filtrar. Sin filtros salen del resultado de abajo, y cuando ese llega este pedido
  // se cancela (deja de hacer falta): asi no pisa con un error o con datos mas viejos.
  const needsAll = active && all === null;
  useEffect(() => {
    if (!needsAll) return;
    const controller = new AbortController();
    setAllError(null);
    listModuleOrders({}, { signal: controller.signal })
      .then((orders) => {
        if (!controller.signal.aborted) setAll(orders);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setAllError(moduleOrderError(reason, "No se pudieron cargar los indicadores."));
      });
    return () => controller.abort();
  }, [reload, needsAll]);

  // Lo que muestra la grilla, del servidor (busca tambien por numero y telefono).
  useEffect(() => {
    setResultError(null);
    if (problem) return;
    const controller = new AbortController();
    const query = apiFilters(filters);
    const key = JSON.stringify(query);
    listModuleOrders(query, { signal: controller.signal })
      .then((orders) => {
        if (controller.signal.aborted) return;
        setResult({ key, orders });
        // Sin filtros es la lista completa: tambien renueva los indicadores.
        if (key === "{}") {
          setAll(orders);
          setAllError(null);
        }
      })
      .catch((reason) => {
        if (controller.signal.aborted) return;
        setResultError(moduleOrderError(reason, key === "{}" ? "No se pudo cargar el listado de solicitudes de módulos." : "No se pudo buscar en las solicitudes de módulos."));
      });
    return () => controller.abort();
  }, [filters, problem, reload]);

  // La busqueda se aplica una pausa despues de escribir, sobre los ultimos filtros pedidos.
  useEffect(() => {
    if (searchText.trim() === requested.current.search) return;
    const armedAt = foreignNavigations.current;
    const timer = window.setTimeout(() => setFilters({ search: searchText.trim() }, armedAt), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Solo cuando cambia lo escrito.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  // Un boton del mouse o un dedo apoyado en cualquier parte de la pantalla.
  useEffect(() => {
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
    };
    document.addEventListener("pointerdown", down, true);
    document.addEventListener("pointerup", up, true);
    document.addEventListener("pointercancel", up, true);
    window.addEventListener("blur", up);
    return () => {
      document.removeEventListener("pointerdown", down, true);
      document.removeEventListener("pointerup", up, true);
      document.removeEventListener("pointercancel", up, true);
      window.removeEventListener("blur", up);
    };
  }, []);

  // Las fechas: vacia o completa va a la URL. Una a medio escribir deja la que habia: un año de menos de 1900, o un
  // segmento borrado (el navegador informa "" con badInput). Los campos se leen del navegador en el momento, no del
  // ultimo dibujo: mientras se borran los otros segmentos, el navegador no avisa nada.
  const dateInputOf = (field: DateField) => (field === "desde" ? desdeInput : hastaInput).current;
  const dateTextOf = (field: DateField) => dateInputOf(field)?.value ?? (field === "desde" ? desdeText : hastaText);
  const draftDate = (field: DateField) => {
    const text = dateTextOf(field);
    const applied = requested.current[field];
    return text === "" ? (dateInputOf(field)?.validity.badInput ? applied : "") : isUsableDay(text) ? text : applied;
  };
  const pendingDates = () => ({ desde: draftDate("desde"), hasta: draftDate("hasta") });
  const datesDiffer = (next: { desde: string; hasta: string }) => next.desde !== requested.current.desde || next.hasta !== requested.current.hasta;
  const applyDates = () => {
    const next = pendingDates();
    if (datesDiffer(next)) setFilters(next);
  };
  // La pausa aplica lo que estaba elegido al empezar. Recorrer despues el calendario cambia el campo sin elegir nada: no
  // la cambia ni la cancela, y Escape vuelve a esa fecha. Lo demas que toca un campo la vuelve a empezar (una tecla, otra
  // fecha elegida, Limpiar filtros), y una navegacion ajena la anula.
  useEffect(() => {
    const chosen = pendingDates();
    if (!datesDiffer(chosen)) return;
    const armedAt = foreignNavigations.current;
    const timer = window.setTimeout(() => {
      if (datesDiffer(chosen)) setFilters(chosen, armedAt);
    }, DATE_DELAY_MS);
    return () => window.clearTimeout(timer);
    // Solo con una fecha elegida o escrita completa, o cuando hay que volver a revisar los campos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateCommit, dateCheck]);
  // El "change" del navegador no llega por el onChange de React (que tambien escucha "input").
  useEffect(() => {
    const commit = () => setDateCommit((value) => value + 1);
    const inputs = [desdeInput.current, hastaInput.current];
    for (const input of inputs) input?.addEventListener("change", commit);
    return () => {
      for (const input of inputs) input?.removeEventListener("change", commit);
    };
  }, []);
  const recheckDates = () => setDateCheck((value) => value + 1);
  // Un campo de fecha con segmentos a medio escribir no vuelve solo a vacio: React no lo toca si el valor ya es "".
  const clearPartialDates = () => {
    for (const input of [desdeInput.current, hastaInput.current]) if (input?.validity.badInput) input.value = "";
  };
  const onDateBlur = (field: DateField) => () => {
    const input = dateInputOf(field);
    const text = dateTextOf(field);
    // Al salir con una fecha a medio escribir, el campo vuelve a mostrar la que filtra.
    if ((text === "" && input?.validity.badInput) || (text !== "" && !isUsableDay(text))) {
      const applied = requested.current[field];
      if (input) input.value = applied;
      (field === "desde" ? setDesdeText : setHastaText)(applied);
    }
    // Con el mouse o el dedo no se aplica enseguida: si la pantalla cambiara entre que se aprieta y se suelta, el click
    // que saco el foco no llegaria a donde apunto. Se vuelve a revisar y la pausa la aplica despues (tambien una fecha
    // borrada segmento por segmento, que el navegador no avisa).
    if (pointerDown.current) recheckDates();
    else applyDates();
  };
  const onDateKeyDown = (event: KeyboardEvent) => {
    if (event.key === "Enter") applyDates();
  };

  // Una URL que no salio de esta pantalla (el menu, aunque lleve a la misma URL; atras) manda sobre lo pedido y lo
  // escrito. Los cambios propios llevan la marca y no se tocan, para no borrar lo que se siguio escribiendo.
  useEffect(() => {
    knownEntry.current = location.key;
    if (navigationType === "REPLACE" && (location.state as { filtrosPropios?: boolean } | null)?.filtrosPropios) return;
    foreignNavigations.current += 1;
    requested.current = filters;
    setSearchText(filters.search);
    setDesdeText(filters.desde);
    setHastaText(filters.hasta);
    clearPartialDates();
    // Solo cuando cambia la ubicacion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key]);

  const resultReady = result !== null && result.key === filtersKey;
  const rowsError = problem ? null : resultError;
  const loading = !problem && !rowsError && !resultReady;
  // Lo que la grilla muestra cuando no espera nada. Un error o un rango invertido no muestran filas (tampoco unas viejas
  // ocultas que se puedan exportar).
  const settledRows: ModuleOrderListItem[] | undefined = problem || rowsError ? NO_ROWS : resultReady ? result.orders : undefined;
  // Mientras llega un resultado, quedan las filas que ya estaban a la vista; si no habia ninguna (por ejemplo, al entrar
  // con filtros en la URL), el esqueleto, y no todas las solicitudes como si fueran el resultado.
  const shownRows = useRef<ModuleOrderListItem[] | null>(null);
  useEffect(() => {
    if (settledRows !== undefined) shownRows.current = settledRows;
  });
  const rows = settledRows !== undefined ? settledRows : shownRows.current;
  // Los filtros del resultado a la vista: con otros, la grilla vuelve a la primera pagina (ModuleOrdersGrid).
  const shownKey = resultReady ? result.key : null;
  const emptyCatalog = !active && resultReady && result.orders.length === 0;
  const indicators = useMemo(() => (all ? moduleOrderIndicators(all, today) : null), [all, today]);
  const indicatorsUnavailable = !all && Boolean(allError || (!active && resultError));
  const diasAviso = aviso ?? 3;

  // La seleccion es de las filas que se ven: las que salen de un resultado nuevo se desmarcan, y lo que se cuenta y se
  // exporta sale siempre de las filas a la vista. Un resultado que no se conoce (cargando, con error o con el rango
  // invertido) no desmarca nada: mientras tanto no hay filas que exportar, y al volver vuelven marcadas. La grilla recibe
  // solo la parte visible (si recibiera las ocultas, su pie las contaria) y la pagina guarda el resto.
  const visibleIds = useMemo(() => new Set((rows ?? NO_ROWS).map((row) => row.id)), [rows]);
  const gridSelection = useMemo(() => selection.filter((id) => visibleIds.has(String(id))), [selection, visibleIds]);
  const selectedRows = useMemo(() => (rows ?? NO_ROWS).filter((row) => selection.includes(row.id)), [rows, selection]);
  useEffect(() => {
    if (loading || rowsError || problem) return;
    setSelection((current) => {
      const kept = current.filter((id) => visibleIds.has(String(id)));
      return kept.length === current.length ? current : kept;
    });
  }, [visibleIds, loading, rowsError, problem]);

  const statusText = userFiltered.current
    ? resultsAnnouncement({ count: loading || rows === null ? null : rows.length, active, emptyCatalog, blocked: Boolean(problem || rowsError) })
    : "";

  // Hasta el detalle de modulos (F5.1), /modulos/:id muestra el detalle comun; "Volver" trae de nuevo aca, con los
  // mismos filtros. La vuelta se lee al hacer click: asi las columnas no dependen de la URL (si cambiaran con cada
  // filtro, la grilla perderia los anchos que acomodo el usuario).
  const openOrder = (row: ModuleOrderListItem) =>
    navigate(`/modulos/${row.id}`, { state: { returnTo: `${window.location.pathname}${window.location.search}` } });

  // Orden de las columnas (DECISIONES 42): lo urgente primero (cliente, entrega, plazo y estado), para que se vea en una
  // notebook o una tablet sin desplazar la tabla; el resto se alcanza desplazandola.
  const columns = useMemo<GridColDef<ModuleOrderListItem>[]>(() => {
    const definitions: GridColDef<ModuleOrderListItem>[] = [
      {
        field: "ver",
        headerName: "",
        width: 48,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        disableExport: true,
        renderCell: ({ row }) => (
          <Tooltip title="Ver la solicitud">
            {/* Fuera del orden de tabulacion: la grilla es una sola parada y se recorre con las flechas; Enter en la
                celda abre la solicitud. */}
            <IconButton
              size="small"
              tabIndex={-1}
              aria-label={`Ver la solicitud M-${row.numero}`}
              onClick={(event) => {
                event.stopPropagation();
                openOrder(row);
              }}
            >
              <VisibilityIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )
      },
      {
        field: "numero",
        headerName: "N°",
        width: 84,
        type: "number",
        align: "left",
        headerAlign: "left",
        valueFormatter: (value: number) => `M-${value}`,
        renderCell: ({ value }) => (
          <Typography variant="body2" fontWeight={800} sx={{ fontVariantNumeric: "tabular-nums" }}>
            M-{value}
          </Typography>
        )
      },
      {
        field: "cliente",
        headerName: "Cliente",
        flex: 1,
        minWidth: 150,
        renderCell: ({ row }) => (
          <Box sx={{ minWidth: 0, lineHeight: 1.3 }}>
            <Typography variant="body2" fontWeight={700} noWrap>
              {row.cliente}
            </Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">
              {row.numeroContacto || "Sin teléfono"}
            </Typography>
          </Box>
        )
      },
      {
        field: "fechaEntrega",
        headerName: "Entrega",
        width: 100,
        valueFormatter: (value: string | null) => formatDay(value) || "Sin fecha"
      },
      {
        field: "plazo",
        headerName: "Plazo",
        width: 136,
        // Se ordena por la clave (lo mas urgente primero); al copiar sale el texto del chip.
        valueGetter: (_value, row) => deliverySortKey(deliveryStatus(row, today, diasAviso)),
        valueFormatter: (_value, row) => deliveryStatus(row, today, diasAviso).label,
        renderCell: ({ row }) => <DeliveryChip size="small" status={deliveryStatus(row, today, diasAviso)} />
      },
      {
        field: "estado",
        headerName: "Estado",
        width: 124,
        sortComparator: (a: EstadoSolicitud, b: EstadoSolicitud) => STATUS_ORDER.indexOf(a) - STATUS_ORDER.indexOf(b),
        valueFormatter: (value: EstadoSolicitud) => getStatusStyle(value).label,
        renderCell: ({ value }) => <StatusChip size="small" status={value as EstadoSolicitud} />
      },
      { field: "observaciones", headerName: "Referencia", flex: 1, minWidth: 120, valueGetter: (value: string | null) => value ?? "" },
      { field: "cantidadModulos", headerName: "Módulos", width: 110, type: "number" },
      { field: "fechaCreacion", headerName: "Creada", width: 100, valueFormatter: (value: string) => formatCreatedDay(value) }
    ];
    // Un ancho acomodado a mano reemplaza al de la definicion (y al flex, que si no ganaria).
    return definitions.map((column) => {
      const width = widths[column.field];
      if (width === undefined) return column;
      const { flex: _flex, ...rest } = column;
      return { ...rest, width };
    });
    // openOrder no cambia nada de las columnas: lee la URL al hacer click.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, diasAviso, widths]);

  async function exportSelection() {
    const chosen = selectedRows;
    if (!chosen.length || exporting) return;
    const tooMany = exportProblem(chosen.length);
    if (tooMany) {
      setExportError(tooMany);
      return;
    }
    setExporting(true);
    setExportError("");
    try {
      const response = await api.get<Blob>("/orders/export", { params: { ids: chosen.map((row) => row.id).join(",") }, responseType: "blob" });
      saveAs(response.data, exportFileName(chosen));
    } catch (reason) {
      setExportError(await exportErrorMessage(reason));
    } finally {
      setExporting(false);
    }
  }

  const clearFilters = (event?: MouseEvent<HTMLElement>) => {
    setSearchText("");
    setDesdeText("");
    setHastaText("");
    // Defensivo: con el mouse o el teclado, el campo ya se restauro al perder el foco antes de este click.
    clearPartialDates();
    setFilters(EMPTY_FILTERS);
    // Una fecha elegida que esperaba su pausa no vuelve despues: la pausa se arma de nuevo con los campos vacios.
    recheckDates();
    // Al limpiar, el "Limpiar filtros" de la barra queda deshabilitado y el de la grilla desaparece: el foco no tiene que
    // caer al principio de la pagina. Con el teclado (detail 0) pasa a Buscar; con el mouse o el dedo, a la zona de
    // filtros: en un celular o una tablet, enfocar Buscar abriria el teclado de la pantalla.
    if (event?.detail === 0) searchInput.current?.focus();
    else filtersRegion.current?.focus({ preventScroll: true });
  };

  const retry = () => setReload((value) => value + 1);

  return (
    <Stack spacing={2.5}>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} justifyContent="space-between" alignItems={{ sm: "flex-end" }}>
        <Stack spacing={0.5}>
          <Typography variant="h4" component="h1">
            Módulos a medida
          </Typography>
          <Typography color="text.secondary">Solicitudes de muebles armados por ROMA. Van aparte de las solicitudes de corte de los carpinteros.</Typography>
        </Stack>
        <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/modulos/nueva")} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
          Nueva solicitud de módulos
        </Button>
      </Stack>

      {rowsError && <ErrorAlert error={rowsError} onRetry={retry} />}
      {allError && <ErrorAlert error={allError} onRetry={retry} />}

      <Box component="section" aria-label="Indicadores" sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: "repeat(4, minmax(0, 1fr))" } }}>
        <Indicator label="En curso" value={indicators?.enCurso ?? null} unavailable={indicatorsUnavailable} hint="Pendientes, en proceso y terminadas" />
        <Indicator label="Módulos a fabricar" value={indicators?.modulosAFabricar ?? null} unavailable={indicatorsUnavailable} hint="De las pendientes y en proceso" />
        <Indicator label="Vencen esta semana" value={indicators?.vencenEstaSemana ?? null} unavailable={indicatorsUnavailable} hint={`Hoy y los próximos ${DIAS_SEMANA} días`} />
        <Indicator label="Atrasadas" value={indicators?.atrasadas ?? null} unavailable={indicatorsUnavailable} hint="Ya pasó la fecha de entrega" alert={Boolean(indicators?.atrasadas)} />
      </Box>

      {/* Desde md, los filtros en una o dos lineas: en una notebook de 1024 px se ve alguna solicitud sin bajar. Los dos
          botones estan siempre (Limpiar, deshabilitado sin filtros; Exportar, con un ancho minimo para su cuenta): asi la
          barra no cambia de alto justo cuando se va a hacer click en la grilla. */}
      <Paper ref={filtersRegion} role="search" aria-label="Filtros" tabIndex={-1} sx={{ p: { xs: 2, sm: 2.25 }, borderRadius: "10px" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap sx={{ alignItems: { md: "center" }, flexWrap: "wrap" }}>
          <TextField
            label="Buscar"
            placeholder="Cliente, teléfono, ref. o M-1044"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            inputRef={searchInput}
            sx={{ flex: { md: "2 1 260px" } }}
            fullWidth
          />
          <TextField
            select
            label="Estado"
            value={filters.estado}
            onChange={(event) => setFilters({ estado: event.target.value as EstadoSolicitud | "" })}
            sx={{ flex: { md: "1 1 160px" } }}
            fullWidth
          >
            <MenuItem value="">Todos</MenuItem>
            {STATUS_ORDER.map((estado) => (
              <MenuItem key={estado} value={estado}>
                {getStatusStyle(estado).label}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Entrega desde"
            type="date"
            value={desdeText}
            onChange={(event) => setDesdeText(event.target.value)}
            onBlur={onDateBlur("desde")}
            onKeyDown={onDateKeyDown}
            onKeyUp={recheckDates}
            inputRef={desdeInput}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: { md: "1 1 150px" } }}
            fullWidth
          />
          <TextField
            label="Entrega hasta"
            type="date"
            value={hastaText}
            onChange={(event) => setHastaText(event.target.value)}
            onBlur={onDateBlur("hasta")}
            onKeyDown={onDateKeyDown}
            onKeyUp={recheckDates}
            inputRef={hastaInput}
            slotProps={{ inputLabel: { shrink: true } }}
            sx={{ flex: { md: "1 1 150px" } }}
            fullWidth
          />
          <Button variant="outlined" onClick={clearFilters} disabled={!active} sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" } }}>
            Limpiar filtros
          </Button>
          <Button
            variant="contained"
            startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <DownloadIcon />}
            onClick={() => void exportSelection()}
            disabled={!selectedRows.length}
            aria-disabled={exporting || undefined}
            // Deshabilitado, sin el degradado del tema (si no, parece activo). En el tema queda pendiente para todos (F7.2).
            sx={{ flexShrink: 0, width: { xs: "100%", sm: "auto" }, minWidth: { sm: "16.5em" } }}
          >
            {exporting ? "Exportando..." : selectedRows.length ? `Exportar selección (${selectedRows.length})` : "Exportar selección"}
          </Button>
        </Stack>
      </Paper>

      {/* Siempre montado: un aviso que aparece junto con su texto no siempre se lee. */}
      <Box role="status" aria-live="polite" aria-atomic="true" sx={visuallyHidden}>
        {statusText}
      </Box>

      {problem && <Alert severity="warning">{problem}</Alert>}
      {exportError && (
        <Alert severity="error" onClose={() => setExportError("")}>
          {exportError}
        </Alert>
      )}

      {emptyCatalog ? (
        <Paper variant="outlined" sx={{ p: 4, textAlign: "center", borderRadius: "10px" }}>
          <Stack spacing={1.5} alignItems="center">
            <Typography fontWeight={800}>Todavía no hay solicitudes de módulos</Typography>
            <Typography color="text.secondary">Se cargan con el asistente: elegís los muebles del catálogo, sus medidas y colores, y revisás el despiece.</Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => navigate("/modulos/nueva")}>
              Cargar la primera solicitud
            </Button>
          </Stack>
        </Paper>
      ) : (
        // La grilla se desplaza sola de costado: un solo scroll, con la paginacion siempre a la vista. Queda montada
        // aunque no haya filas (el aviso va adentro), para no perder el orden ni las filas por pagina.
        <Paper sx={{ height: { xs: 560, md: 600 }, borderRadius: "10px", overflow: "hidden" }}>
          <ModuleOrdersGrid
            shownKey={shownKey}
            rows={rows ?? NO_ROWS}
            columns={columns}
            loading={loading}
            rowHeight={60}
            checkboxSelection
            disableRowSelectionOnClick
            // Los filtros son los de arriba (en la URL); los del menu de columna filtrarian por valores internos.
            disableColumnFilter
            rowSelectionModel={gridSelection}
            onRowSelectionModelChange={(model) => setSelection((current) => [...current.filter((id) => !visibleIds.has(String(id))), ...model])}
            onColumnWidthChange={({ colDef, width }) => setWidths((current) => ({ ...current, [colDef.field]: width }))}
            initialState={{ pagination: { paginationModel: { pageSize: 50 } } }}
            pageSizeOptions={[25, 50, 100]}
            onCellClick={(params) => {
              if (params.field === "__check__" || params.field === "ver") return;
              // Un click que termina de seleccionar texto (por ejemplo, para copiar el telefono) no abre la solicitud.
              if (window.getSelection()?.toString()) return;
              openOrder(params.row);
            }}
            onCellKeyDown={(params, event) => {
              if (event.key !== "Enter" || params.field === "__check__") return;
              event.preventDefault();
              openOrder(params.row);
            }}
            slots={{ noRowsOverlay: ListNoRowsOverlay, loadingOverlay: ListLoadingOverlay }}
            // El nombre y "ocupada" van en el elemento con role=grid (el `aria-label` de la grilla queda en un div sin rol).
            slotProps={{
              main: { "aria-label": "Solicitudes de módulos", "aria-busy": loading },
              loadingOverlay: { variant: "linear-progress", noRowsVariant: "skeleton" },
              noRowsOverlay: { motivo: rowsError ? "error" : "sin-resultados", onClear: clearFilters }
            }}
            sx={{
              "& .MuiDataGrid-row": { cursor: "pointer" },
              // El foco del teclado (contorno y barra de la fila) lo pone el tema en todas las grillas (F7.2).
              "& .MuiDataGrid-cell": { display: "flex", alignItems: "center" }
            }}
          />
        </Paper>
      )}
    </Stack>
  );
}
