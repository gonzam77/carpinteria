// Tests de planModuleOrder (spec §17.1): material por rol, cantos por pieza (DECISIONES 45), codigo de barra, sin
// remark, orden, origen y encaje en la placa. Datos armados a mano, sin base de datos.
import assert from "node:assert/strict";
import test from "node:test";
import { moduleBarcode, planModuleOrder, type PlanCanto, type PlanHardware, type PlanInput, type PlanMaterial, type PlanModule } from "./module-order-plan.js";
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
  perfilCantoOrden: 1,
  observaciones: null,
  cantosOverride: {},
  herrajesOverride: {},
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

test("cada pieza lleva por defecto el canto del color de su placa y del espesor del perfil, con tolerancia", () => {
  const [perfil1] = okPlan(planModuleOrder(input([line()]))).lines;
  const lateral = byCode(perfil1.rows, "LATERAL");
  assert.deepEqual([lateral.cantoLargo1Id, lateral.cantoLargo2Id, lateral.cantoAncho1Id, lateral.cantoAncho2Id], ["canto-blanco-045", null, null, null]);
  assert.deepEqual([lateral.cantoLargo1, lateral.cantoLargo2], [true, false]);
  // La puerta es negra y no hay canto negro de 2 mm: va sin canto, se avisa y no es un error (DECISIONES 45).
  const puerta = byCode(perfil1.rows, "PUERTA");
  assert.deepEqual([puerta.cantoLargo1Id, puerta.cantoLargo2Id, puerta.cantoAncho1Id, puerta.cantoAncho2Id], [null, null, null, null]);
  assert.equal(puerta.origen, "CALCULADO");
  assert.deepEqual(
    perfil1.sinCanto.map((item) => [item.piezaCodigo, item.lado, item.espesorMm, item.placa]),
    [
      ["PUERTA", "LARGO_1", 2, "Negro"],
      ["PUERTA", "LARGO_2", 2, "Negro"],
      ["PUERTA", "ANCHO_1", 2, "Negro"],
      ["PUERTA", "ANCHO_2", 2, "Negro"]
    ]
  );

  const [perfil2] = okPlan(planModuleOrder(input([line({ perfilCantoOrden: 2 })]))).lines;
  assert.deepEqual(
    ["cantoLargo1Id", "cantoLargo2Id", "cantoAncho1Id", "cantoAncho2Id"].map((field) => byCode(perfil2.rows, "PUERTA")[field as "cantoLargo1Id"]),
    Array(4).fill("canto-negro-045")
  );
  assert.equal(byCode(perfil2.rows, "ESTANTE").cantoLargo1Id, null);
  assert.deepEqual(perfil2.sinCanto, []);

  // Con frentes blancos, la puerta lleva el canto blanco de 2 mm (guardado con ruido de punto flotante).
  const [blanca] = okPlan(planModuleOrder(input([line({ colorFrentesId: "blanco" })]))).lines;
  assert.deepEqual(
    ["cantoLargo1Id", "cantoAncho2Id"].map((field) => byCode(blanca.rows, "PUERTA")[field as "cantoLargo1Id"]),
    ["canto-blanco-2", "canto-blanco-2"]
  );
});

test("a mano se elige cualquier canto activo o ninguno, lado por lado; los lados que no se tocan siguen al de por defecto", () => {
  const [planned] = okPlan(
    planModuleOrder(
      input([
        line({
          perfilCantoOrden: 2,
          cantosOverride: {
            puerta: { LARGO_1: "canto-blanco-2", ANCHO_2: null },
            LATERAL: { LARGO_1: "canto-blanco-045" }
          }
        })
      ])
    )
  ).lines;
  const puerta = byCode(planned.rows, "PUERTA");
  assert.deepEqual([puerta.cantoLargo1Id, puerta.cantoLargo2Id, puerta.cantoAncho1Id, puerta.cantoAncho2Id], ["canto-blanco-2", "canto-negro-045", "canto-negro-045", null]);
  assert.deepEqual([puerta.cantoLargo1, puerta.cantoAncho2], [true, false]);
  assert.equal(puerta.origen, "EDITADO");
  assert.equal(byCode(planned.rows, "LATERAL").origen, "CALCULADO", "elegir el mismo canto que el de por defecto no es un cambio");
  // Un lado sin canto de su color que se elige a mano ya no se avisa.
  const [elegido] = okPlan(planModuleOrder(input([line({ cantosOverride: { PUERTA: { LARGO_1: "canto-negro-045", LARGO_2: null, ANCHO_1: null, ANCHO_2: null } } })]))).lines;
  assert.deepEqual(elegido.sinCanto, []);
  assert.equal(byCode(elegido.rows, "PUERTA").cantoLargo1Id, "canto-negro-045");
});

