import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, Paper, Stack, Tooltip, Typography } from "@mui/material";
import { alpha } from "@mui/material/styles";
import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";

type PushConfig = {
  enabled: boolean;
  publicKey: string;
};

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

async function getBrowserSubscription() {
  const registration = await navigator.serviceWorker.register("/sw.js");
  return registration.pushManager.getSubscription();
}

export function PushNotificationsControl() {
  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<PushConfig | null>(null);
  const [supported, setSupported] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const canUsePush = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && window.isSecureContext;
    setSupported(canUsePush);
    if (!canUsePush) return;

    api.get<PushConfig>("/push-notifications/config").then(async (response) => {
      setConfig(response.data);
      const existingSubscription = await getBrowserSubscription();
      setSubscribed(Boolean(existingSubscription));
    });
  }, []);

  async function refreshSubscriptionState() {
    if (!supported) return;
    const existingSubscription = await getBrowserSubscription();
    setSubscribed(Boolean(existingSubscription));
  }

  async function enableNotifications() {
    if (!config?.enabled) {
      setMessage("Configura primero las claves VAPID en el backend.");
      return;
    }

    setLoading(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("El navegador no concedio permisos para mostrar notificaciones.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const existingSubscription = await registration.pushManager.getSubscription();
      const subscription =
        existingSubscription ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(config.publicKey)
        }));

      await api.post("/push-notifications/subscribe", { subscription });
      setSubscribed(true);
      setMessage("Notificaciones activadas en este dispositivo.");
    } finally {
      setLoading(false);
    }
  }

  async function disableNotifications() {
    setLoading(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.register("/sw.js");
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api.post("/push-notifications/unsubscribe", { endpoint: subscription.endpoint });
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Notificaciones desactivadas en este dispositivo.");
    } finally {
      setLoading(false);
    }
  }

  const statusLabel = useMemo(() => {
    if (!supported) return "No disponible";
    if (subscribed) return "Activas";
    return "Inactivas";
  }, [subscribed, supported]);

  const statusTone = supported ? (subscribed ? "success" : "warning") : "default";

  return (
    <>
      <Tooltip title={`Notificaciones: ${statusLabel}`}>
        <Box sx={{ position: "relative", flexShrink: 0 }}>
          <IconButton
            onClick={async () => {
              await refreshSubscriptionState();
              setOpen(true);
            }}
            sx={{
              width: { xs: 38, sm: 42 },
              height: { xs: 38, sm: 42 },
              border: "1px solid",
              borderColor: subscribed ? alpha("#21c383", 0.34) : alpha("#ffb020", 0.34),
              bgcolor: subscribed ? alpha("#21c383", 0.1) : alpha("#ffb020", 0.12),
              color: subscribed ? "success.dark" : "warning.dark",
              "&:hover": {
                bgcolor: subscribed ? alpha("#21c383", 0.16) : alpha("#ffb020", 0.18)
              }
            }}
          >
            {subscribed ? <NotificationsActiveIcon fontSize="small" /> : <NotificationsOffIcon fontSize="small" />}
          </IconButton>
          <Box
            sx={{
              position: "absolute",
              right: 5,
              bottom: 5,
              width: 9,
              height: 9,
              borderRadius: "50%",
              border: "2px solid #ffffff",
              bgcolor: !supported ? "text.disabled" : subscribed ? "success.main" : "warning.main"
            }}
          />
        </Box>
      </Tooltip>

      <Dialog open={open} onClose={() => !loading && setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>Notificaciones de solicitudes</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 0.5 }}>
            <Paper
              sx={{
                p: 2,
                borderRadius: "12px",
                background: subscribed
                  ? "linear-gradient(135deg, rgba(33,195,131,0.12) 0%, rgba(35,214,200,0.08) 100%)"
                  : "linear-gradient(135deg, rgba(255,176,32,0.12) 0%, rgba(255,90,122,0.06) 100%)"
              }}
            >
              <Stack direction="row" spacing={1.5} alignItems="center">
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: "12px",
                    display: "grid",
                    placeItems: "center",
                    bgcolor: subscribed ? alpha("#21c383", 0.18) : alpha("#ffb020", 0.18),
                    color: subscribed ? "success.dark" : "warning.dark",
                    flexShrink: 0
                  }}
                >
                  {subscribed ? <NotificationsActiveIcon /> : <NotificationsOffIcon />}
                </Box>
                <Box>
                  <Typography fontWeight={900}>Estado: {statusLabel}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {subscribed
                      ? "Este dispositivo ya recibe avisos cuando ingresan nuevas solicitudes."
                      : "Activa Web Push para recibir avisos apenas entre una nueva solicitud."}
                  </Typography>
                </Box>
              </Stack>
            </Paper>

            {message && <Alert severity={subscribed ? "success" : "info"}>{message}</Alert>}
            {!supported && <Alert severity="info">Este navegador o contexto no soporta Web Push. Necesitas HTTPS o localhost y un navegador compatible.</Alert>}
            {supported && !config?.enabled && <Alert severity="warning">Faltan configurar las claves VAPID del backend para habilitar las notificaciones push.</Alert>}

            <Box sx={{ display: "grid", gap: 1.25, gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" } }}>
              <Button variant="contained" startIcon={<NotificationsActiveIcon />} onClick={enableNotifications} disabled={!supported || loading || subscribed || !config?.enabled}>
                Activar
              </Button>
              <Button variant="outlined" startIcon={<NotificationsOffIcon />} onClick={disableNotifications} disabled={!supported || loading || !subscribed} color={statusTone === "success" ? "success" : "inherit"}>
                Desactivar
              </Button>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)} disabled={loading}>
            Cerrar
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
