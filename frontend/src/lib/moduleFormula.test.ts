import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateModule, parseFormula, roundMm, validateIdentifier, type ModuleDef } from "./moduleFormula.ts";

// Mismo archivo que importa el seed del catalogo: si alguien lo modifica, la paridad con el Excel se vuelve a verificar.
const catalog = JSON.parse(readFileSync(new URL("../../../backend/prisma/data/modulos-muebles.json", import.meta.url), "utf8"));

const piece = (codigo: string, formulaLargo: string, formulaAncho = "100", formulaCantidad = "1") => ({
  codigo,
  nombre: codigo,
  formulaLargo,
  formulaAncho,
  formulaCantidad
});

test("paridad con muebles.xlsx: las 305 piezas dan lo mismo que el Excel", () => {
  let checked = 0;
  for (const module of catalog.modulos) {
    const result = evaluateModule({ parametros: module.parametros, piezas: module.piezas }, {});
    assert.deepEqual(result.errores, [], `${module.codigo}: ${JSON.stringify(result.errores)}`);
    for (const expected of module.piezas) {
      const got = result.piezas.find((item) => item.codigo === expected.codigo);
      assert.ok(got, `${module.codigo}.${expected.codigo} no calculada`);
      assert.ok(Math.abs(got.largoExacto - expected.esperadoExcel.largo) < 1e-6, `${module.codigo}.${expected.codigo} largo`);
      assert.ok(Math.abs(got.anchoExacto - expected.esperadoExcel.ancho) < 1e-6, `${module.codigo}.${expected.codigo} ancho`);
      if (expected.esperadoExcel.cantidad != null) assert.equal(got.cantidad, expected.esperadoExcel.cantidad);
      checked++;
    }
  }
  assert.equal(checked, 305);
});

test("errores de sintaxis legibles", () => {
  assert.throws(() => parseFormula(""), /vacia/);
  assert.throws(() => parseFormula("ANCHO -"), /incompleta/);
  assert.throws(() => parseFormula("FOO(1)"), /Funcion desconocida FOO/);
  assert.throws(() => parseFormula("PISO.alto"), /largo, ancho o cant/);
  assert.throws(() => parseFormula("SI(1; 2)"), /SI recibe 3 valores/);
  assert.throws(() => parseFormula("(ANCHO"), /Se esperaba "\)"/);
  assert.throws(() => parseFormula("ANCHO 2"), /Sobra "2"/);
  assert.throws(() => parseFormula("ANCHO # 2"), /Caracter no valido "#"/);
  assert.throws(() => parseFormula("1+".repeat(300) + "1"), /500/);
  assert.throws(() => parseFormula("(".repeat(60) + "1" + ")".repeat(60)), /demasiados niveles/);
});

test("referencia circular y division por cero", () => {
  const result = evaluateModule(
    {
      parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 600 }],
      piezas: [piece("A", "B.largo"), piece("B", "A.largo"), piece("C", "ANCHO / 0")]
    },
    {}
  );
  assert.match(result.errores[0].mensaje, /circular/);
  assert.equal(result.errores.length, 3);
  assert.match(result.errores[2].mensaje, /cero/);
});

test("piezas condicionales con SI y cantidad 0", () => {
  const def: ModuleDef = {
    parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 1200 }],
    piezas: [piece("DIVISION", "700", "500", "SI(ANCHO > 1000; 1; 0)")]
  };
  assert.equal(evaluateModule(def, { ANCHO: 900 }).piezas.length, 0);
  assert.equal(evaluateModule(def, {}).piezas.length, 1);
});

test("SI evalua solo la rama elegida", () => {
  const result = evaluateModule(
    { parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 600 }], piezas: [piece("PISO", "SI(ANCHO > 0; ANCHO; 1 / 0)")] },
    {}
  );
  assert.deepEqual(result.errores, []);
  assert.equal(result.piezas[0].largo, 600);
});

test("dependientes de una pieza con error", () => {
  const result = evaluateModule(
    {
      parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 600 }],
      piezas: [piece("PISO", "ANCHO -"), piece("TRAVESANO", "PISO.largo - 36", "80", "2")]
    },
    {}
  );
  assert.match(result.errores[0].mensaje, /incompleta/);
  assert.equal(result.errores[1].mensaje, "Depende de PISO, que tiene un error");
});

