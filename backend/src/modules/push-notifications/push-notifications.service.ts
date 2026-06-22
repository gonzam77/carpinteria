import webpush, { PushSubscription as WebPushSubscription } from "web-push";
import { prisma } from "../../config/prisma.js";
import { env } from "../../config/env.js";
import { Rol } from "../../generated/prisma/client.js";

const isPushConfigured = Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && env.PUSH_VAPID_SUBJECT);

if (isPushConfigured) {
  webpush.setVapidDetails(env.PUSH_VAPID_SUBJECT, env.PUSH_VAPID_PUBLIC_KEY, env.PUSH_VAPID_PRIVATE_KEY);
}

export function getPushConfig() {
  return {
    enabled: isPushConfigured,
    publicKey: env.PUSH_VAPID_PUBLIC_KEY
  };
}

export async function savePushSubscription(userId: string, subscription: WebPushSubscription, userAgent?: string) {
  await prisma.pushSubscription.upsert({
    where: { endpoint: subscription.endpoint },
    update: {
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
      usuarioId: userId
    },
    create: {
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      userAgent: userAgent ?? null,
      usuarioId: userId
    }
  });
}

export async function removePushSubscription(endpoint: string, userId: string) {
  await prisma.pushSubscription.deleteMany({
    where: { endpoint, usuarioId: userId }
  });
}

async function cleanupInvalidSubscription(endpoint: string) {
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
}

async function sendPushToAdminSubscriptions(payload: { title: string; body: string; url: string }) {
  if (!isPushConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      usuario: { rol: Rol.ADMIN }
    }
  });

  const serializedPayload = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          serializedPayload
        );
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) {
          await cleanupInvalidSubscription(subscription.endpoint);
          return;
        }
        console.error("Push notification error", error);
      }
    })
  );
}

export async function sendNewOrderPushNotification(order: { id: string; cliente: string; numeroContacto?: string | null }) {
  await sendPushToAdminSubscriptions({
    title: "Nueva solicitud recibida",
    body: `${order.cliente}${order.numeroContacto ? ` - ${order.numeroContacto}` : ""}`,
    url: `/pedidos/${order.id}`
  });
}

export async function sendOrderStockShortagePushNotification(order: { id: string; cliente: string }, shortages: Array<{ materialNombre: string; disponible: number; requerido: number }>) {
  if (!shortages.length) return;

  const summary = shortages
    .slice(0, 2)
    .map((item) => `${item.materialNombre}: ${item.disponible}/${item.requerido}`)
    .join(" - ");

  await sendPushToAdminSubscriptions({
    title: "Alerta de stock insuficiente",
    body: `${order.cliente} - ${summary}${shortages.length > 2 ? " - ..." : ""}`,
    url: `/pedidos/${order.id}`
  });
}
