import AssessmentIcon from "@mui/icons-material/Assessment";
import AssignmentIcon from "@mui/icons-material/Assignment";
import GroupIcon from "@mui/icons-material/Group";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LogoutIcon from "@mui/icons-material/Logout";
import PostAddIcon from "@mui/icons-material/PostAdd";
import { AppBar, Box, Button, Drawer, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography } from "@mui/material";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const drawerWidth = 248;

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Carpinteria Melamina
          </Typography>
          <Typography variant="body2" sx={{ mr: 2 }}>
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
        <Toolbar />
        <List sx={{ p: 1 }}>
          {navItems.map((item) => (
            <ListItemButton
              key={item.to}
              component={Link}
              to={item.to}
              selected={item.match(location.pathname)}
              sx={{
                borderRadius: 1,
                mb: 0.5,
                "&.Mui-selected": { bgcolor: "primary.main", color: "primary.contrastText", "& .MuiListItemIcon-root": { color: "inherit" } },
                "&.Mui-selected:hover": { bgcolor: "primary.dark" }
              }}
            >
              <ListItemIcon>{item.icon}</ListItemIcon>
              <ListItemText primary={item.label} />
            </ListItemButton>
          ))}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, width: `calc(100% - ${drawerWidth}px)` }}>
        <Toolbar />
        <Outlet />
      </Box>
    </Box>
  );
}
