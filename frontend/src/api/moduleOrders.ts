// Llamadas a la API de solicitudes de modulos (/api/pedidos-modulos, spec §13.2).
import axios from "axios";
import { api } from "./client";
import type { EstadoSolicitud, ModuleOrder, ModuleOrderClient, ModuleOrderLineInput, ModuleOrderListItem, ModuleOrderPreview } from "../types";

/** Vista previa (spec §8.5). La senal corta la espera en el navegador (el servidor la calcula igual, PLAN P12). */
export const previewModuleOrder = async (data: Partial<ModuleOrderClient> & { modulos: ModuleOrderLineInput[] }, options: { signal?: AbortSignal } = {}) =>
  (await api.post<ModuleOrderPreview>("/pedidos-modulos/preview", data, { signal: options.signal })).data;

/**
 * Alta. Con `claveAlta` (un UUID por intento, DECISIONES 40), si el mismo intento llega dos veces el servidor devuelve
 * la solicitud ya creada (200) en vez de crear otra (201).
 */
export const createModuleOrder = async (data: ModuleOrderClient & { modulos: ModuleOrderLineInput[]; claveAlta?: string }) =>
  (await api.post<ModuleOrder>("/pedidos-modulos", data)).data;

export const getModuleOrder = async (id: string) => (await api.get<ModuleOrder>(`/pedidos-modulos/${id}`)).data;

export async function listModuleOrders(filters: { estado?: EstadoSolicitud; search?: string; entregaDesde?: string; entregaHasta?: string; clave?: string } = {}) {
  const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== undefined && value !== ""));
  return (await api.get<ModuleOrderListItem[]>("/pedidos-modulos", { params })).data;
}

export type ModuleOrderApiError = {
  message: string;
  items: string[];
  code?: string;
  details?: Record<string, unknown>;
  /** Sin respuesta: se corto la conexion o vencio el tiempo. */
  noResponse?: boolean;
  /** El codigo HTTP, si hubo respuesta. */
  status?: number;
};

/**
 * Error de la API de solicitudes de modulos, listo para mostrar: el mensaje y la lista de problemas. Junta los dos
 * formatos del backend: reglas del negocio (code y details.errores) y datos mal formados (zod: errors[].message).
 * Sin respuesta (se corto la conexion), con `writes` avisa que la solicitud puede haber quedado cargada.
 */
export function moduleOrderError(error: unknown, fallback: string, writes = false): ModuleOrderApiError {
  if (axios.isAxiosError(error) && !error.response) {
    return {
      message: writes
        ? "Se corto la conexion antes de recibir la respuesta. Revisa si la solicitud quedo cargada antes de volver a crearla."
        : "Se corto la conexion. Revisa la conexion e intenta de nuevo.",
      items: [],
      noResponse: true
    };
  }
  const response = (error as { response?: { status?: number; data?: { message?: string; code?: string; details?: Record<string, unknown> & { errores?: unknown }; errors?: Array<{ message?: string }> } } })?.response;
  const data = response?.data;
  if (!data || typeof data !== "object") return { message: fallback, items: [], status: response?.status };
  const errores = Array.isArray(data.details?.errores) ? (data.details?.errores as unknown[]).map(String) : [];
  const zod = Array.isArray(data.errors) ? data.errors.map((issue) => issue.message ?? "").filter(Boolean) : [];
  const message = zod.length ? "Hay datos para corregir." : (data.message ?? fallback);
  // Los errores de negocio suelen venir tambien dentro del mensaje: se listan solo los que no estan.
  const items = [...new Set(zod.length ? zod : errores)].filter((item) => !message.includes(item));
  return { message, items, code: data.code, details: data.details, status: response?.status };
}
