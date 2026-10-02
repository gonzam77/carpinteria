import { useEffect, useState } from "react";
import { api } from "../api/client";

/**
 * Imagen de un modulo del catalogo como URL para un <img>.
 *
 * La API pide la sesion en el header Authorization, asi que un <img src="/api/modulos/:id/imagen"> recibiria 401:
 * la imagen se baja con el cliente de la API y se muestra con URL.createObjectURL. Queda en una cache en memoria
 * por modulo y version (la fecha de actualizacion de la imagen), y la URL vieja se libera cuando cambia.
 */
const cache = new Map<string, { version: string; url: string }>();
const pending = new Map<string, Promise<string | null>>();

/** Olvida la imagen de un modulo (por ejemplo, despues de subir otra o quitarla). */
export function forgetModuleImage(moduloId: string) {
  const cached = cache.get(moduloId);
  if (cached) URL.revokeObjectURL(cached.url);
  cache.delete(moduloId);
  pending.delete(moduloId);
}

function loadImage(moduloId: string, version: string) {
  const cached = cache.get(moduloId);
  if (cached?.version === version) return Promise.resolve(cached.url);

  const key = `${moduloId}:${version}`;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;

  const request = api
    .get<Blob>(`/modulos/${moduloId}/imagen`, { responseType: "blob" })
    .then((response) => {
      const previous = cache.get(moduloId);
      if (previous) URL.revokeObjectURL(previous.url);
      const url = URL.createObjectURL(response.data);
      cache.set(moduloId, { version, url });
      return url;
    })
    .catch((error) => {
      if (error?.response?.status === 404) return null;
      throw error;
    })
    .finally(() => pending.delete(key));
  pending.set(key, request);
  return request;
}

/**
 * @param moduloId modulo del catalogo
 * @param version fecha de actualizacion de la imagen (o null si el modulo no tiene imagen)
 */
export function useModuleImage(moduloId: string | null | undefined, version: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(() => (moduloId && version && cache.get(moduloId)?.version === version ? cache.get(moduloId)!.url : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    if (!moduloId || !version) {
      setUrl(null);
      return;
    }
    setLoading(true);
    setError("");
    loadImage(moduloId, version)
      .then((loaded) => {
        if (!cancelled) setUrl(loaded);
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo cargar la imagen.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [moduloId, version]);

  return { url, loading, error };
}
