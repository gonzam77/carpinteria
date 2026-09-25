// El optimizador de cortes vive en frontend/src/lib/cutOptimizer.ts y se copia al backend para que
// el plano de cortes y la constancia calculen las placas con el mismo codigo.
//   node scripts/sync-optimizer.mjs          copia la version del frontend al backend
//   node scripts/sync-optimizer.mjs --check  falla si las dos copias difieren
import { copyFileSync, readFileSync } from "node:fs";

const source = new URL("../frontend/src/lib/cutOptimizer.ts", import.meta.url);
const target = new URL("../backend/src/shared/cutOptimizer.ts", import.meta.url);

if (process.argv.includes("--check")) {
  if (readFileSync(source, "utf8") !== readFileSync(target, "utf8")) {
    console.error("backend/src/shared/cutOptimizer.ts no coincide con frontend/src/lib/cutOptimizer.ts. Corre `npm run sync:optimizer`.");
    process.exit(1);
  }
  console.log("Optimizador sincronizado.");
} else {
  copyFileSync(source, target);
  console.log("Optimizador copiado al backend.");
}
