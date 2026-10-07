import assert from "node:assert/strict";
import test from "node:test";
import { changedOrderData, describeChanges, hasChanges, matchRows, samePiece, summarizeChanges, type ComparablePiece } from "./moduleOrderChanges.ts";

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
