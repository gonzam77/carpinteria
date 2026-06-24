import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import { Alert, Button, Paper, Stack, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { api } from "../api/client";

type PushConfig = {
  enabled: boolean;
  publicKey: string;
};

type PushNotificationsCardProps = {
  compact?: boolean;
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

export function PushNotificationsCard({ compact = false }: PushNotificationsCardProps) {
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

  if (!supported) {
    return <Alert severity="info">Este navegador o contexto no soporta Web Push. Necesitas HTTPS o localhost y un navegador compatible.</Alert>;
  }

  return (
    <Paper sx={{ p: compact ? { xs: 1.5, sm: 2 } : { xs: 2, sm: 3 }, borderRadius: "8px" }}>
      <Stack spacing={compact ? 1.5 : 2}>
        <Stack spacing={0.5}>
          <Typography variant={compact ? "subtitle1" : "h6"}>Notificaciones en este dispositivo</Typography>
          <Typography color="text.secondary" variant={compact ? "body2" : "body1"}>
            Activa Web Push para recibir avisos cuando ingrese una nueva solicitud.
          </Typography>
        </Stack>
        {message && <Alert severity="success">{message}</Alert>}
        {!config?.enabled && <Alert severity="warning">Faltan configurar las claves VAPID del backend para habilitar las notificaciones push.</Alert>}
        <Stack direction={{ xs: "column", sm: compact ? "column" : "row" }} spacing={1.5}>
          <Button variant="contained" size={compact ? "small" : "medium"} startIcon={<NotificationsActiveIcon />} onClick={enableNotifications} disabled={loading || subscribed || !config?.enabled}>
            Activar notificaciones
          </Button>
          <Button variant="outlined" size={compact ? "small" : "medium"} startIcon={<NotificationsOffIcon />} onClick={disableNotifications} disabled={loading || !subscribed}>
            Desactivar
          </Button>
        </Stack>
      </Stack>
    </Paper>
  );
}
