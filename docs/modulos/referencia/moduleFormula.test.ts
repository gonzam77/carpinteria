// node --test --experimental-strip-types moduleFormula.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateModule, parseFormula } from "./moduleFormula.ts";

const data = JSON.parse(readFileSync(new URL("../modulos-muebles.json", import.meta.url), "utf8"));

test("paridad con muebles.xlsx: las 305 piezas dan lo mismo que el Excel", () => {
  let checked = 0;
  for (const m of data.modulos) {
    const r = evaluateModule({ parametros: m.parametros, piezas: m.piezas }, {});
    assert.deepEqual(r.errores, [], `${m.codigo}: ${JSON.stringify(r.errores)}`);
    for (const p of m.piezas) {
      const got = r.piezas.find((x) => x.codigo === p.codigo)!;
      assert.ok(got, `${m.codigo}.${p.codigo} no calculada`);
      assert.ok(Math.abs(got.largoExacto - p.esperadoExcel.largo) < 1e-6, `${m.codigo}.${p.codigo} largo`);
      assert.ok(Math.abs(got.anchoExacto - p.esperadoExcel.ancho) < 1e-6, `${m.codigo}.${p.codigo} ancho`);
      if (p.esperadoExcel.cantidad != null) assert.equal(got.cantidad, p.esperadoExcel.cantidad);
      checked++;
    }
  }
  assert.equal(checked, 305);
});

test("errores de sintaxis legibles", () => {
  assert.throws(() => parseFormula("ANCHO -"), /incompleta/);
  assert.throws(() => parseFormula("FOO(1)"), /Funcion desconocida/);
  assert.throws(() => parseFormula("PISO.alto"), /largo, ancho o cant/);
});

test("referencia circular y division por cero", () => {
  const r = evaluateModule({ parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 600 }], piezas: [
    { codigo: "A", nombre: "A", formulaLargo: "B.largo", formulaAncho: "100", formulaCantidad: "1" },
    { codigo: "B", nombre: "B", formulaLargo: "A.largo", formulaAncho: "100", formulaCantidad: "1" },
    { codigo: "C", nombre: "C", formulaLargo: "ANCHO / 0", formulaAncho: "100", formulaCantidad: "1" }] }, {});
  assert.match(r.errores[0].mensaje, /circular/);
  assert.equal(r.errores.length, 3);
  assert.match(r.errores[2].mensaje, /cero/);
});

test("piezas condicionales con SI y cantidad 0", () => {
  const r = evaluateModule({ parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 1200 }], piezas: [
    { codigo: "DIVISION", nombre: "Division", formulaLargo: "700", formulaAncho: "500", formulaCantidad: "SI(ANCHO > 1000; 1; 0)" }] }, { ANCHO: 900 });
  assert.equal(r.piezas.length, 0);
  assert.deepEqual(r.errores, []);
});

test("dependientes de una pieza con error y formula demasiado larga", () => {
  const r = evaluateModule({ parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 600 }], piezas: [
    { codigo: "PISO", nombre: "Piso", formulaLargo: "ANCHO -", formulaAncho: "500", formulaCantidad: "1" },
    { codigo: "TRAVESANO", nombre: "Travesano", formulaLargo: "PISO.largo - 36", formulaAncho: "80", formulaCantidad: "2" }] }, {});
  assert.match(r.errores[0].mensaje, /incompleta/);
  assert.equal(r.errores[1].mensaje, "Depende de PISO, que tiene un error");
  assert.throws(() => parseFormula("1+".repeat(300) + "1"), /500/);
});

test("constante ESP y expresiones de herrajes", () => {
  const r = evaluateModule({ parametros: [{ clave: "ALTO", tipo: "MEDIDA", valorDefecto: 1000 }], piezas: [
    { codigo: "PUERTAS", nombre: "Puertas", formulaLargo: "ALTO - 2 * ESP", formulaAncho: "400", formulaCantidad: "2" }] }, {}, { constantes: { ESP: 18 } });
  assert.equal(r.piezas[0].largo, 964);
  assert.equal(r.evaluarExpresion("PUERTAS.cant * SI(PUERTAS.largo > 900; 3; 2)"), 6);
});
