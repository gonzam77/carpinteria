// Recalcula todos los pedidos de una base con el codigo actual y los compara con lo guardado (el snapshot
// de la constancia). Sirve para medir el impacto de un cambio en el optimizador o en el presupuesto antes
// de desplegarlo (docs/modulos/PLAN.md §7). Solo lee la base: no escribe nada.
//
//   DATABASE_URL=postgresql://... npx tsx src/scripts/recalcular-pedidos.ts
//
// Usalo contra una copia restaurada de un backup, nunca contra produccion. Muestra ids cortos y
// cantidades, nunca datos de clientes.
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { buildOrderEstimateSnapshot } from "../modules/orders/order-estimate.service.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (la base restaurada de un backup).");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const money = (value: number) => Math.round(value).toLocaleString("es-AR");
const FIELDS = ["costoPlacas", "costoManoObraCortes", "costoMaterialCantos", "costoPegadoCantos", "presupuestoEstimado"] as const;

try {
  const orders = await prisma.pedido.findMany({ include: { detalles: true }, orderBy: { fechaCreacion: "asc" } });
  let boardsChanged = 0;
  let errors = 0;
  let maxDiff = 0;

  for (const order of orders) {
    const id = order.id.slice(0, 8);
    try {
      const snapshot = await buildOrderEstimateSnapshot(prisma, order.detalles);
      const diffs = FIELDS.map((field) => snapshot[field] - (order[field] as number));
      maxDiff = Math.max(maxDiff, ...diffs.map(Math.abs));
      const boardsDiffer = snapshot.placasEstimadas !== order.placasEstimadas;
      if (boardsDiffer) boardsChanged += 1;
      const total = diffs[FIELDS.length - 1];
      if (boardsDiffer || Math.abs(total) >= 0.005) {
        console.log(
          `${id} ${order.estado.padEnd(10)} placas guardadas=${order.placasEstimadas} hoy=${snapshot.placasEstimadas}` +
            ` | presupuesto guardado=$${money(order.presupuestoEstimado)} hoy=$${money(snapshot.presupuestoEstimado)} (dif ${total.toFixed(2)})`
        );
      }
    } catch (error) {
      errors += 1;
      console.log(`${id} ${order.estado.padEnd(10)} ERROR: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(
    `\n${orders.length} pedidos | con otra cantidad de placas: ${boardsChanged} | con error: ${errors}` +
      ` | mayor diferencia en un importe: $${maxDiff.toFixed(2)}` +
      `\nLas diferencias de plata incluyen cambios de precios y tarifas desde que se guardo cada pedido.`
  );
} finally {
  await prisma.$disconnect();
}
