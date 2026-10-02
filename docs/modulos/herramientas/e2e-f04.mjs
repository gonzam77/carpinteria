// Prueba de punta a punta de F0.4 contra el backend local (puerto 4100) conectado a la copia del backup.
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
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) process.exitCode = 1;
};

for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const stats = await call("GET", "/stats");
check("dashboard responde", stats.status === 200, `alertas de stock: ${stats.data?.stockAlerts?.length}`);

const orders = (await call("GET", "/orders")).data;
const old = orders.find((order) => order.estado === "PENDIENTE");
const oldSummary = await call("GET", `/orders/${old.id}/materiales`);
check("pedido anterior: listado recalculado", oldSummary.data.origen === "RECALCULADO", `placas ${oldSummary.data.totalPlacas}`);

// Toma las filas de un pedido existente cuyos materiales siguen activos.
let created = null;
let sent = null;
for (const source of orders) {
  const full = (await call("GET", `/orders/${source.id}`)).data;
  sent = full.detalles.map((row) => ({
    materialId: row.materialId,
    largo: row.largo,
    ancho: row.ancho,
    cantidad: row.cantidad,
    permiteRotar: row.permiteRotar,
    cantoLargo1Id: row.cantoLargo1Id,
    cantoLargo2Id: row.cantoLargo2Id,
    cantoAncho1Id: row.cantoAncho1Id,
    cantoAncho2Id: row.cantoAncho2Id,
    nombreProducto: `fila ${row.indice}`
  }));
  if (sent.length < 4) continue;
  const response = await call("POST", "/orders", { cliente: "Prueba F0.4", numeroContacto: "000000", detalles: sent });
  if (response.status === 201) {
    created = response.data;
    break;
  }
}
check("pedido de prueba creado", Boolean(created), created ? `${sent.length} filas, ${created.placasEstimadas} placas` : "");

const loaded = (await call("GET", `/orders/${created.id}`)).data;
check("las filas vuelven en el orden en que se cargaron", loaded.detalles.every((row, index) => row.indice === index && row.nombreProducto === sent[index].nombreProducto));
check("se guardo el detalle del calculo", loaded.estimacionDetalle?.version === 1, `${loaded.estimacionDetalle?.porMaterial?.length} materiales`);

const summary = (await call("GET", `/orders/${created.id}/materiales`)).data;
check("listado: origen constancia", summary.origen === "CONSTANCIA");
check("listado: mismas placas que la constancia", summary.totalPlacas === loaded.placasEstimadas, `${summary.totalPlacas} / ${loaded.placasEstimadas}`);
check("listado: mismos metros que la constancia", summary.totalMetrosCanto === loaded.metrosCanto, `${summary.totalMetrosCanto} / ${loaded.metrosCanto}`);

const fields = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "metrosCanto", "presupuestoEstimado"];
const same = (a, b) => fields.every((field) => a[field] === b[field]);

const unchanged = (await call("PUT", `/orders/${created.id}`, { cliente: "Prueba F0.4", numeroContacto: "000000", detalles: sent })).data;
check("editar sin cambios: mismo snapshot", same(unchanged, loaded));

const reversed = (await call("PUT", `/orders/${created.id}`, { cliente: "Prueba F0.4", numeroContacto: "000000", detalles: [...sent].reverse() })).data;
check("editar con las filas invertidas: mismo snapshot", same(reversed, loaded));
const reloaded = (await call("GET", `/orders/${created.id}`)).data;
check("y se leen en el nuevo orden", reloaded.detalles[0].nombreProducto === sent[sent.length - 1].nombreProducto);

const removed = await call("DELETE", `/orders/${created.id}`);
check("pedido de prueba borrado", removed.status === 204);
