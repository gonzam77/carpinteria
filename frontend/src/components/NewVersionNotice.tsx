import { Alert, Button, Snackbar } from "@mui/material";
import { useEffect, useState } from "react";
import { reloadToLatestVersion, watchForNewVersion } from "../lib/appVersion";

/**
 * Avisa cuando se publico una version nueva del sistema. No recarga solo para
 * no perder lo que el usuario este cargando: la recarga la dispara el boton.
 */
export function NewVersionNotice() {
  const [available, setAvailable] = useState(false);

  useEffect(() => watchForNewVersion(() => setAvailable(true)), []);

  return (
    <Snackbar open={available} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
      <Alert
        severity="info"
        variant="filled"
        action={
          <Button color="inherit" size="small" onClick={reloadToLatestVersion}>
            Actualizar
          </Button>
        }
      >
        Hay una version nueva del sistema disponible.
      </Alert>
    </Snackbar>
  );
}
