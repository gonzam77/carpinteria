// Hilo aparte donde corre el calculo compartido de placas y presupuesto (F7.4, DECISIONES 29). Recibe lo mismo que
// computeOrderEstimate y devuelve su resultado: es el mismo codigo, solo que no frena al hilo principal del servidor.
import { parentPort } from "node:worker_threads";
import { computeOrderEstimate } from "../../shared/orderEstimate.js";

type Request = { id: number; args: Parameters<typeof computeOrderEstimate>[0] };

parentPort?.on("message", ({ id, args }: Request) => {
  try {
    parentPort?.postMessage({ id, result: computeOrderEstimate(args) });
  } catch (error) {
    parentPort?.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
});
