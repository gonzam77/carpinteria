// Logica del detalle de una solicitud de modulos (spec §9.3) que no depende de React: el historial legible, el
// stepper de estados y la fecha de entrega editable.
import { isValidDay, validateClient } from "./moduleOrderWizard.ts";
import { formatDay } from "./moduleOrdersList.ts";
import type { EstadoSolicitud, ModuleOrder, ModuleOrderDetail, Order } from "../types/index.ts";

const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  PENDIENTE: "Pendiente",
  EN_PROCESO: "En proceso",
  TERMINADA: "Terminada",
  ENTREGADA: "Entregada",
  RECHAZADA: "Rechazada"
};
const estadoLabel = (value: string | undefined) => (value && value in ESTADO_LABEL ? ESTADO_LABEL[value as EstadoSolicitud] : (value ?? ""));

/** Los pasos del stepper (spec §9.3). Rechazada no es un paso: se muestra aparte. */
export const STATUS_STEPS: EstadoSolicitud[] = ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA"];

/** El paso en que esta (0..3), o null si esta rechazada. */
export const activeStep = (estado: EstadoSolicitud) => (estado === "RECHAZADA" ? null : STATUS_STEPS.indexOf(estado));

type HistoryItem = NonNullable<Order["historial"]>[number];

/** Una entrada del historial como se lee (spec §9.4). */
export function historyText(item: Pick<HistoryItem, "accion" | "valorAnterior" | "valorNuevo">) {
  switch (item.accion) {
    case "CREAR_PEDIDO_MODULOS":
    case "CREAR_PEDIDO":
      return "Creó la solicitud";
    case "CAMBIAR_ESTADO":
      return `Cambió el estado de ${estadoLabel(item.valorAnterior)} a ${estadoLabel(item.valorNuevo)}`;
    case "CAMBIAR_FECHA_ENTREGA":
      return `Cambió la fecha de entrega del ${formatDay(item.valorAnterior) || "(sin fecha)"} al ${formatDay(item.valorNuevo)}`;
    case "EDITAR_PEDIDO":
      return item.valorNuevo ? `Editó la solicitud: ${item.valorNuevo}` : "Editó la solicitud";
    case "RECALCULAR_MODULO":
      return item.valorNuevo ? `Recalculó un módulo: ${item.valorNuevo}` : "Recalculó un módulo";
    default:
      return [item.accion, item.valorAnterior && item.valorNuevo ? `${item.valorAnterior} → ${item.valorNuevo}` : ""].filter(Boolean).join(": ");
  }
}

/** Una solicitud entregada ya no cambia la fecha de entrega (el backend responde 409). */
export const canChangeDeliveryDate = (estado: EstadoSolicitud) => estado !== "ENTREGADA";

/** Que tiene de malo la fecha nueva (las mismas reglas que el backend), o null si sirve. */
export function deliveryDateProblem(value: string, today: string) {
  if (!isValidDay(value)) return "Elegí la fecha de entrega.";
  if (value < today) return "La fecha de entrega no puede ser anterior a hoy.";
  return null;
}

// ---------------------------------------------------------------- edicion (spec §10)

/** Se puede editar mientras no este en proceso, terminada ni entregada (spec §10.1, igual que corte). */
export const canEditModuleOrder = (estado: EstadoSolicitud) => estado !== "EN_PROCESO" && estado !== "TERMINADA" && estado !== "ENTREGADA";

type OrderModule = Pick<ModuleOrder["modulos"][number], "valores" | "definicionSnapshot">;

/** Las medidas del modulo como se leen en el encabezado: "1200 × 780 × 580 mm" (las medidas pedidas, en su orden). */
export function moduleMeasuresText(modulo: OrderModule) {
  const medidas = [...(modulo.definicionSnapshot?.parametros ?? [])]
    .filter((param) => param.tipo === "MEDIDA")
    .sort((a, b) => a.orden - b.orden)
    .map((param) => modulo.valores[param.clave.toUpperCase()] ?? modulo.valores[param.clave])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return medidas.length ? `${medidas.map((value) => value.toLocaleString("es-AR")).join(" × ")} mm` : "";
}

/**
 * Las filas agrupadas como las muestra la edicion: por modulo (posicion) y las adicionales al final; dentro de cada
 * grupo, en el orden guardado. Una fila de un modulo que no esta va con las adicionales.
 */
export function sortRowsByModule<T extends Pick<ModuleOrderDetail, "pedidoModuloId">>(rows: T[], modulos: Array<{ id: string; posicion: number }>) {
  const posicion = new Map(modulos.map((modulo) => [modulo.id, modulo.posicion]));
  const grupo = (row: T) => (row.pedidoModuloId && posicion.has(row.pedidoModuloId) ? posicion.get(row.pedidoModuloId)! : Number.MAX_SAFE_INTEGER);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => grupo(a.row) - grupo(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/**
 * Validacion del paso Datos al editar, con las reglas del PUT: las del alta, salvo que la fecha de entrega guardada
 * puede seguir aunque ya haya pasado; una nueva tiene que ser desde hoy.
 */
export function validateEditClient(data: Parameters<typeof validateClient>[0], today: string, fechaGuardada: string | null) {
  return validateClient(data, data.fechaEntrega === fechaGuardada ? "" : today);
}
