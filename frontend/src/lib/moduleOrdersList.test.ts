import assert from "node:assert/strict";
import test from "node:test";
import {
  apiFilters,
  daysBetween,
  DEFAULT_EXPORT_NAME,
  deliverySortKey,
  deliveryStatus,
  EMPTY_FILTERS,
  exportErrorMessage,
  exportFileName,
  exportProblem,
  filtersFromParams,
  filtersProblem,
  filtersToParams,
  formatCreatedDay,
  formatDay,
  hasActiveFilters,
  isUsableDay,
  MAX_EXPORT,
  moduleOrderIndicators,
  resultsAnnouncement
} from "./moduleOrdersList.ts";
import type { EstadoSolicitud } from "../types/index.ts";

const TODAY = "2026-10-06";

test("dias calendario entre fechas AAAA-MM-DD", () => {
  assert.equal(daysBetween(TODAY, TODAY), 0);
  assert.equal(daysBetween(TODAY, "2026-10-07"), 1);
  assert.equal(daysBetween(TODAY, "2026-10-03"), -3);
  assert.equal(daysBetween("2026-12-30", "2027-01-02"), 3, "cruza el año");
  assert.equal(daysBetween("2028-02-28", "2028-03-01"), 2, "bisiesto");
});

// La zona se cambia dentro del proceso: `npm test` no fija ninguna, y desde Git Bash la variable TZ ni siquiera llega a
// Node. En Argentina (sin horario de verano) una version con la hora local daria lo mismo; en las zonas con cambio de
// hora y en las que estan en otro dia, no.
const ZONAS = ["America/Argentina/Buenos_Aires", "UTC", "Asia/Tokyo", "America/New_York", "Europe/Madrid"];
function enCadaZona(probar: (zona: string) => void) {
  const original = process.env.TZ;
  try {
    for (const zona of ZONAS) {
      process.env.TZ = zona;
      probar(zona);
    }
  } finally {
    if (original === undefined) delete process.env.TZ;
    else process.env.TZ = original;
  }
}

test("dias calendario en cualquier zona, tambien en los fines de semana con cambio de hora", () => {
  enCadaZona((zona) => {
    // Europa cambia la hora el 29/03 y el 25/10 de 2026; Estados Unidos, el 08/03 y el 01/11. En la hora local esos
    // dias duran 23 o 25 horas: contados asi, darian un dia de menos o de mas.
    for (const [desde, hasta, dias] of [
      ["2026-03-28", "2026-03-30", 2],
      ["2026-10-24", "2026-10-26", 2],
      ["2026-03-07", "2026-03-09", 2],
      ["2026-10-31", "2026-11-02", 2],
      ["2026-03-29", "2026-03-30", 1],
      ["2026-03-08", "2026-03-09", 1],
      ["2026-10-25", "2026-10-26", 1],
      ["2026-11-01", "2026-11-02", 1]
    ] as const) {
      assert.equal(daysBetween(desde, hasta), dias, `${zona}: ${desde} a ${hasta}`);
      assert.equal(daysBetween(hasta, desde), -dias, `${zona}: ${hasta} a ${desde}`);
    }
  });
});

test("fechas para mostrar: el dia del negocio, este donde este el navegador (DECISIONES 26)", () => {
  enCadaZona((zona) => {
    assert.equal(formatDay("2026-10-05"), "05/10/2026", zona);
    assert.equal(formatDay(null), "", zona);
    // 01:30 UTC del 6 son las 22:30 del 5 en Buenos Aires.
    assert.equal(formatCreatedDay("2026-10-06T01:30:00.000Z"), "05/10/2026", zona);
    assert.equal(formatCreatedDay("2026-10-06T03:00:00.000Z"), "06/10/2026", zona);
  });
});

