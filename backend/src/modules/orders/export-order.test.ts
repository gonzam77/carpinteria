import assert from "node:assert/strict";
import test from "node:test";
import { exportFileName, machineRows } from "./export-order.js";

const fila = (codigo: string, indice: number, orden: number, posicion: number | null) => ({ codigo, indice, orden, pedidoModulo: posicion === null ? null : { posicion } });

test("corte: las filas salen tal cual (por indice, como siempre)", () => {
  const detalles = [fila("b", 0, 5, null), fila("a", 1, 0, null), fila("c", 2, 0, null)];
  assert.equal(machineRows({ tipo: "CORTE", detalles }), detalles, "el mismo arreglo, sin ordenar");
});

test("módulos: por posición del módulo y orden de la pieza, adicionales al final (spec §11.1)", () => {
  const detalles = [
    fila("adicional-2", 0, 2, null),
    fila("m2-1", 1, 1, 2),
    fila("m1-nueva", 2, 11, 1), // agregada en la edición arriba de todo: va al final de su módulo
    fila("m1-1", 3, 1, 1),
    fila("adicional-1", 4, 1, null),
    fila("m1-2", 5, 2, 1)
  ];
  assert.deepEqual(
    machineRows({ tipo: "MODULOS", detalles }).map((detalle) => detalle.codigo),
    ["m1-1", "m1-2", "m1-nueva", "m2-1", "adicional-1", "adicional-2"]
  );
  assert.equal(detalles[0].codigo, "adicional-2", "no cambia el arreglo original");
});

test("nombre del archivo", () => {
  assert.equal(exportFileName([{ tipo: "MODULOS", numero: 1044 }]), "pedido-M1044.xlsx");
  assert.equal(exportFileName([{ tipo: "CORTE", numero: 7 }]), "pedidos-carpinteria.xlsx");
  assert.equal(exportFileName([{ tipo: "MODULOS", numero: 1 }, { tipo: "MODULOS", numero: 2 }]), "pedidos-carpinteria.xlsx");
  assert.equal(exportFileName([]), "pedidos-carpinteria.xlsx");
});
