// Tests de planModuleOrder (spec §17.1): material por rol, cantos por perfil y color, faltantes todos juntos,
// codigo de barra, remark, orden, origen y encaje en la placa. Datos armados a mano, sin base de datos.
import assert from "node:assert/strict";
import test from "node:test";
import { moduleBarcode, planModuleOrder, type PlanCanto, type PlanInput, type PlanMaterial, type PlanModule } from "./module-order-plan.js";
import type { ModuleOrderLine } from "./module-orders.schemas.js";

const placa = (id: string, nombre: string, espesorMm: number, extra: Partial<PlanMaterial> = {}): PlanMaterial => ({
  id,
  nombre,
  tipo: "PLACA",
  activo: true,
  espesorMm,
  anchoPlaca: 1830,
  altoPlaca: 2600,
  ...extra
});
const MATERIALS = [
  placa("blanco", " Blanco ", 18),
  placa("negro", "Negro", 18),
  placa("gris", "Gris", 18),
  placa("fina", "Blanco 5,5", 5.5),
  placa("gruesa", "Gruesa", 25),
  placa("fibro", "Fibro", 3),
  placa("inactiva", "Roble", 18, { activo: false }),
  placa("sinmedidas", "Sin medidas", 18, { anchoPlaca: null, altoPlaca: null }),
  { ...placa("canto-blanco-045", "Canto blanco 0,45", 0.45), tipo: "CANTO" as const }
];
const CANTOS: PlanCanto[] = [
  { id: "canto-blanco-045", nombre: "Canto blanco 0,45", placaMaterialId: "blanco", espesorMm: 0.45 },
  // Guardado con ruido de punto flotante: igual tiene que contar como de 2 mm.
  { id: "canto-blanco-2", nombre: "Canto blanco 2", placaMaterialId: "blanco", espesorMm: 2.0000000001 },
  { id: "canto-negro-045", nombre: "Canto negro 0,45", placaMaterialId: "negro", espesorMm: 0.45 }
];

const ALL_SIDES = (espesorMm: number, perfilOrden: number) =>
  (["LARGO_1", "LARGO_2", "ANCHO_1", "ANCHO_2"] as const).map((lado) => ({ perfilOrden, lado, espesorMm }));

const sampleModule = (extra: Partial<PlanModule> = {}): PlanModule => ({
  id: "m1",
  nombre: "Bajo mesada",
  activo: true,
  version: 3,
  materialFondoId: null,
  espesorDisenoMm: 18,
  parametros: [
    { clave: "ANCHO", tipo: "MEDIDA", valorDefecto: 800 },
    { clave: "ALTO", tipo: "MEDIDA", valorDefecto: 720 },
    { clave: "ESTANTES", tipo: "ENTERO", valorDefecto: 1 }
  ],
  perfiles: [{ orden: 1 }, { orden: 2 }],
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
      formulaLargo: "ALTO - 4",
      formulaAncho: "ANCHO / 2 - 4",
      formulaCantidad: "2",
      permiteRotar: false,
      orden: 2,
      cantos: [...ALL_SIDES(2, 1), ...ALL_SIDES(0.45, 2)]
    },
    { codigo: "ESTANTE", nombre: "Estante", rol: "ESQUELETO", materialFijoId: null, formulaLargo: "ANCHO - 36", formulaAncho: "540", formulaCantidad: "ESTANTES", permiteRotar: true, orden: 3, cantos: [] },
    { codigo: "ZOCALO", nombre: "Zocalo", rol: "FIJO", materialFijoId: "negro", formulaLargo: "ANCHO", formulaAncho: "100", formulaCantidad: "1", permiteRotar: false, orden: 4, cantos: [] },
    { codigo: "FONDO", nombre: "Fondo", rol: "FONDO", materialFijoId: null, formulaLargo: "ALTO - 2", formulaAncho: "ANCHO - 2", formulaCantidad: "1", permiteRotar: false, orden: 5, cantos: [] }
  ],
  ...extra
});

