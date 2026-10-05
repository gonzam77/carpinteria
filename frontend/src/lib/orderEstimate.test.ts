import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { evaluateModule } from "./moduleFormula.ts";
import { computeOrderEstimate, toCentavos, type EstimateRow } from "./orderEstimate.ts";

// Presupuesto: las mismas piezas tienen que dar exactamente los mismos numeros (===) se carguen como
// solicitud de corte o desde modulos, en cualquier orden y con cualquier particion de filas.

const optimizerSettings = { espesorSierraMm: 4.3, perfiladoBordeMm: 5 };
const budgetSettings = { manoObraPlacaPorPlaca: 7350.25, manoObraCanto045Mm: 321.11, manoObraCanto1Mm: 410.07, manoObraCanto2Mm: 515.93 };
const plates = [
  { id: "esqueleto", nombre: "Blanco 18", valor: 45999.99, anchoPlaca: 1830, altoPlaca: 2600, stockPlacas: 50 },
  { id: "frentes", nombre: "Gris grafito 18", valor: 38750.5, anchoPlaca: 1830, altoPlaca: 2600, stockPlacas: 50 },
  { id: "fondo", nombre: "Fibrofacil 3", valor: 12345.67, anchoPlaca: 1830, altoPlaca: 2600, stockPlacas: 50 }
];
const cantos = [
  { id: "canto-045", valor: 1234.567, espesorMm: 0.45 },
  { id: "canto-2", valor: 1450.01, espesorMm: 2 }
];

const catalog = JSON.parse(readFileSync(new URL("../../../backend/prisma/data/modulos-muebles.json", import.meta.url), "utf8"));

// Filas como las generaria una solicitud de modulos: una por pieza y por modulo, en orden de modulo.
function moduleRows(codes: string[]): EstimateRow[] {
  return codes.flatMap((code, position) => {
    const module = catalog.modulos.find((item: { codigo: string }) => item.codigo === code);
    const definition = new Map(module.piezas.map((piece: { codigo: string }) => [piece.codigo, piece]));
    return evaluateModule({ parametros: module.parametros, piezas: module.piezas }, {}).piezas.map((piece) => {
      const source = definition.get(piece.codigo) as { rol: string; permiteRotar: boolean; cantosProvisorios: Record<string, number> };
      const edge = (side: string) => (source.rol === "FRENTE" ? "canto-2" : source.rol === "ESQUELETO" && source.cantosProvisorios[side] ? "canto-045" : null);
      return {
        materialId: source.rol === "FRENTE" ? "frentes" : source.rol === "FONDO" ? "fondo" : "esqueleto",
        largo: piece.largo,
        ancho: piece.ancho,
        cantidad: piece.cantidad,
        permiteRotar: source.permiteRotar,
        nombreProducto: piece.nombre,
        remark: `Modulo ${position + 1}`,
        cantoLargo1Id: edge("LARGO_1"),
        cantoLargo2Id: edge("LARGO_2"),
        cantoAncho1Id: edge("ANCHO_1"),
        cantoAncho2Id: edge("ANCHO_2")
      };
    });
  });
}

// Como lo cargaria un carpintero: una fila por medida, con la cantidad total.
function mergedRows(rows: EstimateRow[]) {
  const merged = new Map<string, EstimateRow>();
  for (const row of rows) {
    const key = [row.materialId, row.largo, row.ancho, row.permiteRotar, row.cantoLargo1Id, row.cantoLargo2Id, row.cantoAncho1Id, row.cantoAncho2Id].join("|");
    const current = merged.get(key);
    if (current) current.cantidad = Number(current.cantidad) + Number(row.cantidad);
    else merged.set(key, { ...row, nombreProducto: "Pieza", remark: null });
  }
  return [...merged.values()];
}

const units = (rows: EstimateRow[]) => rows.flatMap((row) => Array.from({ length: Number(row.cantidad) }, () => ({ ...row, cantidad: 1 })));

