// El optimizador de cortes y el motor de formulas de modulos viven en frontend/src/lib/ y se copian al
// backend para que el navegador y el servidor calculen placas y despieces con el mismo codigo.
//   node scripts/sync-optimizer.mjs          copia las versiones del frontend al backend
//   node scripts/sync-optimizer.mjs --check  falla si alguna copia difiere
import { copyFileSync, existsSync, readFileSync } from "node:fs";

const sharedFiles = ["cutOptimizer.ts", "moduleFormula.ts"].map((name) => ({
  name,
  source: new URL(`../frontend/src/lib/${name}`, import.meta.url),
  target: new URL(`../backend/src/shared/${name}`, import.meta.url)
}));

if (process.argv.includes("--check")) {
  const outdated = sharedFiles.filter(
    ({ source, target }) => !existsSync(target) || readFileSync(source, "utf8") !== readFileSync(target, "utf8")
  );
  if (outdated.length) {
    for (const { name } of outdated) {
      console.error(`backend/src/shared/${name} no coincide con frontend/src/lib/${name}.`);
    }
    console.error("Corre `npm run sync:optimizer`.");
    process.exit(1);
  }
  console.log("Codigo compartido sincronizado.");
} else {
  for (const { name, source, target } of sharedFiles) {
    copyFileSync(source, target);
    console.log(`${name} copiado al backend.`);
  }
}
