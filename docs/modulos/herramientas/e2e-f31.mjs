// Prueba de punta a punta de F3.1 y F3.2 (API del catalogo e imagenes) contra el backend local en el puerto 4100,
// con el catalogo ya importado (npm run prisma:seed:modulos). Ver LEEME.md. Deja la base como estaba.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const require = createRequire(new URL("../../../backend/package.json", import.meta.url));
const jwt = require("jsonwebtoken");

const BASE = "http://127.0.0.1:4100/api";
const SECRET = process.env.JWT_SECRET ?? "prueba-local-analisis-0123456789";
const psql = (sql) => execFileSync("docker", ["exec", "carpinteria-analisis-db", "psql", "-U", "carpinteria", "-d", "carpinteria", "-At", "-c", sql], { encoding: "utf8" }).trim();
const admin = jwt.sign({ id: psql("select id from usuarios where rol='ADMIN' limit 1"), email: "prueba@local", rol: "ADMIN" }, SECRET, { expiresIn: "1h" });
const carpintero = jwt.sign({ id: psql("select id from usuarios where rol='CARPINTERO' limit 1"), email: "carp@local", rol: "CARPINTERO" }, SECRET, { expiresIn: "1h" });
const call = async (method, path, body, { token = admin, headers = {}, raw } = {}) => {
  const response = await fetch(BASE + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body !== undefined && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined)
  });
  const type = response.headers.get("content-type") ?? "";
  const data = type.includes("json") ? await response.json() : await response.arrayBuffer();
  return { status: response.status, data, headers: response.headers };
};
let failures = 0;
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "ok " : "MAL"} ${label}${extra ? " | " + extra : ""}`);
  if (!ok) failures += 1;
};
for (let i = 0; i < 60; i += 1) {
  try {
    if ((await call("GET", "/modulos/configuracion")).status === 200) break;
  } catch {}
  await new Promise((resolve) => setTimeout(resolve, 1000));
}

const created = [];
const testCategory = "Prueba API F3";
try {
  // Listado
  const active = (await call("GET", "/modulos")).data;
  const all = (await call("GET", "/modulos?incluirInactivos=true")).data;
  check("listado: activos e inactivos", active.length === 32 && all.length === 33, `${active.length} / ${all.length}`);
  check("listado: los importados evaluan sin errores", all.every((item) => item.estadoFormulas === "OK"));
  check("listado: busqueda", (await call("GET", "/modulos?search=alacena")).data.every((item) => /alacena/i.test(item.nombre)));

  // Detalle
  const baseItem = active.find((item) => item.codigo === "BAJO_MESADA_2_PUERTAS");
  const base = (await call("GET", `/modulos/${baseItem.id}`)).data;
  check("detalle: definicion completa", base.parametros.length === 3 && base.perfiles.length === 2 && base.piezas.length === 10 && Boolean(base.imagen));

  const input = (overrides = {}) => {
    const { id, categoria, version, fechaActualizacion, imagen, tienePedidos, estadoFormulas, errores, ...definition } = base;
    return { ...definition, codigo: "PRUEBA_API", nombre: "Prueba API", ...overrides };
  };

  // Alta y validaciones
  const ok = await call("POST", "/modulos", input());
  if (ok.status === 201) created.push(ok.data.id);
  check("alta: modulo valido", ok.status === 201 && ok.data.version === 1);
  check("alta: ida y vuelta igual", ok.status === 201 && JSON.stringify(ok.data.piezas) === JSON.stringify(base.piezas));
  const dup = await call("POST", "/modulos", input());
  check("alta: codigo repetido", dup.status === 400 && dup.data.details?.errores?.some((e) => /Ya existe un modulo/.test(e)));
  const circular = input({ codigo: "PRUEBA_CIRC", piezas: base.piezas.map((p, i) => (i === 0 ? { ...p, formulaLargo: `${base.piezas[1].codigo}.largo` } : i === 1 ? { ...p, formulaLargo: `${base.piezas[0].codigo}.largo` } : p)) });
  const circularActive = await call("POST", "/modulos", circular);
  check("validacion: activo con referencia circular", circularActive.status === 400 && circularActive.data.code === "MODULE_INVALID" && JSON.stringify(circularActive.data.details).includes("circular"));
  const draft = await call("POST", "/modulos", { ...circular, activo: false });
  if (draft.status === 201) created.push(draft.data.id);
  check("validacion: el mismo, inactivo, se guarda como borrador", draft.status === 201);
  const activateDraft = await call("PATCH", `/modulos/${draft.data.id}/active`, { activo: true });
  check("activar un borrador con errores: 400", activateDraft.status === 400);
  const twoDefaults = await call("POST", "/modulos", input({ codigo: "PRUEBA_PERF", perfiles: base.perfiles.map((p) => ({ ...p, predeterminado: true })) }));
  check("validacion: dos perfiles predeterminados", twoDefaults.status === 400);
  const reserved = await call("POST", "/modulos", input({ codigo: "PRUEBA_SI", parametros: [...base.parametros, { clave: "SI", etiqueta: "Si", tipo: "MEDIDA", valorDefecto: 1, orden: 9 }] }));
  check("validacion: nombre reservado", reserved.status === 400 && JSON.stringify(reserved.data.details).includes("funcion"));
  const fixedWithout = await call("POST", "/modulos", input({ codigo: "PRUEBA_FIJO", piezas: base.piezas.map((p, i) => (i === 0 ? { ...p, rol: "FIJO", materialFijoId: null } : p)) }));
  check("validacion: material fijo sin material", fixedWithout.status === 400);
  const badCode = await call("POST", "/modulos", input({ codigo: "minusculas" }));
  check("validacion: codigo con formato invalido (zod)", badCode.status === 400);

  // Edicion
  const edited = await call("PUT", `/modulos/${ok.data.id}`, input({ nombre: "Prueba API editada", codigo: "PRUEBA_API_2" }));
  check("edicion: sube la version y cambia el codigo", edited.status === 200 && edited.data.version === 2 && edited.data.codigo === "PRUEBA_API_2");
  const off = await call("PATCH", `/modulos/${ok.data.id}/active`, { activo: false });
  const on = await call("PATCH", `/modulos/${ok.data.id}/active`, { activo: true });
  check("desactivar y activar", off.data.activo === false && on.data.activo === true);

  // Duplicar y borrar
  const copy = await call("POST", `/modulos/${baseItem.id}/duplicar`);
  if (copy.status === 201) created.push(copy.data.id);
  check("duplicar: copia inactiva con imagen", copy.status === 201 && copy.data.codigo === "BAJO_MESADA_2_PUERTAS_COPIA" && copy.data.activo === false && Boolean(copy.data.imagen));
  const removed = await call("DELETE", `/modulos/${copy.data.id}`);
  check("borrar un modulo sin pedidos", removed.status === 204 && (await call("GET", `/modulos/${copy.data.id}`)).status === 404);
  created.splice(created.indexOf(copy.data.id), 1);

  // Evaluar sin guardar
  const evaluated = await call("POST", "/modulos/evaluar", { definicion: { parametros: base.parametros, piezas: base.piezas, espesorDisenoMm: 18 }, valores: { ANCHO: 1500 } });
  check("evaluar sin guardar", evaluated.status === 200 && evaluated.data.errores.length === 0 && evaluated.data.piezas.length > 0);

  // Categorias y configuracion
  const categoria = await call("POST", "/modulos/categorias", { nombre: testCategory });
  check("categoria: alta", categoria.status === 201);
  check("categoria: nombre repetido", (await call("POST", "/modulos/categorias", { nombre: testCategory })).status === 409);
  check("categoria: edicion", (await call("PUT", `/modulos/categorias/${categoria.data.id}`, { nombre: testCategory, orden: 9 })).data.orden === 9);
  const config = (await call("GET", "/modulos/configuracion")).data;
  const truncated = await call("PUT", "/modulos/configuracion", { materialFondoId: config.materialFondoId, redondeo: "TRUNCAR", diasEntregaDefecto: 20, diasAvisoVencimiento: 3, herrajesHabilitados: false });
  await call("PUT", "/modulos/configuracion", { materialFondoId: config.materialFondoId, redondeo: config.redondeo, diasEntregaDefecto: config.diasEntregaDefecto, diasAvisoVencimiento: config.diasAvisoVencimiento, herrajesHabilitados: config.herrajesHabilitados });
  check("configuracion: guardar", truncated.status === 200 && truncated.data.redondeo === "TRUNCAR");

  // Imagenes (DECISIONES 12)
  const jpeg = readFileSync(new URL("../../../backend/prisma/data/imagenes/BAJO_MESADA_2_PUERTAS.jpg", import.meta.url));
  const put = await call("PUT", `/modulos/${ok.data.id}/imagen`, undefined, { raw: jpeg, headers: { "Content-Type": "image/jpeg" } });
  check("imagen: subir un JPEG", put.status === 200 && put.data.tamanoBytes === jpeg.length);
  const got = await call("GET", `/modulos/${ok.data.id}/imagen`);
  const etag = got.headers.get("etag");
  check("imagen: bajar con ETag", got.status === 200 && Buffer.from(got.data).equals(jpeg) && Boolean(etag));
  check("imagen: sin cambios devuelve 304", (await call("GET", `/modulos/${ok.data.id}/imagen`, undefined, { headers: { "If-None-Match": etag } })).status === 304);
  const big = await call("PUT", `/modulos/${ok.data.id}/imagen`, undefined, { raw: Buffer.concat([jpeg, Buffer.alloc(1024 * 1024)]), headers: { "Content-Type": "image/jpeg" } });
  check("imagen: mas de 1 MB, 413", big.status === 413 && big.data.code === "IMAGE_TOO_LARGE");
  const fake = await call("PUT", `/modulos/${ok.data.id}/imagen`, undefined, { raw: Buffer.from("esto no es una imagen"), headers: { "Content-Type": "image/png" } });
  check("imagen: archivo que no es imagen, 415", fake.status === 415);
  check("imagen: quitar", (await call("DELETE", `/modulos/${ok.data.id}/imagen`)).status === 204 && (await call("GET", `/modulos/${ok.data.id}/imagen`)).status === 404);

  // Permisos
  check("un carpintero no accede (403)", (await call("GET", "/modulos", undefined, { token: carpintero })).status === 403);
} finally {
  for (const id of created) await call("DELETE", `/modulos/${id}`);
  psql(`delete from categorias_modulo where nombre = '${testCategory}'`);
  console.log(`limpieza: ${created.length} modulos de prueba borrados`);
}
console.log(failures ? `\n${failures} FALLAS` : "\nTodo ok");
process.exitCode = failures ? 1 : 0;
