import assert from "node:assert/strict";
import test from "node:test";
import { emptyHardwareForm, groupByType, hardwareLabel, hardwareLineSummary, readHardwareForm } from "./hardware.ts";

test("formulario de herraje: las mismas reglas que el servidor", () => {
  const ok = readHardwareForm({ ...emptyHardwareForm("t1"), nombre: " Corredera telescópica 400 ", unidad: "par", valor: "9800,5", linea: "Telescópica", medidaMm: "400" });
  assert.deepEqual(ok, { problems: [], input: { nombre: "Corredera telescópica 400", tipoId: "t1", unidad: "par", valor: 9800.5, linea: "Telescópica", medidaMm: 400, formulaCantidadDefecto: null, formulaMedidaDefecto: null } });
  assert.deepEqual(readHardwareForm({ ...emptyHardwareForm(), nombre: "B", valor: "" }).problems, [
    "Escribí el nombre del herraje (al menos 2 caracteres).",
    "Elegí el tipo de herraje.",
    "Cargá el precio (un número, 0 o más)."
  ]);
  assert.deepEqual(readHardwareForm({ ...emptyHardwareForm("t1"), nombre: "Corredera", valor: "10", medidaMm: "400" }).problems, ["Un herraje con medida tiene que tener su línea (por ejemplo, Telescópica)."]);
  assert.equal(readHardwareForm({ ...emptyHardwareForm("t1"), nombre: "Pata", valor: "0", linea: "  " }).input?.linea, null);
});

test("agrupar por tipo, sin tipo al final", () => {
  const h = (id: string, tipo: string | null) => ({ id, tipo: tipo ? { id: tipo, nombre: tipo, activo: true } : null }) as never;
  const groups = groupByType([h("a", "Bisagra"), h("b", null), h("c", "Corredera"), h("d", "Bisagra")]);
  assert.deepEqual(
    groups.map((group) => [group.tipo, group.herrajes.map((item: { id: string }) => item.id)]),
    [
      ["Bisagra", ["a", "d"]],
      ["Corredera", ["c"]],
      ["Sin tipo", ["b"]]
    ]
  );
});

test("línea de herraje del módulo: cómo queda con las medidas de prueba", () => {
  const byId = new Map([
    ["b", { nombre: "Cazoleta común" }],
    ["t350", { nombre: "Telescópica 350" }],
    ["t450", { nombre: "Telescópica 450" }]
  ]);
  const line = (patch: object) => ({ herrajeId: "b", elegidoId: "b", cantidad: 4, medidaNecesaria: null, eleccion: "POR_DEFECTO" as const, error: null, ...patch });
  assert.equal(hardwareLineSummary(line({}), byId), "4 × Cazoleta común");
  assert.equal(hardwareLineSummary(line({ elegidoId: "t450", cantidad: 3, medidaNecesaria: 530, eleccion: "POR_MEDIDA" }), byId), "3 × Telescópica 450 · necesita 530 mm: la más larga que entra");
  assert.equal(
    hardwareLineSummary(line({ elegidoId: "t350", cantidad: 3, medidaNecesaria: 300, eleccion: "MAS_CHICO" }), byId),
    "3 × Telescópica 350 · necesita 300 mm: ninguna entra, va la más chica (se cambia en la solicitud)"
  );
  assert.equal(hardwareLineSummary(line({ elegidoId: null }), byId), "Elegí el modelo por defecto.");
  assert.equal(hardwareLineSummary(line({ error: "Cantidad: No existe la medida X" }), byId), "Cantidad: No existe la medida X");
  assert.equal(hardwareLabel({ nombre: "Telescópica", medidaMm: 400, activo: true }), "Telescópica · 400 mm");
  assert.equal(hardwareLabel({ nombre: "Telescópica 400", medidaMm: 400, activo: false }), "Telescópica 400 (inactivo)");
});

test("fórmulas por defecto del herraje (punto 2): opcionales y que se puedan leer", () => {
  const base = { ...emptyHardwareForm("t1"), nombre: "Corredera", valor: "10" };
  const ok = readHardwareForm({ ...base, formulaCantidad: " FONDO_CAJ.cant ", formulaMedida: "PROFUNDIDAD - 50" });
  assert.deepEqual([ok.input?.formulaCantidadDefecto, ok.input?.formulaMedidaDefecto], ["FONDO_CAJ.cant", "PROFUNDIDAD - 50"]);
  assert.equal(readHardwareForm(base).input?.formulaCantidadDefecto, null, "vacía queda null");
  const mala = readHardwareForm({ ...base, formulaCantidad: "PUERTAS.cant *" });
  assert.equal(mala.input, null);
  assert.match(mala.problems[0], /^La cantidad por defecto no se puede leer/);
});
