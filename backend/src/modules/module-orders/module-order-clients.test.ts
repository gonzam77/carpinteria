import assert from "node:assert/strict";
import test from "node:test";
import { uniqueClients } from "./module-order-clients.js";

const row = (cliente: string, numeroContacto: string, emailContacto: string | null = null, direccionEntrega: string | null = null) => ({ cliente, numeroContacto, emailContacto, direccionEntrega });

test("clientes para autocompletar: uno por nombre y teléfono, con los datos más recientes", () => {
  const result = uniqueClients([
    row("Cliente Uno ", "2664 000-000", null, "Calle 1"),
    row("cliente uno", "2664000000", "uno@example.com", "Calle vieja"),
    row("Cliente Dos", "2664111111"),
    row("Cliente Uno", "2664999999")
  ]);
  assert.deepEqual(result, [
    row("Cliente Uno", "2664 000-000", "uno@example.com", "Calle 1"),
    row("Cliente Dos", "2664111111"),
    row("Cliente Uno", "2664999999")
  ]);
  assert.equal(uniqueClients(Array.from({ length: 20 }, (_, i) => row(`C${i}`, `26640000${i}`)), 8).length, 8);
});
