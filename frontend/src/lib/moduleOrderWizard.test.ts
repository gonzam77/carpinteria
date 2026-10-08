import assert from "node:assert/strict";
import test from "node:test";
import {
  activeEdges,
  clientSuggestionPatch,
  activePlates,
  addDays,
  applyColorsToAll,
  copyMeasuresToSameModel,
  defaultDeliveryDate,
  defaultEdgeId,
  describeAge,
  designPlates,
  edgeSummary,
  hasBackPieces,
  hasWizardContent,
  linePayload,
  materialSummary,
  changedSides,
  isValidDay,
  measureTextError,
  newAltaKey,
  newUnit,
  normalizeOverrides,
  numericValues,
  orderSignature,
  pieceBoardId,
  profileEdges,
  reconcileUnits,
  restoreWizardDraft,
  sanitizeUnit,
  syncUnits,
  todayInArgentina,
  validateClient,
  validateUnit,
  withAvailableColors,
  withEdgeChoice,
  withHardwareChoice,
  withoutEdgeOverride,
  type WizardUnit
} from "./moduleOrderWizard.ts";
import type { Material, ModuleDefinition, ModuleOrderDetail, ModuleOrderPreview } from "../types/index.ts";

const material = (id: string, nombre: string, extra: Partial<Material> = {}): Material => ({
  id,
  nombre,
  tipo: "PLACA",
  valor: 1000,
  espesorMm: 18,
  anchoPlaca: 1830,
  altoPlaca: 2600,
  colorCanto: null,
  placaMaterialId: null,
  stockPlacas: 10,
  activo: true,
  ...extra
});
const canto = (id: string, color: string, espesorMm: number, extra: Partial<Material> = {}) =>
  material(id, `Canto ${color} ${espesorMm}`, { tipo: "CANTO", espesorMm, placaMaterialId: color, anchoPlaca: null, altoPlaca: null, ...extra });
const MATERIALS: Material[] = [
  material("negro", "Negro"),
  material("blanco", " Blanco "),
  material("fino", "Blanco 5,5", { espesorMm: 5.5 }),
  material("fibro", "Fibro", { espesorMm: 3 }),
  material("viejo", "Roble", { activo: false }),
  canto("c-blanco-045", "blanco", 0.45),
  canto("c-blanco-2", "blanco", 2),
  canto("c-negro-045", "negro", 0.45),
  canto("c-negro-2-inactivo", "negro", 2, { activo: false })
];

function definition(extra: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    id: "bajo",
    codigo: "BAJO",
    nombre: "Bajo mesada",
    categoriaId: "cat",
    categoria: { id: "cat", nombre: "Bajo mesada" },
    descripcion: null,
    activo: true,
    espesorDisenoMm: 18,
    materialFondoId: null,
    observaciones: null,
    version: 2,
    fechaActualizacion: "2026-10-05T00:00:00.000Z",
    imagen: null,
    tienePedidos: false,
    herrajes: [],
    parametros: [
      { clave: "ANCHO", etiqueta: "Ancho", tipo: "MEDIDA", valorDefecto: 800, minimo: 300, maximo: 2400, opciones: null, formula: null, ayuda: null, orden: 1 },
      { clave: "ALTO", etiqueta: "Alto", tipo: "MEDIDA", valorDefecto: 720, minimo: null, maximo: null, opciones: null, formula: null, ayuda: null, orden: 2 },
      { clave: "LUZ", etiqueta: "Luz", tipo: "CALCULADO", valorDefecto: null, minimo: null, maximo: null, opciones: null, formula: "ALTO - 36", ayuda: null, orden: 3 }
    ],
    perfiles: [
      { orden: 1, nombre: "Estandar", descripcion: null, predeterminado: true },
      { orden: 2, nombre: "Economico", descripcion: null, predeterminado: false }
    ],
    piezas: [
      {
        codigo: "LATERAL",
        nombre: "Lateral",
        rol: "ESQUELETO",
        materialFijoId: null,
        formulaLargo: "ALTO",
        formulaAncho: "560",
        formulaCantidad: "2",
        permiteRotar: false,
        orden: 1,
        observaciones: null,
        cantos: [
          { perfilOrden: 1, lado: "LARGO_1", espesorMm: 0.45 },
          { perfilOrden: 2, lado: "LARGO_1", espesorMm: 0.45 }
        ]
      },
      {
        codigo: "PUERTA",
        nombre: "Puerta",
        rol: "FRENTE",
        materialFijoId: null,
        formulaLargo: "LUZ",
        formulaAncho: "ANCHO / 2",
        formulaCantidad: "2",
        permiteRotar: false,
        orden: 2,
        observaciones: null,
        cantos: [
          { perfilOrden: 1, lado: "LARGO_1", espesorMm: 2 },
          { perfilOrden: 1, lado: "ANCHO_1", espesorMm: 2 }
        ]
      },
      { codigo: "FONDO", nombre: "Fondo", rol: "FONDO", materialFijoId: null, formulaLargo: "ALTO", formulaAncho: "ANCHO", formulaCantidad: "1", permiteRotar: false, orden: 3, observaciones: null, cantos: [] }
    ],
    ...extra
  };
}
const DEFAULTS = { colorEsqueletoId: "blanco", colorFrentesId: "negro" };
/** Cantos activos y fondo de la configuracion, como los usa la pagina para el canto por defecto. */
const EDGES = { cantos: activeEdges(MATERIALS), configFondoId: "fibro" };

