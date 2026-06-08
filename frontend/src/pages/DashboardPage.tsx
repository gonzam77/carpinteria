import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import PeopleIcon from "@mui/icons-material/People";
import StraightenIcon from "@mui/icons-material/Straighten";
import { Box, ButtonBase, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function DashboardPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    if (user?.rol === "ADMIN") api.get("/stats").then((response) => setStats(response.data));
  }, [user]);

  if (user?.rol !== "ADMIN") {
    return (
      <Stack spacing={2}>
        <Typography variant="h4">Mis solicitudes</Typography>
        <Typography color="text.secondary">Solicita cortes, revisa tus solicitudes y consulta el estado de cada trabajo.</Typography>
      </Stack>
    );
  }

  const cards = [
    { label: "Pedidos", value: stats?.totalOrders ?? 0, icon: <AssignmentTurnedInIcon /> },
    { label: "Usuarios", value: stats?.totalUsers ?? 0, icon: <PeopleIcon /> },
    { label: "Piezas", value: stats?.totalPieces ?? 0, icon: <StraightenIcon /> }
  ];

  return (
    <Stack spacing={3}>
      <Typography variant="h4">Dashboard de solicitudes</Typography>
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(3, 1fr)" }, gap: 2 }}>
        {cards.map((card) => (
          <Paper key={card.label} sx={{ p: 3 }}>
            <Stack direction="row" alignItems="center" spacing={2}>
              <Box sx={{ color: "primary.main" }}>{card.icon}</Box>
              <Box>
                <Typography variant="h5">{card.value}</Typography>
                <Typography color="text.secondary">{card.label}</Typography>
              </Box>
            </Stack>
          </Paper>
        ))}
      </Box>
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Pedidos por estado
        </Typography>
        <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
          {(stats?.byStatus ?? []).map((item: any) => (
            <ButtonBase
              key={item.estado}
              onClick={() => navigate(`/pedidos?estado=${encodeURIComponent(item.estado)}`)}
              sx={{
                border: "1px solid",
                borderColor: "divider",
                borderRadius: 1,
                justifyContent: "space-between",
                minWidth: 160,
                p: 2,
                textAlign: "left",
                width: { xs: "100%", md: "auto" },
                "&:hover": { borderColor: "primary.main", bgcolor: "action.hover" }
              }}
            >
              <Box>
                <Typography variant="h6">{item.total}</Typography>
                <Typography color="text.secondary">{item.estado}</Typography>
              </Box>
              <ArrowForwardIcon color="primary" fontSize="small" />
            </ButtonBase>
          ))}
        </Stack>
      </Paper>
    </Stack>
  );
}
