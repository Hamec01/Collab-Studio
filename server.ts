import express from "express";
import path from "path";
import fs from "fs/promises";
import { createServer as createViteServer, type ViteDevServer } from "vite";
import dotenv from "dotenv";
import helmet from "helmet";
import authRouter from "./src/server/routes/auth";
import projectsRouter from "./src/server/routes/projects";
import collaborationRouter from "./src/server/routes/collaboration";
import notificationsRouter from "./src/server/routes/notifications";
import geminiRouter from "./src/server/routes/gemini";
import policyRouter from "./src/server/routes/policy";
import { profileRouter, publicRouter } from "./src/server/routes/profile";
import { publicationRouter, publicPublicationRouter } from "./src/server/routes/publications";
import discoverRouter from "./src/server/routes/discover";
import commentsRouter from "./src/server/routes/comments";
import dmRouter from "./src/server/routes/dm";
import seoRouter from "./src/server/routes/seo";
import { getProfileMeta, getPublicationMeta } from "./src/server/services/seo";
import { getConfig } from "./src/server/config";
import { createSessionMiddleware } from "./src/server/session";
import { checkDatabaseReady } from "./src/server/db";
import { errorHandler, notFound } from "./src/server/middleware/errors";
import { requireTrustedOrigin } from "./src/server/middleware/origin";
import { apiRateLimit } from "./src/server/middleware/rateLimits";
import { requestId, requestLogger } from "./src/server/middleware/request";

dotenv.config();

const config = getConfig();
const app = express();
const PORT = config.PORT;
const isHttps = config.APP_URL.startsWith("https://");

if (config.TRUST_PROXY) {
  app.set("trust proxy", 1);
}

app.use(requestId);
app.use(requestLogger);
app.use(
  helmet({
    strictTransportSecurity: isHttps,
    crossOriginOpenerPolicy: isHttps,
    originAgentCluster: isHttps,
    contentSecurityPolicy: {
      directives: {
        upgradeInsecureRequests: isHttps ? [] : null,
      },
    },
  }),
);

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
app.use("/api/publications", publicationRouter);
app.use("/api", policyRouter);
app.use("/api/profile", profileRouter);
app.use("/api/public", publicRouter);
app.use("/api/public", publicPublicationRouter);
app.use("/api/discover", discoverRouter);
app.use("/api", commentsRouter);
app.use("/api", dmRouter);
app.use("/", seoRouter);


// REST Endpoints
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/ready", async (_req, res) => {
  const ready = await checkDatabaseReady();
  if (!ready) {
    res.status(503).json({ status: "not_ready" });
    return;
  }
  res.json({ status: "ready" });
});

app.use("/api", notFound);

// Start Server and mount Vite middleware
async function startServer() {
  let vite: ViteDevServer | undefined;
  if (process.env.NODE_ENV !== "production") {
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist"), { index: false }));
  }

  // Intercept routes for SSR SEO injection
  app.get("*", async (req, res, next) => {
    try {
      let metaTags: string | null = null;
      
      const uMatch = req.path.match(/^\/u\/([^/]+)$/);
      if (uMatch) metaTags = await getProfileMeta(uMatch[1]);
      
      const worksMatch = req.path.match(/^\/works\/([^/]+)$/);
      if (worksMatch) metaTags = await getPublicationMeta(worksMatch[1], "WORK");
      
      const collabsMatch = req.path.match(/^\/collabs\/([^/]+)$/);
      if (collabsMatch) metaTags = await getPublicationMeta(collabsMatch[1], "COLLAB");

      let html: string;
      if (vite) {
        html = await fs.readFile(path.join(process.cwd(), "index.html"), "utf-8");
        html = await vite.transformIndexHtml(req.originalUrl, html);
      } else {
        html = await fs.readFile(path.join(process.cwd(), "dist/index.html"), "utf-8");
      }

      if (metaTags) {
        html = html.replace("<!-- SSR_META -->", metaTags);
      }

      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      if (vite) vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });

  app.use(errorHandler);

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