test("fecha de entrega por defecto: hoy en Argentina mas los dias de la configuracion", () => {
  // 01:30 UTC del 6 son las 22:30 del 5 en Buenos Aires.
  const now = new Date("2026-10-06T01:30:00Z");
  assert.equal(todayInArgentina(now), "2026-10-05");
  assert.equal(defaultDeliveryDate(15, now), "2026-10-20");
  assert.equal(addDays("2026-12-25", 10), "2027-01-04");
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(defaultDeliveryDate(-3, now), "2026-10-05", "nunca antes de hoy");
});

test("colores: esqueleto y frentes del espesor de diseno, ordenados; fondo de cualquier placa activa; cantos activos", () => {
  assert.deepEqual(designPlates(MATERIALS, 18).map((item) => item.id), ["blanco", "negro"]);
  assert.deepEqual(activePlates(MATERIALS).map((item) => item.id), ["blanco", "fino", "fibro", "negro"]);
  assert.deepEqual(activeEdges(MATERIALS).map((item) => item.id), ["c-blanco-045", "c-blanco-2", "c-negro-045"], "el canto inactivo no se ofrece");
  assert.equal(hasBackPieces(definition()), true);
  assert.equal(hasBackPieces(definition({ piezas: definition().piezas.filter((pieza) => pieza.rol !== "FONDO") })), false);
});

test("tarjeta nueva: medidas por defecto, perfil predeterminado y solo los colores que sirven", () => {
  const unit = newUnit(definition(), DEFAULTS, MATERIALS);
  assert.deepEqual(unit.valores, { ANCHO: "800", ALTO: "720" }, "sin la medida calculada");
  assert.equal(unit.perfilCantoOrden, 1);
  assert.deepEqual([unit.colorEsqueletoId, unit.colorFrentesId], ["blanco", "negro"]);
  assert.equal(unit.materialFondoId, null);

  const economico = definition({ perfiles: definition().perfiles.map((perfil) => ({ ...perfil, predeterminado: perfil.orden === 2 })) });
  assert.equal(newUnit(economico, DEFAULTS, MATERIALS).perfilCantoOrden, 2, "el predeterminado del modulo");
  const fino = newUnit(definition(), { ...DEFAULTS, colorEsqueletoId: "fino", colorFrentesId: "viejo" }, MATERIALS);
  assert.deepEqual([fino.colorEsqueletoId, fino.colorFrentesId], ["", ""], "un color de otro espesor o inactivo no se pone");
});

test("tarjetas por cantidad: conserva lo cargado, agrega y saca desde el final, en el orden elegido", () => {
  const defs = new Map([
    ["bajo", definition()],
    ["alto", definition({ id: "alto", nombre: "Alacena" })]
  ]);
  let units = syncUnits([], [{ moduloId: "bajo", cantidad: 2 }], defs, DEFAULTS, MATERIALS);
  units = units.map((unit, index) => (index === 0 ? { ...unit, observaciones: "la primera" } : unit));
  const second = syncUnits(units, [{ moduloId: "alto", cantidad: 1 }, { moduloId: "bajo", cantidad: 3 }], defs, DEFAULTS, MATERIALS);
  assert.deepEqual(second.map((unit) => unit.moduloId), ["alto", "bajo", "bajo", "bajo"]);
  assert.equal(second[1].uid, units[0].uid);
  assert.equal(second[1].observaciones, "la primera");
  const third = syncUnits(second, [{ moduloId: "alto", cantidad: 1 }, { moduloId: "bajo", cantidad: 1 }], defs, DEFAULTS, MATERIALS);
  assert.deepEqual(third.map((unit) => unit.uid), [second[0].uid, units[0].uid], "saca las de mas desde el final");
  assert.deepEqual(syncUnits(third, [{ moduloId: "bajo", cantidad: 0 }], defs, DEFAULTS, MATERIALS), []);
});

test("borrador viejo contra el catalogo de hoy: descarta lo que ya no existe y completa lo nuevo", () => {
  const unit: WizardUnit = {
    ...newUnit(definition(), DEFAULTS, MATERIALS),
    valores: { ANCHO: "900", PROFUNDIDAD: "580" },
    perfilCantoOrden: 2,
    cantosOverride: { PUERTA: { LARGO_1: "c-blanco-2" }, ZOCALO: { LARGO_1: "c-blanco-2" } }
  };
  const today = definition({ perfiles: [{ orden: 1, nombre: "Estandar", descripcion: null, predeterminado: true }] });
  const clean = sanitizeUnit(unit, today);
  assert.deepEqual(clean.valores, { ANCHO: "900", ALTO: "720" });
  assert.deepEqual(Object.keys(clean.cantosOverride), ["PUERTA"]);
  assert.equal(clean.perfilCantoOrden, 1);
});

test("copiar medidas a los iguales y aplicar colores a todos", () => {
  const defs = new Map([
    ["bajo", definition()],
    ["fino", definition({ id: "fino", espesorDisenoMm: 5.5 })]
  ]);
  const units = syncUnits([], [{ moduloId: "bajo", cantidad: 3 }, { moduloId: "fino", cantidad: 1 }], defs, DEFAULTS, MATERIALS);
  units[0] = { ...units[0], valores: { ANCHO: "1000", ALTO: "700" } };
  const copied = copyMeasuresToSameModel(units, units[0].uid);
  assert.deepEqual(copied.slice(0, 3).map((unit) => unit.valores.ANCHO), ["1000", "1000", "1000"]);
  assert.equal(copied[3].valores.ANCHO, "800", "otro modelo no cambia");

  const applied = applyColorsToAll(copied, { colorEsqueletoId: "negro", colorFrentesId: "blanco" }, defs, MATERIALS);
  assert.deepEqual([applied[0].colorEsqueletoId, applied[0].colorFrentesId], ["negro", "blanco"]);
  assert.equal(applied[3].colorEsqueletoId, "", "un modulo de 5,5 mm no recibe un color de 18 mm");
});

