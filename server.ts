import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import helmet from "helmet";
import authRouter from "./src/server/routes/auth";
import projectsRouter from "./src/server/routes/projects";
import collaborationRouter from "./src/server/routes/collaboration";
import notificationsRouter from "./src/server/routes/notifications";
import geminiRouter from "./src/server/routes/gemini";
import { getConfig } from "./src/server/config";
import { createSessionMiddleware } from "./src/server/session";
import { errorHandler, notFound } from "./src/server/middleware/errors";
import { requireTrustedOrigin } from "./src/server/middleware/origin";
import { apiRateLimit } from "./src/server/middleware/rateLimits";
import { requestId, requestLogger } from "./src/server/middleware/request";

dotenv.config();

const config = getConfig();
const app = express();
const PORT = config.PORT;

if (config.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(requestId);
app.use(requestLogger);
app.use(helmet());

// JSON APIs no longer carry file content
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ limit: "1mb", extended: true }));
app.use(createSessionMiddleware());
app.use(requireTrustedOrigin);
app.use("/api", apiRateLimit);
app.use("/api/auth", authRouter);
app.use("/api/projects", projectsRouter);
app.use("/api/projects", collaborationRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/gemini", geminiRouter);


// REST Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api", notFound);

// Start Server and mount Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use(errorHandler);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
