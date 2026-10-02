import assert from "node:assert/strict";
import test from "node:test";
import {
  codeFromName,
  copyProfileEdges,
  dependentsOf,
  draftToInput,
  edgeOf,
  fitWarnings,
  identifierProblem,
  matchSuggestions,
  formulaSuggestions,
  newModuleDraft,
  newPiece,
  parseOptionsText,
  removeProfileEdges,
  renameEverywhere,
  renameInFormula,
  withEdge,
  wordAtCaret,
  type ModuleDraft
} from "./moduleEditor.ts";

function sampleDraft(): ModuleDraft {
  const draft = newModuleDraft("cat-1");
  const piso = { ...newPiece([]), codigo: "PISO", nombre: "Piso", formulaLargo: "ANCHO - 36", formulaAncho: "PROFUNDIDAD" };
  const lateral = { ...newPiece([piso]), codigo: "LATERAL", nombre: "Lateral", formulaLargo: "ALTO", formulaAncho: "PISO.ancho", formulaCantidad: "SI(ANCHO > 1000; 3; 2)" };
  return { ...draft, piezas: [piso, lateral] };
}

test("draftToInput: orden de la pantalla, sin claves locales y solo los datos de cada tipo", () => {
  const draft = sampleDraft();
  draft.piezas = [draft.piezas[1], { ...draft.piezas[0], codigo: " piso ", rol: "FRENTE", materialFijoId: "mat-1" }];
  draft.piezas[0] = withEdge(withEdge(draft.piezas[0], 2, "LARGO_1", 1), 1, "ANCHO_2", 0.45);
  draft.parametros[0] = { ...draft.parametros[0], tipo: "CALCULADO", formula: " ALTO / 2 ", valorDefecto: 5, opciones: [{ valor: 1, etiqueta: "x" }] };
  draft.parametros[1] = { ...draft.parametros[1], tipo: "OPCION", opciones: null };

  const input = draftToInput(draft);
  assert.deepEqual(input.piezas.map((pieza) => [pieza.codigo, pieza.orden]), [["LATERAL", 1], ["PISO", 2]]);
  assert.equal(input.piezas[1].materialFijoId, null, "solo FIJO lleva material fijo");
  assert.ok(input.piezas.every((pieza) => !("uid" in pieza)) && input.parametros.every((param) => !("uid" in param)));
  assert.deepEqual(input.piezas[0].cantos, [{ perfilOrden: 1, lado: "ANCHO_2", espesorMm: 0.45 }], "el perfil 2 no existe: sus cantos no se mandan");
  assert.deepEqual([input.parametros[0].formula, input.parametros[0].valorDefecto, input.parametros[0].opciones], ["ALTO / 2", null, null]);
  assert.deepEqual(input.parametros[1].opciones, []);
  assert.deepEqual(input.parametros.map((param) => param.orden), [1, 2, 3]);
});

test("cantos por perfil: poner, quitar, copiar A a B y quitar un perfil", () => {
  let pieza = newPiece([]);
  pieza = withEdge(pieza, 1, "LARGO_1", 2);
  pieza = withEdge(pieza, 1, "LARGO_1", 1);
  pieza = withEdge(pieza, 1, "ANCHO_1", 0.45);
  assert.equal(edgeOf(pieza, 1, "LARGO_1"), 1);
  assert.equal(pieza.cantos.length, 2);
  pieza = withEdge(pieza, 1, "ANCHO_1", null);
  assert.equal(edgeOf(pieza, 1, "ANCHO_1"), null);

  const conB = withEdge(pieza, 2, "LARGO_2", 2);
  const [copiada] = copyProfileEdges([conB], 1, 2);
  assert.deepEqual(copiada.cantos.filter((canto) => canto.perfilOrden === 2), [{ perfilOrden: 2, lado: "LARGO_1", espesorMm: 1 }]);
  assert.equal(edgeOf(copiada, 1, "LARGO_1"), 1, "el perfil A no cambia");
  assert.deepEqual(removeProfileEdges([copiada], 2)[0].cantos, [{ perfilOrden: 1, lado: "LARGO_1", espesorMm: 1 }]);
});

test("referencias: quien usa una pieza o una medida, y renombrar sin tocar funciones ni accesores", () => {
  const draft = sampleDraft();
  assert.deepEqual(dependentsOf(draft, "PISO"), ["LATERAL"]);
  assert.deepEqual(dependentsOf(draft, "ancho"), ["PISO", "LATERAL"]);
  assert.deepEqual(dependentsOf(draft, "LATERAL"), []);

  assert.equal(renameInFormula("piso.ancho + PISO_2.largo + MIN(PISO.largo; 3)", "PISO", "BASE"), "BASE.ancho + PISO_2.largo + MIN(BASE.largo; 3)");
  assert.equal(renameInFormula("SI(ANCHO > 1000; 3; 2)", "SI", "X"), "SI(ANCHO > 1000; 3; 2)", "no renombra funciones");
  assert.equal(renameInFormula("LATERAL.ancho", "ANCHO", "LARGO_TOTAL"), "LATERAL.ancho", "no toca el accesor");

  const { draft: renamed, cambiadas } = renameEverywhere(draft, "ANCHO", "ANCHO_TOTAL");
  assert.equal(cambiadas, 2);
  assert.equal(renamed.piezas[0].formulaLargo, "ANCHO_TOTAL - 36");
  assert.equal(renamed.piezas[1].formulaCantidad, "SI(ANCHO_TOTAL > 1000; 3; 2)");
  assert.equal(renamed.piezas[1].formulaAncho, "PISO.ancho");
});