test("validacion en vivo con el armador compartido: medidas, piezas y colores", () => {
  const ok = validateUnit(newUnit(definition(), DEFAULTS, MATERIALS), definition(), "REDONDEAR");
  assert.equal(ok.ok, true);

  const vacia = validateUnit({ ...newUnit(definition(), DEFAULTS, MATERIALS), valores: { ANCHO: "", ALTO: "720" } }, definition(), "REDONDEAR");
  assert.deepEqual(vacia.porMedida.ANCHO, ["Falta el valor"]);
  assert.deepEqual(vacia.generales, [], "las piezas que usan ANCHO no repiten el problema");
  assert.equal(vacia.ok, false);

  const fuera = validateUnit({ ...newUnit(definition(), DEFAULTS, MATERIALS), valores: { ANCHO: "2500", ALTO: "720" } }, definition(), "REDONDEAR");
  assert.deepEqual(fuera.porMedida.ANCHO, ["Máximo 2400"]);

  const coma = validateUnit({ ...newUnit(definition(), DEFAULTS, MATERIALS), valores: { ANCHO: "800,5", ALTO: "720" } }, definition(), "REDONDEAR");
  assert.equal(coma.ok, true, "acepta la coma decimal");

  const sinColor = validateUnit({ ...newUnit(definition(), DEFAULTS, MATERIALS), colorFrentesId: "" }, definition(), "REDONDEAR");
  assert.deepEqual(sinColor.faltantes, ["el color de frentes"]);
  assert.equal(sinColor.ok, false);

  const roto = definition({ piezas: definition().piezas.map((pieza) => (pieza.codigo === "PUERTA" ? { ...pieza, formulaAncho: "ANCHO / 0" } : pieza)) });
  const errorPieza = validateUnit(newUnit(roto, DEFAULTS, MATERIALS), roto, "REDONDEAR");
  assert.deepEqual(errorPieza.generales, ["PUERTA: División por cero"]);
});

test("pedido para la API: solo los campos de la spec, medidas numericas y lo opcional solo si se eligio", () => {
  const unit: WizardUnit = {
    ...newUnit(definition(), DEFAULTS, MATERIALS),
    valores: { ANCHO: "900,5", ALTO: "", VIEJA: "3" },
    observaciones: "  contra la pared ",
    cantosOverride: { puerta: { LARGO_1: "c-blanco-045", ANCHO_1: null }, ZOCALO: { LARGO_1: "c-blanco-2" } }
  };
  assert.deepEqual(linePayload(unit, definition()), {
    moduloId: "bajo",
    valores: { ANCHO: 900.5 },
    colorEsqueletoId: "blanco",
    colorFrentesId: "negro",
    perfilCantoOrden: 1,
    observaciones: "contra la pared",
    cantosOverride: { PUERTA: { LARGO_1: "c-blanco-045", ANCHO_1: null } }
  });
  const conFondo = linePayload({ ...unit, materialFondoId: "fino", observaciones: "", cantosOverride: {} }, definition(), 2);
  assert.equal(conFondo.materialFondoId, "fino");
  assert.equal(conFondo.version, 2);
  assert.ok(!("observaciones" in conFondo) && !("cantosOverride" in conFondo));
});

const row = (extra: Partial<ModuleOrderDetail>): ModuleOrderDetail => ({
  codigoBarra: "M----01-01",
  material: "Blanco",
  materialId: "blanco",
  largo: 720,
  ancho: 560,
  cantidad: 2,
  cantoLargo1: false,
  cantoLargo2: false,
  cantoAncho1: false,
  cantoAncho2: false,
  permiteRotar: false,
  indice: 0,
  piezaCodigo: "LATERAL",
  origen: "CALCULADO",
  orden: 1,
  posicionModulo: 1,
  ...extra
});

