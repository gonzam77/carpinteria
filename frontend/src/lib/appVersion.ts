const VERSION_URL = "/version.json";

export const currentVersion = typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "dev";

async function fetchPublishedVersion(): Promise<string | null> {
  try {
    const response = await fetch(`${VERSION_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;

    const data = (await response.json()) as { version?: string };
    return typeof data.version === "string" ? data.version : null;
  } catch {
    return null;
  }
}

/**
 * Consulta /version.json y avisa cuando el servidor tiene un build distinto al
 * que esta corriendo en esta pestana. Devuelve la funcion para frenar el chequeo.
 */
export function watchForNewVersion(onNewVersion: () => void, intervalMs = 5 * 60 * 1000): () => void {
  if (!import.meta.env.PROD) return () => undefined;

  let stopped = false;

  const check = async () => {
    if (stopped || document.visibilityState === "hidden") return;

    const published = await fetchPublishedVersion();
    if (stopped || !published || published === currentVersion) return;

    onNewVersion();
  };

  const onVisibilityChange = () => {
    if (document.visibilityState === "visible") void check();
  };

  const timer = window.setInterval(() => void check(), intervalMs);
  document.addEventListener("visibilitychange", onVisibilityChange);
  void check();

  return () => {
    stopped = true;
    window.clearInterval(timer);
    document.removeEventListener("visibilitychange", onVisibilityChange);
  };
}

/** Recarga salteando el cache del navegador para el documento. */
export function reloadToLatestVersion() {
  const url = new URL(window.location.href);
  url.searchParams.set("v", `${Date.now()}`);
  window.location.replace(url.toString());
}
