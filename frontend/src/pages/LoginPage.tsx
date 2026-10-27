import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";
import ContentCutIcon from "@mui/icons-material/ContentCut";
import GoogleIcon from "@mui/icons-material/Google";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import LoginIcon from "@mui/icons-material/Login";
import MailOutlineIcon from "@mui/icons-material/MailOutline";
import RequestQuoteOutlinedIcon from "@mui/icons-material/RequestQuoteOutlined";
import ViewModuleOutlinedIcon from "@mui/icons-material/ViewModuleOutlined";
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { GoogleLogin } from "@react-oauth/google";
import axios from "axios";
import { Alert, Box, Button, IconButton, InputAdornment, Link as MuiLink, Stack, TextField, Tooltip, Typography } from "@mui/material";
import { alpha, keyframes } from "@mui/material/styles";
import { FormEvent, useEffect, useState } from "react";
import { Navigate, Link as RouterLink, useLocation, useNavigate } from "react-router-dom";
import { fieldIcon } from "../components/fieldIcon";
import { useAuth } from "../context/AuthContext";
import { useErrorDialog } from "../context/ErrorDialogContext";

const logoUrl = new URL("../../assets/roma_logo.png", import.meta.url).href;

const draw = keyframes`from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; }`;
const rise = keyframes`from { opacity: 0; } to { opacity: 1; }`;

/**
 * Una placa de melamina de 2750 × 1830 con un plano de cortes de guillotina (en cm, la escala del dibujo). Es el motivo
 * del ingreso: lo que hace el sistema. Las lineas de corte se trazan una vez al entrar (sin movimiento si el sistema
 * pide menos animaciones).
 */
function CutPlanArt({ compact = false }: { compact?: boolean }) {
  // [x, y, ancho, alto] de cada pieza, en cm.
  const pieces: Array<[number, number, number, number]> = [
    [0, 0, 90, 60],
    [0, 60, 90, 60],
    [0, 120, 90, 63],
    [90, 0, 110, 95],
    [90, 95, 55, 88],
    [145, 95, 55, 88],
    [200, 0, 75, 40],
    [200, 40, 75, 40],
    [200, 80, 75, 40]
  ];
  // Los cortes en el orden en que los haria la seccionadora: primero los largos, despues los de cada franja.
  const cuts: Array<[number, number, number, number]> = [
    [90, 0, 90, 183],
    [200, 0, 200, 183],
    [0, 60, 90, 60],
    [0, 120, 90, 120],
    [90, 95, 200, 95],
    [145, 95, 145, 183],
    [200, 40, 275, 40],
    [200, 80, 275, 80],
    [200, 120, 275, 120]
  ];
  return (
    <Box
      component="svg"
      viewBox="-6 -6 287 205"
      role="img"
      aria-label="Plano de cortes de una placa de 2750 por 1830 milímetros"
      sx={{
        width: "100%",
        height: "auto",
        maxHeight: compact ? 150 : "42vh",
        display: "block",
        "& .cut": { strokeDasharray: 1, strokeDashoffset: 0, animation: `${draw} 900ms cubic-bezier(.6,.05,.3,1) both` },
        "& .piece-label": { animation: `${rise} 600ms ease both`, animationDelay: "1.3s" },
        "@media (prefers-reduced-motion: reduce)": { "& .cut, & .piece-label": { animation: "none" } }
      }}
    >
      <defs>
        <pattern id="login-waste" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="rgba(255,255,255,0.14)" strokeWidth="1.4" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="275" height="183" rx="1.5" fill="rgba(255,255,255,0.035)" stroke="rgba(255,255,255,0.28)" strokeWidth="0.8" />
      <rect x="200" y="120" width="75" height="63" fill="url(#login-waste)" />
      {pieces.map(([x, y, w, h]) => (
        <g key={`${x}-${y}`}>
          <rect x={x + 1.2} y={y + 1.2} width={w - 2.4} height={h - 2.4} rx="1" fill="rgba(255,255,255,0.05)" />
          <text className="piece-label" x={x + w / 2} y={y + h / 2 + 2} textAnchor="middle" fill="rgba(255,255,255,0.62)" fontSize={w < 60 ? 6.2 : 7} fontWeight={700} style={{ fontFamily: "inherit", fontVariantNumeric: "tabular-nums" }}>
            {w * 10} × {h * 10}
          </text>
        </g>
      ))}
      {cuts.map(([x1, y1, x2, y2], index) => (
        <line key={index} className="cut" pathLength={1} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#f28c28" strokeWidth="1.3" strokeLinecap="round" style={{ animationDelay: `${150 + index * 110}ms` }} />
      ))}
      {/* Cotas de la placa */}
      <g fill="rgba(255,255,255,0.45)" fontSize="6" fontWeight={700} style={{ fontVariantNumeric: "tabular-nums" }}>
        <text x="137.5" y="194" textAnchor="middle">
          2750 mm
        </text>
        <text x="-2" y="91.5" textAnchor="middle" transform="rotate(-90 -2 91.5)">
          1830 mm
        </text>
      </g>
    </Box>
  );
}

