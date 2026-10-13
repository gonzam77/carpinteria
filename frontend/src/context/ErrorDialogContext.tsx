import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from "@mui/material";
import axios from "axios";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { apiErrorItems, apiErrorMessage, isSilentApiError } from "../lib/apiError";

/** Una accion de la ventana de error, ademas de "Entendido" (por ejemplo "Reintentar" o "Ver M-1044"). */
export type ErrorAction = { label: string; onClick: () => void; variant?: "contained" | "outlined" | "text" };

export type ErrorInput = {
  /** Que no se pudo hacer: "No se pudo guardar". Si falta, "Algo salió mal". */
  title?: string;
  /** El mensaje del sistema, en español y accionable. */
  message: string;
  /** El detalle, uno por renglon (por ejemplo, cada problema de una validacion). */
  items?: string[];
  actions?: ErrorAction[];
};

type ErrorDialogApi = {
  showError: (input: ErrorInput) => void;
  /** Cierra la ventana; con un error, solo si es ese el que se ve (cuando lo que lo causaba ya se resolvio). */
  closeError: (only?: ErrorInput) => void;
};

const ErrorDialogContext = createContext<ErrorDialogApi | null>(null);

/**
 * Los errores del sistema en una ventana en el medio de la pantalla (pedido de Gonzalo, 2026-10-13): un aviso al pie o
 * arriba de una pagina larga no se ve. Sirve en todas las pantallas, tengan o no panel lateral. Uno nuevo reemplaza al
 * que estaba abierto. Los avisos de un campo (al lado del dato) y los que estan dentro de un dialogo abierto no pasan
 * por aca.
 */
export function ErrorDialogProvider({ children }: { children: ReactNode }) {
  const [error, setError] = useState<ErrorInput | null>(null);
  const titleId = useId();
  const showError = useCallback((input: ErrorInput) => setError(input), []);
  const closeError = useCallback((only?: ErrorInput) => setError((current) => (!only || current === only ? null : current)), []);
  const api = useMemo(() => ({ showError, closeError }), [closeError, showError]);
  const items = error?.items?.filter(Boolean) ?? [];

  // Red de seguridad: un pedido a la API que fallo y nadie atrapo (un guardado sin catch) tambien se muestra, en vez
  // de quedar en silencio. Los que la pantalla ya maneja no llegan aca.
  useEffect(() => {
    const onUnhandled = (event: PromiseRejectionEvent) => {
      if (!axios.isAxiosError(event.reason) || isSilentApiError(event.reason)) return;
      event.preventDefault();
      setError({ title: "No se pudo completar la acción", message: apiErrorMessage(event.reason, "El servidor no pudo hacer lo que pediste. Intentá de nuevo."), items: apiErrorItems(event.reason) });
    };
    window.addEventListener("unhandledrejection", onUnhandled);
    return () => window.removeEventListener("unhandledrejection", onUnhandled);
  }, []);

  return (
    <ErrorDialogContext.Provider value={api}>
      {children}
      <Dialog open={Boolean(error)} onClose={() => closeError()} aria-labelledby={titleId} role="alertdialog" fullWidth maxWidth="sm">
        <DialogTitle id={titleId} sx={{ pb: 1 }}>
          <Stack direction="row" spacing={1.25} alignItems="center">
            <ErrorOutlineIcon color="error" aria-hidden />
            <Box component="span">{error?.title ?? "Algo salió mal"}</Box>
          </Stack>
        </DialogTitle>
        <DialogContent>
          <Typography sx={{ overflowWrap: "anywhere" }}>{error?.message}</Typography>
          {items.length > 0 && (
            <Box component="ul" sx={{ mt: 1.25, mb: 0, pl: 2.5, "& li": { mb: 0.5, overflowWrap: "anywhere" } }}>
              {items.map((item, index) => (
                <li key={index}>
                  <Typography variant="body2">{item}</Typography>
                </li>
              ))}
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2, flexWrap: "wrap", gap: 1 }}>
          {error?.actions?.map((action) => (
            <Button
              key={action.label}
              variant={action.variant ?? "outlined"}
              onClick={() => {
                setError(null);
                action.onClick();
              }}
            >
              {action.label}
            </Button>
          ))}
          <Button variant="contained" onClick={() => closeError()} autoFocus>
            Entendido
          </Button>
        </DialogActions>
      </Dialog>
    </ErrorDialogContext.Provider>
  );
}

/** La ventana de errores: showError({ title, message, items, actions }). */
export function useErrorDialog() {
  const api = useContext(ErrorDialogContext);
  if (!api) throw new Error("useErrorDialog va dentro de ErrorDialogProvider");
  return api;
}
