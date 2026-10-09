import assert from "node:assert/strict";
import test from "node:test";
import {
  changedOrderData,
  describeChanges,
  hasChanges,
  matchHardware,
  matchRows,
  resolveHardwareEdit,
  samePiece,
  summarizeChanges,
  type ComparablePiece,
  type HardwareEditModel,
  type SavedHardware
} from "./moduleOrderChanges.ts";
import { hardwareCost } from "./orderEstimate.ts";

const piece = (id: string, patch: Partial<Omit<ComparablePiece, "id">> = {}) => ({
  id,
  pedidoModuloId: "m1" as string | null,
  materialId: "placa-blanca",
  largo: 720,
  ancho: 560,
  cantidad: 2,
  cantoLargo1Id: "canto-blanco",
  cantoLargo2Id: null,
  cantoAncho1Id: null,
  cantoAncho2Id: null,
  permiteRotar: false,
  nombreProducto: "Lateral",
  ...patch
});

test("misma pieza: los textos del formulario y los numeros de la base dan igual", () => {
  assert.equal(samePiece(piece("a"), { ...piece("a"), largo: "720", ancho: "560", cantidad: "2" }), true);
  assert.equal(samePiece(piece("a", { nombreProducto: null }), piece("a", { nombreProducto: "  " })), true, "sin nombre y vacio son lo mismo");
  assert.equal(samePiece(piece("a", { cantoAncho1Id: null }), piece("a", { cantoAncho1Id: "" })), true);
  assert.equal(samePiece(piece("a"), piece("a", { largo: 721 })), false);
  assert.equal(samePiece(piece("a"), piece("a", { cantoLargo2Id: "canto-negro" })), false, "un canto cambiado es un cambio");
  assert.equal(samePiece(piece("a"), piece("a", { permiteRotar: true })), false);
  assert.equal(samePiece(piece("a"), piece("a", { materialId: "placa-negra" })), false);
});

test("emparejar: la primera copia de un id es la pieza; las demas, agregadas", () => {
  const saved = [piece("a"), piece("b"), piece("c", { pedidoModuloId: null })];
  const { matches, removed } = matchRows(saved, [
    piece("a"),
    piece("a", { cantidad: 3 }), // Duplicar copia el id
    piece("b", { largo: 700 }),
    { ...piece("x"), id: undefined }, // nueva
    piece("zz"), // un id que ya no esta guardado
  ]);
  assert.deepEqual(
    matches.map((match) => (match.kind === "kept" ? `${match.saved.id}:${match.changed ? "cambio" : "igual"}` : "nueva")),
    ["a:igual", "nueva", "b:cambio", "nueva", "nueva"]
  );
  assert.deepEqual(removed.map((row) => row.id), ["c"]);
});

test("emparejar: una pieza pasada a otro modulo cuenta como agregada y la original como eliminada", () => {
  const { matches, removed } = matchRows([piece("a")], [piece("a", { pedidoModuloId: "m2" })]);
  assert.deepEqual(matches.map((match) => match.kind), ["added"]);
  assert.deepEqual(removed.map((row) => row.id), ["a"]);
});

test("datos del cliente que cambiaron", () => {
  const saved = { cliente: "Cliente", numeroContacto: "2664000000", emailContacto: null, direccionEntrega: "", fechaEntrega: "2026-10-20", observaciones: "Cocina" };
  assert.deepEqual(changedOrderData(saved, { ...saved, emailContacto: "", direccionEntrega: null }), [], "vacio y sin cargar son lo mismo");
  assert.deepEqual(changedOrderData(saved, { ...saved, cliente: " Cliente " }), [], "los espacios de los bordes no cuentan");
  assert.deepEqual(changedOrderData(saved, { ...saved, numeroContacto: "2664111111", fechaEntrega: "2026-10-22", observaciones: "Cocina y lavadero" }), [
    "el teléfono",
    "la fecha de entrega",
    "la referencia"
  ]);
});

