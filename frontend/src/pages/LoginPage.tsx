import LoginIcon from "@mui/icons-material/Login";
import SecurityIcon from "@mui/icons-material/Security";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import GoogleIcon from "@mui/icons-material/Google";
import AdminPanelSettingsIcon from "@mui/icons-material/AdminPanelSettings";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { Alert, Box, Button, Paper, Stack, TextField, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const logoUrl = new URL("../../assets/roma_logo.png", import.meta.url).href;

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
  const title = isGoogleMode ? "Bienvenido a ROMA" : "Panel de administracion";
  const subtitle = isGoogleMode
    ? "Accede con tu cuenta de Google para cargar solicitudes, seguir pedidos y trabajar mas rapido."
    : "Ingresa con tu usuario administrador para gestionar materiales, usuarios y configuraciones del sistema.";
  const featureItems = isGoogleMode
    ? [
        { icon: <TaskAltIcon fontSize="small" />, text: "Carga de cortes y seguimiento simple" },
        { icon: <SecurityIcon fontSize="small" />, text: "Acceso seguro con tu cuenta de Google" }
      ]
    : [
        { icon: <AdminPanelSettingsIcon fontSize="small" />, text: "Control total del panel y la operacion" },
        { icon: <SecurityIcon fontSize="small" />, text: "Ingreso reservado para administradores" }
      ];

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", bgcolor: "transparent", p: { xs: 2, md: 3 } }}>
      <Paper
        sx={{
          width: "100%",
          maxWidth: 1040,
          display: "grid",
          gridTemplateColumns: { xs: "1fr", md: "1.02fr 0.98fr" },
          borderRadius: "20px",
          overflow: "hidden",
          position: "relative"
        }}
      >
        <Box
          sx={{
            position: "relative",
            p: { xs: 3, sm: 4, md: 5 },
            color: "#fff",
            background: "linear-gradient(145deg, #f29a3c 0%, #d77516 54%, #6d3e12 100%)",
            overflow: "hidden",
            minHeight: { md: 620 }
          }}
        >
          <Box
            sx={{
              position: "absolute",
              inset: 0,
              background:
                "radial-gradient(circle at 14% 20%, rgba(255,255,255,0.16), transparent 18%), radial-gradient(circle at 88% 18%, rgba(255,255,255,0.12), transparent 20%), radial-gradient(circle at 82% 78%, rgba(255,255,255,0.08), transparent 18%)"
            }}
          />
          <Stack sx={{ position: "relative", zIndex: 1, height: "100%" }} spacing={4}>
            <Stack direction="row" alignItems="center" spacing={1.5}>
              <Box
                component="img"
                src={logoUrl}
                alt="ROMA"
                sx={{ width: { xs: 110, sm: 132 }, height: "auto", filter: "drop-shadow(0 10px 18px rgba(0,0,0,0.18))" }}
              />
            </Stack>

            <Stack spacing={2} sx={{ maxWidth: 420, pt: { md: 2 } }}>
              <Typography variant="h3" sx={{ fontSize: { xs: 34, md: 46 }, lineHeight: 1, color: "#fff", fontWeight: 900 }}>
                {title}
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.86)", fontSize: { xs: 15, md: 17 }, lineHeight: 1.65 }}>
                {subtitle}
              </Typography>
            </Stack>

            <Stack spacing={2} sx={{ maxWidth: 430 }}>
              {featureItems.map((item) => (
                <Stack
                  key={item.text}
                  direction="row"
                  spacing={1.5}
                  alignItems="center"
                  sx={{
                    p: 1.5,
                    borderRadius: "14px",
                    background: "rgba(255,255,255,0.12)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backdropFilter: "blur(8px)"
                  }}
                >
                  <Box
                    sx={{
                      width: 36,
                      height: 36,
                      borderRadius: "12px",
                      display: "grid",
                      placeItems: "center",
                      bgcolor: "rgba(255,255,255,0.18)",
                      color: "#fff",
                      flexShrink: 0
                    }}
                  >
                    {item.icon}
                  </Box>
                  <Typography sx={{ color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>{item.text}</Typography>
                </Stack>
              ))}
            </Stack>

            <Box sx={{ flexGrow: 1 }} />

            <Paper
              sx={{
                p: 2,
                borderRadius: "16px",
                bgcolor: "rgba(255,253,250,0.16)",
                border: "1px solid rgba(255,255,255,0.14)",
                color: "#fff",
                backdropFilter: "blur(10px)",
                boxShadow: "none"
              }}
            >
              <Typography sx={{ fontWeight: 800, color: "#fff", mb: 0.5 }}>
                {isGoogleMode ? "Tu espacio de trabajo" : "Acceso de confianza"}
              </Typography>
              <Typography sx={{ color: "rgba(255,255,255,0.84)", lineHeight: 1.6 }}>
                {isGoogleMode
                  ? "Desde aqui puedes ingresar rapido, revisar tus solicitudes y mantener ordenado cada pedido en produccion."
                  : "Utiliza este acceso para administrar el flujo operativo, revisar el estado general y mantener actualizada la informacion clave del sistema."}
              </Typography>
            </Paper>
          </Stack>
        </Box>

        <Box sx={{ p: { xs: 3, sm: 4, md: 5 }, display: "grid", alignItems: "center", bgcolor: "rgba(255,253,250,0.96)" }}>
          <Stack spacing={3.25} sx={{ maxWidth: 400, width: "100%", mx: "auto" }}>
            <Stack spacing={1}>
              <Typography variant="h4" sx={{ fontSize: { xs: 28, md: 34 } }}>
                {isGoogleMode ? "Ingreso con Google" : "Ingreso administrador"}
              </Typography>
              <Typography color="text.secondary" sx={{ lineHeight: 1.65 }}>
                {isGoogleMode
                  ? "Usa tu cuenta habilitada para empezar a cargar y seguir solicitudes de forma simple."
                  : "Accede con tus credenciales para administrar pedidos, materiales, usuarios y configuraciones."}
              </Typography>
            </Stack>

            {error && <Alert severity="error">{error}</Alert>}

            {isGoogleMode ? (
              import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
                <Stack spacing={2.25}>
                  <Box
                    sx={{
                      p: 2,
                      borderRadius: "16px",
                      border: "1px solid rgba(228, 216, 202, 0.95)",
                      background: "linear-gradient(180deg, #fffdfa 0%, #faf4ec 100%)"
                    }}
                  >
                    <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
                      <Box sx={{ width: 38, height: 38, borderRadius: "12px", display: "grid", placeItems: "center", bgcolor: alpha("#f28c28", 0.12), color: "#cf6d14" }}>
                        <GoogleIcon fontSize="small" />
                      </Box>
                      <Typography sx={{ fontWeight: 800 }}>Acceso rapido y seguro</Typography>
                    </Stack>
                    <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
                      Inicia sesion con Google para continuar directamente con tus solicitudes y el seguimiento de cada trabajo.
                    </Typography>
                  </Box>
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
                </Stack>
              ) : (
                <Alert severity="warning">Configura VITE_GOOGLE_CLIENT_ID para habilitar Google Login.</Alert>
              )
            ) : (
              <Stack spacing={2.25} component="form" onSubmit={handleSubmit}>
                <Box
                  sx={{
                    p: 2,
                    borderRadius: "16px",
                    border: "1px solid rgba(228, 216, 202, 0.95)",
                    background: "linear-gradient(180deg, #fffdfa 0%, #faf4ec 100%)"
                  }}
                >
                  <Stack direction="row" spacing={1.25} alignItems="center" sx={{ mb: 1.25 }}>
                    <Box sx={{ width: 38, height: 38, borderRadius: "12px", display: "grid", placeItems: "center", bgcolor: alpha("#2f2a25", 0.08), color: "#2f2a25" }}>
                      <AdminPanelSettingsIcon fontSize="small" />
                    </Box>
                    <Typography sx={{ fontWeight: 800 }}>Acceso operativo</Typography>
                  </Stack>
                  <Typography color="text.secondary" sx={{ lineHeight: 1.6 }}>
                    Desde este ingreso puedes gestionar el panel completo, revisar estados y mantener la operacion ordenada.
                  </Typography>
                </Box>
                <TextField label="Email" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} fullWidth />
                <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} fullWidth />
                <Button type="submit" variant="contained" size="large" startIcon={<LoginIcon />}>
                  Entrar como administrador
                </Button>
              </Stack>
            )}
          </Stack>
        </Box>
      </Paper>
    </Box>
  );
}
