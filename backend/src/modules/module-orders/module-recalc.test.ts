import assert from "node:assert/strict";
import test from "node:test";
import { composeRows, moduleLabel, renumberProblem } from "./module-recalc.js";

const row = (codigo: string, pedidoModuloId: string | null, orden: number, indice: number) => ({ codigo, pedidoModuloId, orden, indice });

test("recalcular: las filas nuevas reemplazan a las del módulo, en su lugar y en orden (spec §10.6)", () => {
  const posicion = new Map([
    ["m1", 1],
    ["m2", 2],
    ["m3", 3]
  ]);
  const saved = [
    row("m1-a", "m1", 1, 0),
    row("m1-nueva", "m1", 12, 1), // agregada a mano arriba: queda donde estaba
    row("m2-a", "m2", 1, 2),
    row("m2-b", "m2", 2, 3),
    row("m3-a", "m3", 1, 4),
    row("adicional", null, 1, 5)
  ];
  const fresh = [row("m2-y", "m2", 2, 99), row("m2-x", "m2", 1, 98), row("m2-z", "m2", 3, 97)];
  const result = composeRows(saved, "m2", fresh, posicion);
  assert.deepEqual(
    result.map((r) => r.codigo),
    ["m1-a", "m1-nueva", "m2-x", "m2-y", "m2-z", "m3-a", "adicional"]
  );
  assert.deepEqual(
    result.map((r) => r.indice),
    [0, 1, 2, 3, 4, 5, 6]
  );
});

test("recalcular: rótulo para el historial y mensajes con la posición real", () => {
  const snapshot = { parametros: [{ clave: "alto", tipo: "MEDIDA", orden: 2 }, { clave: "ancho", tipo: "MEDIDA", orden: 1 }, { clave: "puertas", tipo: "ENTERO", orden: 3 }] };
  assert.equal(moduleLabel(2, "Bajo mesada 2 puertas", snapshot, { ANCHO: 900, ALTO: 780, PUERTAS: 2 }), "Módulo 2 · Bajo mesada 2 puertas · 900 × 780 mm");
  assert.equal(moduleLabel(1, "Sin medidas", null, {}), "Módulo 1 · Sin medidas");
  assert.equal(renumberProblem("El módulo 1 (Alacena) está inactivo: no se puede pedir.", 3), "El módulo 3 (Alacena) está inactivo: no se puede pedir.");
  assert.equal(renumberProblem("Módulo 1 · Puertas: no entra", 2), "Módulo 2 · Puertas: no entra");
  assert.equal(renumberProblem("El módulo 12 no cambia", 4), "El módulo 12 no cambia");
});
