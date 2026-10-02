// Imagenes de los modulos del catalogo (DECISIONES 12). Se comprimen en el navegador antes de subirlas y el
// servidor las guarda como archivos, hasta 1 MB.
import { api } from "./client";
import { compressImageFile } from "../lib/imageCompression";
import { forgetModuleImage } from "../hooks/useModuleImage";

export type ModuleImageInfo = { mime: string; tamanoBytes: number; fechaActualizacion: string };

/** Comprime y sube la imagen de un modulo, reemplazando la anterior. */
export async function uploadModuleImage(moduloId: string, file: File) {
  const blob = await compressImageFile(file);
  const response = await api.put<ModuleImageInfo>(`/modulos/${moduloId}/imagen`, blob, { headers: { "Content-Type": blob.type } });
  forgetModuleImage(moduloId);
  return response.data;
}

export async function deleteModuleImage(moduloId: string) {
  await api.delete(`/modulos/${moduloId}/imagen`);
  forgetModuleImage(moduloId);
}
