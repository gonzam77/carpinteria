import LoginIcon from "@mui/icons-material/Login";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage({ mode }: { mode: "google" | "admin" }) {
  const { login, loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  function getErrorMessage(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) {
      return err.response?.data?.message ?? fallback;
    }

    return fallback;
  }

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(getErrorMessage(err, "Email o password incorrectos"));
    }
  }

  const isGoogleMode = mode === "google";

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "transparent", p: 2 }}>
      <Paper sx={{ width: "100%", maxWidth: 440, p: { xs: 2.5, sm: 4 }, borderRadius: "8px", position: "relative", overflow: "hidden" }}>
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            background: `linear-gradient(135deg, ${alpha("#f28c28", 0.16)}, transparent 44%), linear-gradient(315deg, ${alpha("#2f2a25", 0.16)}, transparent 42%)`
          }}
        />
        <Stack spacing={3} sx={{ position: "relative" }}>
          <Box>
            <Typography variant="h4">{isGoogleMode ? "Solicitar cortes" : "Administracion"}</Typography>
            <Typography color="text.secondary">
              {isGoogleMode ? "Acceso para carpinteros con cuenta de Google" : "Ingreso exclusivo para administradores"}
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}

          {isGoogleMode ? (
            import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <Box sx={{ width: "100%", display: "flex", justifyContent: "center", "& > div": { width: "100% !important" }, "& iframe": { width: "100% !important" } }}>
                <GoogleLogin
                  onSuccess={async (response) => {
                    if (!response.credential) return;
                    try {
                      await loginWithGoogle(response.credential);
                      navigate("/solicitar");
                    } catch (err) {
                      setError(getErrorMessage(err, "Google inicio sesion correctamente, pero la API rechazo el acceso"));
                    }
                  }}
                  onError={() => setError("No se pudo ingresar con Google")}
                  text="continue_with"
                />
              </Box>
            ) : (
              <Alert severity="warning">Configura VITE_GOOGLE_CLIENT_ID para habilitar Google Login.</Alert>
            )
          ) : (
            <Stack spacing={2} component="form" onSubmit={handleSubmit}>
              <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
              <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} fullWidth />
              <Button type="submit" variant="contained" size="large" startIcon={<LoginIcon />}>
                Entrar como administrador
              </Button>
            </Stack>
          )}
        </Stack>
      </Paper>
    </Box>
  );
}