test("paso 4: canto por defecto de la placa de cada pieza y cambios a mano lado por lado (DECISIONES 45)", () => {
  const def = definition();
  let unit = newUnit(def, DEFAULTS, MATERIALS);
  assert.deepEqual(profileEdges(def, 1, "puerta"), { LARGO_1: 2, LARGO_2: null, ANCHO_1: 2, ANCHO_2: null });
  assert.deepEqual(profileEdges(def, 2, "PUERTA"), { LARGO_1: null, LARGO_2: null, ANCHO_1: null, ANCHO_2: null });
  assert.deepEqual(profileEdges(def, 1, "NO_EXISTE"), { LARGO_1: null, LARGO_2: null, ANCHO_1: null, ANCHO_2: null });

  // La placa de cada pieza: esqueleto, frentes y fondo (el elegido, el del modulo o el de la configuracion).
  assert.deepEqual(["LATERAL", "PUERTA", "FONDO"].map((codigo) => pieceBoardId(unit, def, codigo, "fibro")), ["blanco", "negro", "fibro"]);
  assert.equal(pieceBoardId({ ...unit, materialFondoId: "fino" }, def, "fondo", "fibro"), "fino");
  // Por defecto, el canto de esa placa con el espesor del perfil. El negro no tiene uno de 2 mm activo: sin canto.
  assert.equal(defaultEdgeId(unit, def, "lateral", "LARGO_1", EDGES), "c-blanco-045");
  assert.equal(defaultEdgeId(unit, def, "LATERAL", "LARGO_2", EDGES), null, "el perfil no pide canto ahi");
  assert.equal(defaultEdgeId(unit, def, "PUERTA", "LARGO_1", EDGES), null);
  assert.equal(defaultEdgeId({ ...unit, colorFrentesId: "blanco" }, def, "PUERTA", "LARGO_1", EDGES), "c-blanco-2");

  // Elegir el que ya lleva no cambia nada: la misma tarjeta (la pagina no recalcula).
  assert.equal(withEdgeChoice(unit, def, "lateral", "LARGO_1", "c-blanco-045", EDGES), unit);
  unit = withEdgeChoice(unit, def, "lateral", "LARGO_2", "c-negro-045", EDGES);
  assert.deepEqual(unit.cantosOverride, { LATERAL: { LARGO_2: "c-negro-045" } }, "solo el lado tocado, con cualquier canto activo");
  assert.deepEqual(changedSides(unit, "lateral"), ["LARGO_2"]);
  unit = withEdgeChoice(unit, def, "LATERAL", "LARGO_1", null, EDGES);
  assert.deepEqual(unit.cantosOverride.LATERAL, { LARGO_2: "c-negro-045", LARGO_1: null }, "sin canto tambien es una eleccion");
  // Volver al de por defecto saca el cambio: el servidor la guardaria como CALCULADO.
  unit = withEdgeChoice(withEdgeChoice(unit, def, "LATERAL", "LARGO_1", "c-blanco-045", EDGES), def, "LATERAL", "LARGO_2", null, EDGES);
  assert.deepEqual(unit.cantosOverride, {});
  assert.deepEqual(changedSides(unit, "LATERAL"), []);

  // Un lado sin canto de su color se puede completar con cualquiera.
  unit = withEdgeChoice(unit, def, "PUERTA", "LARGO_1", "c-negro-045", EDGES);
  assert.deepEqual(unit.cantosOverride, { PUERTA: { LARGO_1: "c-negro-045" } });
  assert.equal(withoutEdgeOverride(unit, "puerta").cantosOverride.PUERTA, undefined);
  assert.equal(withoutEdgeOverride(unit, "LATERAL"), unit, "sin cambio en esa pieza, la misma tarjeta");

  // Limpieza: piezas que no existen, lados mal guardados (espesores de un borrador viejo) y, con los cantos, los iguales
  // al de por defecto.
  const sucia: WizardUnit = {
    ...unit,
    cantosOverride: { puerta: { LARGO_1: 2, ANCHO_1: null } as never, ZOCALO: { LARGO_1: "c-blanco-2" }, LATERAL: { LARGO_1: "c-blanco-045", LARGO_2: "c-blanco-2" } }
  };
  assert.deepEqual(normalizeOverrides(sucia, def).cantosOverride, { LATERAL: { LARGO_1: "c-blanco-045", LARGO_2: "c-blanco-2" } }, "la pieza del formato viejo se va entera");
  // La puerta negra no tiene canto de 2 mm: "sin canto" en ANCHO_1 es el de por defecto y tambien se va.
  assert.deepEqual(normalizeOverrides(sucia, def, EDGES).cantosOverride, { LATERAL: { LARGO_2: "c-blanco-2" } });
  assert.equal(normalizeOverrides(unit, def, EDGES), unit, "si no hay nada para sacar, la misma tarjeta");
});

test("medidas mal escritas: se dice que tienen y no se leen mal", () => {
  assert.equal(measureTextError(""), null, "el vacio lo informa el motor");
  assert.equal(measureTextError(" 800 "), null);
  assert.equal(measureTextError("800,5"), null);
  assert.equal(measureTextError("800.5"), null);
  assert.equal(measureTextError("1.200"), "Escribí la medida sin punto de miles (por ejemplo 1200)");
  assert.equal(measureTextError("12.000"), "Escribí la medida sin punto de miles (por ejemplo 12000)");
  for (const text of ["720mm", "72O", "0x10", "1e3", "- 5", "Infinity", "800,", ",5"]) assert.equal(measureTextError(text), "Escribí solo el número, en mm", text);
  assert.equal(measureTextError("-5"), null, "el signo lo deciden el minimo y el maximo");
  assert.equal(measureTextError("0.333"), null, "un cero adelante no es punto de miles");
  assert.equal(measureTextError("-1.200"), "Escribí la medida sin punto de miles (por ejemplo -1200)");
  assert.deepEqual(numericValues({ valores: { A: "800,5", B: "1.200", C: "0x10", D: "" } }), { A: 800.5, B: Number.NaN, C: Number.NaN, D: Number.NaN });

  const unit = { ...newUnit(definition(), DEFAULTS, MATERIALS), valores: { ANCHO: "1.200", ALTO: "720mm" } };
  const validation = validateUnit(unit, definition(), "REDONDEAR");
  assert.deepEqual(validation.porMedida, { ANCHO: ["Escribí la medida sin punto de miles (por ejemplo 1200)"], ALTO: ["Escribí solo el número, en mm"] });
  assert.equal(validation.ok, false);
});

test("los cantos no frenan el paso 3: un lado sin canto de su color va sin canto (DECISIONES 45)", () => {
  const unit = newUnit(definition(), DEFAULTS, MATERIALS);
  // Frentes negros: no hay canto negro de 2 mm activo. No es un error.
  const negro = validateUnit(unit, definition(), "REDONDEAR", { activePlateIds: new Set(activePlates(MATERIALS).map((item) => item.id)), configFondoId: "fibro" });
  assert.equal(negro.ok, true);
  // Un cambio de canto de una pieza que no existe no se manda (el servidor responderia 400).
  const fantasma: WizardUnit = { ...unit, cantosOverride: { ZOCALO: { LARGO_1: "c-blanco-2" } } };
  assert.ok(!("cantosOverride" in linePayload(fantasma, definition())));
});

