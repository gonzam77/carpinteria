import assert from "node:assert/strict";
import test from "node:test";
import { emptyHardwareForm, groupByType, readHardwareForm } from "./hardware.ts";

test("formulario de herraje: las mismas reglas que el servidor", () => {
  const ok = readHardwareForm({ ...emptyHardwareForm("t1"), nombre: " Corredera telescópica 400 ", unidad: "par", valor: "9800,5", linea: "Telescópica", medidaMm: "400" });
  assert.deepEqual(ok, { problems: [], input: { nombre: "Corredera telescópica 400", tipoId: "t1", unidad: "par", valor: 9800.5, linea: "Telescópica", medidaMm: 400 } });
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
