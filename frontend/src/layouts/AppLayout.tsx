import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import AssessmentIcon from "@mui/icons-material/Assessment";
import AssignmentIcon from "@mui/icons-material/Assignment";
import GroupIcon from "@mui/icons-material/Group";
import BusinessIcon from "@mui/icons-material/Business";
import Inventory2Icon from "@mui/icons-material/Inventory2";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PostAddIcon from "@mui/icons-material/PostAdd";
import RequestQuoteIcon from "@mui/icons-material/RequestQuote";
import SettingsIcon from "@mui/icons-material/Settings";
import TuneIcon from "@mui/icons-material/Tune";
import { Alert, AppBar, Avatar, Box, Button, Collapse, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Snackbar, Toolbar, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";
import { PushNotificationsControl } from "../components/PushNotificationsControl";
import { useAuth } from "../context/AuthContext";
import { useCompanySettings } from "../context/CompanySettingsContext";

const drawerWidth = 236;

export function AppLayout() {
  const { user, logout } = useAuth();
  const { settings: companySettings } = useCompanySettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [notification, setNotification] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);

  const mainNavItems = [
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
    }
  ];

  const settingsNavItems = useMemo(
    () =>
      user?.rol === "ADMIN"
        ? [
            { label: "Optimizador", to: "/configuracion-optimizador", icon: <TuneIcon />, match: (pathname: string) => pathname === "/configuracion-optimizador" },
            { label: "Presupuesto", to: "/configuracion-presupuesto", icon: <RequestQuoteIcon />, match: (pathname: string) => pathname === "/configuracion-presupuesto" },
            { label: "Materiales", to: "/materiales", icon: <Inventory2Icon />, match: (pathname: string) => pathname === "/materiales" },
            { label: "Empresa", to: "/configuracion-empresa", icon: <BusinessIcon />, match: (pathname: string) => pathname === "/configuracion-empresa" },
            { label: "Usuarios", to: "/usuarios", icon: <GroupIcon />, match: (pathname: string) => pathname === "/usuarios" }
          ]
        : [],
    [user?.rol]
  );

  const settingsSectionActive = settingsNavItems.some((item) => item.match(location.pathname));
  const [settingsOpen, setSettingsOpen] = useState(settingsSectionActive);

  useEffect(() => {
    if (settingsSectionActive) {
      setSettingsOpen(true);
    }
  }, [settingsSectionActive]);

  useEffect(() => {
    const state = location.state as { notification?: string } | null;
    if (!state?.notification) return;

    setNotification(state.notification);
    navigate(location.pathname + location.search, { replace: true, state: {} });
  }, [location, navigate]);

  const navItemSx = {
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
  };

  const drawerContent = (
    <>
      <Box sx={{ px: 2.25, py: 2.5 }}>
        <Typography variant="overline" sx={{ color: "rgba(255,255,255,0.72)", fontWeight: 900, letterSpacing: 1.2 }}>
          Empresa
        </Typography>
        <Typography variant="h6" sx={{ color: "#ffffff", fontWeight: 900, lineHeight: 1.1 }}>
          {companySettings.nombre}
        </Typography>
      </Box>
      <List sx={{ px: 1.25, py: 1 }}>
        {mainNavItems.map((item) => (
          <ListItemButton
            key={item.to}
            component={Link}
            to={item.to}
            selected={item.match(location.pathname)}
            onClick={() => setMobileOpen(false)}
            sx={navItemSx}
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
          </ListItemButton>
        ))}

        {settingsNavItems.length > 0 && (
          <>
            <ListItemButton
              onClick={() => setSettingsOpen((current) => !current)}
              selected={settingsSectionActive}
              sx={{
                ...navItemSx,
                mt: 0.5,
                mb: settingsOpen ? 0.25 : 0.75
              }}
            >
              <ListItemIcon>
                <SettingsIcon />
              </ListItemIcon>
              <ListItemText primary="Configuracion" />
              {settingsOpen ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            </ListItemButton>

            <Collapse in={settingsOpen} timeout="auto" unmountOnExit>
              <List disablePadding sx={{ pl: 1 }}>
                {settingsNavItems.map((item) => (
                  <ListItemButton
                    key={item.to}
                    component={Link}
                    to={item.to}
                    selected={item.match(location.pathname)}
                    onClick={() => setMobileOpen(false)}
                    sx={{
                      ...navItemSx,
                      minHeight: 42,
                      ml: 1,
                      pl: 1.25,
                      pr: 1,
                      background: item.match(location.pathname) ? undefined : alpha("#ffffff", 0.06)
                    }}
                  >
                    <ListItemIcon sx={{ minWidth: 34 }}>{item.icon}</ListItemIcon>
                    <ListItemText
                      primary={item.label}
                      primaryTypographyProps={{ fontSize: 14, fontWeight: item.match(location.pathname) ? 800 : 700 }}
                    />
                  </ListItemButton>
                ))}
              </List>
            </Collapse>
          </>
        )}
      </List>
    </>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "transparent" }}>
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, ml: { md: `${drawerWidth}px` }, width: { xs: "100%", md: `calc(100% - ${drawerWidth}px)` } }}>
        <Toolbar sx={{ minHeight: { xs: 64, sm: 72 }, px: { xs: 1.5, sm: 2.5, md: 3 }, gap: { xs: 1, sm: 1.5 } }}>
          <IconButton color="inherit" aria-label="Abrir menu" edge="start" onClick={() => setMobileOpen(true)} sx={{ display: { md: "none" }, flexShrink: 0 }}>
            <MenuIcon />
          </IconButton>
          <Box sx={{ flexGrow: 1, minWidth: 0 }}>
            <Typography variant="overline" sx={{ color: "text.secondary", display: { xs: "none", sm: "block" }, fontWeight: 900, letterSpacing: 1.2 }}>
              {companySettings.nombre}
            </Typography>
            <Typography noWrap variant="h6" sx={{ color: "text.primary", fontSize: { xs: "1rem", sm: "1.25rem" }, fontWeight: 900, letterSpacing: 0, lineHeight: 1.1 }}>
              Panel de solicitudes
            </Typography>
          </Box>
          <PushNotificationsControl />
          <Avatar sx={{ width: { xs: 34, sm: 38 }, height: { xs: 34, sm: 38 }, background: "linear-gradient(135deg, #4f7cff, #23d6c8)", flexShrink: 0, fontWeight: 900 }}>
            {user?.nombre?.[0] ?? "U"}
          </Avatar>
          <Typography noWrap variant="body2" sx={{ color: "text.secondary", display: { xs: "none", md: "block" }, fontWeight: 800, maxWidth: 260 }}>
            {user?.nombre} {user?.apellido} - {user?.rol}
          </Typography>
          <Button
            color="inherit"
            startIcon={<LogoutIcon />}
            onClick={() => {
              logout();
              navigate("/login");
            }}
            sx={{ px: { xs: 1.25, sm: 2.25 }, flexShrink: 0, minWidth: { xs: 0, sm: 64 } }}
          >
            Salir
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: "block", md: "none" },
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box" }
        }}
      >
        {drawerContent}
      </Drawer>
      <Drawer
        variant="permanent"
        sx={{
          display: { xs: "none", md: "block" },
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box" }
        }}
      >
        {drawerContent}
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, maxWidth: "100%", overflowX: "hidden", p: { xs: 2, sm: 2.5, md: 3.5 }, width: { xs: "100%", md: `calc(100% - ${drawerWidth}px)` } }}>
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