const line = (extra: Partial<ModuleOrderLine> = {}): ModuleOrderLine => ({
  moduloId: "m1",
  valores: {},
  colorEsqueletoId: "blanco",
  colorFrentesId: "negro",
  colorCantoId: "blanco",
  perfilCantoOrden: 1,
  observaciones: null,
  cantosOverride: {},
  ...extra
});

function input(lines: ModuleOrderLine[], extra: Partial<PlanInput> = {}, modules: PlanModule[] = [sampleModule()]): PlanInput {
  return {
    lines,
    modules: new Map(modules.map((module) => [module.id, module])),
    materials: new Map(MATERIALS.map((material) => [material.id, material])),
    cantos: CANTOS,
    config: { redondeo: "REDONDEAR", materialFondoId: "fibro" },
    optimizer: { espesorSierraMm: 4.3, perfiladoBordeMm: 5 },
    ...extra
  };
}

function okPlan(plan: ReturnType<typeof planModuleOrder>) {
  if (!plan.ok) assert.fail(`se esperaba un plan sin errores: ${plan.error.code} ${plan.error.message}`);
  return plan;
}
function errorOf(plan: ReturnType<typeof planModuleOrder>) {
  if (plan.ok) assert.fail("se esperaba un error");
  return plan.error;
}
const byCode = <T extends { piezaCodigo?: string | null }>(rows: T[], codigo: string) => rows.find((row) => row.piezaCodigo === codigo)!;

test("material por rol: esqueleto, frentes, fondo de la configuracion y material fijo", () => {
  const [planned] = okPlan(planModuleOrder(input([line()]))).lines;
  const material = (codigo: string) => byCode(planned.rows, codigo).materialId;
  assert.deepEqual(
    ["LATERAL", "PUERTA", "ESTANTE", "ZOCALO", "FONDO"].map(material),
    ["blanco", "negro", "blanco", "negro", "fibro"]
  );
  assert.deepEqual(
    planned.rows.map((row) => [row.piezaCodigo, row.largo, row.ancho, row.cantidad, row.permiteRotar]),
    [
      ["LATERAL", 720, 560, 2, false],
      ["PUERTA", 716, 396, 2, false],
      ["ESTANTE", 764, 540, 1, true],
      ["ZOCALO", 800, 100, 1, false],
      ["FONDO", 718, 798, 1, false]
    ]
  );
  assert.deepEqual(planned.valores, { ANCHO: 800, ALTO: 720, ESTANTES: 1 });
});

test("el fondo propio del modulo gana al de la configuracion", () => {
  const [planned] = okPlan(planModuleOrder(input([line()], {}, [sampleModule({ materialFondoId: "fina" })]))).lines;
  assert.equal(byCode(planned.rows, "FONDO").materialId, "fina");
  const sinConfig = okPlan(planModuleOrder(input([line()], { config: { redondeo: "REDONDEAR", materialFondoId: null } }, [sampleModule({ materialFondoId: "fina" })])));
  assert.equal(byCode(sinConfig.lines[0].rows, "FONDO").materialId, "fina", "alcanza con el fondo del modulo");
});

