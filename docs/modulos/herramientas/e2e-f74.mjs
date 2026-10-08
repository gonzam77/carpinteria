// Prueba de F7.4: el optimizador más ágil sin cambiar ningún número, contra el backend local (puerto 4100) y la copia del
// backup con el catálogo importado.
// - Mientras se calcula una vista previa grande (20 bajo mesadas, varios segundos), el servidor sigue respondiendo otras
//   consultas al instante: el cálculo corre en un hilo aparte (antes frenaba todo, DECISIONES 29).
// - Crear la solicitud después de la vista previa no vuelve a calcular: reusa el resultado (misma entrada exacta).
// - Los números no cambian: el alta guarda exactamente el presupuesto de la vista previa, que es el de corte con las
//   mismas filas; dos vistas previas a la vez dan lo mismo.
// Crea una solicitud "Prueba F7.4 ..." y la borra al final. No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F7.4";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const admin = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
const call = async (method, path, body) => {
  const response = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${admin}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
let failures = 0;
let total = 0;
const check = (label, ok, extra = "") => {
  total++;
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures++;
};
for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/stats")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
if (psql(`select count(*) from pedidos where cliente like '${PREFIJO}%'`) !== "0") {
  console.log(`MAL hay solicitudes "${PREFIJO}..." de una corrida anterior que se cortó: borralas (DELETE /api/orders/:id).`);
  process.exit(1);
}
const contar = () => psql(`select (select count(*) from pedidos) || '/' || (select count(*) from detalle_pedidos) || '/' || (select count(*) from historial_pedidos) || '/' || (select count(*) from pedidos_modulo)`);
const antes = contar();
const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
  and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
const BAJO = psql(`select id from modulos where codigo = 'BAJO_MESADA_2_PUERTAS'`);
// 20 bajo mesadas de anchos distintos: la mezcla que en DECISIONES 24 tardaba unos 4,5 s.
// Anchos distintos en cada corrida: si no, la segunda corrida contra el mismo servidor encontraria el resultado guardado.
const SEMILLA = 1 + (Date.now() % 13);
const modulos = Array.from({ length: 20 }, (_, i) => ({ moduloId: BAJO, valores: { ANCHO: 600 + i * 30 + SEMILLA }, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 }));
const datos = { cliente: `${PREFIJO} veinte`, numeroContacto: "2664000000" };
const ESTIMADO = ["placasEstimadas", "costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "costoCantos", "metrosCanto", "presupuestoEstimado"];
const ms = (start) => Math.round(performance.now() - start);

const creadas = [];
try {
  // Otra consulta cualquiera, cada 100 ms, mientras se calcula la vista previa grande.
  let calculando = true;
  const demoras = [];
  let fallidas = 0;
  const sondeo = (async () => {
    while (calculando) {
      const start = performance.now();
      try {
        if ((await call("GET", "/company-settings")).status !== 200) fallidas += 1;
      } catch {
        fallidas += 1; // con el servidor ocupado, la conexion se puede cortar
      }
      demoras.push(ms(start));
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  })();
  const inicio = performance.now();
  const vista = await call("POST", "/pedidos-modulos/preview", { ...datos, modulos });
  const tiempoVista = ms(inicio);
  calculando = false;
  await sondeo;
  check("vista previa de 20 módulos: 200", vista.status === 200, `${tiempoVista} ms, ${vista.data?.placasEstimadas} placas`);
  const peor = Math.max(...demoras);
  check(
    "mientras calcula, las otras consultas responden al instante (menos de 1 s)",
    fallidas === 0 && demoras.length >= Math.min(5, Math.floor(tiempoVista / 200)) && peor < 1000,
    `${demoras.length} consultas durante ${tiempoVista} ms, la más lenta ${peor} ms, ${fallidas} fallidas`
  );

  // Alta con lo mismo: reusa el cálculo.
  const inicioAlta = performance.now();
  const alta = await call("POST", "/pedidos-modulos", { ...datos, fechaEntrega: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10), modulos });
  const tiempoAlta = ms(inicioAlta);
  if (alta.data?.id) creadas.push(alta.data.id);
  check("alta: 201", alta.status === 201, String(alta.status));
  check("alta después de la vista previa: no vuelve a calcular", tiempoVista < 1000 || tiempoAlta < tiempoVista / 2, `vista previa ${tiempoVista} ms, alta ${tiempoAlta} ms`);
  check("alta: el mismo presupuesto que la vista previa", ESTIMADO.every((campo) => alta.data[campo] === vista.data[campo]), ESTIMADO.filter((campo) => alta.data[campo] !== vista.data[campo]).join(","));
  const comoCorte = (await call("POST", "/orders/preview", { cliente: "x", numeroContacto: "000000", detalles: alta.data.detalles })).data;
  check("paridad: el de corte con las mismas filas", ESTIMADO.every((campo) => comoCorte[campo] === alta.data[campo]));

  // Dos vistas previas a la vez (otra mezcla, para que no estén guardadas): las dos dan lo mismo.
  const otra = modulos.map((modulo, i) => ({ ...modulo, valores: { ANCHO: 610 + i * 31 + SEMILLA } }));
  const [a, b] = await Promise.all([call("POST", "/pedidos-modulos/preview", { ...datos, modulos: otra }), call("POST", "/pedidos-modulos/preview", { ...datos, modulos: otra })]);
  check("dos vistas previas a la vez: las dos responden y dan lo mismo", a.status === 200 && b.status === 200 && ESTIMADO.every((campo) => a.data[campo] === b.data[campo]));
} catch (error) {
  check("la prueba terminó sin excepciones", false, error.message);
} finally {
  for (const id of creadas) {
    const removed = await call("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) console.log(`MAL no se pudo borrar la solicitud de prueba (${removed.status})`);
  }
  check("la copia quedó como estaba", contar() === antes, contar());
  console.log(`\n${total - failures}/${total} ok`);
  process.exit(failures ? 1 : 0);
}
