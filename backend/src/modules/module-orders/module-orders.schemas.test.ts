// Producción corre en Docker sin zona horaria (UTC). Así, un "hoy" calculado con la hora local o con UTC falla
// en cualquier computadora, no solo de noche.
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { moduleOrderCreateSchema, moduleOrderFiltersSchema } from "./module-orders.schemas.js";

const fechaEntrega = moduleOrderCreateSchema.shape.fechaEntrega;

test("la fecha de entrega se compara con el hoy de Argentina, no con el de UTC", (t) => {
  // 2026-10-06 01:30 UTC son las 22:30 del 5 de octubre en Buenos Aires.
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-06T01:30:00Z") });
  t.after(() => mock.timers.reset());
  assert.equal(fechaEntrega.safeParse("2026-10-05").success, true, "hoy en Argentina");
  assert.equal(fechaEntrega.safeParse("2026-10-06").success, true);
  const ayer = fechaEntrega.safeParse("2026-10-04");
  assert.equal(ayer.success, false);
  assert.match(JSON.stringify(ayer.error?.issues), /no puede ser anterior a hoy/);
});

test("la fecha de entrega tiene que ser AAAA-MM-DD", () => {
  for (const value of ["05/10/2026", "2026-13-01", "2026-02-30", "", null]) {
    assert.equal(fechaEntrega.safeParse(value).success, false, String(value));
  }
});

test("la clave de alta es opcional y tiene que ser un UUID (DECISIONES 40)", () => {
  const claveAlta = moduleOrderCreateSchema.shape.claveAlta;
  assert.equal(claveAlta.safeParse(undefined).success, true);
  assert.equal(claveAlta.safeParse("3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b").success, true);
  for (const value of ["", "123", "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0", 42, null]) {
    const parsed = claveAlta.safeParse(value);
    assert.equal(parsed.success, false, String(value));
    assert.match(JSON.stringify(parsed.error?.issues), /La clave de alta no es válida/);
  }
  assert.equal(moduleOrderFiltersSchema.safeParse({ clave: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b" }).success, true);
  assert.equal(moduleOrderFiltersSchema.safeParse({ clave: "x" }).success, false);
});
