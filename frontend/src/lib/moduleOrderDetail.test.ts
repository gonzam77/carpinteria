import assert from "node:assert/strict";
import test from "node:test";
import { activeStep, canChangeDeliveryDate, deliveryDateProblem, historyText, STATUS_STEPS } from "./moduleOrderDetail.ts";

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
