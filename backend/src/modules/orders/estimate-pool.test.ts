import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const poolUrl = new URL("./estimate-pool.ts", import.meta.url).href;
const backendDir = fileURLToPath(new URL("../../../", import.meta.url));

// Un script (pedidos:completar-detalle, pedidos:recalcular) no tiene un servidor que mantenga vivo el proceso: mientras
// espera al hilo del optimizador, el hilo tiene que mantenerlo vivo. Antes Node lo cortaba a mitad de camino con
// "unsettled top-level await" (2026-10-14, al completar el detalle en produccion).
test("un script que espera al hilo del optimizador termina con el resultado", () => {
  const script = `
    import { computeOrderEstimateInWorker } from ${JSON.stringify(poolUrl)};
    const args = {
      rows: [],
      plates: [],
      cantos: [],
      optimizerSettings: { espesorSierraMm: 4, perfiladoBordeMm: 10 },
      budgetSettings: { manoObraPlacaPorPlaca: 0, manoObraCanto045Mm: 0, manoObraCanto1Mm: 0, manoObraCanto2Mm: 0 }
    };
    for (let i = 0; i < 3; i += 1) await computeOrderEstimateInWorker(args);
    console.log("listo");
  `;
  // En un archivo, como corre un script de verdad (con -e el hilo heredaria --input-type, que no admite).
  const dir = mkdtempSync(join(tmpdir(), "estimate-pool-"));
  try {
    const file = join(dir, "script.mjs");
    writeFileSync(file, script);
    const child = spawnSync(process.execPath, ["--import", "tsx", file], { cwd: backendDir, encoding: "utf8", timeout: 60000 });

    assert.equal(child.status, 0, child.stderr);
    assert.equal(child.stdout.trim(), "listo");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
