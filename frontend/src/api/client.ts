import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { API_BASE_URL } from "./config";
import { ensureFreshToken, getToken, requestReauth } from "./session";

declare module "axios" {
  export interface AxiosRequestConfig {
    /** Corta el reingreso automatico: el 401 se propaga tal cual al llamador. */
    skipReauth?: boolean;
  }
}

type RetriableConfig = InternalAxiosRequestConfig & { _reauthRetry?: boolean };

// Sin timeout, una red que cuelga en vez de cortar deja el request colgado
// indefinidamente y al usuario sin saber si su pedido se guardo o no.
export const api = axios.create({ baseURL: API_BASE_URL, timeout: 60000 });

/** Endpoints que establecen sesion: no tienen token que renovar ni que reintentar. */
function isSessionEndpoint(url?: string) {
  return !!url && /\/auth\/(login|google|refresh)$/.test(url);
}

api.interceptors.request.use(async (config) => {
  if (isSessionEndpoint(config.url)) return config;

  // Renovacion deslizante: si al token le queda poco, se cambia antes de salir.
  // Asi la sesion no vence mientras alguien esta cargando un pedido largo.
  const token = (await ensureFreshToken()) ?? getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;

  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as RetriableConfig | undefined;

    const recoverable =
      error.response?.status === 401 &&
      !!config &&
      !config._reauthRetry &&
      !config.skipReauth &&
      !isSessionEndpoint(config.url);

    if (!recoverable) throw error;

    // Un solo reintento por request: si el reingreso no alcanza, el error sube.
    config._reauthRetry = true;

    if (!(await requestReauth())) throw error;

    const token = getToken();
    if (token) config.headers.Authorization = `Bearer ${token}`;

    return api(config);
  }
);