test("cantos del perfil elegido y del color de canto, con tolerancia en el espesor", () => {
  const [perfil1] = okPlan(planModuleOrder(input([line()]))).lines;
  const lateral = byCode(perfil1.rows, "LATERAL");
  assert.deepEqual([lateral.cantoLargo1Id, lateral.cantoLargo2Id, lateral.cantoAncho1Id, lateral.cantoAncho2Id], ["canto-blanco-045", null, null, null]);
  assert.deepEqual([lateral.cantoLargo1, lateral.cantoLargo2], [true, false]);
  const puerta = byCode(perfil1.rows, "PUERTA");
  assert.deepEqual([puerta.cantoLargo1Id, puerta.cantoLargo2Id, puerta.cantoAncho1Id, puerta.cantoAncho2Id], Array(4).fill("canto-blanco-2"));

  const [perfil2] = okPlan(planModuleOrder(input([line({ perfilCantoOrden: 2 })]))).lines;
  assert.deepEqual(
    ["cantoLargo1Id", "cantoLargo2Id", "cantoAncho1Id", "cantoAncho2Id"].map((field) => byCode(perfil2.rows, "PUERTA")[field as "cantoLargo1Id"]),
    Array(4).fill("canto-blanco-045")
  );
  assert.equal(byCode(perfil2.rows, "ESTANTE").cantoLargo1Id, null);
});

test("codigo de barra, remark, nombre, pieza de origen, orden y origen", () => {
  const plan = okPlan(
    planModuleOrder(
      input([
        line(),
        line({ valores: { ESTANTES: 0 }, cantosOverride: { puerta: { LARGO_1: 0.45, LARGO_2: null, ANCHO_1: null, ANCHO_2: null } } })
      ])
    )
  );
  const [first, second] = plan.lines;
  assert.deepEqual(first.rows.map((row) => row.codigoBarra), ["M----01-01", "M----01-02", "M----01-03", "M----01-04", "M----01-05"]);
  assert.deepEqual(
    second.rows.map((row) => [row.codigoBarra, row.piezaCodigo, row.orden]),
    [
      ["M----02-01", "LATERAL", 1],
      ["M----02-02", "PUERTA", 2],
      ["M----02-03", "ZOCALO", 3],
      ["M----02-04", "FONDO", 4]
    ],
    "sin estantes, el estante no se genera y no ocupa numero"
  );
  assert.ok(first.rows.every((row) => row.remark === "Modulo 1 · Bajo mesada" && row.origen === "CALCULADO"));
  assert.deepEqual(first.rows.map((row) => row.nombreProducto), ["Lateral", "Puerta", "Estante", "Zocalo", "Fondo"]);
  const puerta = byCode(second.rows, "PUERTA");
  assert.equal(puerta.origen, "EDITADO");
  assert.deepEqual([puerta.cantoLargo1Id, puerta.cantoLargo2Id, puerta.cantoAncho1Id, puerta.cantoAncho2Id], ["canto-blanco-045", null, null, null]);
  assert.ok(second.rows.filter((row) => row.piezaCodigo !== "PUERTA").every((row) => row.origen === "CALCULADO"));
  assert.ok(second.rows.every((row) => row.remark === "Modulo 2 · Bajo mesada"));
  assert.equal(moduleBarcode(1044, 1, 3), "M1044-01-03");
  assert.equal(moduleBarcode(null, 12, 7), "M----12-07");
});

test("faltan cantos: todos juntos, sin repetir y ordenados", () => {
  const error = errorOf(planModuleOrder(input([line({ colorCantoId: "negro" }), line({ colorCantoId: "gris" }), line({ colorCantoId: "negro" })])));
  assert.equal(error.code, "MISSING_EDGE_MATERIAL");
  assert.deepEqual(error.details.faltantes, [
    { colorId: "gris", colorNombre: "Gris", espesorMm: 0.45 },
    { colorId: "gris", colorNombre: "Gris", espesorMm: 2 },
    { colorId: "negro", colorNombre: "Negro", espesorMm: 2 }
  ]);
  assert.equal(
    error.message,
    'Falta el canto de 0,45 mm para "Gris". Falta el canto de 2 mm para "Gris". Falta el canto de 2 mm para "Negro". Cargalo en Materiales.'
  );
  assert.equal(error.problems.length, 3);
});

