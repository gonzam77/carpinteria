import LoginIcon from "@mui/icons-material/Login";
import { GoogleLogin } from "@react-oauth/google";
import { Alert, Box, Button, Divider, Paper, Stack, TextField, Typography } from "@mui/material";
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
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "background.default", p: 2 }}>
      <Paper sx={{ width: "100%", maxWidth: 420, p: 4 }}>
        <Stack spacing={3}>
          <Box>
            <Typography variant="h4">Solicitar cortes</Typography>
            <Typography color="text.secondary">Acceso para carpinteros con cuenta de Google</Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
            <GoogleLogin
              onSuccess={async (response) => {
                if (!response.credential) return;
                await loginWithGoogle(response.credential);
                navigate("/solicitar");
              }}
              onError={() => setError("No se pudo ingresar con Google")}
              width="100%"
              text="continue_with"
            />
          ) : (
            <Alert severity="warning">Configura VITE_GOOGLE_CLIENT_ID para habilitar Google Login.</Alert>
          )}
          <Divider>Administracion</Divider>
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
