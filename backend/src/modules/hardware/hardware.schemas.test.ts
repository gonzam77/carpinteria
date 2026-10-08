import assert from "node:assert/strict";
import test from "node:test";
import { hardwareAdjustSchema, hardwareSchema, hardwareTypeSchema } from "./hardware.schemas.js";

const tipoId = "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b";

test("herraje: modelo con precio y unidad; los que van por medida necesitan su línea (DECISIONES 57)", () => {
  assert.equal(hardwareSchema.safeParse({ nombre: "Bisagra cazoleta común", tipoId, unidad: "unidad", valor: 850 }).success, true);
  const corredera = hardwareSchema.safeParse({ nombre: "Corredera telescópica 400", tipoId, unidad: "par", valor: 9800, linea: "Telescópica", medidaMm: 400 });
  assert.equal(corredera.success, true);
  const sinLinea = hardwareSchema.safeParse({ nombre: "Corredera 400", tipoId, unidad: "par", valor: 9800, medidaMm: 400 });
  assert.equal(sinLinea.success, false);
  assert.match(JSON.stringify(sinLinea.error?.issues), /tiene que tener su línea/);
  assert.equal(hardwareSchema.parse({ nombre: "Pata", tipoId, unidad: "unidad", valor: 300, linea: "  " }).linea, null, "línea vacía queda null");
  assert.equal(hardwareSchema.safeParse({ nombre: "Pata", tipoId, unidad: "caja", valor: 300 }).success, false, "unidad desconocida");
  assert.equal(hardwareSchema.safeParse({ nombre: "Pata", tipoId, unidad: "unidad", valor: -1 }).success, false, "precio negativo");
  assert.equal(hardwareSchema.safeParse({ nombre: "Pata", tipoId: "x", unidad: "unidad", valor: 1 }).success, false, "tipo inválido");
  assert.equal(hardwareSchema.safeParse({ nombre: "Pata", tipoId, unidad: "unidad", valor: 1, stock: 3 }).success, false, "sin stock (solo precio y cantidad)");
});

test("tipo y ajuste de precios", () => {
  assert.equal(hardwareTypeSchema.safeParse({ nombre: "Bisagra" }).success, true);
  assert.equal(hardwareTypeSchema.safeParse({ nombre: "B" }).success, false);
  assert.equal(hardwareAdjustSchema.safeParse({ herrajeIds: [tipoId], percentage: 12.5 }).success, true);
  assert.equal(hardwareAdjustSchema.safeParse({ herrajeIds: [tipoId], percentage: -100 }).success, false);
  assert.equal(hardwareAdjustSchema.safeParse({ herrajeIds: [], percentage: 10 }).success, false);
});
