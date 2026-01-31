import fs from "fs";
import path from "path";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "..", ".env") });
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import morgan from "morgan";
import createHttpError from "http-errors";

import { config } from "./utils/config";
import { AudioCache } from "./services/audioCache";
import { NeteaseClient } from "./services/neteaseClient";
import { getDefaultCookie } from "./services/neteaseCookie";
import { createMusicRouter } from "./routes/musicRoutes";
import { createAlbumRouter } from "./routes/albumRoutes";

async function bootstrap(): Promise<void> {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("combined"));

  const cache = new AudioCache({
    baseDir: config.cache.baseDir,
    maxSizeBytes: config.cache.maxSizeBytes,
    ttlMs: config.cache.ttlMs,
  });
  await cache.init();

  if (config.netease.proxy) {
    process.env.HTTP_PROXY = config.netease.proxy;
    process.env.HTTPS_PROXY = config.netease.proxy;
  }

  const client = new NeteaseClient({
    cookie: getDefaultCookie() || config.netease.cookie,
    realIP: config.netease.realIp,
    proxy: config.netease.proxy,
    timeout: config.netease.timeoutMs,
  });

  app.use("/api", createMusicRouter({ cache, client }));
  // Mount album-related routes (search/detail/cache)
  app.use("/api", createAlbumRouter({ cache, client }));

  const webDist = path.resolve(__dirname, "..", "..", "web", "dist");
  const serveWeb = String(process.env.SERVE_WEB || "").toLowerCase() === "true" || process.env.NODE_ENV === 'production';
  if (serveWeb && fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get("/", (_req, res) => {
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use((req: Request, _res: Response, next: NextFunction) => {
    next(createHttpError(404, `Route not found: ${req.method} ${req.originalUrl}`));
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || 500;
    res.status(status).json({
      status,
      message: err.message || "Internal Server Error",
      details: err.details,
    });
  });

  app.listen(config.port, config.host, () => {
    console.log(`GWM music server listening on http://${config.host}:${config.port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start server", error);
  process.exit(1);
});

