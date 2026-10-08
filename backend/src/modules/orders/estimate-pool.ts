// El calculo de placas y presupuesto en un hilo aparte (F7.4). El optimizador puede tardar varios segundos en una
// solicitud grande (DECISIONES 0.12 y 24); en el hilo principal frenaba a todas las demas solicitudes y vencia las
// transacciones ajenas que esperaban (DECISIONES 29). Corre en un solo hilo aparte, de a un calculo por vez como antes,
// y ese hilo guarda sus resultados recientes (orderEstimate.ts), asi la vista previa y el alta calculan una sola vez.
// Es el mismo codigo compartido: los numeros no cambian. Si el hilo no puede arrancar, se calcula en el principal.
import { Worker } from "node:worker_threads";
import { computeOrderEstimate, type OrderEstimate } from "../../shared/orderEstimate.js";

type Args = Parameters<typeof computeOrderEstimate>[0];
type Pending = { resolve: (value: OrderEstimate) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let disabled = false;
let nextId = 0;
const pending = new Map<number, Pending>();

function failAll(error: Error) {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
}

function getWorker() {
  if (disabled) return null;
  if (worker) return worker;
  try {
    // En desarrollo (tsx) el archivo es .ts y el hilo hereda el cargador de tsx; compilado (dist) es .js.
    const file = import.meta.url.endsWith(".ts") ? "./estimate-worker.ts" : "./estimate-worker.js";
    const created = new Worker(new URL(file, import.meta.url));
    created.on("message", ({ id, result, error }: { id: number; result?: OrderEstimate; error?: string }) => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      if (error !== undefined) request.reject(new Error(error));
      else request.resolve(result!);
    });
    created.on("error", (error) => {
      console.error("El hilo del optimizador falló; se vuelve a crear en el próximo cálculo.", error);
      failAll(error instanceof Error ? error : new Error(String(error)));
      worker = null;
    });
    created.on("exit", (code) => {
      if (worker === created) worker = null;
      if (code !== 0) failAll(new Error(`El hilo del optimizador terminó con el código ${code}.`));
    });
    // No mantiene vivo el proceso: al apagar el servidor no hay que esperarlo.
    created.unref();
    worker = created;
    return worker;
  } catch (error) {
    console.error("No se pudo crear el hilo del optimizador; se calcula en el hilo principal.", error);
    disabled = true;
    return null;
  }
}

/** computeOrderEstimate en el hilo aparte (o en el principal, si el hilo no puede arrancar). */
export function computeOrderEstimateInWorker(args: Args): Promise<OrderEstimate> {
  const target = getWorker();
  if (!target) return Promise.resolve(computeOrderEstimate(args));
  return new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    target.postMessage({ id, args });
  });
}
