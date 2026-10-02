// Prueba de punta a punta de F0.5 (reserva de stock exacta) contra el backend local (puerto 4100) y la copia del backup.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = "http://127.0.0.1:4100/api";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-c", sql], { encoding: "utf8" }).trim();
const adminId = psql("select id from usuarios where rol='ADMIN' limit 1");
const token = jwt.sign({ id: adminId, email: "prueba@local", rol: "ADMIN" }, "prueba-local-analisis-0123456789", { expiresIn: "1h" });
const call = async (method, path, body) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures += 1;
};
for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const stockOf = (ids) => Object.fromEntries(ids.map((id) => [id, Number(psql(`select "stockPlacas" from materiales where id='${id}'`))]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const minus = (stock, boards) => Object.fromEntries(Object.entries(stock).map(([id, value]) => [id, value - (boards[id] ?? 0)]));
const status = (id, estado, forceWithoutStock = false) => call("PATCH", `/orders/${id}/status`, { estado, forceWithoutStock });

// Pedido de prueba con las filas de un pedido real cuyos materiales siguen activos.
async function createTestOrder() {
  const orders = (await call("GET", "/orders")).data;
  for (const source of orders) {
    const full = (await call("GET", `/orders/${source.id}`)).data;
    if (full.detalles.length < 3) continue;
    const detalles = full.detalles.map((row) => ({
      materialId: row.materialId, largo: row.largo, ancho: row.ancho, cantidad: row.cantidad, permiteRotar: row.permiteRotar,
      cantoLargo1Id: row.cantoLargo1Id, cantoLargo2Id: row.cantoLargo2Id, cantoAncho1Id: row.cantoAncho1Id, cantoAncho2Id: row.cantoAncho2Id
    }));
    const created = await call("POST", "/orders", { cliente: "Prueba F0.5", numeroContacto: "000000", detalles });
    if (created.status !== 201) continue;
    const boards = Object.fromEntries(created.data.estimacionDetalle.porMaterial.map((item) => [item.materialId, item.placas]));
    const ids = Object.keys(boards);
    const stock = stockOf(ids);
    if (ids.every((id) => stock[id] >= boards[id] + 1)) return { order: created.data, boards, ids };
    await call("DELETE", `/orders/${created.data.id}`);
  }
  throw new Error("No encontre un pedido con stock suficiente para probar");
}

const { order, boards, ids } = await createTestOrder();
const initial = stockOf(ids);
console.log(`pedido de prueba: ${ids.length} materiales, placas ${JSON.stringify(Object.values(boards))}`);

// 1) Reservar, cambiar la configuracion y el orden de las filas, y liberar: el stock vuelve exacto.
check("pendiente -> en proceso", (await status(order.id, "EN_PROCESO")).status === 200);
check("descuenta las placas de la constancia", same(stockOf(ids), minus(initial, boards)));
const summary = (await call("GET", `/orders/${order.id}/materiales`)).data;
check("el listado no marca faltantes por las placas propias", summary.placas.every((placa) => placa.faltantePlacas === 0));
const settings = (await call("GET", "/optimizer-settings")).data;
await call("PUT", "/optimizer-settings", { espesorSierraMm: settings.espesorSierraMm, perfiladoBordeMm: settings.perfiladoBordeMm + 20 });
psql(`update detalle_pedidos set indice = 1000 - indice where "pedidoId" = '${order.id}'`);
check("en proceso -> pendiente", (await status(order.id, "PENDIENTE")).status === 200);
check("devuelve exactamente lo descontado aunque cambiaron la configuracion y el orden", same(stockOf(ids), initial));
await call("PUT", "/optimizer-settings", { espesorSierraMm: settings.espesorSierraMm, perfiladoBordeMm: settings.perfiladoBordeMm });

// 2) Dos cambios de estado simultaneos: uno solo descuenta.
const [a, b] = await Promise.all([status(order.id, "EN_PROCESO"), status(order.id, "EN_PROCESO")]);
check("dos cambios simultaneos: uno pasa y el otro recibe 409", [a.status, b.status].sort().join() === "200,409", `${a.status}/${b.status} ${[a, b].find((r) => r.status === 409)?.data?.code ?? ""}`);
check("y se descuenta una sola vez", same(stockOf(ids), minus(initial, boards)));
await status(order.id, "PENDIENTE");
check("vuelve al stock inicial", same(stockOf(ids), initial));

// 3) Transiciones: pendiente -> terminada consume; terminada <-> en proceso / entregada no reserva de nuevo.
await status(order.id, "TERMINADA");
check("pendiente -> terminada consume stock", same(stockOf(ids), minus(initial, boards)));
await status(order.id, "EN_PROCESO");
await status(order.id, "ENTREGADA");
check("terminada -> en proceso -> entregada no descuenta de nuevo", same(stockOf(ids), minus(initial, boards)));
await status(order.id, "RECHAZADA");
check("entregada -> rechazada devuelve el stock", same(stockOf(ids), initial));
await status(order.id, "PENDIENTE");

// 4) Sin stock: 409 y, a la fuerza, avanza sin descontar y no descuenta despues.
const first = ids[0];
psql(`update materiales set "stockPlacas" = 0 where id = '${first}'`);
const blockedDone = await status(order.id, "TERMINADA");
check("pendiente -> terminada sin stock tambien pide confirmacion", blockedDone.status === 409 && blockedDone.data?.code === "STOCK_SHORTAGE_CONFIRMATION_REQUIRED", blockedDone.data?.message);
const blocked = await status(order.id, "EN_PROCESO");
check("sin stock pide confirmacion (409)", blocked.status === 409 && blocked.data?.code === "STOCK_SHORTAGE_CONFIRMATION_REQUIRED");
check("forzado pasa", (await status(order.id, "EN_PROCESO", true)).status === 200);
await status(order.id, "TERMINADA");
check("forzado: no descuenta al avanzar", Number(psql(`select "stockPlacas" from materiales where id='${first}'`)) === 0 && ids.slice(1).every((id) => stockOf([id])[id] === initial[id]));
await status(order.id, "PENDIENTE");
check("forzado: al volver no devuelve lo que no desconto", Number(psql(`select "stockPlacas" from materiales where id='${first}'`)) === 0);
psql(`update materiales set "stockPlacas" = ${initial[first]} where id = '${first}'`);

// 5) Editar un material con el formulario abierto antes de una reserva no pisa la reserva.
const material = (await call("GET", "/materiales?incluirInactivos=true")).data.find((item) => item.id === first);
const formOpenedWith = material.stockPlacas;
await status(order.id, "EN_PROCESO");
const payload = { tipo: "PLACA", nombre: material.nombre, valor: material.valor, espesorMm: material.espesorMm, anchoPlaca: material.anchoPlaca, altoPlaca: material.altoPlaca, stockPlacas: formOpenedWith + 5, stockPlacasAnterior: formOpenedWith, activo: true };
const edited = await call("PUT", `/materiales/${first}`, payload);
check("editar material: aplica solo la diferencia", edited.status === 200 && edited.data.stockPlacas === initial[first] - boards[first] + 5, `${edited.data?.stockPlacas} = ${initial[first]} - ${boards[first]} + 5`);
await status(order.id, "PENDIENTE");
check("y la reserva se devuelve igual", stockOf([first])[first] === initial[first] + 5);
await call("PUT", `/materiales/${first}`, { ...payload, stockPlacas: initial[first], stockPlacasAnterior: initial[first] + 5 });
check("restaurado el stock del material", stockOf([first])[first] === initial[first]);

// 6) Borrar un pedido con stock descontado lo devuelve.
await status(order.id, "EN_PROCESO");
check("borrar pedido en proceso", (await call("DELETE", `/orders/${order.id}`)).status === 204);
check("borrar devuelve el stock", same(stockOf(ids), initial));

// 7) Pedido anterior con stock reservado (sin reserva guardada): se devuelve recalculando, como antes.
const legacy = psql(`select id from pedidos where estado='EN_PROCESO' and "stockReservado" and "reservaStock" is null limit 1`);
check("existe el pedido anterior con stock reservado", Boolean(legacy));

console.log(failures ? `\n${failures} FALLAS` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
