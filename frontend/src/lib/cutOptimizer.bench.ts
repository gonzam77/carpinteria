// Banco de pruebas del optimizador (PLAN F0.9). Compara una version base contra la actual en placas, distancia
// a la cota por superficie, cortes de guillotina y tiempo. No es parte de npm test: se corre a mano.
//
//   npm run bench:optimizer                                  casos del catalogo y al azar
//   npm run bench:optimizer -- --base <ruta a cutOptimizer.ts>  compara contra otra version (por ejemplo, git show HEAD:...)
//   npm run bench:optimizer -- --datos <datos.json>          suma pedidos reales exportados de un backup (PLAN §7)
//
// Regla 2 de CLAUDE.md: una mejora nunca puede dar mas placas que la base en ningun caso.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import * as CURRENT from "./cutOptimizer.ts";
import { evaluateModule } from "./moduleFormula.ts";

// La prueba de guillotina esta en docs/, fuera de frontend/. Se carga al correr el banco (y no con un import) para que
// el build del frontend no la necesite: en Docker solo se copia frontend/.
const GUILLOTINE_TOOL = new URL("../../../docs/modulos/herramientas/guillotina.mjs", import.meta.url).href;
const { isGuillotine } = (await import(GUILLOTINE_TOOL)) as { isGuillotine: (pieces: unknown[], kerfMm: number) => boolean };

type Optimizer = typeof CURRENT;
type Row = CURRENT.OptimizerRow;
type Case = { name: string; rows: Row[]; width: number; height: number };

const args = process.argv.slice(2);
const argValue = (flag: string) => {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : undefined;
};
const basePath = argValue("--base");
const datosPath = argValue("--datos");
const BASE: Optimizer | null = basePath ? await import(pathToFileURL(basePath).href) : null;
const settings = { espesorSierraMm: 4.3 };
const USABLE = { width: 1820, height: 2590 }; // placa 1830 x 2600 con perfilado 5, como en produccion

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function catalogCases(): Case[] {
  const catalog = JSON.parse(readFileSync(new URL("../../../backend/prisma/data/modulos-muebles.json", import.meta.url), "utf8"));
  const orders: Record<string, string[]> = {
    cocina: ["BAJO_MESADA_2_PUERTAS", "CAJONERA_3_CAJONES", "ALACENA_2_PUERTAS", "ALACENA_2_PUERTAS", "MODULO_MICROONDAS"],
    placares: ["PLACARD_3_PUERTAS_DE_EMBUTIR", "ESCOBERO", "TORRE_HORNO", "DESPENSERO_4_PUERTAS"],
    bano: ["VANITORY_2_CAJONES", "ALACENA_1_PUERTA", "MODULO_ABIERTO"],
    dormitorio: ["MESA_DE_LUZ", "MESA_DE_LUZ", "MESA_DE_LUZ_FLOTANTE", "ARMARIO_2_PUERTAS"],
    grande: ["BAJO_MESADA_4_PUERTAS", "BAJO_MESADA_3_PUERTAS", "CAJONERA_2_CAJONES", "ESQUINERO", "ALACENA_4_PUERTAS", "ALACENA_3_PUERTAS", "ALACENA_LEVADIZA_2_PUERTAS", "MODULO_SOBRE_HELADERA", "ESPECIERO", "BAJO_MESADA_2_PUERTAS_3_CAJONES"]
  };
  const cases: Case[] = [];
  for (const [name, codes] of Object.entries(orders)) {
    const byRole = new Map<string, Row[]>();
    for (const code of codes) {
      const module = catalog.modulos.find((item: { codigo: string }) => item.codigo === code);
      const definition = new Map(module.piezas.map((piece: { codigo: string }) => [piece.codigo, piece]));
      for (const piece of evaluateModule({ parametros: module.parametros, piezas: module.piezas }, {}).piezas) {
        const source = definition.get(piece.codigo) as { rol: string; permiteRotar: boolean };
        const rows = byRole.get(source.rol) ?? [];
        rows.push({ largo: piece.largo, ancho: piece.ancho, cantidad: piece.cantidad, permiteRotar: source.permiteRotar, nombreProducto: piece.nombre });
        byRole.set(source.rol, rows);
      }
    }
    for (const [role, rows] of byRole) cases.push({ name: `catalogo ${name} ${role.toLowerCase()}`, rows, ...USABLE });
  }
  return cases;
}

