import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import PeopleIcon from "@mui/icons-material/People";
import StraightenIcon from "@mui/icons-material/Straighten";
import WarningAmberIcon from "@mui/icons-material/WarningAmber";
import { Alert, Box, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { DashboardStats, EstadoSolicitud } from "../types";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (user?.rol === "ADMIN") api.get<DashboardStats>("/stats").then((response) => setStats(response.data));
  }, [user]);

  if (user?.rol !== "ADMIN") {
    return (
      <Stack spacing={1}>
        <Typography variant="h4">Mis solicitudes</Typography>
        <Typography color="text.secondary">Solicita cortes, revisa tus solicitudes y consulta el estado de cada trabajo.</Typography>
      </Stack>
    );
  }

  const cards = [
    {
      label: "Pedidos",
      subtitle: "Pedidos activos",
      value: stats?.totalOrders ?? 0,
      icon: <AssignmentTurnedInIcon fontSize="small" />,
      accent: "#f29a3c",
      halo: alpha("#f29a3c", 0.2),
      badge: alpha("#f29a3c", 0.14)
    },
    {
      label: "Usuarios",
      subtitle: "Usuarios registrados",
      value: stats?.totalUsers ?? 0,
      icon: <PeopleIcon fontSize="small" />,
      accent: "#8d7f72",
      halo: alpha("#8d7f72", 0.18),
      badge: alpha("#8d7f72", 0.14)
    },
    {
      label: "Piezas",
      subtitle: "Piezas cargadas",
      value: stats?.totalPieces ?? 0,
      icon: <StraightenIcon fontSize="small" />,
      accent: "#cf6d14",
      halo: alpha("#cf6d14", 0.18),
      badge: alpha("#cf6d14", 0.14)
    }
  ];

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5} sx={{ maxWidth: 560 }}>
        <Typography variant="h4">Dashboard de solicitudes</Typography>
        <Typography color="text.secondary">Vista general de actividad, volumen y avance de trabajos.</Typography>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2.25 }}>
        {cards.map((card) => (
          <Paper
            key={card.label}
            sx={{
              p: { xs: 2.5, sm: 3 },
              minHeight: 148,
              borderRadius: "18px",
              color: "#221d19",
              background: "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(255,251,247,0.96) 100%)",
              boxShadow: "0 18px 34px rgba(94, 74, 52, 0.11)",
              overflow: "hidden",
              position: "relative"
            }}
          >
            <Box
              sx={{
                position: "absolute",
                top: -30,
                right: -26,
                width: 112,
                height: 112,
                borderRadius: "50%",
                bgcolor: card.halo
              }}
            />
            <Box
              sx={{
                position: "absolute",
                top: 18,
                right: 18,
                width: 42,
                height: 42,
                borderRadius: "12px",
                bgcolor: card.badge,
                color: card.accent,
                display: "grid",
                placeItems: "center"
              }}
            >
              {card.icon}
            </Box>
            <Stack spacing={1.1} sx={{ position: "relative", zIndex: 1 }}>
              <Box>
                <Typography sx={{ fontSize: 24, fontWeight: 900, lineHeight: 1, letterSpacing: 0, color: "#231f1b" }}>{card.label}</Typography>
                <Typography sx={{ mt: 0.55, color: "#8b8177", fontWeight: 700 }}>{card.subtitle}</Typography>
              </Box>
              <Typography variant="h4" sx={{ mt: 1.5, color: "#181512", lineHeight: 1 }}>
                {card.value}
              </Typography>
            </Stack>
          </Paper>
        ))}
      </Box>
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: "8px" }}>
        <Typography variant="h6" gutterBottom>
          Pedidos por estado
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2} useFlexGap sx={{ flexWrap: "wrap" }}>
          {(stats?.byStatus ?? []).map((item: any) => (
            <ButtonBase
              key={item.estado}
              onClick={() => navigate(`/pedidos?estado=${encodeURIComponent(item.estado)}`)}
              sx={{
                border: "1px solid",
                borderColor: getStatusStyle(item.estado as EstadoSolicitud).border,
                borderRadius: "8px",
                bgcolor: getStatusStyle(item.estado as EstadoSolicitud).bg,
                background: getStatusStyle(item.estado as EstadoSolicitud).gradient,
                justifyContent: "space-between",
                minWidth: 160,
                p: 2,
                textAlign: "left",
                width: { xs: "100%", md: "auto" },
                "&:hover": { boxShadow: `0 14px 28px ${alpha(getStatusStyle(item.estado as EstadoSolicitud).fg, 0.14)}` }
              }}>
              <Box>
                <Typography variant="h6">{item.total}</Typography>
                <StatusChip size="small" status={item.estado as EstadoSolicitud} />
              </Box>
              <ArrowForwardIcon sx={{ color: getStatusStyle(item.estado as EstadoSolicitud).fg }} fontSize="small" />
            </ButtonBase>
          ))}
        </Stack>
      </Paper>
      <Paper sx={{ p: { xs: 2, sm: 3 }, borderRadius: "8px" }}>
        <Stack spacing={2}>
          <Stack direction="row" spacing={1} alignItems="center">
            <WarningAmberIcon color="warning" />
            <Typography variant="h6">Alertas de stock</Typography>
          </Stack>
          {stats?.stockAlerts?.length ? (
            <Stack spacing={1.5}>
              {stats.stockAlerts.map((alert) => (
                <ButtonBase
                  key={alert.materialId}
                  onClick={() => navigate("/pedidos?estado=PENDIENTE")}
                  sx={{
                    alignItems: "stretch",
                    border: "1px solid",
                    borderColor: alpha("#cf6d14", 0.24),
                    borderRadius: "8px",
                    display: "block",
                    overflow: "hidden",
                    textAlign: "left",
                    width: "100%"
                  }}>
                  <Alert
                    severity="warning"
                    sx={{
                      alignItems: "flex-start",
                      borderRadius: 0,
                      height: "100%",
                      "& .MuiAlert-message": { width: "100%" }
                    }}>
                    <Typography fontWeight={800}>{alert.materialNombre}</Typography>
                    <Typography variant="body2">
                      Stock disponible: {alert.stockDisponible} placas - Solicitudes pendientes: {alert.placasPendientes} placas - Faltante: {alert.faltantePlacas} placas
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      Pedidos pendientes afectados: {alert.pedidosPendientes}
                    </Typography>
                  </Alert>
                </ButtonBase>
              ))}
            </Stack>
          ) : (
            <Typography color="text.secondary">No hay faltantes de stock para cubrir las solicitudes pendientes.</Typography>
          )}
        </Stack>
      </Paper>
    </Stack>
  );
}
