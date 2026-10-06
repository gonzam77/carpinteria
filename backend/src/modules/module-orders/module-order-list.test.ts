import assert from "node:assert/strict";
import test from "node:test";
import { compareForList, type ListOrderKey } from "./module-order-list.js";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);
const order = (numero: number, estado: string, fechaEntrega: string | null): ListOrderKey => ({ numero, estado, fechaEntrega: fechaEntrega ? day(fechaEntrega) : null });

test("orden del listado: en curso por fecha, despues las rechazadas y al final las entregadas (DECISIONES 41)", () => {
  const orders = [
    order(1, "ENTREGADA", "2026-09-16"),
    order(2, "RECHAZADA", "2026-10-01"),
    order(3, "PENDIENTE", "2026-10-16"),
    order(4, "EN_PROCESO", "2026-10-06"),
    order(5, "PENDIENTE", "2026-10-03"),
    order(6, "TERMINADA", "2026-10-08"),
    order(7, "RECHAZADA", "2026-09-20"),
    order(8, "ENTREGADA", "2026-09-10")
  ];
  assert.deepEqual(
    [...orders].sort(compareForList).map((item) => item.numero),
    [5, 4, 6, 3, 7, 2, 8, 1]
  );
});

test("orden del listado: sin fecha al final de su grupo, y a igual fecha por numero", () => {
  const orders = [order(10, "PENDIENTE", null), order(9, "PENDIENTE", null), order(12, "PENDIENTE", "2026-10-06"), order(11, "PENDIENTE", "2026-10-06")];
  assert.deepEqual(
    [...orders].sort(compareForList).map((item) => item.numero),
    [11, 12, 9, 10]
  );
});

test("orden del listado: no depende del orden de llegada", () => {
  const orders = [order(1, "RECHAZADA", "2026-10-01"), order(2, "PENDIENTE", "2026-10-10"), order(3, "ENTREGADA", "2026-09-01"), order(4, "EN_PROCESO", null)];
  const expected = [2, 4, 1, 3];
  assert.deepEqual([...orders].sort(compareForList).map((item) => item.numero), expected);
  assert.deepEqual([...orders].reverse().sort(compareForList).map((item) => item.numero), expected);
});