function randomCases(count: number): Case[] {
  const random = seededRandom(20261003);
  const between = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  return Array.from({ length: count }, (_, index) => ({
    name: `azar ${index + 1}`,
    rows: Array.from({ length: between(2, 8) }, () => ({
      ancho: between(120, 900),
      largo: between(150, 2400),
      cantidad: between(1, 8),
      permiteRotar: random() < 0.4
    })),
    ...USABLE
  }));
}

function productionCases(path: string): Case[] {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const perfilado = data.optimizador.perfiladoBordeMm;
  const materials = new Map(data.materiales.map((material: { id: string }) => [material.id, material]));
  const cases: Case[] = [];
  for (const order of data.pedidos) {
    const rows = data.detalles.filter((row: { pedidoId: string }) => row.pedidoId === order.id);
    for (const materialId of new Set(rows.map((row: { materialId: string }) => row.materialId))) {
      const material = materials.get(materialId) as { anchoPlaca: number; altoPlaca: number };
      cases.push({
        name: `produccion ${order.id.slice(0, 8)} ${String(materialId).slice(0, 4)}`,
        rows: rows.filter((row: { materialId: string }) => row.materialId === materialId),
        width: material.anchoPlaca - perfilado * 2,
        height: material.altoPlaca - perfilado * 2
      });
    }
  }
  return cases;
}

function measure(optimizer: Optimizer, item: Case) {
  const pieces = optimizer.buildPiecesFromRows(item.rows, "m");
  const started = performance.now();
  const result = optimizer.optimizeCutLayout({ pieces, usableBoardWidthMm: item.width, usableBoardHeightMm: item.height, settings, variant: 0 });
  const ms = performance.now() - started;
  const boards = result.boards.filter((board) => board.usedArea > 0);
  return {
    placas: result.unplaced.length ? null : boards.length,
    cota: result.lowerBound,
    cortable: boards.every((board) => isGuillotine(board.pieces, settings.espesorSierraMm)),
    ms
  };
}

const cases = [...catalogCases(), ...randomCases(Number(argValue("--azar") ?? 40)), ...(datosPath ? productionCases(datosPath) : [])];
let worse = 0;
let better = 0;
let notCuttable = 0;
let totalBase = 0;
let totalCurrent = 0;
let atBound = 0;
let maxMs = 0;
let maxBaseMs = 0;
let maxDelta = 0;
let maxDeltaCase = "";

for (const item of cases) {
  const current = measure(CURRENT, item);
  const base = BASE ? measure(BASE, item) : null;
  if (!current.cortable) notCuttable += 1;
  if (current.placas !== null && current.placas === current.cota) atBound += 1;
  maxMs = Math.max(maxMs, current.ms);
  totalCurrent += current.placas ?? 0;
  if (base) {
    totalBase += base.placas ?? 0;
    maxBaseMs = Math.max(maxBaseMs, base.ms);
    if (current.ms - base.ms > maxDelta) {
      maxDelta = current.ms - base.ms;
      maxDeltaCase = `${item.name} (${Math.round(base.ms)} -> ${Math.round(current.ms)} ms, placas ${current.placas}, cota ${current.cota})`;
    }
    if ((current.placas ?? Infinity) > (base.placas ?? Infinity)) {
      worse += 1;
      console.log(`PEOR   ${item.name}: base ${base.placas} -> actual ${current.placas}`);
    } else if ((current.placas ?? Infinity) < (base.placas ?? Infinity)) {
      better += 1;
      console.log(`MEJOR  ${item.name}: base ${base.placas} -> actual ${current.placas} (cota ${current.cota}, ${Math.round(base.ms)} -> ${Math.round(current.ms)} ms)`);
    }
  }
}

console.log(`\n${cases.length} casos | placas actual ${totalCurrent}${BASE ? ` (base ${totalBase})` : ""} | en la cota por superficie: ${atBound}`);
if (BASE) console.log(`mejoran: ${better} | empeoran: ${worse} | tiempo maximo base ${Math.round(maxBaseMs)} ms, actual ${Math.round(maxMs)} ms | mayor aumento en un caso: ${Math.round(maxDelta)} ms, en ${maxDeltaCase}`);
console.log(`placas que no se pueden cortar: ${notCuttable}`);
process.exitCode = worse || notCuttable ? 1 : 0;