test("materiales que no sirven: todos juntos y sin repetir", () => {
  const error = errorOf(
    planModuleOrder(
      input(
        [
          line({ colorEsqueletoId: "fina", colorFrentesId: "inactiva", colorCantoId: "canto-blanco-045" }),
          line({ colorEsqueletoId: "fina", colorFrentesId: "inactiva", colorCantoId: "canto-blanco-045" })
        ],
        { config: { redondeo: "REDONDEAR", materialFondoId: null } },
        [sampleModule({ piezas: sampleModule().piezas.map((pieza) => (pieza.rol === "FIJO" ? { ...pieza, materialFijoId: "inactiva" } : pieza)) })]
      )
    )
  );
  assert.equal(error.code, "MODULE_MATERIAL_INVALID");
  assert.deepEqual(error.problems.slice(0, 5), [
    'Modulo 1 (Bajo mesada): el color de esqueleto "Blanco 5,5" es de 5,5 mm y el modulo esta pensado para placas de 18 mm.',
    'Modulo 1 (Bajo mesada): el color de frentes "Roble" esta inactivo.',
    "Modulo 1 (Bajo mesada): el color de los cantos no es una placa del sistema.",
    "Modulo 1 (Bajo mesada): tiene piezas de fondo y no hay material de fondo. Configuralo en Catalogo de modulos > Configuracion.",
    'Modulo 1 (Bajo mesada): el material fijo de "Zocalo" "Roble" esta inactivo.'
  ]);
  assert.equal(error.problems.length, 10, "cada modulo informa lo suyo");
});

test("orden de los errores: primero los modulos, despues las formulas", () => {
  const inactivo = errorOf(planModuleOrder(input([line({ moduloId: "m2" }), line({ moduloId: "no-existe", colorCantoId: "gris" })], {}, [sampleModule({ id: "m2", activo: false })])));
  assert.equal(inactivo.code, "MODULE_NOT_AVAILABLE");
  assert.deepEqual(inactivo.problems, ["El modulo 1 (Bajo mesada) esta inactivo: no se puede pedir.", "El modulo 2 no existe en el catalogo."]);

  const formulas = errorOf(planModuleOrder(input([line(), line({ valores: { ANCHOO: 1 } }), line({ perfilCantoOrden: 2 }, ), line({ valores: { ANCHO: 20 } })], {}, [sampleModule()])));
  assert.equal(formulas.code, "MODULE_FORMULA_ERRORS");
  assert.equal(formulas.message, "Hay 2 modulos con errores.");
  assert.equal(formulas.details.posicion, 2);
  assert.deepEqual(
    (formulas.details.modulos as Array<{ posicion: number }>).map((item) => item.posicion),
    [2, 4]
  );
  assert.equal(formulas.problems[0], "Modulo 2 (Bajo mesada), ANCHOO: No existe la medida ANCHOO.");

  const perfil = errorOf(planModuleOrder(input([line({ perfilCantoOrden: 2 })], {}, [sampleModule({ perfiles: [{ orden: 1 }] })])));
  assert.equal(perfil.message, "El modulo 1 (Bajo mesada) tiene errores.");
  assert.deepEqual(perfil.problems, ["Modulo 1 (Bajo mesada), PERFIL: El modulo no tiene el perfil de canto 2."]);
});

test("encaje con la funcion del optimizador: ejes, rotacion y placas sin medidas", () => {
  // Placa de 1830 × 2600 con 5 mm de perfilado: 1820 de ancho util y 2590 de alto util.
  const girable = errorOf(planModuleOrder(input([line({ valores: { ANCHO: 2000 } })])));
  assert.equal(girable.code, "MODULE_PIECES_DO_NOT_FIT");
  assert.deepEqual(girable.problems, [
    '"Fondo" del Modulo 1 (718 × 1998 mm) no entra en la placa Fibro (2590 × 1820 mm utiles). Girada entraria: si la veta lo permite, marcala para rotar en el catalogo.'
  ]);
  // El estante rota (1964 × 540 entra girado) y el zocalo de 2000 × 100 entra derecho: ninguno es un error.

  const grande = errorOf(planModuleOrder(input([line({ valores: { ANCHO: 3000 } })])));
  assert.ok(grande.problems.includes('"Estante" del Modulo 1 (2964 × 540 mm) no entra en la placa Blanco (2590 × 1820 mm utiles).'), grande.problems.join("\n"));
  assert.ok(grande.problems.some((problem) => problem.startsWith('"Zocalo" del Modulo 1 (3000 × 100 mm) no entra en la placa Negro')));

  const sinMedidas = errorOf(planModuleOrder(input([line({ colorEsqueletoId: "sinmedidas" })])));
  assert.deepEqual(sinMedidas.problems, ['La placa "Sin medidas" no tiene medidas cargadas. Completalas en Materiales.']);
});

