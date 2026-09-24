import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * Autoguardado local de un formulario en curso.
 *
 * Red de seguridad independiente de la sesion: cubre el 401, pero tambien el
 * F5, el cierre accidental de la pestania y al navegador del celular matando
 * la pagina por memoria. Nada de esto viaja al servidor.
 *
 * Las claves se separan por usuario porque en un taller la computadora se
 * comparte: el pedido a medio cargar de una persona no puede aparecerle a la
 * siguiente que entra.
 */

const DRAFT_PREFIX = "draft:";
const SAVE_DELAY_MS = 800;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Mientras hay un borrador ofrecido y sin decidir, lo que la persona escribe se
 * guarda aparte. Asi ni el borrador viejo ni lo nuevo se pisan entre si: al
 * decidir, uno de los dos queda y el otro se descarta.
 */
const LIVE_SUFFIX = "~live";

type StoredDraft<T> = { savedAt: number; value: T };

/** Espacio de nombres de un usuario. Sin usuario no se guarda nada. */
export function draftScope(userId: string | undefined) {
  return userId ? `u:${userId}:` : null;
}

function listDraftKeys() {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key?.startsWith(DRAFT_PREFIX)) keys.push(key);
    }
  } catch {
    // Sin acceso al almacenamiento no hay nada que recorrer.
  }
  return keys;
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Que no se pueda limpiar nunca debe romper el flujo del usuario.
  }
}

/** Borra los borradores de un usuario. Se usa al cerrar sesion a proposito. */
export function clearDraftsForUser(userId: string | undefined) {
  const scope = draftScope(userId);
  if (!scope) return;
  listDraftKeys()
    .filter((key) => key.startsWith(DRAFT_PREFIX + scope))
    .forEach(removeKey);
}

/** Barre los vencidos de todos los usuarios: si no, las ediciones abandonadas se acumulan. */
function pruneExpiredDrafts() {
  for (const key of listDraftKeys()) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as StoredDraft<unknown>;
      if (typeof parsed?.savedAt !== "number" || Date.now() - parsed.savedAt > MAX_AGE_MS) removeKey(key);
    } catch {
      removeKey(key);
    }
  }
}

function readDraft<T>(storageKey: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (typeof parsed?.savedAt !== "number" || parsed.value === undefined) return null;

    if (Date.now() - parsed.savedAt > MAX_AGE_MS) {
      removeKey(storageKey);
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function writeDraft<T>(storageKey: string, serializedValue: string) {
  try {
    localStorage.setItem(storageKey, JSON.stringify({ savedAt: Date.now(), value: JSON.parse(serializedValue) }));
    return true;
  } catch {
    // Sin espacio o en modo privado no hay red de seguridad, pero el
    // formulario tiene que seguir funcionando igual.
    return false;
  }
}

export function useFormDraft<T>(
  key: string | null,
  value: T,
  options: { ready?: boolean; worthSaving?: boolean } = {}
) {
  const { ready = true, worthSaving = true } = options;
  const storageKey = key ? `${DRAFT_PREFIX}${key}` : null;

  // Lo guardado al entrar, leido una sola vez y sostenido en memoria: recuperar
  // usa esta copia y no el archivo, asi el autoguardado puede seguir trabajando
  // aunque el banner siga en pantalla.
  const [pendingDraft, setPendingDraft] = useState<StoredDraft<T> | null>(() => {
    pruneExpiredDrafts();
    return storageKey ? readDraft<T>(storageKey) : null;
  });
  const [finished, setFinished] = useState(false);

  const serialized = useMemo(() => JSON.stringify(value), [value]);
  const latest = useRef(serialized);
  latest.current = serialized;

  // Con un borrador sin decidir se escribe al costado, para no pisarlo.
  const targetKey = storageKey && pendingDraft ? `${storageKey}${LIVE_SUFFIX}` : storageKey;
  const active = !!targetKey && ready && !finished;
  const store = active && worthSaving;

  const targetRef = useRef(targetKey);
  targetRef.current = targetKey;
  const storeRef = useRef(store);
  storeRef.current = store;

  // Solo borramos una clave que nosotros mismos escribimos. Sin esto, el primer
  // ciclo tras cargar la pagina (formulario todavia vacio, nada que guardar)
  // borraria el borrador que el banner esta ofreciendo en ese mismo momento.
  const written = useRef(false);

  const persist = useCallback(() => {
    const target = targetRef.current;
    if (!target) return;

    if (!storeRef.current) {
      // El formulario quedo vacio o volvio a como estaba: se limpia lo que
      // habiamos escrito para no dejar un borrador huerfano.
      if (written.current) {
        removeKey(target);
        written.current = false;
      }
      return;
    }

    if (writeDraft(target, latest.current)) written.current = true;
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setTimeout(persist, SAVE_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [active, persist, serialized, store, targetKey]);

  // Al cerrar o esconder la pestania no hay tiempo para el debounce.
  // `pagehide` cubre iOS, donde `beforeunload` no es confiable.
  useEffect(() => {
    if (!active) return;

    const flush = () => persist();
    const onHide = () => {
      if (document.visibilityState === "hidden") persist();
    };

    window.addEventListener("beforeunload", flush);
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      window.removeEventListener("beforeunload", flush);
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [active, persist]);

  /** Tras decidir, lo escrito al costado deja de tener sentido. */
  const dropLive = useCallback(() => {
    if (storageKey) removeKey(`${storageKey}${LIVE_SUFFIX}`);
    written.current = false;
  }, [storageKey]);

  /** Devuelve el borrador para que la pagina lo aplique a su estado. */
  const restoreDraft = useCallback(() => {
    const recovered = pendingDraft?.value ?? null;
    dropLive();
    setPendingDraft(null);
    return recovered;
  }, [dropLive, pendingDraft]);

  /**
   * El usuario prefiere lo que tiene en pantalla: el borrador viejo se va y lo
   * que venia escribiendo pasa a ocupar la clave principal.
   */
  const dismissDraft = useCallback(() => {
    if (storageKey) {
      const live = readDraft<T>(`${storageKey}${LIVE_SUFFIX}`);
      if (live) {
        writeDraft(storageKey, JSON.stringify(live.value));
        written.current = true;
      } else {
        removeKey(storageKey);
      }
      removeKey(`${storageKey}${LIVE_SUFFIX}`);
    }
    setPendingDraft(null);
  }, [storageKey]);

  /** Se guardo en el servidor: el borrador ya no tiene sentido. */
  const clearDraft = useCallback(() => {
    setFinished(true);
    storeRef.current = false;
    written.current = false;
    if (storageKey) {
      removeKey(storageKey);
      removeKey(`${storageKey}${LIVE_SUFFIX}`);
    }
    setPendingDraft(null);
  }, [storageKey]);

  return {
    pendingDraft: pendingDraft?.value ?? null,
    draftSavedAt: pendingDraft?.savedAt ?? null,
    restoreDraft,
    dismissDraft,
    clearDraft
  };
}
