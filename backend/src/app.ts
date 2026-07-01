import cors from "cors";
import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorMiddleware } from "./middlewares/error.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { companySettingsRouter } from "./modules/company-settings/company-settings.routes.js";
import { materialsRouter } from "./modules/materials/materials.routes.js";
import { optimizerSettingsRouter } from "./modules/optimizer-settings/optimizer-settings.routes.js";
import { ordersRouter } from "./modules/orders/orders.routes.js";
import { pushNotificationsRouter } from "./modules/push-notifications/push-notifications.routes.js";
import { statsRouter } from "./modules/stats/stats.routes.js";
import { usersRouter } from "./modules/users/users.routes.js";

export const app = express();

app.use(
  helmet({
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
  })
);
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.FRONTEND_URL.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origen no permitido por CORS: ${origin}`));
    },
    credentials: true
  })
);
app.use(express.json({ limit: "2mb" }));
app.use(morgan("dev"));

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/auth", authRouter);
app.use("/api/company-settings", companySettingsRouter);
app.use("/api/materiales", materialsRouter);
app.use("/api/optimizer-settings", optimizerSettingsRouter);
app.use("/api/users", usersRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/push-notifications", pushNotificationsRouter);
app.use("/api/stats", statsRouter);

app.use(errorMiddleware);


