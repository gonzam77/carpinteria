import { Router } from "express";
import { z } from "zod";
import { authenticate } from "../../middlewares/auth.js";
import { asyncHandler } from "../../utils/http.js";
import { getPushConfig, removePushSubscription, savePushSubscription } from "./push-notifications.service.js";

export const pushNotificationsRouter = Router();

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1)
  })
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url()
});

pushNotificationsRouter.use(authenticate);

pushNotificationsRouter.get(
  "/config",
  asyncHandler(async (_req: any, res: any) => {
    res.json(getPushConfig());
  })
);

pushNotificationsRouter.post(
  "/subscribe",
  asyncHandler(async (req: any, res: any) => {
    const subscription = subscriptionSchema.parse(req.body.subscription ?? req.body);
    await savePushSubscription(req.user.id, subscription as any, req.headers["user-agent"]);
    res.status(204).send();
  })
);

pushNotificationsRouter.post(
  "/unsubscribe",
  asyncHandler(async (req: any, res: any) => {
    const data = unsubscribeSchema.parse(req.body);
    await removePushSubscription(data.endpoint, req.user.id);
    res.status(204).send();
  })
);
