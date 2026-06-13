import LoginIcon from "@mui/icons-material/Login";
import { GoogleLogin } from "@react-oauth/google";
import { Alert, Box, Button, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Email o password incorrectos");
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "transparent", p: 2 }}>
      <Paper sx={{ width: "100%", maxWidth: 440, p: 4, borderRadius: "8px", position: "relative", overflow: "hidden" }}>
        <Box sx={{ position: "absolute", inset: 0, background: `linear-gradient(135deg, ${alpha("#4f7cff", 0.15)}, transparent 48%), linear-gradient(315deg, ${alpha("#23d6c8", 0.2)}, transparent 44%)` }} />
        <Stack spacing={3} sx={{ position: "relative" }}>
          <Box>
            <Typography variant="h4">Solicitar cortes</Typography>
            <Typography color="text.secondary">Acceso para carpinteros con cuenta de Google</Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
            <GoogleLogin
              onSuccess={async (response) => {
                if (!response.credential) return;
                try {
                  await loginWithGoogle(response.credential);
                  navigate("/solicitar");
                } catch {
                  setError("Google inicio sesion correctamente, pero la API rechazo el acceso");
                }
              }}
              onError={() => setError("No se pudo ingresar con Google")}
              width="100%"
              text="continue_with"
            />
          ) : (
            <Alert severity="warning">Configura VITE_GOOGLE_CLIENT_ID para habilitar Google Login.</Alert>
          )}
          <Divider sx={{ color: "text.secondary", fontWeight: 700 }}>Administracion</Divider>
          <Stack spacing={2} component="form" onSubmit={handleSubmit}>
            <TextField label="Email" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
            <TextField label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} fullWidth />
            <Button type="submit" variant="contained" size="large" startIcon={<LoginIcon />}>
              Entrar como administrador
            </Button>
          </Stack>
        </Stack>
      </Paper>
    </Box>
  );
}
