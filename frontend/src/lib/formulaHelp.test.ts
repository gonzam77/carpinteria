import assert from "node:assert/strict";
import test from "node:test";
import { catalogSuggestions, formulaHelp, insertAt } from "./formulaHelp.ts";
import { formulaSuggestions } from "./moduleEditor.ts";
import { FORMULA_FUNCTIONS, parseFormula } from "./moduleFormula.ts";

const draft = {
  parametros: [
    { uid: "p1", clave: "ANCHO", etiqueta: "Ancho", tipo: "MEDIDA" },
    { uid: "p2", clave: "ALTO", etiqueta: "Alto", tipo: "MEDIDA" }
  ],
  piezas: [
    { uid: "a", codigo: "LATERAL", nombre: "Lateral" },
    { uid: "b", codigo: "PUERTAS", nombre: "Puertas" }
  ]
} as unknown as Parameters<typeof formulaSuggestions>[0];

test("ayuda de fórmulas: las medidas, las piezas con largo, ancho y cant, ESP y todas las funciones del motor", () => {
  const help = formulaHelp("pieza-largo", formulaSuggestions(draft));
  assert.deepEqual(help.medidas.map((item) => item.insert), ["ANCHO", "ALTO"]);
  assert.deepEqual(help.piezas.map((item) => [item.codigo, item.accesos.map((acceso) => acceso.insert)]), [
    ["LATERAL", ["LATERAL.largo", "LATERAL.ancho", "LATERAL.cant"]],
    ["PUERTAS", ["PUERTAS.largo", "PUERTAS.ancho", "PUERTAS.cant"]]
  ]);
  assert.deepEqual(help.constantes.map((item) => item.insert), ["ESP"]);
  assert.deepEqual(help.funciones.map((item) => item.nombre), FORMULA_FUNCTIONS, "ni una de más ni una de menos");
  assert.ok(help.funciones.every((item) => item.descripcion && item.ejemplo), "cada función con su explicación y un ejemplo");
});

test("ayuda de fórmulas: cada ejemplo, de cada campo y de cada función, es una fórmula válida", () => {
  for (const kind of ["pieza-largo", "pieza-ancho", "pieza-cantidad", "medida-calculada", "herraje-cantidad", "herraje-medida"] as const) {
    const help = formulaHelp(kind, []);
    assert.ok(help.ejemplos.length >= 3, kind);
    for (const example of help.ejemplos) assert.doesNotThrow(() => parseFormula(example.formula), `${kind}: ${example.formula}`);
    for (const fn of help.funciones) assert.doesNotThrow(() => parseFormula(fn.ejemplo), fn.ejemplo);
  }
});

test("ayuda de fórmulas: sin módulo, los nombres del catálogo con en cuántos módulos están", () => {
  const suggestions = catalogSuggestions({ medidas: [{ nombre: "ANCHO", detalle: "Ancho", modulos: 32 }], piezas: [{ nombre: "PUERTAS", detalle: "Puertas", modulos: 1 }] });
  const help = formulaHelp("herraje-cantidad", suggestions);
  assert.equal(help.medidas[0].detail, "Ancho · en 32 módulos");
  assert.equal(help.piezas[0].nombre, "Puertas · en 1 módulo");
  assert.equal(help.funciones.length, FORMULA_FUNCTIONS.length);
});

test("ayuda de fórmulas: tocar un nombre lo escribe donde está el cursor, separado si quedaría pegado", () => {
  assert.deepEqual(insertAt("ALTO - ", "ESP", null, null), { value: "ALTO - ESP", caret: 10 });
  assert.deepEqual(insertAt("ALTO", "ESP", 4, 4), { value: "ALTO ESP", caret: 8 });
  assert.deepEqual(insertAt("ALTO - 2", "ESP", 7, 8), { value: "ALTO - ESP", caret: 10 }, "reemplaza lo seleccionado");
  assert.deepEqual(insertAt("", "SI(", 0, 0), { value: "SI(", caret: 3 });
});