test("resumen de cambios en una linea", () => {
  const data = { cliente: "Cliente", numeroContacto: "2664000000", fechaEntrega: "2026-10-20" };
  const saved = { data, rows: [piece("a"), piece("b"), piece("c")] };
  const sinCambios = summarizeChanges(saved, { data, rows: [piece("a"), piece("b"), piece("c")] });
  assert.equal(hasChanges(sinCambios), false);
  assert.equal(describeChanges(sinCambios), "");

  const cambios = summarizeChanges(saved, {
    data: { ...data, numeroContacto: "2664111111", fechaEntrega: "2026-10-22" },
    rows: [piece("a", { cantidad: 4 }), piece("b", { cantoAncho2Id: "canto-negro" }), { ...piece("n"), id: undefined }]
  });
  assert.deepEqual(cambios, { modificadas: 2, agregadas: 1, eliminadas: 1, datos: ["el teléfono", "la fecha de entrega"] });
  assert.equal(hasChanges(cambios), true);
  assert.equal(describeChanges(cambios), "2 piezas modificadas, 1 pieza agregada y 1 pieza eliminada; cambió el teléfono y la fecha de entrega");
  assert.equal(describeChanges({ modificadas: 1, agregadas: 0, eliminadas: 0, datos: [] }), "1 pieza modificada");
  assert.equal(describeChanges({ modificadas: 0, agregadas: 0, eliminadas: 2, datos: ["el cliente"] }), "2 piezas eliminadas; cambió el cliente");
  assert.equal(describeChanges({ modificadas: 0, agregadas: 0, eliminadas: 0, datos: ["el email"] }), "cambió el email");
});

// ---------------------------------------------------------------- herrajes (F6.4)

const guardado = (id: string, patch: Partial<SavedHardware> = {}): SavedHardware => ({
  id,
  pedidoModuloId: "m1",
  herrajeId: "comun",
  nombre: "Cazoleta común",
  unidad: "unidad",
  tipo: "Bisagra",
  linea: null,
  medidaMm: null,
  cantidad: 4,
  valorUnitario: 850,
  origen: "CALCULADO",
  ...patch
});
const modelo = (id: string, nombre: string, valor: number, activo = true): HardwareEditModel => ({ id, nombre, unidad: "unidad", tipo: "Bisagra", linea: null, medidaMm: null, valor, activo });
const MODELOS = new Map([modelo("comun", "Cazoleta común", 1000), modelo("suave", "Cierre suave", 1900), modelo("vieja", "Bisagra vieja", 500, false)].map((item) => [item.id, item]));

test("herrajes: emparejar por id y contar los cambios", () => {
  const saved = [guardado("h1"), guardado("h2", { herrajeId: "suave", cantidad: 2 }), guardado("h3", { pedidoModuloId: "m2" })];
  const { matches, removed } = matchHardware(saved, [
    { id: "h1", pedidoModuloId: "m1", herrajeId: "comun", cantidad: 4 },
    { id: "h2", pedidoModuloId: "m1", herrajeId: "suave", cantidad: 3 },
    { id: null, pedidoModuloId: "m1", herrajeId: "comun", cantidad: 1 }
  ]);
  assert.deepEqual(
    matches.map((match) => (match.kind === "kept" ? `${match.saved.id}:${match.changed ? "cambio" : "igual"}` : "nuevo")),
    ["h1:igual", "h2:cambio", "nuevo"]
  );
  assert.deepEqual(removed.map((item) => item.id), ["h3"]);

  const data = { cliente: "Cliente", numeroContacto: "2664000000" };
  const sinHerrajes = summarizeChanges({ data, rows: [], herrajes: saved }, { data, rows: [] });
  assert.equal(hasChanges(sinHerrajes), false, "sin herrajes en la edicion (apagados) no hay cambios");
  const iguales = summarizeChanges({ data, rows: [], herrajes: saved }, { data, rows: [], herrajes: saved });
  assert.equal(hasChanges(iguales), false);
  const cambios = summarizeChanges(
    { data, rows: [], herrajes: saved },
    { data, rows: [], herrajes: [{ ...saved[0], cantidad: 6 }, { id: null, pedidoModuloId: "m2", herrajeId: "suave", cantidad: 1 }] }
  );
  assert.deepEqual(cambios.herrajes, { modificados: 1, agregados: 1, quitados: 2 });
  assert.equal(hasChanges(cambios), true);
  assert.equal(describeChanges(cambios), "1 herraje modificado, 1 herraje agregado y 2 herrajes quitados");
  assert.equal(
    describeChanges({ modificadas: 1, agregadas: 0, eliminadas: 0, datos: ["el teléfono"], herrajes: { modificados: 0, agregados: 2, quitados: 0 } }),
    "1 pieza modificada y 2 herrajes agregados; cambió el teléfono"
  );
});

