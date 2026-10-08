// Configuracion › Herrajes (/api/herrajes, spec §13.4 y DECISIONES 57).
import { api } from "./client";
import type { Hardware, HardwareInput, HardwareType } from "../types";

export const listHardwareTypes = async () => (await api.get<HardwareType[]>("/herrajes/tipos")).data;
export const createHardwareType = async (nombre: string) => (await api.post<HardwareType>("/herrajes/tipos", { nombre })).data;
export const updateHardwareType = async (id: string, data: { nombre: string; activo?: boolean }) => (await api.put<HardwareType>(`/herrajes/tipos/${id}`, data)).data;

export const listHardware = async (incluirInactivos = false) =>
  (await api.get<Hardware[]>("/herrajes", { params: incluirInactivos ? { incluirInactivos: "true" } : {} })).data;
export const createHardware = async (data: HardwareInput) => (await api.post<Hardware>("/herrajes", data)).data;
export const updateHardware = async (id: string, data: HardwareInput) => (await api.put<Hardware>(`/herrajes/${id}`, data)).data;
export const setHardwareActive = async (id: string, activo: boolean) => (await api.patch<Hardware>(`/herrajes/${id}/active`, { activo })).data;
export const deleteHardware = async (id: string) => api.delete(`/herrajes/${id}`);
export const adjustHardwareValues = async (herrajeIds: string[], percentage: number) =>
  (await api.post<{ updatedCount: number }>("/herrajes/adjust-values", { herrajeIds, percentage })).data;
