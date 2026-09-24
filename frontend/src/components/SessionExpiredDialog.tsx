import LockClockIcon from "@mui/icons-material/LockClock";
import LoginIcon from "@mui/icons-material/Login";
import { GoogleLogin } from "@react-oauth/google";
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, TextField, Typography } from "@mui/material";
import axios from "axios";
import { FormEvent, useEffect, useState } from "react";
import { getAuthMethod } from "../api/session";
import { useAuth } from "../context/AuthContext";

/**
 * Reingreso sin perder el trabajo en curso.
 *
 * Se monta por encima de la pantalla actual en lugar de navegar al login: el
 * formulario que el usuario estaba completando sigue montado detras. Cuando
 * vuelve a entrar, el request que fallo se reintenta solo.
 */
export function SessionExpiredDialog() {
  const { sessionExpired, user, login, loginWithGoogle, abandonSession } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const googleEnabled = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
  const [usePassword, setUsePassword] = useState(!googleEnabled);

  useEffect(() => {
    if (!sessionExpired) return;
    setError("");
    setPassword("");
    setEmail(user?.email ?? "");
    // Le ofrecemos el metodo con el que entro, no el que sugiere su rol: un
    // ADMIN creado desde una cuenta de Google no tiene password.
    setUsePassword(!googleEnabled || getAuthMethod() === "password");
  }, [googleEnabled, sessionExpired, user]);

  if (!sessionExpired) return null;

  function describe(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) return err.response?.data?.message ?? fallback;
    return fallback;
  }

  async function handlePasswordSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(describe(err, "Email o password incorrectos"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open fullWidth maxWidth="xs" disableEscapeKeyDown onClose={() => undefined}>
      <DialogTitle>
        <Stack direction="row" spacing={1.25} alignItems="center">
          <LockClockIcon color="warning" />
          <span>Tu sesion expiro</span>
        </Stack>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={2}>
          <Alert severity="info">
            Volve a ingresar para continuar. <strong>No vas a perder lo que estabas cargando</strong>: apenas entres, la accion se reintenta sola.
          </Alert>

          {user && (
            <Typography color="text.secondary" variant="body2">
              Sesion de {user.nombre} {user.apellido} ({user.email}). Si entra otra persona, la accion
              pendiente se descarta en vez de guardarse a su nombre.
            </Typography>
          )}

          {error && <Alert severity="error">{error}</Alert>}

          {!usePassword && googleEnabled && (
            <Stack spacing={1.5}>
              <GoogleLogin
                onSuccess={async (response) => {
                  if (!response.credential) return;
                  setError("");
                  try {
                    await loginWithGoogle(response.credential);
                  } catch (err) {
                    setError(describe(err, "Google respondio, pero la API rechazo el acceso"));
                  }
                }}
                onError={() => setError("No se pudo ingresar con Google")}
                text="continue_with"
              />
              <Divider />
              <Button size="small" onClick={() => setUsePassword(true)}>
                Ingresar con email y password
              </Button>
            </Stack>
          )}

          {usePassword && (
            <Stack spacing={2} component="form" onSubmit={handlePasswordSubmit}>
              <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth autoFocus />
              <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} fullWidth />
              <Button type="submit" variant="contained" startIcon={<LoginIcon />} disabled={submitting}>
                {submitting ? "Ingresando..." : "Continuar"}
              </Button>
              {googleEnabled && (
                <Button size="small" onClick={() => setUsePassword(false)}>
                  Ingresar con Google
                </Button>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button color="inherit" onClick={abandonSession}>
          Salir y descartar
        </Button>
      </DialogActions>
    </Dialog>
  );
}