test("el redondeo de la configuracion llega al armado", () => {
  const module = sampleModule({ piezas: sampleModule().piezas.map((pieza) => (pieza.codigo === "PUERTA" ? { ...pieza, formulaAncho: "ANCHO / 2 - 4.5" } : pieza)) });
  const redondea = okPlan(planModuleOrder(input([line()], {}, [module])));
  const trunca = okPlan(planModuleOrder(input([line()], { config: { redondeo: "TRUNCAR", materialFondoId: "fibro" } }, [module])));
  assert.equal(byCode(redondea.lines[0].rows, "PUERTA").ancho, 396, "395.5 redondea a 396");
  assert.equal(byCode(trunca.lines[0].rows, "PUERTA").ancho, 395, "395.5 trunca a 395");
});

test("cada lado de canto va a su campo, con un perfil asimetrico", () => {
  const module = sampleModule({
    piezas: sampleModule().piezas.map((pieza) =>
      pieza.codigo === "LATERAL"
        ? {
            ...pieza,
            cantos: [
              { perfilOrden: 1, lado: "LARGO_2", espesorMm: 0.45 },
              { perfilOrden: 1, lado: "ANCHO_1", espesorMm: 2 }
            ]
          }
        : pieza
    )
  });
  const lateral = byCode(okPlan(planModuleOrder(input([line()], {}, [module]))).lines[0].rows, "LATERAL");
  assert.deepEqual(
    [lateral.cantoLargo1Id, lateral.cantoLargo2Id, lateral.cantoAncho1Id, lateral.cantoAncho2Id],
    [null, "canto-blanco-045", "canto-blanco-2", null]
  );
  assert.deepEqual([lateral.cantoLargo1, lateral.cantoLargo2, lateral.cantoAncho1, lateral.cantoAncho2], [false, true, true, false]);
});

test("el espesor de diseno se exige a esqueleto y frentes, mas fino o mas grueso", () => {
  const frentes = errorOf(planModuleOrder(input([line({ colorFrentesId: "fina" })])));
  assert.deepEqual(frentes.problems, ['Modulo 1 (Bajo mesada): el color de frentes "Blanco 5,5" es de 5,5 mm y el modulo esta pensado para placas de 18 mm.']);
  const gruesa = errorOf(planModuleOrder(input([line({ colorEsqueletoId: "gruesa" })])));
  assert.deepEqual(gruesa.problems, ['Modulo 1 (Bajo mesada): el color de esqueleto "Gruesa" es de 25 mm y el modulo esta pensado para placas de 18 mm.']);
  okPlan(planModuleOrder(input([line({ colorCantoId: "blanco" })])));
});

test("sin piezas de fondo no hace falta material de fondo", () => {
  const sinFondo = sampleModule({ piezas: sampleModule().piezas.filter((pieza) => pieza.rol !== "FONDO") });
  const plan = okPlan(planModuleOrder(input([line()], { config: { redondeo: "REDONDEAR", materialFondoId: null } }, [sinFondo])));
  assert.equal(plan.lines[0].rows.length, 4);
  // Con una pieza de fondo que no se genera (cantidad 0), tampoco.
  const fondoApagado = sampleModule({ piezas: sampleModule().piezas.map((pieza) => (pieza.rol === "FONDO" ? { ...pieza, formulaCantidad: "0" } : pieza)) });
  okPlan(planModuleOrder(input([line()], { config: { redondeo: "REDONDEAR", materialFondoId: null } }, [fondoApagado])));
});