test("cantidad no entera y medida invalida", () => {
  const result = evaluateModule(
    { parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 5 }], piezas: [piece("A", "100", "100", "ANCHO / 2"), piece("B", "ANCHO - 5")] },
    {}
  );
  assert.equal(result.errores[0].mensaje, "La cantidad debe ser un entero mayor o igual a 0 (dio 2.5)");
  assert.equal(result.errores[1].mensaje, "Medida invalida: 0 x 100 mm");
});

test("redondeo REDONDEAR y TRUNCAR solo sobre la medida final", () => {
  assert.equal(roundMm(412.5), 413);
  assert.equal(roundMm(412.5, "TRUNCAR"), 412);
  assert.equal(roundMm(412.49999999999), 413);
  assert.equal(roundMm(-0.2), 0);

  const def: ModuleDef = {
    parametros: [{ clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 825 }],
    piezas: [piece("PUERTA", "ANCHO / 2"), piece("DOBLE", "PUERTA.largo * 2")]
  };
  const rounded = evaluateModule(def, {});
  assert.equal(rounded.piezas[0].largo, 413);
  assert.equal(rounded.piezas[1].largo, 825); // usa 412.5 exacto, no 413
  assert.equal(evaluateModule(def, {}, { redondeo: "TRUNCAR" }).piezas[0].largo, 412);
});

test("validacion de medidas: rangos, enteros, opciones y faltantes", () => {
  const result = evaluateModule(
    {
      parametros: [
        { clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 600, minimo: 300, maximo: 2750 },
        { clave: "ESTANTES", tipo: "ENTERO", valorDefecto: 2 },
        { clave: "VARIANTE", tipo: "OPCION", valorDefecto: 1, opciones: [{ valor: 1, etiqueta: "Entero" }, { valor: 2, etiqueta: "Partido" }] },
        { clave: "LUZ", tipo: "MEDIDA" }
      ],
      piezas: []
    },
    { ancho: 200, ESTANTES: 1.5, VARIANTE: 3 }
  );
  assert.deepEqual(result.errores, [
    { ref: "ANCHO", mensaje: "Minimo 300" },
    { ref: "ESTANTES", mensaje: "Tiene que ser un numero entero" },
    { ref: "VARIANTE", mensaje: "Elegi una de las opciones" },
    { ref: "LUZ", mensaje: "Falta el valor" }
  ]);
});

test("medidas calculadas que dependen de piezas", () => {
  const result = evaluateModule(
    {
      parametros: [
        { clave: "ALTO", tipo: "MEDIDA", valorDefecto: 2000 },
        { clave: "LUZ_ABAJO", tipo: "MEDIDA", valorDefecto: 700 },
        { clave: "LUZ_ARRIBA", tipo: "CALCULADO", formula: "LATERAL.largo - LUZ_ABAJO - 54" }
      ],
      piezas: [piece("LATERAL", "ALTO"), piece("PUERTA", "LUZ_ARRIBA")]
    },
    {}
  );
  assert.deepEqual(result.errores, []);
  assert.equal(result.piezas[1].largo, 1246);
});

test("constante ESP y expresiones de herrajes", () => {
  const result = evaluateModule(
    { parametros: [{ clave: "ALTO", tipo: "MEDIDA", valorDefecto: 1000 }], piezas: [{ ...piece("PUERTAS", "ALTO - 2 * ESP", "400", "2") }] },
    {},
    { constantes: { ESP: 18 } }
  );
  assert.equal(result.piezas[0].largo, 964);
  assert.equal(result.evaluarExpresion("PUERTAS.cant * SI(PUERTAS.largo > 900; 3; 2)"), 6);
  assert.throws(() => result.evaluarExpresion("BISAGRA.cant"), /No existe la pieza BISAGRA/);
});

test("nombres de medidas y piezas", () => {
  assert.equal(validateIdentifier("LUZ_ABAJO"), null);
  assert.match(validateIdentifier("luz") ?? "", /mayusculas/);
  assert.match(validateIdentifier("SI") ?? "", /funcion/);
  assert.match(validateIdentifier("ESP") ?? "", /constante/);
});
