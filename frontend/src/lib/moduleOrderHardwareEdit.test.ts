import assert from "node:assert/strict";
import test from "node:test";
import { hardwareLinesError, hardwareLinesFromOrder, hardwareLinesPayload, resolveEditLines, type EditHardwareLine } from "./moduleOrderHardwareEdit.ts";
import type { Hardware, OrderHardware } from "../types/index.ts";

const modelo = (id: string, nombre: string, valor: number, activo = true): Hardware => ({
  id,
  nombre,
  unidad: "unidad",
  valor,
  activo,
  tipoId: "bisagra",
  tipo: { id: "bisagra", nombre: "Bisagra", activo: true },
  linea: null,
  medidaMm: null,
  formulaCantidadDefecto: null,
  formulaMedidaDefecto: null,
  usoModulos: 0,
  usoSolicitudes: 0,
  canDeletePermanently: false
});
const MODELOS = [modelo("comun", "Cazoleta común", 1000), modelo("suave", "Cierre suave", 1900), modelo("vieja", "Bisagra vieja", 500, false)];
const GUARDADOS: OrderHardware[] = [
  { id: "h1", pedidoModuloId: "m1", herrajeId: "comun", nombre: "Cazoleta común", unidad: "unidad", tipo: "Bisagra", linea: null, medidaMm: null, cantidad: 4, valorUnitario: 850, orden: 1, origen: "CALCULADO" }
];

test("edición de herrajes: lo guardado conserva su precio, lo nuevo va con el de hoy, y el costo es el del servidor", () => {
  const lines: EditHardwareLine[] = [...hardwareLinesFromOrder(GUARDADOS), { key: "n1", id: null, pedidoModuloId: "m2", herrajeId: "suave", cantidad: 2 }];
  assert.deepEqual(lines[0], { key: "h1", id: "h1", pedidoModuloId: "m1", herrajeId: "comun", cantidad: 4 });
  const { byLine, costo } = resolveEditLines(GUARDADOS, lines, MODELOS);
  assert.deepEqual(
    byLine.map(({ row }) => [row?.nombre, row?.valorUnitario, row?.origen]),
    [
      ["Cazoleta común", 850, "CALCULADO"],
      ["Cierre suave", 1900, "MANUAL"]
    ]
  );
  assert.equal(costo, 4 * 850 + 2 * 1900);
  assert.deepEqual(hardwareLinesPayload(lines)[1], { id: null, pedidoModuloId: "m2", herrajeId: "suave", cantidad: 2 }, "sin la clave de la lista");
});

test("edición de herrajes: problemas por línea y el primero para avisar", () => {
  const posiciones = new Map([
    ["m1", 1],
    ["m2", 2]
  ]);
  const lines: EditHardwareLine[] = [
    { key: "h1", id: "h1", pedidoModuloId: "m1", herrajeId: "comun", cantidad: 4 },
    { key: "n1", id: null, pedidoModuloId: "m2", herrajeId: "vieja", cantidad: 1 }
  ];
  const resolved = resolveEditLines(GUARDADOS, lines, MODELOS);
  assert.deepEqual(
    resolved.byLine.map(({ problem }) => problem),
    [null, 'el herraje "Bisagra vieja" está inactivo. Elegí otro modelo.']
  );
  assert.equal(resolved.costo, 3400, "lo que tiene problemas no suma");
  assert.equal(hardwareLinesError(lines, posiciones, resolved.problems), 'Herraje 1 del módulo 2: el herraje "Bisagra vieja" está inactivo. Elegí otro modelo.');
  const cero = [{ ...lines[0], cantidad: 0 }];
  assert.equal(hardwareLinesError(cero, posiciones, []), "Herraje 1 del módulo 1: la cantidad tiene que ser un número entero desde 1 (para sacarlo, quitalo).");
  assert.match(hardwareLinesError([{ ...lines[0], cantidad: 2.5 }], posiciones, []), /número entero/);
  assert.match(hardwareLinesError([{ ...lines[0], cantidad: 10000 }], posiciones, []), /máximo 9999/);
  assert.equal(hardwareLinesError(lines.slice(0, 1), posiciones, []), "");
});
