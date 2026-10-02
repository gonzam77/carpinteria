// Completa Pedido.estimacionDetalle en los pedidos anteriores a que existiera (lo tienen en NULL), marcado
// como "recalculado". Asi el listado de materiales, la reserva de stock y el dashboard leen las placas
// guardadas en lugar de volver a optimizar en cada carga. No toca la constancia (placasEstimadas,
// importes): se respetan los valores ya informados a los clientes (DECISIONES 0.5).
//
//   DATABASE_URL=postgresql://... npx tsx src/scripts/completar-detalle-pedidos.ts
//
// Es idempotente: solo toca los pedidos que no tienen detalle. Se corre una vez al pasar a produccion
// (PLAN F8) y se puede repetir sin riesgo. Muestra ids cortos y cantidades, nunca datos de clientes.
import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "../generated/prisma/client.js";
import { buildOrderEstimateSnapshot } from "../modules/orders/order-estimate.service.js";
import { DETALLES_ORDENADOS } from "../modules/orders/order-queries.js";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL.");
  process.exit(1);
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

try {
  const orders = await prisma.pedido.findMany({
    where: { estimacionDetalle: { equals: Prisma.DbNull } },
    include: { detalles: DETALLES_ORDENADOS },
    orderBy: { fechaCreacion: "asc" }
  });
  let done = 0;
  let differs = 0;
  const failed: string[] = [];

  for (const order of orders) {
    const id = order.id.slice(0, 8);
    try {
      const snapshot = await buildOrderEstimateSnapshot(prisma, order.detalles);
      await prisma.pedido.update({
        where: { id: order.id },
        data: { estimacionDetalle: { ...snapshot.estimacionDetalle, recalculado: true } }
      });
      done += 1;
      if (snapshot.placasEstimadas !== order.placasEstimadas) {
        differs += 1;
        console.log(`${id} ${order.estado.padEnd(10)} constancia ${order.placasEstimadas} placas, detalle recalculado ${snapshot.placasEstimadas}`);
      }
    } catch (error) {
      failed.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${orders.length} pedidos sin detalle | completados: ${done} | con otras placas que su constancia: ${differs} | con error: ${failed.length}`);
  failed.forEach((line) => console.log(`  ${line}`));
} finally {
  await prisma.$disconnect();
}
