// Prueba de F5.3: el Excel para la máquina (GET /api/orders/export, spec §11.1), contra el backend local (puerto 4100)
// y la copia del backup.
// - Corte: cada solicitud exportada sola da sus filas en el orden de carga (índice), con los valores de la base en las
//   mismas 19 columnas, y el archivo se llama pedidos-carpinteria.xlsx, como antes.
// - Módulos: las filas salen por módulo (posición) y por el orden de la pieza, con las adicionales al final, aunque en
//   la edición se hayan cargado en otro orden; el archivo de una sola se llama pedido-M{número}.xlsx y el de varias,
//   pedidos-carpinteria.xlsx.
// - ?tipo=CORTE y ?tipo=MODULOS filtran; sin tipo, todas como antes; un tipo desconocido da 400; un carpintero, 403.
// Crea solicitudes "Prueba F5.3 ..." y las borra al final. Deja la copia como estaba. No imprime datos de clientes.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";

const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");
const ExcelJS = require("exceljs");

const BASE = process.env.BASE ?? "http://127.0.0.1:4100/api";
const SECRET = "prueba-local-analisis-0123456789";
const PREFIJO = "Prueba F5.3";
const psql = (sql) =>
  execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-F", "|", "-c", sql], { encoding: "utf8" }).trim();
const admin = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "2h" });
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "2h" });

const call = async (method, path, body, token = admin) => {
  const response = await fetch(BASE + path, { method, headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  return { status: response.status, data: text ? JSON.parse(text) : null };
};
/** Exporta y devuelve el nombre del archivo y las filas (sin el encabezado) como arreglos de 19 textos. */
async function exportar(query, token = admin) {
  const response = await fetch(`${BASE}/orders/export${query}`, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status !== 200) return { status: response.status };
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(await response.arrayBuffer()));
  const sheet = workbook.getWorksheet("Pedidos");
  const filas = [];
  sheet.eachRow((row) => filas.push(Array.from({ length: 19 }, (_, index) => String(row.getCell(index + 1).value ?? ""))));
  const archivo = /filename="([^"]+)"/.exec(response.headers.get("content-disposition") ?? "")?.[1];
  return { status: 200, archivo, encabezado: filas[0], filas: filas.slice(1) };
}
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

/** Una fila de la base como la escribe buildOrdersWorkbook (las 19 columnas). */
const canto = (flag, nombre) => (flag === "t" ? nombre || "Canto" : "");
const filasDeLaBase = (where) =>
  psql(`select "codigoBarra", material, largo, ancho, cantidad, "cantoLargo1", coalesce("cantoLargo1Nombre", ''), "cantoLargo2", coalesce("cantoLargo2Nombre", ''),
               "cantoAncho1", coalesce("cantoAncho1Nombre", ''), "cantoAncho2", coalesce("cantoAncho2Nombre", ''), "permiteRotar", coalesce("codigoBarraCentro", ''),
               coalesce(remark, ''), coalesce("numeroCliente", ''), coalesce("nombreCliente", ''), coalesce("nombreProducto", ''), id
        from detalle_pedidos where ${where} order by indice, id`)
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const c = line.split("|");
      return [c[0], c[1], c[2], c[3], c[4], "", "", "", "", canto(c[5], c[6]), canto(c[7], c[8]), canto(c[9], c[10]), canto(c[11], c[12]), c[13] === "t" ? "true" : "false", c[14], c[15], c[16], c[17], c[18]];
    });
const ENCABEZADO = ["codigo barra", "Material", "largo", "ancho", "cantidad", "", "", "", "", "canto largo 1", "canto largo 2", "canto ancho 1", "canto ancho 2", "permite rotar", "codigo barra centro p", "Remark", "numero cliente", "nombre cliente", "nombre producto"];

