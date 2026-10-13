import axios from "axios";

/**
 * El mensaje de un error de la API para mostrar (2026-10-13): el del servidor, el primero de una validacion, o el que
 * se da. Sin respuesta, que se corto la conexion.
 */
export function apiErrorMessage(error: unknown, fallback: string) {
  if (axios.isAxiosError<{ message?: string; errors?: Array<{ message?: string }> }>(error)) {
    if (!error.response) return "Se cortó la conexión con el servidor. Revisá la conexión e intentá de nuevo.";
    const data = error.response.data;
    if (data && typeof data === "object" && !(data instanceof Blob)) return data.message || data.errors?.[0]?.message || fallback;
  }
  return fallback;
}

/** Los detalles de una validacion del servidor (zod o details.errores), uno por renglon. */
export function apiErrorItems(error: unknown): string[] {
  if (!axios.isAxiosError<{ errors?: Array<{ message?: string }>; details?: { errores?: unknown } }>(error)) return [];
  const data = error.response?.data;
  if (!data || typeof data !== "object") return [];
  const errores = Array.isArray(data.details?.errores) ? data.details.errores.filter((item): item is string => typeof item === "string") : [];
  const zod = (data.errors ?? []).map((item) => item.message ?? "").filter(Boolean);
  return [...new Set([...errores, ...zod.slice(1)])];
}

/** Un error que no hace falta mostrar: la sesion vencida (tiene su dialogo) o un pedido cancelado a proposito. */
export function isSilentApiError(error: unknown) {
  return axios.isCancel(error) || (axios.isAxiosError(error) && error.response?.status === 401);
}
