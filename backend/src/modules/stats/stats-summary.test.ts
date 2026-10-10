import assert from "node:assert/strict";
import test from "node:test";
import { summarizeModuleOrders, summarizeOrders, type ModuleOrderForStats } from "./stats-summary.js";

const group = (estado: string, tipo: string, total: number) => ({ estado, tipo, _count: { _all: total } });

test("dashboard: totales por estado con los de módulos aparte, y por tipo (spec §15)", () => {
  const summary = summarizeOrders([group("PENDIENTE", "CORTE", 5), group("PENDIENTE", "MODULOS", 2), group("ENTREGADA", "CORTE", 40), group("EN_PROCESO", "MODULOS", 1)]);
  assert.deepEqual(summary.byStatus, [
    { estado: "PENDIENTE", total: 7, modulos: 2 },
    { estado: "ENTREGADA", total: 40, modulos: 0 },
    { estado: "EN_PROCESO", total: 1, modulos: 1 }
  ]);
  assert.deepEqual(summary.byTipo, [
    { tipo: "CORTE", total: 45 },
    { tipo: "MODULOS", total: 3 }
  ]);
});

test("dashboard: sin solicitudes de módulos, los mismos totales de antes y módulos en 0", () => {
  const summary = summarizeOrders([group("PENDIENTE", "CORTE", 3)]);
  assert.deepEqual(summary.byStatus, [{ estado: "PENDIENTE", total: 3, modulos: 0 }]);
  assert.deepEqual(summary.byTipo, [
    { tipo: "CORTE", total: 3 },
    { tipo: "MODULOS", total: 0 }
  ]);
});

test("dashboard de módulos (punto 8): en curso, entregas, cumplimiento, ticket y meses", () => {
  const order = (numero: number, extra: Partial<ModuleOrderForStats>): ModuleOrderForStats => ({
    id: `o${numero}`,
    numero,
    cliente: `Cliente ${numero}`,
    estado: "PENDIENTE",
    fechaEntrega: "2026-10-20",
    creada: "2026-10-01",
    presupuestoEstimado: 100000.1,
    costoHerrajes: 0,
    placasEstimadas: 3,
    modulos: 2,
    entregada: null,
    ...extra
  });
  const summary = summarizeModuleOrders(
    [
      order(1, { fechaEntrega: "2026-10-05" }), // vencida
      order(2, { estado: "EN_PROCESO", fechaEntrega: "2026-10-11", costoHerrajes: 5000 }), // por vencer (2 dias)
      order(3, { estado: "TERMINADA", fechaEntrega: "2026-10-30" }),
      order(4, { estado: "ENTREGADA", fechaEntrega: "2026-09-30", entregada: "2026-09-29", creada: "2026-08-10" }), // a tiempo
      order(5, { estado: "ENTREGADA", fechaEntrega: "2026-09-30", entregada: "2026-10-02", creada: "2026-09-15" }), // tarde
      order(6, { estado: "RECHAZADA", creada: "2026-09-20" })
    ],
    [{ nombre: "Bajo mesada", cantidad: 7 }],
    { today: "2026-10-09", diasAviso: 3 }
  );
  assert.equal(summary.activas, 3);
  assert.deepEqual(summary.porEstado.map((item) => item.total), [1, 1, 1]);
  assert.equal(summary.modulosActivos, 6);
  assert.equal(summary.placasActivas, 9);
  assert.equal(summary.presupuestoActivo, 305000.3, "con herrajes, sumado en centavos");
  assert.equal(summary.vencidas, 1);
  assert.equal(summary.porVencer, 1);
  assert.deepEqual(summary.proximas.map((item) => [item.numero, item.dias]), [[1, -4], [2, 2], [3, 21]]);
  assert.deepEqual(summary.cumplimiento, { entregadas: 2, aTiempo: 1 });
  assert.equal(summary.ticketPromedio, 101000.1, "las creadas en los últimos 90 días, sin la rechazada");
  assert.deepEqual(summary.meses.map((item) => item.mes), ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]);
  assert.deepEqual(summary.meses.slice(3).map((item) => [item.solicitudes, item.presupuesto]), [[1, 100000.1], [2, 100000.1], [3, 305000.3]]);
});