test("si hay dos cantos del mismo color y espesor, gana el primero de la lista", () => {
  const cantos = [{ id: "canto-blanco-045-b", nombre: "A primero", placaMaterialId: "blanco", espesorMm: 0.45 }, ...CANTOS];
  const lateral = byCode(okPlan(planModuleOrder(input([line()], { cantos }))).lines[0].rows, "LATERAL");
  assert.equal(lateral.cantoLargo1Id, "canto-blanco-045-b");
});

test("faltantes ordenados por color y espesor aunque aparezcan en otro orden", () => {
  // La primera linea pide 2 mm (cambio a mano del lateral y puertas); la segunda, 0,45 (perfil 2).
  const error = errorOf(
    planModuleOrder(
      input([
        line({ colorCantoId: "gris", cantosOverride: { LATERAL: { LARGO_1: 2, LARGO_2: null, ANCHO_1: null, ANCHO_2: null } } }),
        line({ colorCantoId: "gris", perfilCantoOrden: 2 })
      ])
    )
  );
  assert.deepEqual(
    (error.details.faltantes as Array<{ espesorMm: number }>).map((item) => item.espesorMm),
    [0.45, 2]
  );
});

test("fondo elegido en la solicitud: le gana al del modulo y al de la configuracion (DECISIONES 32)", () => {
  const conFondoPropio = sampleModule({ materialFondoId: "fibro" });
  const [elegido] = okPlan(planModuleOrder(input([line({ materialFondoId: "fina" })], {}, [conFondoPropio]))).lines;
  assert.equal(byCode(elegido.rows, "FONDO").materialId, "fina");
  assert.equal(elegido.materialFondoId, "fina", "se guarda el que se uso");

  const [delModulo] = okPlan(planModuleOrder(input([line()], {}, [sampleModule({ materialFondoId: "fina" })]))).lines;
  assert.equal(delModulo.materialFondoId, "fina");
  const [deLaConfiguracion] = okPlan(planModuleOrder(input([line({ materialFondoId: null })]))).lines;
  assert.equal(deLaConfiguracion.materialFondoId, "fibro");
  assert.equal(byCode(deLaConfiguracion.rows, "FONDO").materialId, "fibro");

  // Se puede elegir aunque la configuracion no tenga fondo.
  const sinConfig = okPlan(planModuleOrder(input([line({ materialFondoId: "fibro" })], { config: { redondeo: "REDONDEAR", materialFondoId: null } })));
  assert.equal(sinConfig.lines[0].materialFondoId, "fibro");
});

test("el fondo elegido se revisa aunque el modulo no tenga piezas de fondo, y si no hay fondo no se guarda", () => {
  const sinFondo = sampleModule({ piezas: sampleModule().piezas.filter((pieza) => pieza.rol !== "FONDO") });
  const error = errorOf(planModuleOrder(input([line({ materialFondoId: "inactiva" })], {}, [sinFondo])));
  assert.deepEqual(error.problems, ['Modulo 1 (Bajo mesada): el material de fondo elegido "Roble" esta inactivo.']);
  const noEsPlaca = errorOf(planModuleOrder(input([line({ materialFondoId: "canto-blanco-045" })])));
  assert.deepEqual(noEsPlaca.problems, ["Modulo 1 (Bajo mesada): el material de fondo elegido no es una placa del sistema."]);
  const [sinPiezasDeFondo] = okPlan(planModuleOrder(input([line({ materialFondoId: "fina" })], {}, [sinFondo]))).lines;
  assert.equal(sinPiezasDeFondo.materialFondoId, null);
});