function shuffle<T>(items: T[], seed: number) {
  let state = seed >>> 0;
  const random = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

const estimate = (rows: EstimateRow[]) => computeOrderEstimate({ rows, plates, cantos, optimizerSettings, budgetSettings });

function signature(rows: EstimateRow[]) {
  const result = estimate(rows);
  return {
    totales: result.totales,
    porMaterial: result.porMaterial
      .map((material) => ({ materialId: material.materialId, placas: material.placas, mm2: material.mm2, totalCentavos: material.totalCentavos, cantos: material.cantos }))
      .sort((a, b) => (a.materialId < b.materialId ? -1 : 1)),
    porCanto: result.porCanto,
    errores: result.errores
  };
}

test("presupuesto de una cocina de modulos: igual a mano, fusionado, de a una pieza o en cualquier orden", () => {
  const rows = moduleRows(["BAJO_MESADA_2_PUERTAS", "CAJONERA_3_CAJONES", "ALACENA_2_PUERTAS", "ALACENA_2_PUERTAS", "MODULO_MICROONDAS"]);
  const base = signature(rows);
  assert.deepEqual(base.errores, []);
  assert.ok(base.totales.placasEstimadas > 0);

  const forms: Array<[string, EstimateRow[]]> = [
    ["fusionado", mergedRows(rows)],
    ["de a una pieza", units(rows)],
    ["invertido", [...rows].reverse()],
    ["barajado", shuffle(rows, 11)],
    ["fusionado y barajado", shuffle(mergedRows(rows), 12)]
  ];
  for (const [label, form] of forms) assert.deepEqual(signature(form), base, label);
});

test("los totales son la suma exacta de los materiales", () => {
  const result = estimate(moduleRows(["BAJO_MESADA_1_PUERTA", "ALACENA_3_PUERTAS", "ESPECIERO"]));
  const total = result.porMaterial.reduce((sum, material) => sum + material.totalCentavos, 0);
  assert.equal(result.totales.presupuestoEstimado, total / 100);
  assert.equal(
    toCentavos(result.totales.presupuestoEstimado),
    toCentavos(result.totales.costoPlacas) + toCentavos(result.totales.costoManoObraCortes) + toCentavos(result.totales.costoCantos)
  );
});

test("los cantos se cuentan en mm enteros: una fila x3 da lo mismo que tres filas x1", () => {
  // Con la suma en coma flotante, este frente daba 6.677999999999999 m y 6.678 m segun como se cargara.
  const front: EstimateRow = {
    materialId: "frentes",
    largo: 716,
    ancho: 397,
    cantidad: 3,
    permiteRotar: false,
    cantoLargo1Id: "canto-2",
    cantoLargo2Id: "canto-2",
    cantoAncho1Id: "canto-2",
    cantoAncho2Id: "canto-2"
  };
  const one = computeOrderEstimate({ rows: [front], plates, cantos, optimizerSettings, budgetSettings: { ...budgetSettings, manoObraCanto2Mm: 450.5 } });
  const three = computeOrderEstimate({ rows: units([front]), plates, cantos, optimizerSettings, budgetSettings: { ...budgetSettings, manoObraCanto2Mm: 450.5 } });

  assert.deepEqual(three.totales, one.totales);
  assert.equal(one.totales.metrosCanto, 6.678);
  // 6678 mm x $1450,01 = $9683,1668 -> $9683,17; 6678 mm x $450,50 = $3008,439 -> $3008,44
  assert.equal(one.totales.costoMaterialCantos, 9683.17);
  assert.equal(one.totales.costoPegadoCantos, 3008.44);
});

test("errores: material inexistente y piezas que no entran en la placa", () => {
  const result = computeOrderEstimate({
    rows: [
      { materialId: "fantasma", largo: 500, ancho: 500, cantidad: 1, permiteRotar: false },
      { materialId: "esqueleto", largo: 3000, ancho: 500, cantidad: 1, permiteRotar: false }
    ],
    plates,
    cantos,
    optimizerSettings,
    budgetSettings
  });
  assert.deepEqual(
    result.errores.map((error) => [error.tipo, error.mensaje]),
    [
      ["MATERIAL_INEXISTENTE", "Material no encontrado para calcular presupuesto."],
      ["NO_ENTRA", "Hay piezas que no entran en la placa Blanco 18."]
    ]
  );
});

test("faltante de stock cuando las placas superan el stock del material", () => {
  const rows: EstimateRow[] = [{ materialId: "esqueleto", largo: 2500, ancho: 1700, cantidad: 3, permiteRotar: false }];
  const conStock = computeOrderEstimate({ rows, plates, cantos, optimizerSettings, budgetSettings });
  const sinStock = computeOrderEstimate({ rows, plates: plates.map((plate) => ({ ...plate, stockPlacas: 2 })), cantos, optimizerSettings, budgetSettings });
  assert.equal(conStock.totales.placasEstimadas, 3);
  assert.equal(conStock.faltanteStock, false);
  assert.equal(sinStock.faltanteStock, true);
});

test("superficie por material en mm² enteros: la suma exacta de las piezas, sin importar como se carguen", () => {
  const rows: EstimateRow[] = [
    { materialId: "esqueleto", largo: 720, ancho: 560, cantidad: 2, permiteRotar: false },
    { materialId: "esqueleto", largo: 545, ancho: 1164, cantidad: 3, permiteRotar: true },
    { materialId: "fondo", largo: 717, ancho: 1197, cantidad: 1, permiteRotar: false }
  ];
  const result = estimate(rows);
  const mm2 = Object.fromEntries(result.porMaterial.map((material) => [material.materialId, material.mm2]));
  assert.deepEqual(mm2, { esqueleto: 720 * 560 * 2 + 545 * 1164 * 3, fondo: 717 * 1197 });
  assert.ok(Object.values(mm2).every(Number.isInteger));
  // La pieza rotable cargada al reves (ancho por largo) y de a una da la misma superficie.
  const swapped = estimate([rows[0], { ...rows[1], largo: 1164, ancho: 545, cantidad: 1 }, { ...rows[1], largo: 1164, ancho: 545, cantidad: 2 }, rows[2]]);
  assert.deepEqual(Object.fromEntries(swapped.porMaterial.map((material) => [material.materialId, material.mm2])), mm2);
});
