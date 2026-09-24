import axios from "axios";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import { TOKEN_STORAGE_KEY, USER_STORAGE_KEY } from "../api/config";
import {
  clearSession,
  completeReauth,
  ensureFreshToken,
  getStoredUser,
  getToken,
  markSessionEstablished,
  sameUser,
  setAuthMethod,
  storeSession,
  subscribeToSession
} from "../api/session";
import { clearDraftsForUser } from "../hooks/useFormDraft";
import { User } from "../types";

/** Cada cuanto revisamos si conviene renovar mientras la pestania esta abierta. */
const REFRESH_CHECK_MS = 5 * 60 * 1000;

type AuthContextValue = {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  updateProfile: (profile: { nombre: string; apellido: string; telefono: string }) => Promise<void>;
  logout: () => void;
  loading: boolean;
  /** Hay un request esperando a que el usuario vuelva a ingresar. */
  sessionExpired: boolean;
  /** Descarta el reingreso: el request pendiente falla y se cierra la sesion. */
  abandonSession: () => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState(() => getToken());
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);

  // El modulo de sesion renueva y reingresa por fuera de React; esto trae esos
  // cambios al estado para que la UI los refleje.
  useEffect(
    () =>
      subscribeToSession(
        (nextToken, nextUser) => {
          setToken(nextToken);
          // Conservar la identidad del objeto cuando los datos no cambiaron es
          // parte del contrato: hay efectos que dependen de `user` y volver a
          // dispararlos en cada renovacion recargaria formularios a medio
          // completar, pisando lo que la persona estaba escribiendo.
          setUser((current) => (sameUser(current, nextUser) ? current : nextUser));
        },
        (pending) => setSessionExpired(pending)
      ),
    []
  );

  // Validacion inicial. `skipReauth` deja que un token ya vencido al arrancar
  // caiga al login de siempre: todavia no hay nada cargado que perder.
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .get<User>("/auth/me", { skipReauth: true })
      .then((response) => {
        markSessionEstablished(true);
        setUser(response.data);
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data));
        } catch {
          // Sin almacenamiento el usuario vive solo en memoria.
        }
      })
      .catch((error) => {
        // Solo un rechazo explicito del servidor cierra la sesion. Un timeout o
        // una red caida al arrancar no prueban nada sobre el token, y borrarlo
        // ahi obligaba a reloguearse por una demora pasajera.
        if (!axios.isAxiosError(error) || error.response?.status !== 401) return;

        // Token muerto: cierra cualquier dialogo que hayan abierto los requests
        // de fondo y deja que la app caiga al login de siempre.
        markSessionEstablished(false);
        completeReauth(false);
        clearSession();
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
    // Solo al montar y al cambiar de sesion: las renovaciones no deben re-validar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token === null]);

  // Renovacion proactiva: por reloj y al volver a la pestania. Cubre el caso de
  // alguien que deja el formulario abierto sin tocar nada durante horas.
  useEffect(() => {
    if (!token) return;

    const renew = () => {
      void ensureFreshToken();
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") renew();
    };

    const timer = window.setInterval(renew, REFRESH_CHECK_MS);
    window.addEventListener("focus", renew);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", renew);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [token]);

  const endSession = useCallback(() => {
    markSessionEstablished(false);
    clearSession();
    setToken(null);
    setUser(null);
  }, []);

  // Sincronizacion entre pestanias. Sin esto, cerrar sesion en una dejaba a la
  // otra viva: seguia pareciendo una sesion activa, volvia a escribir el
  // borrador que el logout acababa de borrar, y en una maquina compartida la
  // siguiente persona la encontraba abierta.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== TOKEN_STORAGE_KEY) return;

      if (!event.newValue) {
        completeReauth(false);
        endSession();
        return;
      }

      setToken(event.newValue);
      const stored = getStoredUser();
      if (stored) setUser((current) => (sameUser(current, stored) ? current : stored));
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [endSession]);

  /** Salida deliberada: deja la terminal limpia para el que venga despues. */
  const logout = useCallback(() => {
    clearDraftsForUser(user?.id);
    endSession();
  }, [endSession, user]);

  /**
   * La sesion vencio y la persona desiste de reingresar. A diferencia del
   * logout, su borrador se conserva: vuelve a entrar y lo recupera.
   */
  const abandonSession = useCallback(() => {
    completeReauth(false);
    endSession();
  }, [endSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      loading,
      sessionExpired,
      abandonSession,
      login: async (email, password) => {
        const response = await api.post("/auth/login", { email, password });
        setAuthMethod("password");
        markSessionEstablished(true);
        storeSession(response.data.token, response.data.user);
        completeReauth(true);
      },
      loginWithGoogle: async (credential) => {
        const response = await api.post("/auth/google", { credential });
        setAuthMethod("google");
        markSessionEstablished(true);
        storeSession(response.data.token, response.data.user);
        completeReauth(true);
      },
      updateProfile: async (profile) => {
        const response = await api.put("/auth/profile", profile);
        try {
          localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(response.data));
        } catch {
          // Ver arriba.
        }
        setUser(response.data);
      },
      logout
    }),
    [abandonSession, loading, logout, sessionExpired, token, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