test("catalogo que cambio con el asistente abierto: modulos que ya no estan, tarjetas y colores", () => {
  const before = new Map([
    ["bajo", definition()],
    ["alto", definition({ id: "alto", nombre: "Alacena" })],
    ["borrado", definition({ id: "borrado", nombre: "Especiero" })]
  ]);
  const units = syncUnits([], [{ moduloId: "bajo", cantidad: 1 }, { moduloId: "alto", cantidad: 1 }, { moduloId: "borrado", cantidad: 1 }], before, DEFAULTS, MATERIALS);
  const sinAlto = definition({ id: "alto", nombre: "Alacena", version: 3, parametros: definition().parametros.filter((param) => param.clave !== "ALTO").concat([{ clave: "PROF", etiqueta: "Profundidad", tipo: "MEDIDA", valorDefecto: 300, minimo: null, maximo: null, opciones: null, formula: null, ayuda: null, orden: 4 }]) });
  const fresh = new Map<string, ModuleDefinition | null>([
    ["bajo", definition()],
    ["alto", sinAlto],
    ["borrado", null]
  ]);
  const result = reconcileUnits(units, fresh, before);
  assert.deepEqual(result.units.map((unit) => unit.moduloId), ["bajo", "alto"]);
  assert.deepEqual(result.units[1].valores, { ANCHO: "800", PROF: "300" }, "saca la medida que ya no esta y agrega la nueva");
  assert.deepEqual(result.quitados, ["Especiero"]);
  assert.deepEqual(result.cambiados, ["Alacena"]);
  assert.deepEqual(reconcileUnits(units.slice(0, 1), fresh, before), { units: units.slice(0, 1), quitados: [], cambiados: [] }, "sin cambios, igual");
  const inactivo = reconcileUnits(units.slice(0, 1), new Map([["bajo", definition({ activo: false })]]), before);
  assert.deepEqual(inactivo.quitados, ["Bajo mesada"]);

  const colores = withAvailableColors(
    { ...units[0], colorFrentesId: "viejo", materialFondoId: "fino", cantosOverride: { PUERTA: { LARGO_1: "c-negro-2-inactivo", ANCHO_1: null } } },
    definition(),
    MATERIALS
  );
  assert.equal(colores.changed, true);
  assert.equal(colores.unit.colorFrentesId, "");
  assert.equal(colores.unit.materialFondoId, "fino");
  assert.deepEqual(colores.unit.cantosOverride, { PUERTA: { ANCHO_1: null } }, "un canto elegido que se desactivo vuelve al de por defecto");
  const igual = withAvailableColors(units[0], definition(), MATERIALS);
  assert.equal(igual.unit, units[0]);

  // Sin piezas de fondo, el fondo elegido se saca (el selector no se ve).
  const sinFondo = definition({ piezas: definition().piezas.filter((pieza) => pieza.rol !== "FONDO") });
  assert.equal(sanitizeUnit({ ...units[0], materialFondoId: "fino" }, sinFondo).materialFondoId, null);
});

test("clave de alta: un UUID v4 nuevo cada vez, tambien sin crypto.randomUUID", () => {
  const formato = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const a = newAltaKey();
  const b = newAltaKey();
  assert.match(a, formato);
  assert.notEqual(a, b);
  // En un contexto no seguro (http que no es localhost) el navegador no tiene randomUUID.
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  try {
    const manual = newAltaKey();
    assert.match(manual, formato);
    assert.notEqual(manual, newAltaKey());
  } finally {
    Object.defineProperty(crypto, "randomUUID", { value: original, configurable: true });
  }
});

test("resumen del panel: solo datos de la vista previa (placas, m² y metros de canto)", () => {
  const preview = {
    estimacionDetalle: {
      version: 1 as const,
      porMaterial: [{ materialId: "blanco", nombre: " Blanco ", placas: 3, piezas: 12, mm2: 4_512_345, valorCentavos: 100 }],
      porCanto: [{ cantoId: "c-blanco-045", mm: 12_340, espesorMm: 0.45, valorCentavos: 10 }]
    },
    detalles: [row({ cantoLargo1Id: "c-blanco-045", cantoLargo1Nombre: " Canto Blanco 0,45mm " })]
  } as unknown as ModuleOrderPreview;
  assert.deepEqual(materialSummary(preview), [{ materialId: "blanco", nombre: "Blanco", placas: 3, piezas: 12, m2: 4.512345 }]);
  assert.deepEqual(edgeSummary(preview), [{ cantoId: "c-blanco-045", nombre: "Canto Blanco 0,45mm", espesorMm: 0.45, metros: 12.34 }]);
});

