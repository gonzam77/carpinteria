// Verificador de cortes de guillotina: indica si un acomodo de piezas en una placa se puede cortar con una
// seccionadora (cortes rectos de lado a lado, con el espesor de sierra entre las partes).
// Se uso para comparar el estimador viejo del backend con el optimizador actual (DECISIONES 0.6).
//
//   node docs/modulos/herramientas/guillotina.mjs        corre la autoprueba
//
// Uso desde otro script:
//   import { isGuillotine } from "./guillotina.mjs";
//   const ok = optimizeCutLayout(...).boards.every((board) => isGuillotine(board.pieces, settings.espesorSierraMm));

const EPS = 1e-6;

// Un conjunto de rectangulos fijos es "de guillotina" si existe un corte recto completo (vertical u horizontal)
// que lo separa en dos grupos no vacios, con al menos `kerf` de luz, y cada grupo vuelve a serlo.
// Tomar cualquier corte valido es correcto: un subconjunto de un acomodo de guillotina sigue siendolo.
export function isGuillotine(rects, kerf) {
  if (rects.length <= 1) return true;
  for (const [pos, size] of [["x", "width"], ["y", "height"]]) {
    const edges = [...new Set(rects.map((r) => r[pos] + r[size]))].sort((a, b) => a - b);
    for (const edge of edges) {
      const before = rects.filter((r) => r[pos] + r[size] <= edge + EPS);
      const after = rects.filter((r) => r[pos] >= edge + kerf - EPS);
      if (before.length && after.length && before.length + after.length === rects.length) {
        return isGuillotine(before, kerf) && isGuillotine(after, kerf);
      }
    }
  }
  return false;
}

// Autoprueba solo cuando se ejecuta este archivo directamente, no al importarlo.
if (process.argv[1]?.endsWith("guillotina.mjs")) {
  const r = (x, y, width, height) => ({ x, y, width, height });
  const cases = [
    ["grilla 2x2 con 4 mm de luz y sierra 4", isGuillotine([r(0, 0, 100, 100), r(104, 0, 100, 100), r(0, 104, 100, 100), r(104, 104, 100, 100)], 4), true],
    ["molinete (no se puede cortar)", isGuillotine([r(0, 0, 200, 100), r(200, 0, 100, 200), r(100, 200, 200, 100), r(0, 100, 100, 200)], 0), false],
    ["luz de 2 mm con sierra de 4", isGuillotine([r(0, 0, 100, 100), r(102, 0, 100, 100)], 4), false]
  ];
  let failed = 0;
  for (const [name, got, expected] of cases) {
    const ok = got === expected;
    if (!ok) failed += 1;
    console.log(`${ok ? "ok " : "MAL"} ${name}`);
  }
  process.exit(failed ? 1 : 0);
}
