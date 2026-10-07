import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildModulePieces, evaluateModule, evaluateModuleDefinition, parseFormula, roundMm, validateIdentifier, type ModuleDef, type CatalogModuleDef, type CatalogPieceDef } from "./moduleFormula.ts";

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
  assert.throws(() => parseFormula(""), /vacía/);
  assert.throws(() => parseFormula("ANCHO -"), /incompleta/);
  assert.throws(() => parseFormula("FOO(1)"), /Función desconocida FOO/);
  assert.throws(() => parseFormula("PISO.alto"), /largo, ancho o cant/);
  assert.throws(() => parseFormula("SI(1; 2)"), /SI recibe 3 valores/);
  assert.throws(() => parseFormula("(ANCHO"), /Se esperaba "\)"/);
  assert.throws(() => parseFormula("ANCHO 2"), /Sobra "2"/);
  assert.throws(() => parseFormula("ANCHO # 2"), /Carácter no válido "#"/);
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
  assert.equal(result.errores[1].mensaje, "Medida inválida: 0 x 100 mm");
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
    { ref: "ANCHO", mensaje: "Mínimo 300" },
    { ref: "ESTANTES", mensaje: "Tiene que ser un número entero" },
    { ref: "VARIANTE", mensaje: "Elegí una de las opciones" },
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
  assert.match(validateIdentifier("luz") ?? "", /mayúsculas/);
  assert.match(validateIdentifier("SI") ?? "", /función/);
  assert.match(validateIdentifier("ESP") ?? "", /constante/);
});

test("evaluateModuleDefinition: ESP es el espesor de diseno y el redondeo es el que se pasa", () => {
  const definition = {
    parametros: [{ clave: "ALTO", tipo: "MEDIDA" as const, valorDefecto: 1000.5 }],
    piezas: [piece("PUERTA", "ALTO - 2 * ESP", "400.5")]
  };
  const redondeada = evaluateModuleDefinition({ ...definition, espesorDisenoMm: 18 }, {}, "REDONDEAR");
  assert.deepEqual([redondeada.piezas[0].largo, redondeada.piezas[0].ancho], [965, 401]);
  const truncada = evaluateModuleDefinition({ ...definition, espesorDisenoMm: 15 }, { ALTO: 1000.5 }, "TRUNCAR");
  assert.deepEqual([truncada.piezas[0].largo, truncada.piezas[0].ancho], [970, 400]);
  assert.equal(truncada.piezas[0].largoExacto, 970.5);
});

// ---------------------------------------------------------------- buildModulePieces (DECISIONES R6)

const catalogPiece = (codigo: string, orden: number, extra: Partial<CatalogPieceDef> = {}): CatalogPieceDef => ({
  codigo,
  nombre: codigo.toLowerCase(),
  formulaLargo: "ALTO",
  formulaAncho: "100",
  formulaCantidad: "1",
  rol: "ESQUELETO",
  permiteRotar: false,
  orden,
  cantos: [],
  ...extra
});
const sampleModule = (): CatalogModuleDef => ({
  parametros: [
    { clave: "ALTO", tipo: "MEDIDA", valorDefecto: 720 },
    { clave: "ESTANTES", tipo: "ENTERO", valorDefecto: 1 },
    { clave: "LUZ", tipo: "CALCULADO", formula: "ALTO - 2 * ESP" }
  ],
  perfiles: [{ orden: 1 }, { orden: 2 }],
  espesorDisenoMm: 18,
  piezas: [
    catalogPiece("ESTANTE", 3, { formulaLargo: "LUZ", formulaCantidad: "ESTANTES", permiteRotar: true }),
    catalogPiece("LATERAL", 1, {
      formulaCantidad: "2",
      cantos: [
        { perfilOrden: 1, lado: "LARGO_1", espesorMm: 2 },
        { perfilOrden: 2, lado: "LARGO_1", espesorMm: 0.45 },
        { perfilOrden: 2, lado: "ANCHO_1", espesorMm: 0.45 }
      ]
    }),
    catalogPiece("ZOCALO", 2, { rol: "FIJO", materialFijoId: "negro", formulaLargo: "ALTO / 8.1", formulaCantidad: "SI(ESTANTES > 1; 1; 0)" }),
    catalogPiece("FONDO", 4, { rol: "FONDO", materialFijoId: "ignorado", formulaLargo: "ALTO - 0.5" })
  ]
});

