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

export async function sendNewOrderPushNotification(order: { id: string; cliente: string; numeroContacto?: string | null }) {
  if (!isPushConfigured) return;

  const subscriptions = await prisma.pushSubscription.findMany({
    where: {
      usuario: { rol: Rol.ADMIN }
    },
    include: { usuario: true }
  });

  const payload = JSON.stringify({
    title: "Nueva solicitud recibida",
    body: `${order.cliente}${order.numeroContacto ? ` - ${order.numeroContacto}` : ""}`,
    url: `/pedidos/${order.id}`
  });

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
          payload
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
