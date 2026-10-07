// Logica del listado de solicitudes de modulos (spec §9.1) que no depende de React: semaforo de plazo, indicadores,
// filtros de la URL, fechas para mostrar, exportacion y el aviso de resultados. Las fechas de entrega son dias
// AAAA-MM-DD en la zona del negocio (DECISIONES 26): se cuentan dias calendario y nunca se pasan por la hora local del
// navegador.
import { isValidDay, todayInArgentina } from "./moduleOrderWizard.ts";
import type { EstadoSolicitud, ModuleOrderListItem } from "../types/index.ts";

/** Los estados en el orden del trabajo: para el selector y para ordenar la columna Estado. */
export const STATUS_ORDER: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA", "RECHAZADA"];

// ---------------------------------------------------------------- fechas

/** Dias calendario de `from` a `to` (AAAA-MM-DD): negativo si `to` es anterior. En UTC no hay saltos de horario. */
export function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000);
}

/** "AAAA-MM-DD" como "dd/mm/aaaa", sin pasar por Date (un Date lo correria un dia en Argentina, DECISIONES 26). */
export const formatDay = (ymd: string | null | undefined) => (ymd ? ymd.split("-").reverse().join("/") : "");

/** El dia de una fecha y hora ISO en la zona del negocio, como "dd/mm/aaaa". */
export const formatCreatedDay = (iso: string) => formatDay(todayInArgentina(new Date(iso)));

/**
 * Una fecha de filtro que se puede usar: que exista y que sea de 1900 en adelante. Mientras se escribe el año, el
 * navegador informa fechas como 0002-10-15 o 0202-10-15, que no se aplican (DECISIONES 42).
 */
export const isUsableDay = (value: string) => isValidDay(value) && value >= "1900-01-01";

// ---------------------------------------------------------------- semaforo de plazo (spec §9.1)

export type DeliveryKind = "entregada" | "atrasada" | "proxima" | "en-plazo" | "sin-plazo";
export type DeliveryStatus = {
  kind: DeliveryKind;
  /** Texto corto del chip ("Atrasada 2 d", "Vence hoy", "Faltan 5 d"). */
  label: string;
  /** Para el title y los lectores de pantalla. */
  description: string;
  /** Dias hasta la entrega (negativo si ya paso), o null si no tiene plazo. */
  dias: number | null;
};

const dayWord = (value: number) => (value === 1 ? "día" : "días");
const faltan = (value: number) => (value === 1 ? "Falta" : "Faltan");

/**
 * Semaforo de plazo (spec §9.1, DECISIONES 41): entregada (gris); atrasada si hoy ya paso la fecha de entrega (rojo);
 * proxima si faltan de 0 a `diasAviso` dias (amarillo; el mismo dia dice "Vence hoy"); en plazo si faltan mas (verde).
 * Una rechazada no tiene plazo, y una sin fecha tampoco (gris).
 */
export function deliveryStatus(order: Pick<ModuleOrderListItem, "estado" | "fechaEntrega">, today: string, diasAviso: number): DeliveryStatus {
  if (order.estado === "ENTREGADA") return { kind: "entregada", label: "Entregada", description: "Ya se entregó", dias: null };
  if (order.estado === "RECHAZADA") return { kind: "sin-plazo", label: "Sin plazo", description: "Rechazada: no tiene plazo de entrega", dias: null };
  if (!order.fechaEntrega) return { kind: "sin-plazo", label: "Sin fecha", description: "No tiene fecha de entrega", dias: null };
  const dias = daysBetween(today, order.fechaEntrega);
  const fecha = formatDay(order.fechaEntrega);
  if (dias < 0) return { kind: "atrasada", label: `Atrasada ${-dias} d`, description: `Atrasada ${-dias} ${dayWord(-dias)}: la entrega era el ${fecha}`, dias };
  if (dias === 0) return { kind: "proxima", label: "Vence hoy", description: `Se entrega hoy, ${fecha}`, dias };
  return {
    kind: dias <= diasAviso ? "proxima" : "en-plazo",
    label: `${faltan(dias)} ${dias} d`,
    description: `${faltan(dias)} ${dias} ${dayWord(dias)}: se entrega el ${fecha}`,
    dias
  };
}

/**
 * Clave para ordenar por plazo: lo mas urgente primero, despues lo que no tiene plazo y al final lo entregado. Es el
 * mismo criterio que el orden del servidor (compareForList en el backend).
 */
export function deliverySortKey(status: DeliveryStatus) {
  if (status.dias !== null) return status.dias;
  return status.kind === "entregada" ? 2_000_000 : 1_000_000;
}

// ---------------------------------------------------------------- indicadores (spec §9.1, DECISIONES 41)

/** En curso: lo que todavia no se entrego ni se rechazo. */
export const EN_CURSO: readonly EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA"];
/** A fabricar: lo que todavia no se termino. */
export const A_FABRICAR: readonly EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO"];
/** "Vencen esta semana": de hoy a 7 dias, como el prototipo. */
export const DIAS_SEMANA = 7;

export type ModuleOrderIndicators = { enCurso: number; modulosAFabricar: number; vencenEstaSemana: number; atrasadas: number };

