import AssessmentIcon from "@mui/icons-material/Assessment";
import AssignmentIcon from "@mui/icons-material/Assignment";
import GroupIcon from "@mui/icons-material/Group";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LogoutIcon from "@mui/icons-material/Logout";
import PostAddIcon from "@mui/icons-material/PostAdd";
import { Alert, AppBar, Avatar, Box, Button, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Toolbar, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const drawerWidth = 236;

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [notification, setNotification] = useState("");
  const navItems = [
    { label: "Dashboard", to: "/", icon: <AssessmentIcon />, match: (pathname: string) => pathname === "/" },
    {
      label: user?.rol === "ADMIN" ? "Solicitudes" : "Mis solicitudes",
      to: user?.rol === "ADMIN" ? "/pedidos" : "/mis-solicitudes",
      icon: <AssignmentIcon />,
      match: (pathname: string) => pathname === "/pedidos" || pathname === "/mis-solicitudes" || /^\/pedidos\/(?!nuevo$).+/.test(pathname)
    },
    {
      label: "Solicitar cortes",
      to: user?.rol === "ADMIN" ? "/pedidos/nuevo" : "/solicitar",
      icon: <PostAddIcon />,
      match: (pathname: string) => pathname === "/pedidos/nuevo" || pathname === "/solicitar"
    },
    ...(user?.rol === "ADMIN"
      ? [
          { label: "Materiales", to: "/materiales", icon: <Inventory2Icon />, match: (pathname: string) => pathname === "/materiales" },
          { label: "Usuarios", to: "/usuarios", icon: <GroupIcon />, match: (pathname: string) => pathname === "/usuarios" }
        ]
      : [])
  ];

  useEffect(() => {
    const state = location.state as { notification?: string } | null;
    if (!state?.notification) return;

    setNotification(state.notification);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location, navigate]);

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "transparent" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, ml: `${drawerWidth}px`, width: `calc(100% - ${drawerWidth}px)` }}>
        <Toolbar sx={{ minHeight: 72, px: 3 }}>
          <Box sx={{ flexGrow: 1 }}>
            <Typography variant="overline" sx={{ color: "text.secondary", fontWeight: 900, letterSpacing: 1.2 }}>
              Carpinteria
            </Typography>
            <Typography variant="h6" sx={{ color: "text.primary", fontWeight: 900, letterSpacing: 0, lineHeight: 1.1 }}>
              Panel de solicitudes
            </Typography>
          </Box>
          <Avatar sx={{ width: 38, height: 38, mr: 1.25, background: "linear-gradient(135deg, #4f7cff, #23d6c8)", fontWeight: 900 }}>
            {user?.nombre?.[0] ?? "U"}
          </Avatar>
          <Typography variant="body2" sx={{ mr: 2, color: "text.secondary", fontWeight: 800 }}>
            {user?.nombre} {user?.apellido} - {user?.rol}
          </Typography>
          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            Salir
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box" }
        }}
      >
        <Box sx={{ px: 2.25, py: 2.5 }}>
          <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.72)", fontWeight: 900, letterSpacing: 1.2 }}>
            Business
          </Typography>
          <Typography variant="h6" sx={{ color: "#ffffff", fontWeight: 900, lineHeight: 1.1 }}>
            R O M A
          </Typography>
        </Box>
        <List sx={{ px: 1.25, py: 1 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              selected={item.match(location.pathname)}
              sx={{
                borderRadius: "8px",
                mb: 0.75,
                minHeight: 46,
                color: "rgba(255,255,255,0.78)",
                "& .MuiListItemIcon-root": { color: "inherit", minWidth: 38 },
                "&:hover": { bgcolor: alpha("#ffffff", 0.14), color: "#ffffff" },
                "&.Mui-selected": {
                  bgcolor: alpha("#ffffff", 0.22),
                  background: "rgba(255,255,255,0.22)",
                  boxShadow: "inset 3px 0 0 #ffffff, 0 12px 28px rgba(22, 76, 170, 0.18)",
                  color: "#ffffff",
                  "& .MuiListItemIcon-root": { color: "inherit" }
                },
                "&.Mui-selected:hover": { bgcolor: alpha("#ffffff", 0.24) }
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: { xs: 2.5, md: 3.5 }, width: `calc(100% - ${drawerWidth}px)` }}>
        <Toolbar />
        <Outlet />
      </Box>
      <Snackbar
        open={Boolean(notification)}
        autoHideDuration={4200}
        onClose={() => setNotification("")}
        anchorOrigin={{ vertical: "top", horizontal: "right" }}
        sx={{ mt: 8 }}
      >
        <Alert
          severity="success"
          variant="filled"
          onClose={() => setNotification("")}
          sx={{
            alignItems: "center",
            background: "linear-gradient(135deg, #21c383 0%, #23d6c8 100%)",
            borderRadius: "8px",
            boxShadow: "0 18px 42px rgba(33, 195, 131, 0.28)",
            fontWeight: 800
          }}
        >
          {notification}
        </Alert>
      </Snackbar>
    </Box>
  );
}
