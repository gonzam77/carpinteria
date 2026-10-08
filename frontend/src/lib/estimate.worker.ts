// Hilo aparte del navegador donde corre el calculo compartido de placas y presupuesto (F7.4): con muchas piezas tarda
// unos segundos y, en la pagina, la congelaba. Es el mismo codigo: los numeros no cambian.
import { computeOrderEstimate } from "./orderEstimate";

type Request = { id: number; args: Parameters<typeof computeOrderEstimate>[0] };
const scope = self as unknown as { onmessage: ((event: MessageEvent<Request>) => void) | null; postMessage: (message: unknown) => void };

scope.onmessage = (event) => {
  const { id, args } = event.data;
  try {
    scope.postMessage({ id, result: computeOrderEstimate(args) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
