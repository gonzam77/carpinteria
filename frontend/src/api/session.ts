import axios from "axios";
import { API_BASE_URL, AUTH_METHOD_STORAGE_KEY, TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "./config";
import { User } from "../types";

/**
 * Manejo de la sesion fuera de React.
 *
 * Vive aca y no en AuthContext porque el interceptor de axios necesita leer y
 * renovar el token, y el contexto necesita al cliente axios: si se llamaran
 * entre si tendriamos un ciclo de imports. El contexto se suscribe a este
 * modulo y lo usa como fuente de verdad.
 */

/** Margen antes del vencimiento en el que ya conviene renovar. */
const REFRESH_MARGIN_MS = 30 * 60 * 1000;

/** Espera minima tras una renovacion fallida, para no martillar al servidor. */
const REFRESH_COOLDOWN_MS = 60 * 1000;

/**
 * Cliente sin interceptores: renovar no puede disparar otra renovacion.
 * El timeout es corto a proposito: cada request de la app espera a esta
 * llamada, asi que una red colgada no puede congelar toda la pantalla.
 */
const bareClient = axios.create({ baseURL: API_BASE_URL, timeout: 15000 });

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

/**
 * Compara por campos explicitos y no por JSON.stringify: distintos endpoints
 * arman el objeto en otro orden y con campos de mas, y cualquiera de esas dos
 * cosas hacia ver como "cambiado" a un usuario identico.
 */
export function sameUser(a: User | null, b: User | null) {
  if (!a || !b) return a === b;
  return (
    a.id === b.id &&
    a.nombre === b.nombre &&
    a.apellido === b.apellido &&
    a.email === b.email &&
    (a.telefono ?? "") === (b.telefono ?? "") &&
    a.rol === b.rol
  );
}

export function storeSession(token: string, user: User) {
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
  } catch {
    // Modo privado o almacenamiento lleno: la sesion sigue viva en memoria.
  }
  notifySession(token, user);
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Ignorado a proposito: no poder limpiar no debe romper el logout.
  }
}

export type AuthMethod = "google" | "password";

/**
 * Como entro esta persona. El dialogo de reingreso lo usa para ofrecerle el
 * mismo metodo: el rol no sirve para adivinarlo, porque un ADMIN creado desde
 * una cuenta de Google no tiene password con la cual volver a entrar.
 */
export function setAuthMethod(method: AuthMethod) {
  try {
    localStorage.setItem(AUTH_METHOD_STORAGE_KEY, method);
  } catch {
    // Se cae al metodo por defecto del dialogo.
  }
}

export function getAuthMethod(): AuthMethod | null {
  try {
    const stored = localStorage.getItem(AUTH_METHOD_STORAGE_KEY);
    return stored === "google" || stored === "password" ? stored : null;
  } catch {
    return null;
  }
}

