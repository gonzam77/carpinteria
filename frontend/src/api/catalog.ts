// Llamadas a la API del catalogo de modulos (/api/modulos, spec §13.1).
import { api } from "./client";
import type { ModuleCategory, ModuleDefinition, ModuleEvaluation, ModuleInput, ModuleListItem, ModulesConfig } from "../types";

export async function listModules(filters: { categoriaId?: string; search?: string; incluirInactivos?: boolean } = {}) {
  const response = await api.get<ModuleListItem[]>("/modulos", {
    params: {
      ...(filters.categoriaId ? { categoriaId: filters.categoriaId } : {}),
      ...(filters.search ? { search: filters.search } : {}),
      ...(filters.incluirInactivos ? { incluirInactivos: "true" } : {})
    }
  });
  return response.data;
}

export const getModule = async (id: string) => (await api.get<ModuleDefinition>(`/modulos/${id}`)).data;
export const createModule = async (input: ModuleInput) => (await api.post<ModuleDefinition>("/modulos", input)).data;
export const updateModule = async (id: string, input: ModuleInput) => (await api.put<ModuleDefinition>(`/modulos/${id}`, input)).data;
export const setModuleActive = async (id: string, activo: boolean) => (await api.patch<ModuleDefinition>(`/modulos/${id}/active`, { activo })).data;
export const duplicateModule = async (id: string) => (await api.post<ModuleDefinition>(`/modulos/${id}/duplicar`)).data;
export const deleteModule = async (id: string) => {
  await api.delete(`/modulos/${id}`);
};

export const evaluateModuleDefinition = async (definicion: Pick<ModuleInput, "parametros" | "piezas" | "espesorDisenoMm" | "herrajes">, valores: Record<string, number> = {}) =>
  (await api.post<ModuleEvaluation>("/modulos/evaluar", { definicion, valores })).data;

export const listModuleCategories = async () => (await api.get<ModuleCategory[]>("/modulos/categorias")).data;
export const createModuleCategory = async (data: { nombre: string; orden?: number }) => (await api.post<ModuleCategory>("/modulos/categorias", data)).data;
export const updateModuleCategory = async (id: string, data: { nombre: string; orden: number; activo: boolean }) =>
  (await api.put<ModuleCategory>(`/modulos/categorias/${id}`, data)).data;

export const getModulesConfig = async () => (await api.get<ModulesConfig>("/modulos/configuracion")).data;
export const updateModulesConfig = async (data: Omit<ModulesConfig, "id">) => (await api.put<ModulesConfig>("/modulos/configuracion", data)).data;

/** Mensaje de error de la API, con el detalle de validacion de los modulos si lo hay. */
export function catalogErrorMessage(error: unknown, fallback: string) {
  const data = (error as { response?: { data?: { message?: string; details?: { errores?: string[] }; errors?: Array<{ message?: string }> } } })?.response?.data;
  if (!data) return fallback;
  const details = data.details?.errores?.length ? ` ${data.details.errores.join(" ")}` : "";
  return `${data.message ?? fallback}${details}` || (data.errors?.[0]?.message ?? fallback);
}