test("borrador: que cuenta como contenido, antiguedad y validacion del cliente", () => {
  const empty = { cliente: "", numeroContacto: "", emailContacto: "", direccionEntrega: "", observaciones: "", selecciones: [] };
  assert.equal(hasWizardContent(empty), false, "la fecha y los colores por defecto no cuentan");
  assert.equal(hasWizardContent({ ...empty, cliente: " Ana " }), true);
  assert.equal(hasWizardContent({ ...empty, selecciones: [{ moduloId: "bajo", cantidad: 1 }] }), true);
  assert.equal(hasWizardContent(null), false);
  const now = Date.parse("2026-10-05T12:00:00Z");
  assert.equal(describeAge(now - 30_000, now), "recién");
  assert.equal(describeAge(now - 5 * 60_000, now), "hace 5 min");
  assert.equal(describeAge(now - 3 * 3_600_000, now), "hace 3 h");
  assert.equal(describeAge(now - 50 * 3_600_000, now), "hace 2 días");
  assert.deepEqual(validateClient({ cliente: "Ana", numeroContacto: "1234567", emailContacto: "", fechaEntrega: "2026-10-05" }, "2026-10-05"), []);
  assert.deepEqual(validateClient({ cliente: "A", numeroContacto: "123", emailContacto: "x@", fechaEntrega: "2026-10-04" }, "2026-10-05"), [
    "Completá el cliente (al menos 2 caracteres).",
    "Completá el teléfono (al menos 6 caracteres).",
    "El email no es válido.",
    "La fecha de entrega no puede ser anterior a hoy."
  ]);
});

test("borrador recuperado contra el catalogo de hoy: modulos, colores, fecha y paso", () => {
  const defs = new Map([
    ["bajo", definition()],
    ["inactivo", definition({ id: "inactivo", activo: false })]
  ]);
  // Un borrador de antes de DECISIONES 45 guardaba espesores: esos lados vuelven al de por defecto, con un aviso.
  const unit = {
    ...newUnit(definition(), DEFAULTS, MATERIALS),
    colorFrentesId: "viejo",
    materialFondoId: "fino",
    valores: { ANCHO: "900", BORRADA: "1" },
    cantosOverride: { PUERTA: { LARGO_1: 2, LARGO_2: null, ANCHO_1: null, ANCHO_2: null } } as never
  };
  const { draft, avisos } = restoreWizardDraft(
    {
      cliente: "Ana",
      fechaEntrega: "2026-09-01",
      selecciones: [
        { moduloId: "bajo", cantidad: 1 },
        { moduloId: "inactivo", cantidad: 2 },
        { moduloId: "no-existe", cantidad: 1 }
      ],
      units: [unit, newUnit(definition({ id: "inactivo" }), DEFAULTS, MATERIALS)],
      defaults: { colorEsqueletoId: "blanco", colorFrentesId: "viejo" },
      step: 3
    },
    { definitions: defs, materials: MATERIALS, today: "2026-10-05", defaultFecha: "2026-10-20" }
  );
  assert.deepEqual(draft.selecciones, [{ moduloId: "bajo", cantidad: 1 }]);
  assert.equal(draft.units.length, 1);
  assert.deepEqual(draft.units[0].valores, { ANCHO: "900", ALTO: "720" });
  assert.equal(draft.units[0].colorFrentesId, "", "el color inactivo se limpia");
  assert.equal(draft.units[0].materialFondoId, "fino", "un fondo activo se conserva");
  assert.equal(draft.fechaEntrega, "2026-10-20");
  assert.equal(draft.step, 2, "nunca directo al paso 4");
  assert.equal(draft.defaults.colorFrentesId, "");
  assert.equal(draft.numeroContacto, "", "un campo que faltaba queda vacio");
  assert.deepEqual(draft.units[0].cantosOverride, {}, "la pieza del formato viejo se descarta entera");
  assert.equal(avisos.length, 4);
  assert.ok(avisos.includes("Algunos cantos cambiados a mano no se pudieron recuperar: revisalos en el paso 4."));
});

test("paso 1: las mismas reglas que el alta (email como zod, fecha que existe, largos maximos)", () => {
  const base = { cliente: "Ana", numeroContacto: "1234567", emailContacto: "", fechaEntrega: "2026-10-05" };
  for (const email of ["ana@gmail.com.", "ana@gmail.com,", "ana..perez@gmail.com", "ana@gmail.c", "josé@gmail.com", "ana@gmail..com", ".ana@gmail.com", "ana@ñandu.com.ar"]) {
    assert.deepEqual(validateClient({ ...base, emailContacto: email }, "2026-10-05"), ["El email no es válido."], email);
  }
  for (const email of ["ana@gmail.com", " ana.perez+roma@empresa.com.ar ", "a_b-c@sub.dominio.ar"]) {
    assert.deepEqual(validateClient({ ...base, emailContacto: email }, "2026-10-05"), [], email);
  }
  assert.deepEqual(validateClient({ ...base, fechaEntrega: "2026-02-30" }, "2026-01-01"), ["Elegí la fecha de entrega."]);
  assert.equal(isValidDay("2028-02-29"), true);
  assert.equal(isValidDay("2027-02-29"), false);
  assert.equal(isValidDay("2026-13-01"), false);
  assert.deepEqual(validateClient({ ...base, direccionEntrega: "x".repeat(301), observaciones: "y".repeat(1001) }, "2026-10-05"), [
    "La dirección de entrega tiene como máximo 300 caracteres.",
    "La referencia del trabajo tiene como máximo 1000 caracteres."
  ]);
  assert.deepEqual(validateClient({ ...base, direccionEntrega: ` ${"x".repeat(300)} `, observaciones: "y".repeat(1000) }, "2026-10-05"), [], "cuenta sin los espacios de los bordes, como el alta");
});

