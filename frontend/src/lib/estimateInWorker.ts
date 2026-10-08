// El calculo de placas y presupuesto del plano de cortes en un hilo aparte del navegador (F7.4), para que la pagina no
// se congele mientras calcula. Si el navegador no puede crear el hilo, se calcula como antes, en la pagina.
import { computeOrderEstimate, type OrderEstimate } from "./orderEstimate";

type Args = Parameters<typeof computeOrderEstimate>[0];
type Pending = { resolve: (value: OrderEstimate) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let disabled = typeof Worker === "undefined";
let nextId = 0;
const pending = new Map<number, Pending>();

function getWorker() {
  if (disabled) return null;
  if (worker) return worker;
  try {
    const created = new Worker(new URL("./estimate.worker.ts", import.meta.url), { type: "module" });
    created.onmessage = (event: MessageEvent<{ id: number; result?: OrderEstimate; error?: string }>) => {
      const request = pending.get(event.data.id);
      if (!request) return;
      pending.delete(event.data.id);
      if (event.data.error !== undefined) request.reject(new Error(event.data.error));
      else request.resolve(event.data.result!);
    };
    created.onerror = (event) => {
      // Si el hilo no carga, lo que estaba esperando se calcula en la pagina y no se vuelve a intentar.
      event.preventDefault();
      disabled = true;
      worker = null;
      created.terminate();
      const waiting = [...pending.values()];
      pending.clear();
      waiting.forEach(({ reject }) => reject(new Error("WORKER_UNAVAILABLE")));
    };
    worker = created;
    return worker;
  } catch {
    disabled = true;
    return null;
  }
}

/** computeOrderEstimate en el hilo aparte del navegador (o en la pagina, si no se puede). */
export async function computeOrderEstimateAsync(args: Args): Promise<OrderEstimate> {
  const target = getWorker();
  if (!target) return computeOrderEstimate(args);
  try {
    return await new Promise<OrderEstimate>((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      target.postMessage({ id, args });
    });
  } catch (error) {
    if (error instanceof Error && error.message === "WORKER_UNAVAILABLE") return computeOrderEstimate(args);
    throw error;
  }
}
