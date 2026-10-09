import assert from "node:assert/strict";
import test from "node:test";
import { compactTable, edgeSummary, labeledMeasures, pieceMark, workshopRows, workshopSheets, type WorkshopEdge } from "./moduleWorkshop.ts";

const row = (patch: Record<string, unknown>) =>
  ({
    materialId: "blanco",
    cantoLargo1Id: null,
    cantoLargo2Id: null,
    cantoAncho1Id: null,
    cantoAncho2Id: null,
    orden: 0,
    indice: 0,
    pedidoModuloId: null,
    ...patch
  }) as never;

test("hojas: una por módulo, en orden, y las adicionales al final", () => {
  const modulos = [{ id: "m2", posicion: 2 }, { id: "m1", posicion: 1 }] as never;
  const detalles = [
    row({ codigo: "a1", pedidoModuloId: null, orden: 1, indice: 0 }),
    row({ codigo: "m1-nueva", pedidoModuloId: "m1", orden: 11, indice: 1 }),
    row({ codigo: "m1-1", pedidoModuloId: "m1", orden: 1, indice: 2 }),
    row({ codigo: "m2-1", pedidoModuloId: "m2", orden: 1, indice: 3 })
  ];
  const sheets = workshopSheets({ modulos, detalles });
  assert.deepEqual(
    sheets.map((sheet) => [sheet.titulo, sheet.rows.map((r) => (r as unknown as { codigo: string }).codigo)]),
    [
      ["Módulo 1 de 2", ["m1-1", "m1-nueva"]],
      ["Módulo 2 de 2", ["m2-1"]],
      ["Piezas adicionales", ["a1"]]
    ]
  );
  assert.equal(workshopSheets({ modulos, detalles: detalles.slice(1) }).length, 2, "sin adicionales, sin hoja extra");
  assert.deepEqual(workshopRows([row({ orden: 2, indice: 0 }), row({ orden: 1, indice: 5 }), row({ orden: 1, indice: 1 })]).map((r) => r.indice), [1, 5, 0]);
});

test("cantos: lados y espesor, y el color cuando no es el de la placa", () => {
  const edges = new Map<string, WorkshopEdge>([
    ["c-blanco-045", { espesorMm: 0.45, placaMaterialId: "blanco", color: "Blanco" }],
    ["c-blanco-2", { espesorMm: 2, placaMaterialId: "blanco", color: "Blanco" }],
    ["c-negro-2", { espesorMm: 2, placaMaterialId: "negro", color: "Negro" }]
  ]);
  assert.equal(edgeSummary(row({ cantoLargo1Id: "c-blanco-2", cantoLargo2Id: "c-blanco-2", cantoAncho1Id: "c-blanco-2", cantoAncho2Id: "c-blanco-2" }), edges), "L1 L2 A1 A2 (2 mm)");
  assert.equal(edgeSummary(row({ cantoLargo1Id: "c-blanco-045" }), edges), "L1 (0,45 mm)");
  assert.equal(edgeSummary(row({ cantoLargo1Id: "c-blanco-045", cantoAncho1Id: "c-blanco-2", cantoAncho2Id: "c-blanco-2" }), edges), "L1 (0,45 mm) · A1 A2 (2 mm)");
  assert.equal(edgeSummary(row({ cantoLargo1Id: "c-negro-2" }), edges), "L1 (2 mm, Negro)", "otro color que la placa");
  assert.equal(edgeSummary(row({ cantoLargo1Id: "viejo", cantoLargo1Nombre: "Canto Roble 1mm" }), edges), "L1 (Canto Roble 1mm)", "un canto que ya no está");
  assert.equal(edgeSummary(row({}), edges), "Sin canto");
});

test("marcas y tabla apretada", () => {
  assert.equal(pieceMark("EDITADO"), "Editada");
  assert.equal(pieceMark("MANUAL"), "Agregada");
  assert.equal(pieceMark("CALCULADO"), "");
  assert.equal(pieceMark(null), "");
  assert.equal(compactTable(18), false);
  assert.equal(compactTable(19), true);
});

test("medidas con su nombre", () => {
  const param = (clave: string, etiqueta: string, tipo: string, orden: number) => ({ clave, etiqueta, tipo, orden });
  const modulo = {
    valores: { ANCHO: 2600, ALTO: 2400, PROFUNDIDAD: 600, ALTO_BAULERA: 432, PUERTAS: 3 },
    definicionSnapshot: { parametros: [param("alto", "Alto", "MEDIDA", 2), param("ancho", "Ancho", "MEDIDA", 1), param("puertas", "Puertas", "ENTERO", 3), param("profundidad", "Profundidad", "MEDIDA", 3), param("alto_baulera", "Alto baulera", "MEDIDA", 4)] }
  } as never;
  assert.equal(labeledMeasures(modulo), "Ancho 2.600 · Alto 2.400 · Profundidad 600 · Alto baulera 432 mm");
  assert.equal(labeledMeasures({ valores: {}, definicionSnapshot: { parametros: [] } } as never), "");
});

test("hojas: los herrajes de cada módulo en su orden; la de piezas adicionales no lleva", () => {
  const modulos = [{ id: "m1", posicion: 1 }, { id: "m2", posicion: 2 }] as never;
  const detalles = [row({ pedidoModuloId: null }), row({ pedidoModuloId: "m1" })];
  const herraje = (id: string, pedidoModuloId: string, orden: number) => ({ id, pedidoModuloId, orden }) as never;
  const sheets = workshopSheets({ modulos, detalles, herrajes: [herraje("b", "m1", 2), herraje("c", "m2", 1), herraje("a", "m1", 1)] });
  assert.deepEqual(
    sheets.map((sheet) => sheet.herrajes.map((item) => item.id)),
    [["a", "b"], ["c"], []]
  );
  assert.deepEqual(workshopSheets({ modulos, detalles }).map((sheet) => sheet.herrajes.length), [0, 0, 0], "sin herrajes guardados");
});
