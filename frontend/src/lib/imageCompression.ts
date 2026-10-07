// Compresion de imagenes de modulos antes de subirlas (DECISIONES 12): lado mayor de hasta 1200 px, WebP (o JPEG si
// el navegador no codifica WebP) y menos de 1 MB. El servidor vuelve a validar el tamano y el tipo real.

export const MAX_IMAGE_BYTES = 1024 * 1024;
export const MAX_IMAGE_SIDE = 1200;
const QUALITIES = [0.82, 0.72, 0.62, 0.52];
const MIN_SIDE = 400;

export type ImageEncoder = (width: number, height: number, type: "image/webp" | "image/jpeg", quality: number) => Promise<Blob | null>;

/** Medidas finales: el lado mayor a lo sumo `maxSide`, sin agrandar imagenes chicas. */
export function fitWithin(width: number, height: number, maxSide = MAX_IMAGE_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/**
 * Busca la primera combinacion de tamano y calidad que queda por debajo del limite. Prueba WebP y, si el
 * navegador no lo codifica (devuelve otro tipo o nada), JPEG. Si con la calidad minima sigue pesando de mas,
 * achica la imagen y vuelve a probar. Separado del canvas para poder probarlo sin navegador.
 */
export async function compressWith(sourceWidth: number, sourceHeight: number, encode: ImageEncoder, maxBytes = MAX_IMAGE_BYTES) {
  let { width, height } = fitWithin(sourceWidth, sourceHeight);
  let type: "image/webp" | "image/jpeg" = "image/webp";

  while (Math.max(width, height) >= Math.min(MIN_SIDE, Math.max(sourceWidth, sourceHeight))) {
    for (const quality of QUALITIES) {
      let blob = await encode(width, height, type, quality);
      if (type === "image/webp" && (!blob || blob.type !== "image/webp")) {
        type = "image/jpeg";
        blob = await encode(width, height, type, quality);
      }
      if (blob && blob.size <= maxBytes) return blob;
    }
    if (Math.max(width, height) <= MIN_SIDE) break;
    ({ width, height } = fitWithin(width, height, Math.round(Math.max(width, height) * 0.8)));
  }
  throw new Error("No se pudo comprimir la imagen por debajo de 1 MB. Probá con otra foto o recortala.");
}

/** Comprime un archivo elegido por el usuario. Solo en el navegador (usa canvas). */
export async function compressImageFile(file: File) {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("No se pudo leer la imagen. Usá una foto JPEG, PNG o WebP.");
  }
  try {
    const canvas = document.createElement("canvas");
    const encode: ImageEncoder = (width, height, type, quality) => {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return Promise.resolve(null);
      // Fondo blanco: las transparencias de un PNG no se pierden en negro al pasar a JPEG.
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(bitmap, 0, 0, width, height);
      return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
    };
    return await compressWith(bitmap.width, bitmap.height, encode);
  } finally {
    bitmap.close();
  }
}