test("borrador con un alta sin respuesta: la marca vuelve, con lo que se mando, para revisar antes de crear", () => {
  const context = { definitions: new Map([["bajo", definition()]]), materials: MATERIALS, today: "2026-10-05", defaultFecha: "2026-10-20" };
  const enviado = { clave: "3f2b8c1e-9a4d-4e6f-8b2a-1c3d5e7f9a0b", firma: "abc" };
  assert.equal(restoreWizardDraft({ cliente: "Ana" }, context).draft.enviado, null);
  const restored = restoreWizardDraft({ cliente: "Ana", fechaEntrega: "2026-09-01", enviado: { ...enviado, extra: 1 } as never }, context).draft;
  assert.deepEqual(restored.enviado, enviado, "solo la clave y la huella");
  for (const roto of [1_759_000_000_000, "ayer", { ...enviado, clave: "no-es-uuid" }, { ...enviado, firma: "" }, { clave: enviado.clave }]) {
    assert.equal(restoreWizardDraft({ cliente: "Ana", enviado: roto as never }, context).draft.enviado, null, JSON.stringify(roto));
  }
  assert.equal(orderSignature({ a: 1, b: [1, 2] }), orderSignature({ a: 1, b: [1, 2] }));
  assert.notEqual(orderSignature({ a: 1, b: [1, 2] }), orderSignature({ a: 1, b: [2, 1] }));
});

test("cambiar de perfil, de color o de catalogo: los lados elegidos a mano quedan y los demas siguen al de por defecto", () => {
  const def = definition();
  let unit = withEdgeChoice(newUnit(def, DEFAULTS, MATERIALS), def, "PUERTA", "LARGO_2", "c-blanco-045", EDGES);
  assert.deepEqual(unit.cantosOverride, { PUERTA: { LARGO_2: "c-blanco-045" } });
  // Perfil B (2): la puerta no lleva cantos por defecto; el lado elegido a mano sigue.
  unit = { ...unit, perfilCantoOrden: 2 };
  assert.deepEqual(changedSides(unit, "PUERTA"), ["LARGO_2"]);
  assert.equal(defaultEdgeId(unit, def, "PUERTA", "LARGO_1", EDGES), null);

  // Un canto elegido que con otro color de frentes queda igual al de por defecto deja de ser un cambio.
  const elegido = withEdgeChoice(newUnit(def, DEFAULTS, MATERIALS), def, "PUERTA", "LARGO_1", "c-blanco-2", EDGES);
  assert.deepEqual(elegido.cantosOverride, { PUERTA: { LARGO_1: "c-blanco-2" } });
  assert.deepEqual(normalizeOverrides({ ...elegido, colorFrentesId: "blanco" }, def, EDGES).cantosOverride, {});

  // El catalogo cambia los cantos del perfil: el lado elegido se conserva, sin pasar nada.
  const nuevo = definition({
    piezas: def.piezas.map((pieza) => (pieza.codigo === "PUERTA" ? { ...pieza, cantos: [...pieza.cantos, { perfilOrden: 1, lado: "ANCHO_2" as const, espesorMm: 2 }] } : pieza))
  });
  const conCambio = withEdgeChoice(newUnit(def, DEFAULTS, MATERIALS), def, "PUERTA", "LARGO_1", "c-negro-045", EDGES);
  const reconciled = reconcileUnits([conCambio], new Map([["bajo", nuevo]]), new Map([["bajo", def]]));
  assert.deepEqual(reconciled.units[0].cantosOverride, { PUERTA: { LARGO_1: "c-negro-045" } });
  // Un modulo que no se volvio a traer queda como esta y no se cuenta como quitado.
  const sinTraer = reconcileUnits([conCambio], new Map(), new Map([["bajo", def]]));
  assert.deepEqual(sinTraer, { units: [conCambio], quitados: [], cambiados: [] });
});

test("materiales como el servidor: fondo del catalogo, fondo elegido y materiales fijos", () => {
  const activas = new Set(activePlates(MATERIALS).map((material) => material.id));
  const unit = newUnit(definition(), DEFAULTS, MATERIALS);
  assert.equal(validateUnit(unit, definition(), "REDONDEAR", { activePlateIds: activas, configFondoId: "fibro" }).ok, true);
  const sinFondo = validateUnit(unit, definition(), "REDONDEAR", { activePlateIds: activas, configFondoId: null });
  assert.deepEqual(sinFondo.faltantes, ["el material de fondo (el catálogo no tiene uno configurado)"]);
  assert.equal(sinFondo.fondo, "el catálogo no tiene uno configurado");
  assert.equal(validateUnit(unit, definition(), "REDONDEAR", { activePlateIds: activas, configFondoId: "fibro" }).fondo, null);
  assert.deepEqual(validateUnit(unit, definition(), "REDONDEAR", { activePlateIds: activas, configFondoId: "viejo" }).faltantes, ["el material de fondo (el del catálogo está inactivo)"]);
  assert.equal(validateUnit(unit, definition({ materialFondoId: "fino" }), "REDONDEAR", { activePlateIds: activas, configFondoId: null }).ok, true, "el fondo del modulo alcanza");
  assert.equal(validateUnit({ ...unit, materialFondoId: "fino" }, definition(), "REDONDEAR", { activePlateIds: activas, configFondoId: null }).ok, true, "el elegido alcanza");
  assert.deepEqual(validateUnit({ ...unit, materialFondoId: "viejo" }, definition(), "REDONDEAR", { activePlateIds: activas }).faltantes, ["el material de fondo (el elegido ya no está activo)"]);
  const sinPiezaFondo = definition({ piezas: definition().piezas.filter((pieza) => pieza.rol !== "FONDO") });
  assert.equal(validateUnit(unit, sinPiezaFondo, "REDONDEAR", { activePlateIds: activas, configFondoId: null }).ok, true, "sin piezas de fondo no hace falta");
  const conFijo = definition({
    piezas: [...definition().piezas, { codigo: "TAPA", nombre: "Tapa", rol: "FIJO", materialFijoId: "viejo", formulaLargo: "ANCHO", formulaAncho: "100", formulaCantidad: "1", permiteRotar: false, orden: 4, observaciones: null, cantos: [] }]
  });
  const fijo = validateUnit(unit, conFijo, "REDONDEAR", { activePlateIds: activas, configFondoId: "fibro" });
  assert.equal(fijo.ok, false);
  assert.deepEqual(fijo.generales, ["TAPA: su material fijo no está activo. Revisalo en el catálogo de módulos."]);
});

