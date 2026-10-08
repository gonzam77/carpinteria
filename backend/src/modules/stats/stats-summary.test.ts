import assert from "node:assert/strict";
import test from "node:test";
import { summarizeOrders } from "./stats-summary.js";

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
