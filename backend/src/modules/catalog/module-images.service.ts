// Imagenes de los modulos del catalogo, guardadas como archivos en UPLOADS_DIR/modulos (DECISIONES 12).
// La tabla modulos_imagen guarda solo el nombre del archivo, el tipo y el tamano. El navegador las achica y
// comprime antes de subirlas; aca se valida igual el tamano y el tipo real, sin confiar en lo que llega.
import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { env } from "../../config/env.js";
import { AppError } from "../../utils/http.js";

export const MAX_IMAGE_BYTES = 1024 * 1024;

const EXTENSION = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type ImageMime = keyof typeof EXTENSION;
const FILE_NAME = /^[A-Za-z0-9-]+\.(jpg|png|webp)$/;

function imageDir() {
  return resolve(env.UPLOADS_DIR, "modulos");
}

/** Tipo real de la imagen por sus primeros bytes (no por el nombre ni por el Content-Type). */
export function detectImageMime(buffer: Buffer): ImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

/** Ruta del archivo de una imagen guardada. Rechaza cualquier nombre que no sea uno generado aca. */
export function moduleImagePath(archivo: string) {
  if (!FILE_NAME.test(archivo)) throw new AppError(500, "Nombre de archivo de imagen no valido.");
  return join(imageDir(), archivo);
}

/**
 * Guarda (o reemplaza) la imagen de un modulo. Escribe el archivo de forma atomica (temporal + rename), y
 * borra el anterior solo despues de registrar el nuevo, asi nunca queda el modulo apuntando a un archivo
 * que no existe.
 */
export async function storeModuleImage(prisma: PrismaClient, moduloId: string, buffer: Buffer) {
  if (!buffer.length) throw new AppError(400, "La imagen esta vacia.");
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new AppError(413, "La imagen supera 1 MB. Achicala o comprimila antes de subirla.", { code: "IMAGE_TOO_LARGE" });
  }
  const mime = detectImageMime(buffer);
  if (!mime) throw new AppError(415, "Solo se aceptan imagenes JPEG, PNG o WebP.", { code: "IMAGE_TYPE_NOT_ALLOWED" });

  const hash = createHash("sha256").update(buffer).digest("hex").slice(0, 16);
  const archivo = `${moduloId}-${hash}.${EXTENSION[mime]}`;
  await mkdir(imageDir(), { recursive: true });
  const temporary = join(imageDir(), `.tmp-${randomUUID()}`);
  await writeFile(temporary, buffer);
  await rename(temporary, moduleImagePath(archivo));

  const previous = await prisma.moduloImagen.findUnique({ where: { moduloId } });
  const saved = await prisma.moduloImagen.upsert({
    where: { moduloId },
    update: { mime, archivo, tamanoBytes: buffer.length },
    create: { moduloId, mime, archivo, tamanoBytes: buffer.length }
  });
  if (previous && previous.archivo !== archivo) {
    await rm(moduleImagePath(previous.archivo), { force: true });
  }
  return saved;
}

/** Quita la imagen de un modulo: el registro y el archivo. */
export async function removeModuleImage(prisma: PrismaClient, moduloId: string) {
  const previous = await prisma.moduloImagen.findUnique({ where: { moduloId } });
  if (!previous) return false;
  await prisma.moduloImagen.delete({ where: { moduloId } });
  await rm(moduleImagePath(previous.archivo), { force: true });
  return true;
}