export function LoginPage({ mode }: { mode: "google" | "admin" }) {
  const { login, loginWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Donde estaba cuando lo mandaron a ingresar (lo deja ProtectedRoute).
  const from = (location.state as { from?: string } | null)?.from;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  // El error de ingreso en la ventana del medio (2026-10-13).
  const { showError } = useErrorDialog();
  useEffect(() => {
    if (!error) return;
    showError({ title: "No se pudo ingresar", message: error });
    setError("");
  }, [error, showError]);

  function getErrorMessage(err: unknown, fallback: string) {
    if (axios.isAxiosError(err)) {
      return err.response?.data?.message ?? fallback;
    }

    return fallback;
  }

  if (user) return <Navigate to={from ?? "/"} replace />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from ?? "/", { replace: true });
    } catch (err) {
      setError(getErrorMessage(err, "Email o contraseña incorrectos"));
    } finally {
      setSubmitting(false);
    }
  }

  const isGoogleMode = mode === "google";
  const features = isGoogleMode
    ? [
        { icon: <ContentCutIcon />, text: "Cargá tus piezas y recibí el plano de cortes optimizado." },
        { icon: <RequestQuoteOutlinedIcon />, text: "Presupuesto al instante y el estado de cada solicitud." }
      ]
    : [
        { icon: <ContentCutIcon />, text: "Solicitudes de corte con su plano de guillotina y su stock." },
        { icon: <ViewModuleOutlinedIcon />, text: "Módulos a medida: del catálogo a la hoja de taller." }
      ];

  return (
    <Box
      sx={{
        height: "100dvh",
        minHeight: 560,
        overflow: "hidden",
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1.08fr) minmax(420px, 0.92fr)" },
        bgcolor: "background.default"
      }}
    >
      {/* La placa: el lado oscuro, solo en pantallas anchas. */}
      <Box
        sx={{
          display: { xs: "none", md: "flex" },
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 3,
          minHeight: 0,
          px: { md: 5, lg: 7 },
          py: { md: 4, lg: 5 },
          color: "#fff",
          position: "relative",
          overflow: "hidden",
          background: "radial-gradient(circle at 85% 8%, rgba(242,140,40,0.22), transparent 38%), linear-gradient(160deg, #3a322b 0%, #221e1a 55%, #161412 100%)"
        }}
      >
        <Stack direction="row" spacing={1.25} alignItems="center">
          <Box aria-hidden sx={{ width: 10, height: 26, borderRadius: "2px", bgcolor: "primary.main", boxShadow: "6px 0 0 rgba(255,255,255,0.28), 12px 0 0 rgba(255,255,255,0.12)" }} />
          <Typography sx={{ pl: 2, fontWeight: 900, letterSpacing: "0.12em", fontSize: 15, color: "rgba(255,255,255,0.86)" }}>ROMA AMOBLAMIENTOS</Typography>
        </Stack>

        <Box sx={{ maxWidth: 560 }}>
          <Typography component="p" sx={{ fontSize: { md: 38, lg: 46 }, lineHeight: 1.05, fontWeight: 900, letterSpacing: "-0.02em", color: "#fff" }}>
            {isGoogleMode ? "Tus cortes, de la lista a la placa." : "El taller entero, en un solo panel."}
          </Typography>
          <Typography sx={{ mt: 1.5, color: "rgba(255,255,255,0.7)", fontSize: 16, lineHeight: 1.6, maxWidth: 470 }}>
            {isGoogleMode
              ? "Cada solicitud se optimiza para usar la menor cantidad de placas y que se pueda cortar con guillotina."
              : "Solicitudes, materiales, catálogo de módulos y presupuesto, con los mismos números en cada pantalla."}
          </Typography>
        </Box>

        <Box sx={{ minHeight: 0, display: "flex", alignItems: "center" }}>
          <CutPlanArt />
        </Box>

        <Stack direction={{ md: "column", lg: "row" }} spacing={{ md: 1.25, lg: 3 }}>
          {features.map((item) => (
            <Stack key={item.text} direction="row" spacing={1.25} alignItems="center" sx={{ flex: 1, minWidth: 0 }}>
              <Box aria-hidden sx={{ width: 34, height: 34, borderRadius: "10px", flexShrink: 0, display: "grid", placeItems: "center", color: "#f6aa57", bgcolor: "rgba(242,140,40,0.14)", "& svg": { fontSize: 19 } }}>
                {item.icon}
              </Box>
              <Typography variant="body2" sx={{ color: "rgba(255,255,255,0.78)", lineHeight: 1.45 }}>
                {item.text}
              </Typography>
            </Stack>
          ))}
        </Stack>
      </Box>

      {/* El formulario */}
      <Box
        sx={{
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          px: { xs: 2.5, sm: 4 },
          py: { xs: 3, sm: 4 },
          position: "relative",
          overflowY: "auto",
          background: { xs: "radial-gradient(circle at 50% -10%, rgba(242,140,40,0.2), transparent 45%), linear-gradient(180deg, #fbf8f4 0%, #f3ede4 100%)", md: "linear-gradient(180deg, #fffdfa 0%, #f8f3ec 100%)" }
        }}
      >
        <Stack spacing={{ xs: 2.5, sm: 3 }} sx={{ width: "100%", maxWidth: 400 }}>
          {/* El archivo del logo trae mucho margen blanco: se recorta al dibujo y el blanco se funde con el fondo. */}
          <Box
            component="img"
            src={logoUrl}
            alt="ROMA"
            sx={{ display: "block", width: 168, height: 46, objectFit: "cover", objectPosition: "50% 50%", alignSelf: { xs: "center", md: "flex-start" }, ml: { md: "-14px !important" }, mixBlendMode: "multiply" }}
          />
          {/* En el celular, el plano de cortes en chico, arriba del formulario. */}
          <Box sx={{ display: { xs: "block", md: "none" }, p: 2, borderRadius: "18px", background: "linear-gradient(160deg, #3a322b 0%, #1d1a17 100%)", boxShadow: "0 18px 40px rgba(35, 28, 20, 0.22)" }}>
            <CutPlanArt compact />
          </Box>

          <Box sx={{ textAlign: { xs: "center", md: "left" } }}>
            <Typography component="h1" sx={{ fontSize: { xs: 26, sm: 30 }, fontWeight: 900, letterSpacing: "-0.01em", lineHeight: 1.15 }}>
              {isGoogleMode ? "Ingresá a tu cuenta" : "Ingreso de administración"}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75, lineHeight: 1.55 }}>
              {isGoogleMode ? "Usá la cuenta de Google que tenés habilitada en ROMA." : "Con tu email y tu contraseña de administrador."}
            </Typography>
          </Box>

          {isGoogleMode ? (
            import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <Stack spacing={1.5}>
                <Box sx={{ width: "100%", display: "flex", justifyContent: "center", "& > div": { width: "100% !important" }, "& iframe": { width: "100% !important" } }}>
                  <GoogleLogin
                    onSuccess={async (response) => {
                      if (!response.credential) return;
                      try {
                        await loginWithGoogle(response.credential);
                        navigate(from ?? "/solicitar", { replace: true });
                      } catch (err) {
                        setError(getErrorMessage(err, "Google inició sesión correctamente, pero la API rechazó el acceso"));
                      }
                    }}
                    onError={() => setError("No se pudo ingresar con Google")}
                    text="continue_with"
                    size="large"
                    shape="rectangular"
                  />
                </Box>
                <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ color: "text.secondary" }}>
                  <GoogleIcon sx={{ fontSize: 16 }} aria-hidden />
                  <Typography variant="caption">Tu contraseña la maneja Google: ROMA nunca la ve.</Typography>
                </Stack>
              </Stack>
            ) : (
              <Alert severity="warning">Configurá VITE_GOOGLE_CLIENT_ID para habilitar el ingreso con Google.</Alert>
            )
          ) : (
            <Stack spacing={2} component="form" onSubmit={handleSubmit}>
              <TextField
                label="Email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                fullWidth
                required
                size="medium"
                slotProps={{ input: fieldIcon(<MailOutlineIcon />) }}
              />
              <TextField
                label="Contraseña"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                fullWidth
                required
                size="medium"
                slotProps={{
                  input: {
                    ...fieldIcon(<LockOutlinedIcon />),
                    endAdornment: (
                      <InputAdornment position="end">
                        <Tooltip title={showPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"}>
                          <IconButton edge="end" aria-label={showPassword ? "Ocultar la contraseña" : "Mostrar la contraseña"} onClick={() => setShowPassword((value) => !value)}>
                            {showPassword ? <VisibilityOffOutlinedIcon fontSize="small" /> : <VisibilityOutlinedIcon fontSize="small" />}
                          </IconButton>
                        </Tooltip>
                      </InputAdornment>
                    )
                  }
                }}
              />
              <Button type="submit" variant="contained" size="large" endIcon={<LoginIcon />} disabled={submitting} sx={{ minHeight: 50, fontSize: 16 }}>
                {submitting ? "Ingresando..." : "Entrar como administrador"}
              </Button>
            </Stack>
          )}

          <Box sx={{ pt: 2, borderTop: 1, borderColor: "divider", textAlign: { xs: "center", md: "left" } }}>
            <MuiLink
              component={RouterLink}
              to={isGoogleMode ? "/admin" : "/login"}
              underline="hover"
              sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, fontWeight: 800, color: "text.secondary", "&:hover": { color: "primary.dark" } }}
            >
              {isGoogleMode ? <AdminPanelSettingsOutlinedIcon sx={{ fontSize: 18 }} /> : <GoogleIcon sx={{ fontSize: 18 }} />}
              {isGoogleMode ? "Soy administrador" : "Soy carpintero: ingresar con Google"}
            </MuiLink>
          </Box>
        </Stack>
      </Box>
    </Box>
  );
}