test("opciones y valores por defecto del catalogo: no se toman como texto mal escrito", () => {
  const conOpcion = definition({
    parametros: [
      ...definition().parametros,
      { clave: "LADO", etiqueta: "Lado", tipo: "OPCION", valorDefecto: -1, minimo: null, maximo: null, opciones: [{ valor: -1, etiqueta: "Izquierda" }, { valor: 1, etiqueta: "Derecha" }], formula: null, ayuda: null, orden: 4 },
      { clave: "TERCIO", etiqueta: "Tercio", tipo: "MEDIDA", valorDefecto: 1.125, minimo: null, maximo: null, opciones: null, formula: null, ayuda: null, orden: 5 }
    ]
  });
  const unit = newUnit(conOpcion, DEFAULTS, MATERIALS);
  assert.equal(unit.valores.LADO, "-1");
  const decimal = definition({
    parametros: [
      ...definition().parametros,
      { clave: "PASO", etiqueta: "Paso", tipo: "OPCION", valorDefecto: 1.125, minimo: null, maximo: null, opciones: [{ valor: 1.125, etiqueta: "Fino" }, { valor: 5.5, etiqueta: "Grueso" }], formula: null, ayuda: null, orden: 4 }
    ]
  });
  const conDecimal = newUnit(decimal, DEFAULTS, MATERIALS);
  assert.equal(conDecimal.valores.PASO, "1.125", "como el value del selector: String(valor)");
  assert.equal(numericValues(conDecimal, decimal).PASO, 1.125, "una opcion no es punto de miles");
  assert.equal(validateUnit(conDecimal, decimal, "REDONDEAR").ok, true);
  assert.equal(linePayload(conDecimal, decimal).valores.PASO, 1.125);
  assert.equal(unit.valores.TERCIO, "1,125", "con coma decimal, para que no parezca punto de miles");
  const validation = validateUnit(unit, conOpcion, "REDONDEAR");
  assert.deepEqual(validation.porMedida, {});
  assert.equal(validation.ok, true);
  assert.deepEqual(numericValues(unit), { ANCHO: 800, ALTO: 720, LADO: -1, TERCIO: 1.125 });
});

test("elegir un cliente anterior: nombre y teléfono; email y dirección solo si están vacíos", () => {
  const client = { cliente: "Cliente Uno", numeroContacto: "2664000000", emailContacto: "uno@example.com", direccionEntrega: "Calle 1" };
  assert.deepEqual(clientSuggestionPatch({ emailContacto: "", direccionEntrega: " " }, client), client);
  assert.deepEqual(clientSuggestionPatch({ emailContacto: "otro@example.com", direccionEntrega: "Obra nueva" }, client), { cliente: "Cliente Uno", numeroContacto: "2664000000" });
  assert.deepEqual(clientSuggestionPatch({ emailContacto: "", direccionEntrega: "" }, { ...client, emailContacto: null, direccionEntrega: null }), { cliente: "Cliente Uno", numeroContacto: "2664000000" });
});

test("herrajes del paso 4: elegir otro modelo, volver al que corresponde y solo las lineas del modulo (DECISIONES 57)", () => {
  const herrajes = [
    { herrajeId: "bisagra-comun", formulaCantidad: "4", formulaMedida: null, orden: 1 },
    { herrajeId: "corredera-350", formulaCantidad: "1", formulaMedida: "PROFUNDIDAD - 50", orden: 2 }
  ] as ModuleDefinition["herrajes"];
  const def = definition({ herrajes });
  const unit = newUnit(def, DEFAULTS, MATERIALS);
  assert.deepEqual(unit.herrajesOverride, {});
  assert.ok(!("herrajesOverride" in linePayload(unit, def)));

  const elegida = withHardwareChoice(unit, "bisagra-comun", "bisagra-suave");
  assert.deepEqual(elegida.herrajesOverride, { "bisagra-comun": "bisagra-suave" });
  assert.deepEqual(linePayload(elegida, def).herrajesOverride, { "bisagra-comun": "bisagra-suave" });
  assert.equal(withHardwareChoice(elegida, "bisagra-comun", "bisagra-suave"), elegida, "lo mismo: no cambia nada");

  const vuelta = withHardwareChoice(elegida, "bisagra-comun", null);
  assert.deepEqual(vuelta.herrajesOverride, {});
  assert.equal(withHardwareChoice(vuelta, "bisagra-comun", null), vuelta);

  // Una linea que el modulo ya no tiene (catalogo que cambio, borrador viejo) se descarta.
  const vieja = sanitizeUnit({ ...elegida, herrajesOverride: { "bisagra-comun": "bisagra-suave", "pata-vieja": "pata-nueva" } }, def);
  assert.deepEqual(vieja.herrajesOverride, { "bisagra-comun": "bisagra-suave" });
  assert.deepEqual(sanitizeUnit(elegida, definition({ herrajes: [] })).herrajesOverride, {});
});
