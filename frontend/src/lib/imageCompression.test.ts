import assert from "node:assert/strict";
import test from "node:test";
import { MAX_IMAGE_BYTES, compressWith, fitWithin, type ImageEncoder } from "./imageCompression.ts";

// Codificador falso: el peso crece con la superficie y la calidad, como en uno real.
function fakeEncoder({ bytesPerPixel = 1, supportsWebp = true } = {}) {
  const calls: Array<{ width: number; height: number; type: string; quality: number }> = [];
  const encode: ImageEncoder = async (width, height, type, quality) => {
    calls.push({ width, height, type, quality });
    const realType = type === "image/webp" && !supportsWebp ? "image/png" : type;
    return new Blob([new Uint8Array(Math.round(width * height * bytesPerPixel * quality))], { type: realType });
  };
  return { encode, calls };
}

test("achica al lado mayor de 1200 px sin agrandar las chicas", () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1200, height: 900 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 900, height: 1200 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
});

test("una foto comun sale en WebP a 1200 px en el primer intento", async () => {
  const { encode, calls } = fakeEncoder();
  const blob = await compressWith(4000, 3000, encode);
  assert.equal(blob.type, "image/webp");
  assert.ok(blob.size <= MAX_IMAGE_BYTES);
  assert.deepEqual(calls[0], { width: 1200, height: 900, type: "image/webp", quality: 0.82 });
  assert.equal(calls.length, 1);
});

test("si el navegador no codifica WebP, usa JPEG", async () => {
  const { encode } = fakeEncoder({ supportsWebp: false });
  const blob = await compressWith(4000, 3000, encode);
  assert.equal(blob.type, "image/jpeg");
});

test("una foto pesada baja la calidad y, si hace falta, el tamano", async () => {
  const { encode, calls } = fakeEncoder({ bytesPerPixel: 2 });
  const blob = await compressWith(4000, 3000, encode);
  assert.ok(blob.size <= MAX_IMAGE_BYTES);
  assert.ok(calls.length > 1);
  assert.ok(calls.some((call) => call.quality < 0.82 || call.width < 1200));
});

test("si no hay forma de bajar de 1 MB, avisa", async () => {
  // 20 bytes por pixel: ni a 400 px con la calidad minima baja de 1 MB.
  const { encode } = fakeEncoder({ bytesPerPixel: 20 });
  await assert.rejects(() => compressWith(4000, 3000, encode), /1 MB/);
});