/** Los indicadores de arriba del listado, sobre todas las solicitudes (no cambian con los filtros). */
export function moduleOrderIndicators(orders: Pick<ModuleOrderListItem, "estado" | "fechaEntrega" | "cantidadModulos">[], today: string): ModuleOrderIndicators {
  const enCurso = orders.filter((order) => EN_CURSO.includes(order.estado));
  const dias = (order: Pick<ModuleOrderListItem, "fechaEntrega">) => (order.fechaEntrega ? daysBetween(today, order.fechaEntrega) : null);
  return {
    enCurso: enCurso.length,
    modulosAFabricar: orders.filter((order) => A_FABRICAR.includes(order.estado)).reduce((sum, order) => sum + order.cantidadModulos, 0),
    vencenEstaSemana: enCurso.filter((order) => {
      const value = dias(order);
      return value !== null && value >= 0 && value <= DIAS_SEMANA;
    }).length,
    atrasadas: enCurso.filter((order) => {
      const value = dias(order);
      return value !== null && value < 0;
    }).length
  };
}

// ---------------------------------------------------------------- filtros (en la URL, para volver del detalle con los mismos)

export type ListFilters = { estado: EstadoSolicitud | ""; search: string; desde: string; hasta: string };
export const EMPTY_FILTERS: ListFilters = { estado: "", search: "", desde: "", hasta: "" };

/** Los filtros de la URL (?estado=&q=&desde=&hasta=). Lo que no es valido se ignora: una URL vieja o tocada no da 400. */
export function filtersFromParams(params: URLSearchParams): ListFilters {
  const estado = params.get("estado") ?? "";
  const desde = params.get("desde") ?? "";
  const hasta = params.get("hasta") ?? "";
  return {
    estado: (STATUS_ORDER as string[]).includes(estado) ? (estado as EstadoSolicitud) : "",
    search: (params.get("q") ?? "").trim(),
    desde: isUsableDay(desde) ? desde : "",
    hasta: isUsableDay(hasta) ? hasta : ""
  };
}

/** Los filtros como parametros de la URL, solo los que tienen valor. */
export function filtersToParams(filters: ListFilters) {
  const params = new URLSearchParams();
  if (filters.estado) params.set("estado", filters.estado);
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.desde) params.set("desde", filters.desde);
  if (filters.hasta) params.set("hasta", filters.hasta);
  return params;
}

export const hasActiveFilters = (filters: ListFilters) => Boolean(filters.estado || filters.search.trim() || filters.desde || filters.hasta);

/** Un rango de entrega que no puede traer nada se avisa en vez de pedirlo. */
export function filtersProblem(filters: ListFilters) {
  if (filters.desde && filters.hasta && filters.desde > filters.hasta) return "La fecha de entrega desde no puede ser posterior a la fecha hasta.";
  return null;
}

/** Los filtros como los pide GET /api/pedidos-modulos. */
export const apiFilters = (filters: ListFilters) => ({
  estado: filters.estado || undefined,
  search: filters.search.trim() || undefined,
  entregaDesde: filters.desde || undefined,
  entregaHasta: filters.hasta || undefined
});

// ---------------------------------------------------------------- exportar

/** Ids por exportacion: van en la URL de GET /api/orders/export y un proxy corta las URL largas (unos 200 ids). */
export const MAX_EXPORT = 200;

/** El nombre de siempre de la exportacion (el del servidor y el del listado de corte). */
export const DEFAULT_EXPORT_NAME = "pedidos-carpinteria.xlsx";

/** Spec §11.1: una sola solicitud de modulos, pedido-M{numero}.xlsx; en cualquier otro caso, el nombre de siempre. */
export function exportFileName(selected: Pick<ModuleOrderListItem, "numero">[]) {
  return selected.length === 1 ? `pedido-M${selected[0].numero}.xlsx` : DEFAULT_EXPORT_NAME;
}

/** Lo que impide exportar una seleccion, o null. */
export function exportProblem(count: number) {
  if (count > MAX_EXPORT) return `Se pueden exportar hasta ${MAX_EXPORT} solicitudes por vez: elegí menos.`;
  return null;
}

/**
 * Mensaje de un error de la exportacion. Se pide con responseType "blob", asi que el cuerpo del error (el JSON con el
 * mensaje del servidor) tambien llega como Blob.
 */
export async function exportErrorMessage(error: unknown) {
  const failure = error as { isAxiosError?: boolean; response?: { status?: number; data?: unknown } } | null;
  if (failure?.isAxiosError && !failure.response) return "Se cortó la conexión. Revisá la conexión e intentá de nuevo.";
  const response = failure?.response;
  if (response?.status === 414) return "Son demasiadas solicitudes para exportar juntas: elegí menos.";
  if (typeof Blob !== "undefined" && response?.data instanceof Blob) {
    try {
      const parsed = JSON.parse(await response.data.text()) as { message?: unknown };
      if (typeof parsed?.message === "string" && parsed.message) return parsed.message;
    } catch {
      // Un cuerpo que no es JSON (por ejemplo, el HTML de un proxy): queda el mensaje general.
    }
  }
  return "No se pudo exportar. Intentá de nuevo en un momento.";
}

// ---------------------------------------------------------------- aviso de resultados (lectores de pantalla)

const solicitudes = (count: number) => (count === 1 ? "1 solicitud" : `${count} solicitudes`);

/**
 * Lo que se anuncia (role=status) despues de cambiar los filtros. Vacio mientras carga, con un error o con el rango
 * invertido: esos ya tienen su aviso.
 */
export function resultsAnnouncement(input: { count: number | null; active: boolean; emptyCatalog: boolean; blocked: boolean }) {
  if (input.blocked || input.count === null) return "";
  if (input.emptyCatalog) return "Todavía no hay solicitudes de módulos";
  if (!input.active) return `Sin filtros: ${solicitudes(input.count)}`;
  if (input.count === 0) return "No hay solicitudes que coincidan con los filtros";
  return input.count === 1 ? "1 solicitud coincide con los filtros" : `${input.count} solicitudes coinciden con los filtros`;
}