test("codigo de barra, remark, nombre, pieza de origen, orden y origen", () => {
  const plan = okPlan(
    planModuleOrder(
      input([
        line(),
        line({ valores: { ESTANTES: 0 }, cantosOverride: { puerta: { LARGO_1: "canto-blanco-045" } } })
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
  assert.ok(first.rows.every((row) => row.remark === null && row.origen === "CALCULADO"), "sin Remark (DECISIONES 20)");
  assert.deepEqual(first.rows.map((row) => row.nombreProducto), ["Lateral", "Puerta", "Estante", "Zocalo", "Fondo"]);
  const puerta = byCode(second.rows, "PUERTA");
  assert.equal(puerta.origen, "EDITADO");
  assert.deepEqual([puerta.cantoLargo1Id, puerta.cantoLargo2Id, puerta.cantoAncho1Id, puerta.cantoAncho2Id], ["canto-blanco-045", null, null, null]);
  assert.ok(second.rows.filter((row) => row.piezaCodigo !== "PUERTA").every((row) => row.origen === "CALCULADO"));
  assert.ok(second.rows.every((row) => row.remark === null));
  assert.equal(moduleBarcode(1044, 1, 3), "M1044-01-03");
  assert.equal(moduleBarcode(null, 12, 7), "M----12-07");
});

test("materiales que no sirven: todos juntos y sin repetir", () => {
  const error = errorOf(
    planModuleOrder(
      input(
        [
          line({ colorEsqueletoId: "fina", colorFrentesId: "inactiva", cantosOverride: { PUERTA: { LARGO_1: "inactiva" } } }),
          line({ colorEsqueletoId: "fina", colorFrentesId: "inactiva" })
        ],
        { config: { redondeo: "REDONDEAR", materialFondoId: null } },
        [sampleModule({ piezas: sampleModule().piezas.map((pieza) => (pieza.rol === "FIJO" ? { ...pieza, materialFijoId: "inactiva" } : pieza)) })]
      )
    )
  );
  assert.equal(error.code, "MODULE_MATERIAL_INVALID");
  assert.deepEqual(error.problems.slice(0, 5), [
    'Módulo 1 (Bajo mesada): el color de esqueleto "Blanco 5,5" es de 5,5 mm y el módulo está pensado para placas de 18 mm.',
    'Módulo 1 (Bajo mesada): el color de frentes "Roble" está inactivo.',
    "Módulo 1 (Bajo mesada): tiene piezas de fondo y no hay material de fondo. Configuralo en Catálogo de módulos > Configuración.",
    'Módulo 1 (Bajo mesada): el material fijo de "Zocalo" "Roble" está inactivo.',
    'Módulo 1 (Bajo mesada): el canto elegido para "Puerta" (Largo 1) no es un canto activo del sistema.'
  ]);
  assert.equal(error.problems.length, 9, "cada modulo informa lo suyo");
});

test("orden de los errores: primero los modulos, despues las formulas", () => {
  const inactivo = errorOf(planModuleOrder(input([line({ moduloId: "m2" }), line({ moduloId: "no-existe" })], {}, [sampleModule({ id: "m2", activo: false })])));
  assert.equal(inactivo.code, "MODULE_NOT_AVAILABLE");
  assert.deepEqual(inactivo.problems, ["El módulo 1 (Bajo mesada) está inactivo: no se puede pedir.", "El módulo 2 no existe en el catálogo."]);

  const formulas = errorOf(planModuleOrder(input([line(), line({ valores: { ANCHOO: 1 } }), line({ perfilCantoOrden: 2 }, ), line({ valores: { ANCHO: 20 } })], {}, [sampleModule()])));
  assert.equal(formulas.code, "MODULE_FORMULA_ERRORS");
  assert.equal(formulas.message, "Hay 2 módulos con errores.");
  assert.equal(formulas.details.posicion, 2);
  assert.deepEqual(
    (formulas.details.modulos as Array<{ posicion: number }>).map((item) => item.posicion),
    [2, 4]
  );
  assert.equal(formulas.problems[0], "Módulo 2 (Bajo mesada), ANCHOO: No existe la medida ANCHOO.");

  const perfil = errorOf(planModuleOrder(input([line({ perfilCantoOrden: 2 })], {}, [sampleModule({ perfiles: [{ orden: 1 }] })])));
  assert.equal(perfil.message, "El módulo 1 (Bajo mesada) tiene errores.");
  assert.deepEqual(perfil.problems, ["Módulo 1 (Bajo mesada), PERFIL: El módulo no tiene el perfil de canto 2."]);
});

test("encaje con la funcion del optimizador: ejes, rotacion y placas sin medidas", () => {
  // Placa de 1830 × 2600 con 5 mm de perfilado: 1820 de ancho util y 2590 de alto util.
  const girable = errorOf(planModuleOrder(input([line({ valores: { ANCHO: 2000 } })])));
  assert.equal(girable.code, "MODULE_PIECES_DO_NOT_FIT");
  assert.deepEqual(girable.problems, [
    '"Fondo" del Módulo 1 (718 × 1998 mm) no entra en la placa Fibro (2590 × 1820 mm útiles). Girada entraría: si la veta lo permite, marcala para rotar en el catálogo.'
  ]);
  // El estante rota (1964 × 540 entra girado) y el zocalo de 2000 × 100 entra derecho: ninguno es un error.

  const grande = errorOf(planModuleOrder(input([line({ valores: { ANCHO: 3000 } })])));
  assert.ok(grande.problems.includes('"Estante" del Módulo 1 (2964 × 540 mm) no entra en la placa Blanco (2590 × 1820 mm útiles).'), grande.problems.join("\n"));
  assert.ok(grande.problems.some((problem) => problem.startsWith('"Zocalo" del Módulo 1 (3000 × 100 mm) no entra en la placa Negro')));

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
  assert.deepEqual(frentes.problems, ['Módulo 1 (Bajo mesada): el color de frentes "Blanco 5,5" es de 5,5 mm y el módulo está pensado para placas de 18 mm.']);
  const gruesa = errorOf(planModuleOrder(input([line({ colorEsqueletoId: "gruesa" })])));
  assert.deepEqual(gruesa.problems, ['Módulo 1 (Bajo mesada): el color de esqueleto "Gruesa" es de 25 mm y el módulo está pensado para placas de 18 mm.']);
  okPlan(planModuleOrder(input([line()])));
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

test("un cambio de cantos para una pieza que no existe es un error; para una que no se genera, no", () => {
  const error = errorOf(planModuleOrder(input([line({ cantosOverride: { PUERTITA: { LARGO_1: null } } })])));
  assert.equal(error.code, "MODULE_FORMULA_ERRORS");
  assert.deepEqual(error.problems, ["Módulo 1 (Bajo mesada), PUERTITA: No existe la pieza PUERTITA para cambiarle los cantos."]);
  okPlan(planModuleOrder(input([line({ valores: { ESTANTES: 0 }, cantosOverride: { ESTANTE: { LARGO_1: "canto-blanco-045" } } })])));
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
  assert.deepEqual(error.problems, ['Módulo 1 (Bajo mesada): el material de fondo elegido "Roble" está inactivo.']);
  const noEsPlaca = errorOf(planModuleOrder(input([line({ materialFondoId: "canto-blanco-045" })])));
  assert.deepEqual(noEsPlaca.problems, ["Módulo 1 (Bajo mesada): el material de fondo elegido no es una placa del sistema."]);
  const [sinPiezasDeFondo] = okPlan(planModuleOrder(input([line({ materialFondoId: "fina" })], {}, [sinFondo]))).lines;
  assert.equal(sinPiezasDeFondo.materialFondoId, null);
});

// ---------------------------------------------------------------- herrajes (Fase 6, DECISIONES 57)

const herraje = (id: string, tipoId: string, extra: Partial<PlanHardware> = {}): PlanHardware => ({
  id,
  tipoId,
  nombre: id,
  unidad: "unidad",
  valor: 100,
  tipo: tipoId,
  linea: null,
  medidaMm: null,
  activo: true,
  ...extra
});
const HARDWARE = new Map(
  [
    herraje("bisagra-comun", "bisagra", { valor: 850 }),
    herraje("bisagra-suave", "bisagra", { valor: 1900 }),
    herraje("bisagra-vieja", "bisagra", { activo: false }),
    herraje("t350", "corredera", { unidad: "par", linea: "Telescópica", medidaMm: 350, valor: 9100 }),
    herraje("t450", "corredera", { unidad: "par", linea: "Telescópica", medidaMm: 450, valor: 10500 }),
    herraje("pata", "pata", { valor: 300 })
  ].map((item) => [item.id, item])
);
const conHerrajes = (herrajes: PlanModule["herrajes"]) => [sampleModule({ herrajes })];
const hardwareOn = { hardware: { enabled: true, models: HARDWARE } };

test("herrajes: cantidad con las piezas del módulo, modelo por defecto o por medida, y los de cantidad 0 no van", () => {
  const modules = conHerrajes([
    { herrajeId: "bisagra-comun", formulaCantidad: "PUERTA.cant * 2" },
    { herrajeId: "t350", formulaCantidad: "ESTANTES", formulaMedida: "ALTO - 220" },
    { herrajeId: "pata", formulaCantidad: "SI(ANCHO > 1000; 6; 0)" }
  ]);
  const [planned] = okPlan(planModuleOrder(input([line()], hardwareOn, modules))).lines;
  assert.deepEqual(
    planned.herrajes.map((item) => [item.herrajeId, item.cantidad, item.medidaNecesaria, item.eleccion, item.origen, item.valorUnitario, item.unidad, item.orden]),
    [
      ["bisagra-comun", 4, null, "POR_DEFECTO", "CALCULADO", 850, "unidad", 1],
      ["t450", 1, 500, "POR_MEDIDA", "CALCULADO", 10500, "par", 2]
    ],
    "la pata no va: cantidad 0 con 800 de ancho"
  );
  const apagados = okPlan(planModuleOrder(input([line()], { hardware: { enabled: false, models: HARDWARE } }, modules))).lines[0];
  assert.deepEqual(apagados.herrajes, [], "con los herrajes apagados no se calculan");
});

test("herrajes: elegir otro modelo del mismo tipo; otro tipo, uno inactivo o una fórmula mala no pasan", () => {
  const modules = conHerrajes([{ herrajeId: "bisagra-comun", formulaCantidad: "PUERTA.cant * 2" }]);
  const elegido = okPlan(planModuleOrder(input([line({ herrajesOverride: { "bisagra-comun": "bisagra-suave" } })], hardwareOn, modules))).lines[0];
  assert.deepEqual(
    elegido.herrajes.map((item) => [item.herrajeId, item.herrajeDefectoId, item.eleccion, item.origen, item.valorUnitario]),
    [["bisagra-suave", "bisagra-comun", "ELEGIDO", "EDITADO", 1900]]
  );
  const mismo = okPlan(planModuleOrder(input([line({ herrajesOverride: { "bisagra-comun": "bisagra-comun" } })], hardwareOn, modules))).lines[0];
  assert.equal(mismo.herrajes[0].origen, "CALCULADO", "elegir el mismo que correspondía no lo marca como editado");
  const otroTipo = errorOf(planModuleOrder(input([line({ herrajesOverride: { "bisagra-comun": "pata" } })], hardwareOn, modules)));
  assert.equal(otroTipo.code, "MODULE_HARDWARE_INVALID");
  assert.match(otroTipo.message, /no es del mismo tipo/);
  const inactivo = errorOf(planModuleOrder(input([line({ herrajesOverride: { "bisagra-comun": "bisagra-vieja" } })], hardwareOn, modules)));
  assert.ok(inactivo.message.includes(`Módulo 1 (Bajo mesada): el herraje "bisagra-vieja" está inactivo`), inactivo.message);
  const ajeno = errorOf(planModuleOrder(input([line({ herrajesOverride: { pata: "pata" } })], hardwareOn, modules)));
  assert.equal(ajeno.code, "MODULE_FORMULA_ERRORS");
  const mala = errorOf(planModuleOrder(input([line()], hardwareOn, conHerrajes([{ herrajeId: "bisagra-comun", formulaCantidad: "PUERTAZ.cant" }]))));
  assert.equal(mala.code, "MODULE_FORMULA_ERRORS");
  assert.match(mala.problems.join(" "), /herraje 1: Cantidad: No existe la pieza PUERTAZ/);
});