test("semaforo de plazo (spec 9.1): gris, rojo, amarillo y verde", () => {
  const status = (estado: EstadoSolicitud, fechaEntrega: string | null, aviso = 3) => deliveryStatus({ estado, fechaEntrega }, TODAY, aviso);
  assert.deepEqual(status("ENTREGADA", "2026-09-01"), { kind: "entregada", label: "Entregada", description: "Ya se entrego", dias: null }, "entregada, aunque la fecha haya pasado");
  assert.equal(status("RECHAZADA", "2026-09-01").kind, "sin-plazo", "una rechazada no tiene plazo");
  assert.equal(status("RECHAZADA", "2026-09-01").label, "Sin plazo");
  assert.equal(status("PENDIENTE", null).label, "Sin fecha");

  const atrasada = status("TERMINADA", "2026-10-05");
  assert.deepEqual([atrasada.kind, atrasada.label, atrasada.dias], ["atrasada", "Atrasada 1 d", -1]);
  assert.equal(atrasada.description, "Atrasada 1 dia: la entrega era el 05/10/2026");
  assert.equal(status("EN_PROCESO", "2026-10-01").label, "Atrasada 5 d");

  const hoy = status("PENDIENTE", TODAY);
  assert.deepEqual([hoy.kind, hoy.label, hoy.dias], ["proxima", "Vence hoy", 0]);
  const manana = status("PENDIENTE", "2026-10-07");
  assert.deepEqual([manana.kind, manana.label, manana.description], ["proxima", "Falta 1 d", "Falta 1 dia: se entrega el 07/10/2026"], "en singular");
  assert.equal(status("PENDIENTE", "2026-10-08").label, "Faltan 2 d");
  assert.equal(status("PENDIENTE", "2026-10-09").kind, "proxima", "justo en el aviso (3 dias)");
  assert.equal(status("PENDIENTE", "2026-10-10").kind, "en-plazo", "un dia despues del aviso");
  assert.equal(status("PENDIENTE", "2026-10-10").description, "Faltan 4 dias: se entrega el 10/10/2026");

  // Con aviso 0, solo el dia de la entrega es amarillo.
  assert.equal(status("PENDIENTE", TODAY, 0).kind, "proxima");
  assert.equal(status("PENDIENTE", "2026-10-07", 0).kind, "en-plazo");
});

test("ordenar por plazo: lo mas urgente primero, despues sin plazo y al final lo entregado", () => {
  const keys = [
    deliveryStatus({ estado: "ENTREGADA", fechaEntrega: "2026-09-01" }, TODAY, 3),
    deliveryStatus({ estado: "PENDIENTE", fechaEntrega: "2026-10-20" }, TODAY, 3),
    deliveryStatus({ estado: "RECHAZADA", fechaEntrega: "2026-09-01" }, TODAY, 3),
    deliveryStatus({ estado: "PENDIENTE", fechaEntrega: "2026-10-01" }, TODAY, 3),
    deliveryStatus({ estado: "PENDIENTE", fechaEntrega: TODAY }, TODAY, 3)
  ].map((item) => [item.label, deliverySortKey(item)] as const);
  assert.deepEqual(
    [...keys].sort((a, b) => a[1] - b[1]).map(([label]) => label),
    ["Atrasada 5 d", "Vence hoy", "Faltan 14 d", "Sin plazo", "Entregada"]
  );
});

test("indicadores: en curso, modulos a fabricar, vencen esta semana y atrasadas (sobre todas)", () => {
  const order = (estado: EstadoSolicitud, fechaEntrega: string | null, cantidadModulos = 1) => ({ estado, fechaEntrega, cantidadModulos });
  const orders = [
    order("PENDIENTE", "2026-10-01", 3), // atrasada
    order("EN_PROCESO", "2026-10-08", 2), // vence esta semana
    order("TERMINADA", "2026-10-13", 4), // vence esta semana (justo 7 dias), ya fabricada
    order("PENDIENTE", "2026-10-14", 5), // 8 dias: no vence esta semana
    order("PENDIENTE", TODAY, 1), // vence hoy: esta semana
    order("ENTREGADA", "2026-09-01", 6), // no cuenta
    order("RECHAZADA", "2026-09-01", 7), // no cuenta
    order("EN_PROCESO", null, 2) // en curso, sin fecha
  ];
  assert.deepEqual(moduleOrderIndicators(orders, TODAY), { enCurso: 6, modulosAFabricar: 3 + 2 + 5 + 1 + 2, vencenEstaSemana: 3, atrasadas: 1 });
  assert.deepEqual(moduleOrderIndicators([], TODAY), { enCurso: 0, modulosAFabricar: 0, vencenEstaSemana: 0, atrasadas: 0 });
});

