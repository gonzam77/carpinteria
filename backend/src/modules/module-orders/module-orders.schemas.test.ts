// Producción corre en Docker sin zona horaria (UTC). Así, un "hoy" calculado con la hora local o con UTC falla
// en cualquier computadora, no solo de noche.
process.env.TZ = "UTC";

import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { moduleOrderCreateSchema, moduleOrderDeliveryDateSchema, moduleOrderFiltersSchema, moduleOrderUpdateSchema } from "./module-orders.schemas.js";

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

test("cambio de fecha de entrega (spec §9.3): desde hoy en Argentina y solo la fecha", (t) => {
  mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-10-06T01:30:00Z") });
  t.after(() => mock.timers.reset());
  assert.equal(moduleOrderDeliveryDateSchema.safeParse({ fechaEntrega: "2026-10-05" }).success, true, "hoy en Argentina");
  assert.equal(moduleOrderDeliveryDateSchema.safeParse({ fechaEntrega: "2026-10-04" }).success, false, "ayer");
  assert.equal(moduleOrderDeliveryDateSchema.safeParse({ fechaEntrega: "15/10/2026" }).success, false);
  assert.equal(moduleOrderDeliveryDateSchema.safeParse({}).success, false, "sin fecha");
  assert.equal(moduleOrderDeliveryDateSchema.safeParse({ fechaEntrega: "2026-10-20", estado: "ENTREGADA" }).success, false, "solo la fecha");
});

test("edición (spec §10.3): la fecha guardada puede haber pasado, las filas traen id y módulo, y nada más", () => {
  const fila = { materialId: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", largo: 720, ancho: 560, cantidad: 2 };
  const base = { cliente: "Prueba", numeroContacto: "2664000000", fechaEntrega: "2020-01-01", detalles: [fila] };
  const parsed = moduleOrderUpdateSchema.safeParse(base);
  assert.equal(parsed.success, true, "una fecha pasada pasa el esquema: el servicio la acepta si es la guardada");
  assert.equal(parsed.data?.detalles[0].pedidoModuloId, null, "sin módulo es una pieza adicional");
  const conIds = moduleOrderUpdateSchema.safeParse({
    ...base,
    fechaActualizacion: "2026-10-07T12:34:56.789Z",
    detalles: [{ ...fila, id: "9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e", pedidoModuloId: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", piezaCodigo: "LAT", orden: 4 }]
  });
  assert.equal(conIds.success, true);
  assert.equal("piezaCodigo" in (conIds.data?.detalles[0] ?? {}), false, "el código de pieza lo pone el servidor");
  assert.equal(moduleOrderUpdateSchema.safeParse({ ...base, detalles: [] }).success, false, "sin piezas");
  assert.equal(moduleOrderUpdateSchema.safeParse({ ...base, fechaEntrega: "01/01/2020" }).success, false);
  assert.equal(moduleOrderUpdateSchema.safeParse({ ...base, estado: "PENDIENTE" }).success, false, "un campo desconocido");
  assert.equal(moduleOrderUpdateSchema.safeParse({ ...base, fechaActualizacion: "ayer" }).success, false);
  assert.equal(moduleOrderUpdateSchema.safeParse({ ...base, detalles: [{ ...fila, pedidoModuloId: "x" }] }).success, false);
});

test("edición con herrajes (F6.4): opcionales; cada uno con su módulo, su modelo y una cantidad entera desde 1", () => {
  const fila = { materialId: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", largo: 720, ancho: 560, cantidad: 2 };
  const base = { cliente: "Prueba", numeroContacto: "2664000000", fechaEntrega: "2026-12-01", detalles: [fila] };
  const herraje = { pedidoModuloId: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", herrajeId: "9b1d2c3e-4f5a-4b6c-8d7e-0f1a2b3c4d5e", cantidad: 4 };
  assert.equal(moduleOrderUpdateSchema.safeParse(base).data?.herrajes, undefined, "sin herrajes, los guardados no cambian");
  const parsed = moduleOrderUpdateSchema.safeParse({ ...base, herrajes: [herraje, { ...herraje, id: "0f1a2b3c-4d5e-4f6a-8b7c-9d0e1f2a3b4c", herrajeId: null }] });
  assert.equal(parsed.success, true);
  assert.equal(parsed.data?.herrajes?.[0].id, null, "sin id es uno nuevo");
  assert.equal(moduleOrderUpdateSchema.safeParse({ ...base, herrajes: [] }).success, true, "se pueden quitar todos");
  const mal = (patch: Record<string, unknown>) => moduleOrderUpdateSchema.safeParse({ ...base, herrajes: [{ ...herraje, ...patch }] });
  assert.match(mal({ cantidad: 0 }).error?.issues[0].message ?? "", /al menos 1/);
  assert.match(mal({ cantidad: 1.5 }).error?.issues[0].message ?? "", /entero/);
  assert.equal(mal({ pedidoModuloId: undefined }).success, false, "sin módulo");
  assert.equal(mal({ valorUnitario: 1 }).success, false, "el precio lo pone el servidor");
});