test("buildModulePieces: orden del modulo, orden 1..n sin las piezas de cantidad 0, roles y medidas enteras", () => {
  const result = buildModulePieces(sampleModule(), { alto: 720.5 }, { redondeo: "REDONDEAR", perfilOrden: 1 });
  assert.deepEqual(result.errores, []);
  assert.deepEqual(
    result.piezas.map((pieza) => [pieza.codigo, pieza.orden, pieza.largo, pieza.ancho, pieza.cantidad]),
    [
      ["LATERAL", 1, 721, 100, 2],
      ["ESTANTE", 2, 685, 100, 1],
      ["FONDO", 3, 720, 100, 1]
    ],
    "ZOCALO no se genera con 1 estante y no ocupa numero de orden"
  );
  assert.deepEqual(result.valores, { ALTO: 720.5, ESTANTES: 1 }, "valores efectivos: lo cargado y los defectos");
  assert.equal(result.piezas[2].materialFijoId, null, "solo FIJO lleva material fijo");
  assert.equal(result.piezas[1].permiteRotar, true);

  const conZocalo = buildModulePieces(sampleModule(), { ESTANTES: 2 }, { redondeo: "TRUNCAR", perfilOrden: 1 });
  assert.deepEqual(
    conZocalo.piezas.map((pieza) => [pieza.codigo, pieza.orden, pieza.largo]),
    [
      ["LATERAL", 1, 720],
      ["ZOCALO", 2, 88],
      ["ESTANTE", 3, 684],
      ["FONDO", 4, 719]
    ],
    "TRUNCAR: 720 / 8.1 = 88.9 -> 88 y 719.5 -> 719"
  );
  assert.equal(conZocalo.piezas[1].materialFijoId, "negro");
});

test("buildModulePieces: cantos del perfil elegido", () => {
  const perfil1 = buildModulePieces(sampleModule(), {}, { redondeo: "REDONDEAR", perfilOrden: 1 });
  assert.deepEqual(perfil1.piezas[0].cantos, { LARGO_1: 2, LARGO_2: null, ANCHO_1: null, ANCHO_2: null });
  const perfil2 = buildModulePieces(sampleModule(), {}, { redondeo: "REDONDEAR", perfilOrden: 2 });
  assert.deepEqual(perfil2.piezas[0].cantos, { LARGO_1: 0.45, LARGO_2: null, ANCHO_1: 0.45, ANCHO_2: null });
});

test("buildModulePieces: es estricto con las medidas y el perfil", () => {
  const result = buildModulePieces(sampleModule(), { ANCHOO: 600, luz: 10, ALTO: 700 }, { redondeo: "REDONDEAR", perfilOrden: 3 });
  assert.deepEqual(result.errores.slice(0, 3), [
    { ref: "ANCHOO", mensaje: "No existe la medida ANCHOO" },
    { ref: "LUZ", mensaje: "LUZ se calcula sola: no se carga" },
    { ref: "PERFIL", mensaje: "El módulo no tiene el perfil de canto 3" }
  ]);
  const fueraDeRango = buildModulePieces(
    { ...sampleModule(), parametros: [{ clave: "ALTO", tipo: "MEDIDA", valorDefecto: 720, minimo: 300, maximo: 2400 }, ...sampleModule().parametros.slice(1)] },
    { ALTO: 2500 },
    { redondeo: "REDONDEAR", perfilOrden: 1 }
  );
  assert.deepEqual(fueraDeRango.errores, [{ ref: "ALTO", mensaje: "Máximo 2400" }]);
});

test("buildModulePieces da las mismas medidas que el motor en las 305 piezas del catalogo", () => {
  let checked = 0;
  for (const module of catalog.modulos) {
    const definition: CatalogModuleDef = {
      parametros: module.parametros,
      perfiles: [{ orden: 1 }],
      espesorDisenoMm: module.espesorDisenoMm ?? 18,
      piezas: module.piezas.map((pieza: CatalogPieceDef) => ({ ...pieza, cantos: [] }))
    };
    for (const redondeo of ["REDONDEAR", "TRUNCAR"] as const) {
      const built = buildModulePieces(definition, {}, { redondeo, perfilOrden: 1 });
      const engine = evaluateModule({ parametros: module.parametros, piezas: module.piezas }, {}, { redondeo, constantes: { ESP: definition.espesorDisenoMm } });
      assert.deepEqual(built.errores, [], module.codigo);
      for (const pieza of built.piezas) {
        const expected = engine.piezas.find((item) => item.codigo === pieza.codigo)!;
        assert.deepEqual([pieza.largo, pieza.ancho, pieza.cantidad], [expected.largo, expected.ancho, expected.cantidad], `${module.codigo}.${pieza.codigo}`);
        assert.ok(Number.isInteger(pieza.largo) && Number.isInteger(pieza.ancho) && Number.isInteger(pieza.cantidad));
        checked++;
      }
    }
  }
  assert.ok(checked >= 600, `piezas comparadas: ${checked}`);
});