test("filtros en la URL: lo que no sirve se ignora y vuelven iguales", () => {
  const params = new URLSearchParams("estado=EN_PROCESO&q=%20ana%20&desde=2026-10-01&hasta=2026-10-31&otra=1");
  const filters = filtersFromParams(params);
  assert.deepEqual(filters, { estado: "EN_PROCESO", search: "ana", desde: "2026-10-01", hasta: "2026-10-31" });
  assert.equal(filtersToParams(filters).toString(), "estado=EN_PROCESO&q=ana&desde=2026-10-01&hasta=2026-10-31");
  assert.deepEqual(filtersFromParams(new URLSearchParams("estado=CUALQUIERA&desde=2026-02-30&hasta=ayer")), EMPTY_FILTERS);
  assert.deepEqual(filtersFromParams(new URLSearchParams("desde=0002-10-15&hasta=0202-10-15")), EMPTY_FILTERS, "años a medio escribir");
  assert.equal(filtersToParams(EMPTY_FILTERS).toString(), "");
  assert.equal(hasActiveFilters(EMPTY_FILTERS), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, search: "  " }), false);
  assert.equal(hasActiveFilters({ ...EMPTY_FILTERS, hasta: "2026-10-31" }), true);
  assert.equal(filtersProblem({ ...EMPTY_FILTERS, desde: "2026-10-31", hasta: "2026-10-01" }), "La fecha de entrega desde no puede ser posterior a la fecha hasta.");
  assert.equal(filtersProblem({ ...EMPTY_FILTERS, desde: "2026-10-01", hasta: "2026-10-01" }), null);
  assert.deepEqual(apiFilters(filters), { estado: "EN_PROCESO", search: "ana", entregaDesde: "2026-10-01", entregaHasta: "2026-10-31" });
  assert.deepEqual(apiFilters(EMPTY_FILTERS), { estado: undefined, search: undefined, entregaDesde: undefined, entregaHasta: undefined });
});

test("fecha de filtro que se puede usar: completa, que exista y desde 1900", () => {
  for (const value of ["2026-10-15", "1900-01-01", "2028-02-29"]) assert.equal(isUsableDay(value), true, value);
  for (const value of ["", "0002-10-15", "0020-10-15", "0202-10-15", "1899-12-31", "2026-02-30", "2026-13-01", "15/10/2026"]) assert.equal(isUsableDay(value), false, value);
});

test("exportar: nombre del archivo (spec 11.1) y tope por vez", () => {
  assert.equal(exportFileName([{ numero: 1044 }]), "pedido-M1044.xlsx");
  assert.equal(exportFileName([{ numero: 1 }, { numero: 2 }]), "pedidos-carpinteria.xlsx");
  assert.equal(exportFileName([]), DEFAULT_EXPORT_NAME);
  assert.equal(exportProblem(MAX_EXPORT), null);
  assert.equal(exportProblem(MAX_EXPORT + 1), "Se pueden exportar hasta 200 solicitudes por vez: elegi menos.");
});

test("exportar: mensajes de error, con el cuerpo que llega como Blob", async () => {
  const blob = (text: string, type: string) => new Blob([text], { type });
  assert.equal(await exportErrorMessage({ isAxiosError: true, response: { status: 403, data: blob('{"message":"Solo un administrador puede exportar."}', "application/json") } }), "Solo un administrador puede exportar.");
  assert.equal(await exportErrorMessage({ isAxiosError: true, response: { status: 502, data: blob("<html>Bad gateway</html>", "text/html") } }), "No se pudo exportar. Intenta de nuevo en un momento.");
  assert.equal(await exportErrorMessage({ isAxiosError: true, response: { status: 500, data: blob('{"otro":1}', "application/json") } }), "No se pudo exportar. Intenta de nuevo en un momento.");
  assert.equal(await exportErrorMessage({ isAxiosError: true, response: { status: 414, data: blob("", "text/html") } }), "Son demasiadas solicitudes para exportar juntas: elegi menos.");
  assert.equal(await exportErrorMessage({ isAxiosError: true }), "Se corto la conexion. Revisa la conexion e intenta de nuevo.");
  assert.equal(await exportErrorMessage(new Error("cualquier cosa")), "No se pudo exportar. Intenta de nuevo en un momento.");
  assert.equal(await exportErrorMessage(null), "No se pudo exportar. Intenta de nuevo en un momento.");
});

test("aviso de resultados para lectores de pantalla", () => {
  const announce = (count: number | null, active = true, extra: { emptyCatalog?: boolean; blocked?: boolean } = {}) =>
    resultsAnnouncement({ count, active, emptyCatalog: extra.emptyCatalog ?? false, blocked: extra.blocked ?? false });
  assert.equal(announce(null), "", "mientras carga");
  assert.equal(announce(0, true, { blocked: true }), "", "con error o rango invertido: ya tienen su aviso");
  assert.equal(announce(0), "No hay solicitudes que coincidan con los filtros");
  assert.equal(announce(1), "1 solicitud coincide con los filtros");
  assert.equal(announce(3), "3 solicitudes coinciden con los filtros");
  assert.equal(announce(7, false), "Sin filtros: 7 solicitudes");
  assert.equal(announce(1, false), "Sin filtros: 1 solicitud");
  assert.equal(announce(0, false, { emptyCatalog: true }), "Todavia no hay solicitudes de modulos");
});