test("herrajes al guardar la edicion: copia guardada, modelo de hoy y origen (DECISIONES 57)", () => {
  const saved = [guardado("h1"), guardado("h2", { herrajeId: "suave", nombre: "Cierre suave", valorUnitario: 1500, cantidad: 2, origen: "MANUAL" }), guardado("h3")];
  const { rows, problems } = resolveHardwareEdit(
    saved,
    [
      { id: "h1", pedidoModuloId: "m1", herrajeId: "comun", cantidad: 4 }, // igual: queda como estaba
      { id: "h2", pedidoModuloId: "m1", herrajeId: "suave", cantidad: 3 }, // otra cantidad: sigue MANUAL y con su precio
      { id: "h3", pedidoModuloId: "m1", herrajeId: "suave", cantidad: 4 }, // otro modelo: el de hoy, EDITADO
      { id: null, pedidoModuloId: "m2", herrajeId: "comun", cantidad: 2 }, // lo del catalogo: CALCULADO
      { id: null, pedidoModuloId: "m2", herrajeId: "comun", cantidad: 2 }, // otro igual, que el catalogo no da: MANUAL
      { id: null, pedidoModuloId: "m2", herrajeId: "vieja", cantidad: 1 }, // inactivo
      { id: null, pedidoModuloId: "m2", herrajeId: "borrada", cantidad: 1 } // no existe
    ],
    MODELOS,
    [{ pedidoModuloId: "m2", herrajeId: "comun", cantidad: 2 }]
  );
  assert.deepEqual(
    rows.map((row) => [row.pedidoModuloId, row.nombre, row.cantidad, row.valorUnitario, row.origen, row.orden]),
    [
      ["m1", "Cazoleta común", 4, 850, "CALCULADO", 1],
      ["m1", "Cierre suave", 3, 1500, "MANUAL", 2],
      ["m1", "Cierre suave", 4, 1900, "EDITADO", 3],
      ["m2", "Cazoleta común", 2, 1000, "CALCULADO", 1],
      ["m2", "Cazoleta común", 2, 1000, "MANUAL", 2]
    ]
  );
  assert.deepEqual(problems, [
    { index: 5, mensaje: 'el herraje "Bisagra vieja" está inactivo. Elegí otro modelo.' },
    { index: 6, mensaje: "ese herraje ya no existe. Elegí otro modelo." }
  ]);
  // Uno guardado cuyo modelo se borro (herrajeId null) sigue como esta si no se toca.
  const borrado = resolveHardwareEdit([guardado("h9", { herrajeId: null })], [{ id: "h9", pedidoModuloId: "m1", herrajeId: null, cantidad: 4 }], MODELOS);
  assert.deepEqual([borrado.rows[0].nombre, borrado.problems.length], ["Cazoleta común", 0]);
});

test("costo de herrajes: en centavos, como el presupuesto", () => {
  assert.equal(hardwareCost([]), 0);
  assert.equal(hardwareCost([{ cantidad: 3, valorUnitario: 0.1 }, { cantidad: 4, valorUnitario: 850 }]), 3400.3);
  assert.equal(hardwareCost([{ cantidad: 7, valorUnitario: 1234.565 }]), 8641.99);
});
