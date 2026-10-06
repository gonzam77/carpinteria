import { useEffect, useState } from "react";
import { todayInArgentina } from "../lib/moduleOrderWizard";

/**
 * El dia de hoy en Argentina (AAAA-MM-DD), que cambia solo al pasar la medianoche: una pantalla que queda abierta (o
 * una notebook que se suspende) no sigue con el dia anterior. Se revisa cada minuto y al volver a la pestana, porque
 * un temporizador largo hasta la medianoche puede llegar tarde despues de una suspension.
 */
export function useTodayInArgentina() {
  const [today, setToday] = useState(() => todayInArgentina());
  useEffect(() => {
    // Con el mismo texto, React no vuelve a dibujar.
    const check = () => setToday(todayInArgentina());
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = window.setInterval(check, 60_000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
  return today;
}