test("nombres de medidas y piezas", () => {
  assert.equal(identifierProblem("PISO", ["PISO", "LATERAL"]), null);
  assert.match(identifierProblem("PISO", ["PISO", "piso"]) ?? "", /Ya hay/);
  assert.match(identifierProblem("MIN", ["MIN"]) ?? "", /funcion/);
  assert.match(identifierProblem("", [""]) ?? "", /Completalo/);
});

test("autocompletado: palabra en el cursor y sugerencias", () => {
  assert.deepEqual(wordAtCaret("ANCHO - pi", 10), { start: 8, word: "pi" });
  assert.deepEqual(wordAtCaret("PISO.la", 7), { start: 0, word: "PISO.la" });
  assert.equal(wordAtCaret("ANCHO - 36", 10), null);
  assert.equal(wordAtCaret("12.5", 4), null);

  const all = formulaSuggestions(sampleDraft());
  assert.deepEqual(matchSuggestions(all, "pi").map((item) => item.insert), ["PISO.largo", "PISO.ancho", "PISO.cant"]);
  assert.deepEqual(matchSuggestions(all, "PISO.l").map((item) => item.insert), ["PISO.largo"]);
  assert.deepEqual(matchSuggestions(all, "s").map((item) => item.insert), ["SI("]);
  assert.deepEqual(matchSuggestions(all, "ANCHO").map((item) => item.insert), [], "no sugiere lo que ya esta escrito");
});

test("opciones de una medida, una por linea", () => {
  assert.deepEqual(parseOptionsText("1 = Fondo entero\n\n2: Fondo en dos partes"), {
    opciones: [
      { valor: 1, etiqueta: "Fondo entero" },
      { valor: 2, etiqueta: "Fondo en dos partes" }
    ],
    error: null
  });
  assert.match(parseOptionsText("1 = A\n1 = B").error ?? "", /repetido/);
  assert.match(parseOptionsText("Fondo entero").error ?? "", /Linea 1/);
  assert.match(parseOptionsText("").error ?? "", /al menos una/);
});

test("encaje: misma funcion que el optimizador, agrupando placas por tamano util", () => {
  const placa = (id: string, anchoPlaca: number | null, altoPlaca: number | null) => ({ id, nombre: id, anchoPlaca, altoPlaca });
  const settings = { espesorSierraMm: 4.3, perfiladoBordeMm: 10 };
  const placas = [placa("Blanco", 1830, 2750), placa("Negro", 1830, 2750), placa("Chica", 1830, 2600), placa("Sin medidas", null, null)];

  const warnings = fitWarnings(
    [
      { codigo: "ENTRA", nombre: "Entra", largo: 2730, ancho: 1810, permiteRotar: false, placas },
      { codigo: "ACOSTADA", nombre: "Acostada", largo: 1000, ancho: 2500, permiteRotar: false, placas },
      { codigo: "ROTA", nombre: "Rota", largo: 1000, ancho: 2500, permiteRotar: true, placas },
      { codigo: "LARGA", nombre: "Larga", largo: 2700, ancho: 600, permiteRotar: true, placas }
    ],
    settings
  );
  assert.deepEqual(
    warnings.map((warning) => warning.codigo),
    ["ENTRA", "ACOSTADA", "ACOSTADA", "LARGA"]
  );
  assert.match(warnings[0].mensaje, /no entra en Chica \(1810 × 2580 mm utiles\)\.$/);
  assert.match(warnings[1].mensaje, /no entra en Blanco, Negro \(1810 × 2730 mm utiles\)\. Girada entraria/);
  const muchas = fitWarnings(
    [{ codigo: "X", nombre: "X", largo: 3000, ancho: 100, permiteRotar: false, placas: ["A ", "B", "C", "D", "E"].map((nombre) => placa(nombre, 1830, 2750)) }],
    settings
  );
  assert.match(muchas[0].mensaje, /no entra en A, B, C y 2 placas mas \(/);
  assert.match(warnings[3].mensaje,/"Larga" \(2700 × 600 mm\) no entra en Chica/);
});

test("codigo sugerido a partir del nombre", () => {
  assert.equal(codeFromName("Bajo mesada 2 puertas"), "BAJO_MESADA_2_PUERTAS");
  assert.equal(codeFromName("  Alacena  basculante (vidrio) "), "ALACENA_BASCULANTE_VIDRIO");
  assert.equal(codeFromName("Cajonera ñandú"), "CAJONERA_NANDU");
  assert.equal(codeFromName("3 cajones"), "M_3_CAJONES");
  assert.equal(codeFromName(""), "");
});
