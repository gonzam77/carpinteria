import assert from "node:assert/strict";
import test from "node:test";
import { adjustedCells, applyAdjustments, describeAdjustments, emptyAdjustments, machineRow, normalizeAdjustments, readAdjustments } from "./machine-excel.js";

const pieza = (codigoBarra: string, extra: Record<string, unknown> = {}) =>
  machineRow({
    codigoBarra,
    material: "Blanco mdf",
    largo: 720,
    ancho: 560,
    cantidad: 2,
    cantoLargo1: true,
    cantoLargo2: false,
    cantoAncho1: false,
    cantoAncho2: false,
    cantoLargo1Nombre: "Canto blanco 0,45",
    permiteRotar: false,
    remark: "Lateral",
    nombreProducto: "Lateral",
    ...extra
  });

test("Excel de corte: la fila de una pieza, como siempre", () => {
  const row = pieza("M1-01-01");
  assert.equal(row["codigo barra"], "M1-01-01");
  assert.equal(row["canto largo 1"], "Canto blanco 0,45");
  assert.equal(row["canto largo 2"], "");
  assert.equal(row["permite rotar"], "false");
  assert.equal("blank1" in row, false, "las columnas vacias de la maquina no se completan");
});

test("ajustes del Excel (punto 5): celdas cambiadas, columnas agregadas y lo que se guarda", () => {
  const base = [pieza("A"), pieza("B")];
  const columna = { id: "col-caja", titulo: "Caja" };
  const guardado = normalizeAdjustments(
    {
      columnas: [{ ...columna, titulo: " Caja " }],
      celdas: {
        A: { largo: "700", Remark: "Lateral", "col-caja": "3" }, // el remark igual al de la pieza no se guarda
        B: { "nombre producto": "Lateral izq.", "col-caja": "  " }, // una columna agregada vacia no se guarda
        Z: { largo: "1" }, // una fila que ya no esta
        AA: {}
      }
    },
    base
  );
  assert.deepEqual(guardado, { version: 1, columnas: [columna], celdas: { A: { largo: "700", "col-caja": "3" }, B: { "nombre producto": "Lateral izq." } } });
  const aplicadas = applyAdjustments(base, guardado);
  assert.equal(aplicadas[0].largo, 700, "largo, ancho y cantidad van como numero");
  assert.equal(aplicadas[0]["col-caja"], "3");
  assert.equal(aplicadas[1]["col-caja"], "", "la columna agregada esta en todas las filas");
  assert.equal(aplicadas[1]["nombre producto"], "Lateral izq.");
  assert.deepEqual(adjustedCells(guardado), { total: 2, critical: 1 }, "el largo cambia lo que se corta");
  assert.equal(normalizeAdjustments({ columnas: [], celdas: { A: { largo: "720,0" } } }, base).celdas.A, undefined, "720,0 es el mismo largo");
});

test("ajustes del Excel: lo guardado se lee con cuidado y el historial dice que cambio", () => {
  assert.deepEqual(readAdjustments(null), emptyAdjustments());
  assert.deepEqual(readAdjustments({ columnas: "x", celdas: null }), emptyAdjustments());
  const antes = { version: 1 as const, columnas: [{ id: "col-a", titulo: "Caja" }], celdas: { A: { largo: "700" } } };
  const despues = { version: 1 as const, columnas: [{ id: "col-a", titulo: "Caja N°" }, { id: "col-b", titulo: "Pallet" }], celdas: { A: { largo: "700", ancho: "500" } } };
  assert.equal(describeAdjustments(antes, despues), "2 celdas modificadas en total; columna agregada: Pallet; columna renombrada: Caja N°");
  assert.equal(describeAdjustments(despues, emptyAdjustments()), "se restauraron todas las celdas; columnas quitadas: Caja N°, Pallet");
  assert.equal(describeAdjustments(antes, antes), "", "sin cambios no hay nada que guardar");
});
