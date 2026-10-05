import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";
import { env } from "./env.js";

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL
});

// El limite de las transacciones interactivas es un temporizador de JS (5 s por defecto). El optimizador corre en
// el mismo hilo y una solicitud grande lo puede ocupar varios segundos (DECISIONES 0.12 y 24): sin margen, una
// transaccion ajena que quedo esperando vence y se pierde con un error 500, aunque sus escrituras tarden milisegundos.
export const prisma = new PrismaClient({ adapter, transactionOptions: { maxWait: 10_000, timeout: 30_000 } });
