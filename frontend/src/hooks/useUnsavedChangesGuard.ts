import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Aviso de cambios sin guardar (spec §6.2). La app usa <BrowserRouter>, que no tiene useBlocker, asi que:
 * - al cerrar o recargar la pestana, el navegador pregunta (beforeunload);
 * - los clics en links internos (el menu, por ejemplo) se frenan y quedan pendientes hasta que se confirme;
 * - los botones de la pantalla usan requestLeave(ruta).
 * El boton "atras" del navegador no se puede frenar sin cambiar el router de toda la app.
 */
export function useUnsavedChangesGuard(dirty: boolean) {
  const navigate = useNavigate();
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self") || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = `${url.pathname}${url.search}${url.hash}`;
      if (to === `${window.location.pathname}${window.location.search}${window.location.hash}`) return;
      // En captura, antes de que llegue al Link de React Router.
      event.preventDefault();
      event.stopPropagation();
      setPending(to);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const requestLeave = useCallback((to: string) => (dirty ? setPending(to) : navigate(to)), [dirty, navigate]);
  const confirmLeave = useCallback(() => {
    const to = pending;
    setPending(null);
    if (to) navigate(to);
  }, [navigate, pending]);
  const cancelLeave = useCallback(() => setPending(null), []);

  return { leaving: pending !== null, requestLeave, confirmLeave, cancelLeave };
}
