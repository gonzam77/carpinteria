import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import PeopleIcon from "@mui/icons-material/People";
import StraightenIcon from "@mui/icons-material/Straighten";
import { Box, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { getStatusStyle, StatusChip } from "../components/StatusChip";
import { useAuth } from "../context/AuthContext";
import { EstadoSolicitud } from "../types";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (user?.rol === "ADMIN") api.get("/stats").then((response) => setStats(response.data));
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
    { label: "Pedidos", value: stats?.totalOrders ?? 0, icon: <AssignmentTurnedInIcon />, gradient: "linear-gradient(135deg, #7c62ff 0%, #9f7cff 100%)", shadow: "rgba(124,98,255,0.32)" },
    { label: "Usuarios", value: stats?.totalUsers ?? 0, icon: <PeopleIcon />, gradient: "linear-gradient(135deg, #23d6c8 0%, #44e5b6 100%)", shadow: "rgba(35,214,200,0.3)" },
    { label: "Piezas", value: stats?.totalPieces ?? 0, icon: <StraightenIcon />, gradient: "linear-gradient(135deg, #4f7cff 0%, #4aa7ff 100%)", shadow: "rgba(79,124,255,0.32)" }
  ];

  return (
    <Stack spacing={3}>
      <Stack spacing={0.5}>
        <Typography variant="h4">Dashboard de solicitudes</Typography>
        <Typography color="text.secondary">Vista general de actividad, volumen y avance de trabajos.</Typography>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2.25 }}>
        {cards.map((card) => (
          <Paper key={card.label} sx={{ p: { xs: 2.5, sm: 3 }, border: 0, borderRadius: "8px", color: "#ffffff", background: card.gradient, boxShadow: `0 20px 42px ${card.shadow}`, overflow: "hidden", position: "relative" }}>
            <Box sx={{ position: "absolute", right: -24, top: -28, width: 112, height: 112, borderRadius: "50%", bgcolor: "rgba(255,255,255,0.18)" }} />
            <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
              <Box sx={{ zIndex: 1 }}>
                <Typography variant="h4" sx={{ color: "#ffffff", lineHeight: 1 }}>
                  {card.value}
                </Typography>
                <Typography sx={{ color: "rgba(255,255,255,0.82)", fontWeight: 800 }}>{card.label}</Typography>
              </Box>
              <Box sx={{ color: "#ffffff", bgcolor: "rgba(255,255,255,0.18)", borderRadius: "8px", display: "grid", height: 48, placeItems: "center", width: 48, zIndex: 1 }}>{card.icon}</Box>
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
              }}
            >
              <Box>
                <Typography variant="h6">{item.total}</Typography>
                <StatusChip size="small" status={item.estado as EstadoSolicitud} />
              </Box>
              <ArrowForwardIcon sx={{ color: getStatusStyle(item.estado as EstadoSolicitud).fg }} fontSize="small" />
            </ButtonBase>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
