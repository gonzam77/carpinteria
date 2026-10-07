import assert from "node:assert/strict";
import test from "node:test";
import {
  activeStep,
  canChangeDeliveryDate,
  canEditModuleOrder,
  deliveryDateProblem,
  historyText,
  moduleMeasuresText,
  sortRowsByModule,
  STATUS_STEPS,
  validateEditClient
} from "./moduleOrderDetail.ts";

test("historial legible (spec §9.4)", () => {
  assert.equal(historyText({ accion: "CREAR_PEDIDO_MODULOS" }), "Creó la solicitud");
  assert.equal(historyText({ accion: "CAMBIAR_ESTADO", valorAnterior: "PENDIENTE", valorNuevo: "EN_PROCESO" }), "Cambió el estado de Pendiente a En proceso");
  assert.equal(
    historyText({ accion: "CAMBIAR_FECHA_ENTREGA", valorAnterior: "2026-10-15", valorNuevo: "2026-10-20" }),
    "Cambió la fecha de entrega del 15/10/2026 al 20/10/2026"
  );
  assert.equal(historyText({ accion: "CAMBIAR_FECHA_ENTREGA", valorNuevo: "2026-10-20" }), "Cambió la fecha de entrega del (sin fecha) al 20/10/2026");
  assert.equal(historyText({ accion: "EDITAR_PEDIDO", valorNuevo: "2 piezas modificadas" }), "Editó la solicitud: 2 piezas modificadas");
  assert.equal(historyText({ accion: "EDITAR_PEDIDO" }), "Editó la solicitud");
  assert.equal(historyText({ accion: "OTRA_COSA", valorAnterior: "a", valorNuevo: "b" }), "OTRA_COSA: a → b", "una accion desconocida se muestra tal cual");
});

test("stepper: cuatro pasos y rechazada aparte", () => {
  assert.deepEqual(STATUS_STEPS, ["PENDIENTE", "EN_PROCESO", "TERMINADA", "ENTREGADA"]);
  assert.equal(activeStep("PENDIENTE"), 0);
  assert.equal(activeStep("ENTREGADA"), 3);
  assert.equal(activeStep("RECHAZADA"), null);
});

test("fecha de entrega: desde hoy, y una entregada ya no cambia", () => {
  assert.equal(deliveryDateProblem("2026-10-07", "2026-10-07"), null);
  assert.equal(deliveryDateProblem("2026-10-06", "2026-10-07"), "La fecha de entrega no puede ser anterior a hoy.");
  assert.equal(deliveryDateProblem("", "2026-10-07"), "Elegí la fecha de entrega.");
  assert.equal(deliveryDateProblem("2026-02-30", "2026-01-01"), "Elegí la fecha de entrega.");
  assert.equal(canChangeDeliveryDate("TERMINADA"), true);
  assert.equal(canChangeDeliveryDate("ENTREGADA"), false);
});

test("edición: estados editables, medidas del encabezado y orden de las filas", () => {
  assert.deepEqual(
    (["PENDIENTE", "RECHAZADA", "EN_PROCESO", "TERMINADA", "ENTREGADA"] as const).map(canEditModuleOrder),
    [true, true, false, false, false]
  );
  const param = (clave: string, tipo: string, orden: number) => ({ clave, tipo, orden }) as never;
  const modulo = {
    valores: { ANCHO: 1200, ALTO: 780, PROFUNDIDAD: 580, PUERTAS: 2, INTERIOR: 1164 },
    definicionSnapshot: { parametros: [param("alto", "MEDIDA", 2), param("ancho", "MEDIDA", 1), param("puertas", "ENTERO", 3), param("interior", "CALCULADO", 4), param("profundidad", "MEDIDA", 3)] }
  } as never;
  assert.equal(moduleMeasuresText(modulo), "1.200 × 780 × 580 mm");
  assert.equal(moduleMeasuresText({ valores: {}, definicionSnapshot: { parametros: [] } } as never), "");

  const modulos = [{ id: "m2", posicion: 2 }, { id: "m1", posicion: 1 }];
  const rows = [{ n: 1, pedidoModuloId: null }, { n: 2, pedidoModuloId: "m2" }, { n: 3, pedidoModuloId: "m1" }, { n: 4, pedidoModuloId: "m2" }, { n: 5, pedidoModuloId: "otro" }, { n: 6, pedidoModuloId: "m1" }];
  assert.deepEqual(sortRowsByModule(rows, modulos).map((row) => row.n), [3, 6, 2, 4, 1, 5], "por posición, adicionales (y desconocidas) al final, estable");
});

test("edición: la fecha guardada puede haber pasado, una nueva no", () => {
  const data = { cliente: "Cliente", numeroContacto: "2664000000", emailContacto: "", fechaEntrega: "2026-10-01" };
  assert.deepEqual(validateEditClient(data, "2026-10-07", "2026-10-01"), [], "la guardada sigue aunque haya pasado");
  assert.deepEqual(validateEditClient({ ...data, fechaEntrega: "2026-10-02" }, "2026-10-07", "2026-10-01"), ["La fecha de entrega no puede ser anterior a hoy."]);
  assert.deepEqual(validateEditClient({ ...data, fechaEntrega: "2026-10-07" }, "2026-10-07", "2026-10-01"), []);
  assert.deepEqual(validateEditClient({ ...data, cliente: "C", emailContacto: "x@" }, "2026-10-07", "2026-10-01"), [
    "Completá el cliente (al menos 2 caracteres).",
    "El email no es válido."
  ]);
});