/** Lee el `exp` del JWT sin validar la firma: solo sirve para decidir cuando renovar. */
export function readTokenExpiry(token: string | null) {
  if (!token) return null;

  const payload = token.split(".")[1];
  if (!payload) return null;

  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
    const claims = JSON.parse(atob(padded)) as { exp?: number };
    return typeof claims.exp === "number" ? claims.exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Un token sin `exp` legible se asume vigente: que decida el servidor. */
export function isTokenAlive(token: string | null) {
  if (!token) return false;
  const expiresAt = readTokenExpiry(token);
  return expiresAt === null || expiresAt > Date.now();
}

function needsRefresh(token: string) {
  const expiresAt = readTokenExpiry(token);
  return expiresAt !== null && expiresAt - Date.now() < REFRESH_MARGIN_MS;
}

// --- Renovacion ---------------------------------------------------------

let refreshInFlight: Promise<string | null> | null = null;
let refreshBlockedUntil = 0;

/**
 * Pide un token nuevo. Las llamadas concurrentes comparten la misma promesa:
 * la app dispara varios requests en paralelo y no queremos N renovaciones.
 * Tras un fallo espera un minuto, para que una red caida no genere un pedido
 * de renovacion por cada request durante la ultima media hora del token.
 */
export function refreshToken() {
  if (refreshInFlight) return refreshInFlight;

  const current = getToken();
  if (!current) return Promise.resolve(null);
  if (Date.now() < refreshBlockedUntil) return Promise.resolve(null);

  refreshInFlight = bareClient
    .post<{ token: string; user: User }>("/auth/refresh", null, {
      headers: { Authorization: `Bearer ${current}` }
    })
    .then((response) => {
      refreshBlockedUntil = 0;
      storeSession(response.data.token, response.data.user);
      return response.data.token;
    })
    .catch(() => {
      refreshBlockedUntil = Date.now() + REFRESH_COOLDOWN_MS;
      return null;
    })
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
}

/**
 * Devuelve un token utilizable, renovandolo si esta por vencer.
 * `null` significa que no hay sesion recuperable sin intervencion del usuario.
 */
export async function ensureFreshToken() {
  const token = getToken();
  if (!token) return null;
  if (!isTokenAlive(token)) return null;
  if (!needsRefresh(token)) return token;

  return (await refreshToken()) ?? token;
}

// --- Re-autenticacion en el lugar ---------------------------------------

type SessionListener = (token: string, user: User) => void;
type ReauthListener = (pending: boolean) => void;

let sessionListener: SessionListener | null = null;
let reauthListener: ReauthListener | null = null;
let reauthInFlight: Promise<boolean> | null = null;
let settleReauth: ((recovered: boolean) => void) | null = null;
let sessionEstablished = false;
let reauthIdentity: string | null = null;

/**
 * Marca que la sesion llego a funcionar en esta carga de la app.
 *
 * Hasta que eso pasa, un 401 no abre el dialogo: si el token ya venia muerto al
 * abrir la pagina no hay trabajo que proteger, y corresponde el login de
 * siempre en vez de un modal encima de una pantalla vacia.
 */
export function markSessionEstablished(established: boolean) {
  sessionEstablished = established;
}

function notifySession(token: string, user: User) {
  sessionListener?.(token, user);
}

/** El AuthContext se engancha aca para reflejar en React lo que pasa afuera. */
export function subscribeToSession(onSession: SessionListener, onReauth: ReauthListener) {
  sessionListener = onSession;
  reauthListener = onReauth;

  return () => {
    sessionListener = null;
    reauthListener = null;
  };
}

/**
 * Abre el dialogo de reingreso y espera. No navega ni desmonta nada: el
 * formulario que el usuario estaba completando sigue vivo detras del modal.
 */
export function requestReauth() {
  if (reauthInFlight) return reauthInFlight;

  // Sin dialogo montado, sin sesion previa que recuperar o ya deslogueado, el
  // 401 se propaga y la app cae al login normal.
  if (!reauthListener || !sessionEstablished || !getToken()) return Promise.resolve(false);

  // De quien era la sesion que vencio. Si vuelve a entrar otra persona, lo que
  // quedo pendiente es trabajo ajeno y no se puede completar con su identidad.
  reauthIdentity = getStoredUser()?.id ?? null;

  reauthInFlight = new Promise<boolean>((resolve) => {
    settleReauth = resolve;
  }).finally(() => {
    reauthInFlight = null;
    settleReauth = null;
    reauthIdentity = null;
  });

  reauthListener(true);
  return reauthInFlight;
}

/**
 * La llama el dialogo: `true` si el usuario volvio a entrar, `false` si desistio.
 * Si entro alguien distinto se resuelve en `false` igual, para que el request
 * pendiente se descarte en vez de ejecutarse a nombre de quien no lo pidio.
 */
export function completeReauth(recovered: boolean) {
  const sameIdentity = !reauthIdentity || getStoredUser()?.id === reauthIdentity;
  reauthListener?.(false);
  settleReauth?.(recovered && sameIdentity);
}

/** `true` si quien acaba de entrar no es el duenio de la sesion que vencio. */
export function reauthChangedIdentity() {
  return !!reauthIdentity && getStoredUser()?.id !== reauthIdentity;
}

/**
 * Garantiza sesion valida antes de una accion que no queremos perder.
 * Renueva en silencio y, si ya no alcanza, pide reingreso antes de mandar nada.
 */
export async function ensureSession() {
  if (await ensureFreshToken()) return true;
  return requestReauth();
}
