// Prueba de punta a punta de F2.3: materiales vinculados al catalogo de modulos (ver LEEME.md).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const psql = (sql) => execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-c", sql], { encoding: "utf8" }).trim();
const token = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, "prueba-local-analisis-0123456789", { expiresIn: "1h" });
const call = async (method, path) => { const r = await fetch("http://127.0.0.1:4100/api" + path, { method, headers: { Authorization: `Bearer ${token}` } }); const t = await r.text(); return { status: r.status, data: t ? JSON.parse(t) : null }; };
const check = (label, ok, extra = "") => { console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`); if (!ok) process.exitCode = 1; };
for (let i = 0; i < 60; i += 1) { try { if ((await call("GET", "/stats")).status === 200) break; } catch {} await new Promise((r) => setTimeout(r, 1000)); }
const material = psql(`select id from materiales where "altoPlaca" = 26000 limit 1`);
psql(`insert into categorias_modulo (id, nombre) values ('cat-prueba-f23', 'Prueba F2.3')`);
psql(`insert into modulos (id, codigo, nombre, "categoriaId", "materialFondoId", "fechaActualizacion") values ('mod-prueba-f23', 'PRUEBA_F23', 'Prueba', 'cat-prueba-f23', '${material}', now())`);
try {
  const listed = (await call("GET", "/materiales?incluirInactivos=true")).data.find((m) => m.id === material);
  check("el listado cuenta el vinculo con el catalogo", listed.linkedModulesCount === 1 && listed.canDeletePermanently === false, `vinculos ${listed.linkedModulesCount}, se puede borrar ${listed.canDeletePermanently}`);
  const permanent = await call("DELETE", `/materiales/${material}/permanent`);
  check("borrado definitivo: 409 claro, sin error de base", permanent.status === 409 && permanent.data.code === "MATERIAL_IN_USE_BY_MODULES", permanent.data?.message);
  const deactivated = await call("DELETE", `/materiales/${material}`);
  check("desactivar: permitido, con aviso", deactivated.status === 200 && Boolean(deactivated.data?.aviso), deactivated.data?.aviso);
  await fetch(`http://127.0.0.1:4100/api/materiales/${material}/active`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ activo: true }) });
  const other = psql(`select m.id from materiales m where m.tipo = 'PLACA' and m.activo and not exists (select 1 from detalle_pedidos d where d."materialId" = m.id) and m.id <> '${material}' limit 1`);
  if (other) {
    const plain = await call("DELETE", `/materiales/${other}`);
    check("desactivar un material sin vinculos: 204 como antes", plain.status === 204);
    await fetch(`http://127.0.0.1:4100/api/materiales/${other}/active`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ activo: true }) });
  }
} finally {
  psql(`delete from modulos where id = 'mod-prueba-f23'`);
  psql(`delete from categorias_modulo where id = 'cat-prueba-f23'`);
  console.log("datos de prueba borrados; material reactivado:", psql(`select activo from materiales where id = '${material}'`));
}