const creadas = [];
try {
  // ---------------------------------------------------------------- corte, como antes
  const cortes = psql(`select p.id from pedidos p where p.tipo = 'CORTE' and exists (select 1 from detalle_pedidos d where d."pedidoId" = p.id) order by p."fechaCreacion" desc limit 6`).split("\n");
  for (const [index, id] of cortes.entries()) {
    const excel = await exportar(`?ids=${id}`);
    const esperado = filasDeLaBase(`"pedidoId" = '${id}'`);
    check(
      `corte ${index + 1}: mismas filas, mismo orden y pedidos-carpinteria.xlsx`,
      excel.archivo === "pedidos-carpinteria.xlsx" && JSON.stringify(excel.encabezado) === JSON.stringify(ENCABEZADO) && JSON.stringify(excel.filas) === JSON.stringify(esperado),
      `${excel.filas?.length} filas, ${esperado.length} en la base`
    );
  }

  // ---------------------------------------------------------------- módulos: una solicitud editada
  const [colorA, colorB] = psql(`select p.id from materiales p where p.tipo = 'PLACA' and p.activo and p."espesorMm" = 18 and p."anchoPlaca" is not null
    and exists (select 1 from materiales c where c."placaMaterialId" = p.id and c.tipo = 'CANTO' and c.activo) order by p.nombre limit 2`).split("\n");
  const modulo = (codigo) => psql(`select id from modulos where codigo = '${codigo}'`);
  const crear = async (sufijo) => {
    const response = await call("POST", "/pedidos-modulos", {
      cliente: `${PREFIJO} ${sufijo}`,
      numeroContacto: "2664000000",
      fechaEntrega: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
      modulos: [
        { moduloId: modulo("BAJO_MESADA_2_PUERTAS"), valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorB, perfilCantoOrden: 1 },
        { moduloId: modulo("ALACENA_2_PUERTAS"), valores: {}, colorEsqueletoId: colorA, colorFrentesId: colorA, perfilCantoOrden: 1 }
      ]
    });
    if (response.status !== 201) throw new Error(`no se pudo crear (${response.status})`);
    creadas.push(response.data.id);
    return response.data;
  };
  const una = await crear("una");
  const [m1] = una.modulos;
  const nueva = (pedidoModuloId, nombreProducto) => ({ materialId: colorA, largo: 450, ancho: 300, cantidad: 1, permiteRotar: false, nombreProducto, pedidoModuloId });
  // En el formulario: la adicional primero y la nueva del módulo 1 arriba de las suyas. En el Excel van a su lugar.
  const editada = await call("PUT", `/pedidos-modulos/${una.id}`, {
    cliente: una.cliente,
    numeroContacto: una.numeroContacto,
    fechaEntrega: una.fechaEntrega,
    fechaActualizacion: una.fechaActualizacion,
    detalles: [nueva(null, "Adicional"), nueva(m1.id, "Nueva del 1"), ...una.detalles]
  });
  check("edición previa: 200", editada.status === 200, String(editada.status));
  const posicion = new Map(una.modulos.map((m) => [m.id, m.posicion]));
  const esperadoModulos = [...editada.data.detalles]
    .sort((a, b) => (posicion.get(a.pedidoModuloId) ?? 1e9) - (posicion.get(b.pedidoModuloId) ?? 1e9) || a.orden - b.orden)
    .map((d) => d.codigoBarra);
  const excelUna = await exportar(`?ids=${una.id}`);
  const codigos = excelUna.filas.map((fila) => fila[0]);
  check("módulos: por módulo y orden, adicionales al final", JSON.stringify(codigos) === JSON.stringify(esperadoModulos), codigos.join(" "));
  check(
    "módulos: la nueva del módulo 1 al final de su módulo y la adicional última",
    codigos.indexOf(`M${una.numero}-01-${String(Math.max(...una.detalles.filter((d) => d.pedidoModuloId === m1.id).map((d) => d.orden)) + 1).padStart(2, "0")}`) ===
      una.detalles.filter((d) => d.pedidoModuloId === m1.id).length &&
      codigos[codigos.length - 1] === `M${una.numero}-00-01` &&
      codigos.every((codigo, index) => index === 0 || codigo.slice(0, -3) >= codigos[index - 1].slice(0, -3) || codigo.includes("-00-"))
  );
  const porCodigo = new Map(filasDeLaBase(`"pedidoId" = '${una.id}'`).map((fila) => [fila[0], fila]));
  check("módulos: cada fila con los valores de la base, en las mismas 19 columnas", JSON.stringify(excelUna.encabezado) === JSON.stringify(ENCABEZADO) && excelUna.filas.every((fila) => JSON.stringify(fila) === JSON.stringify(porCodigo.get(fila[0]))));
  check("módulos: una sola se llama pedido-M{número}.xlsx", excelUna.archivo === `pedido-M${una.numero}.xlsx`, excelUna.archivo);
  check("módulos: m2 entre m1 y las adicionales", codigos.findIndex((c) => c.includes("-02-")) > codigos.findLastIndex((c) => c.includes("-01-")) && codigos.findLastIndex((c) => c.includes("-02-")) < codigos.indexOf(`M${una.numero}-00-01`));

  const otra = await crear("otra");
  const dos = await exportar(`?ids=${una.id},${otra.id}`);
  check("dos de módulos: pedidos-carpinteria.xlsx, con las filas de las dos", dos.archivo === "pedidos-carpinteria.xlsx" && dos.filas.length === excelUna.filas.length + otra.detalles.length, dos.archivo);
  const corteYModulo = await exportar(`?ids=${cortes[0]},${una.id}`);
  check("una de corte y una de módulos: pedidos-carpinteria.xlsx", corteYModulo.archivo === "pedidos-carpinteria.xlsx");

  // ---------------------------------------------------------------- filtro por tipo
  const todas = await exportar("");
  const soloCorte = await exportar("?tipo=CORTE");
  const soloModulos = await exportar("?tipo=MODULOS");
  const filasCorte = Number(psql(`select count(*) from detalle_pedidos d join pedidos p on p.id = d."pedidoId" where p.tipo = 'CORTE'`));
  const filasModulos = Number(psql(`select count(*) from detalle_pedidos d join pedidos p on p.id = d."pedidoId" where p.tipo = 'MODULOS'`));
  check("sin tipo: todas las filas, como antes", todas.filas.length === filasCorte + filasModulos, `${todas.filas.length}`);
  check("?tipo=CORTE: solo las de corte", soloCorte.filas.length === filasCorte && !soloCorte.filas.some((fila) => /^M\d+-/.test(fila[0])), `${soloCorte.filas.length}`);
  check("?tipo=MODULOS: solo las de módulos", soloModulos.filas.length === filasModulos && soloModulos.filas.every((fila) => /^M\d+-\d\d-\d\d$/.test(fila[0])), `${soloModulos.filas.length}`);
  check("?tipo=MODULOS con ids de corte: nada", (await exportar(`?ids=${cortes[0]}&tipo=MODULOS`)).filas.length === 0);
  const malo = await call("GET", "/orders/export?tipo=OTRO");
  check("un tipo desconocido: 400 con el mensaje", malo.status === 400 && JSON.stringify(malo.data).includes("El tipo de solicitud es CORTE o MODULOS"));
  check("carpintero: 403", (await exportar("", carpintero)).status === 403);
} catch (error) {
  check("la prueba terminó sin excepciones", false, error.message);
} finally {
  for (const id of creadas) {
    const removed = await call("DELETE", `/orders/${id}`);
    if (removed.status !== 204 && removed.status !== 200) console.log(`MAL no se pudo borrar una solicitud de prueba (${removed.status})`);
  }
  check("la copia quedó como estaba", contar() === antes, contar());
  console.log(`\n${total - failures}/${total} ok`);
  process.exit(failures ? 1 : 0);
}
