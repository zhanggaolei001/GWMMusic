import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import createHttpError from "http-errors";

import { AudioCache, CacheEntry } from "../services/audioCache";
import { NeteaseClient, NeteaseRequestOptions } from "../services/neteaseClient";
import { config, defaultTag } from "../utils/config";
import { fetchAndCacheSong } from "../services/songService";
import { searchBiliVideos, fetchAndCacheFromBiliByKeywords } from "../services/biliService";
import path from "path";
import fs from "fs";
// vendor bilibili helpers
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createStreamProxy, updateCookie, getBilibiliCookies } = require("../../../vendor/util/biliApiHandler");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cache: biliCache } = require("../../../vendor/util/biliRequest");

type MusicDeps = {
  cache: AudioCache;
  client: NeteaseClient;
};

const inflightDownloads = new Map<string, Promise<CacheEntry>>();

const buildRequestOptions = (req: Request): NeteaseRequestOptions => ({
  cookie: req.get("x-netease-cookie") || config.netease.cookie,
  realIP: req.get("x-real-ip") || config.netease.realIp,
  proxy: config.netease.proxy,
  timeout: config.netease.timeoutMs,
});

const streamFromCache = (entry: CacheEntry, res: Response, attachment: boolean) => {
  const disposition = attachment ? "attachment" : "inline";
  const filename = entry.metadata.audioFile;
  if (filename) {
    res.setHeader("Content-Disposition", `${disposition}; filename="${encodeURIComponent(filename)}"`);
  } else {
    res.setHeader("Content-Disposition", disposition);
  }
  res.setHeader("Content-Type", entry.metadata.mimeType);
  res.setHeader("Content-Length", entry.metadata.size.toString());
  const readStream = fs.createReadStream(entry.audioPath);
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      readStream.off("error", onError);
      res.off("close", onClose);
      res.off("finish", onClose);
    };
    const onError = (err: Error) => {
      cleanup();
      reject(err);
    };
    const onClose = () => {
      cleanup();
      resolve();
    };
    readStream.on("error", onError);
    res.once("close", onClose);
    res.once("finish", onClose);
    readStream.pipe(res).on("error", onError);
  });
};

async function serveSong(
  deps: MusicDeps,
  req: Request,
  res: Response,
  attachment: boolean,
): Promise<void> {
  const songId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(songId)) {
    throw createHttpError(400, "Invalid song id");
  }
  const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
  const tag = tagParam || defaultTag;
  const bitrate = req.query.br ? Number.parseInt(String(req.query.br), 10) : undefined;
  const options = buildRequestOptions(req);

  const cached = await deps.cache.get(tag, songId);
  if (cached) {
    await streamFromCache(cached, res, attachment);
    if (cached.transient) {
      await deps.cache.remove(tag, songId).catch(() => undefined);
    }
    return;
  }

  const key = `${tag}:${songId}`;
  let downloadPromise = inflightDownloads.get(key);
  if (!downloadPromise) {
    downloadPromise = fetchAndCacheSong({
      cache: deps.cache,
      client: deps.client,
      songId,
      tag,
      bitrate,
      requestOptions: options,
    }).finally(() => {
      inflightDownloads.delete(key);
    });
    inflightDownloads.set(key, downloadPromise);
  }
  const entry = await downloadPromise;
  await streamFromCache(entry, res, attachment);
  if (entry.transient) {
    await deps.cache.remove(tag, songId).catch(() => undefined);
  }
}

export const createMusicRouter = (deps: MusicDeps): Router => {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.json({ status: "ok", cacheDir: config.cache.baseDir });
  });

  router.get("/search", async (req, res, next) => {
    const keywords = req.query.q || req.query.keywords;
    if (!keywords || typeof keywords !== "string") {
      return next(createHttpError(400, "Missing search query (?q=)"));
    }
    const type = Number.parseInt(String(req.query.type || "1"), 10);
    const limit = Number.parseInt(String(req.query.limit || "30"), 10);
    const offset = Number.parseInt(String(req.query.offset || "0"), 10);
    const source = String(req.query.source || "netease");

    try {
      if (source === "bili" || source === "bilibili") {
        const items = await searchBiliVideos(String(keywords), limit, offset);
        res.json({ songs: type === 1 ? items : undefined, playlists: type === 1000 ? items : undefined, items });
      } else {
        const response = await deps.client.call<any>("cloudsearch", {
          keywords,
          type,
          limit,
          offset,
        }, buildRequestOptions(req));
        res.json(response.result || response);
      }
    } catch (error) {
      next(error);
    }
  });

  router.get("/playlists/:id", async (req, res, next) => {
    const { id } = req.params;
    try {
      const detail = await deps.client.call<any>("playlist_detail", { id }, buildRequestOptions(req));
      res.json(detail);
    } catch (error) {
      next(error);
    }
  });

  router.get("/playlists/:id/tracks", async (req, res, next) => {
    const { id } = req.params;
    const limit = Number.parseInt(String(req.query.limit || "200"), 10);
    try {
      const tracks = await deps.client.call<any>("playlist_track_all", { id, limit }, buildRequestOptions(req));
      res.json(tracks);
    } catch (error) {
      next(error);
    }
  });

  router.get("/songs/:id", async (req, res, next) => {
    const { id } = req.params;
    try {
      const detail = await deps.client.call<any>("song_detail", { ids: String(id) }, buildRequestOptions(req));
      res.json(detail);
    } catch (error) {
      next(error);
    }
  });

  router.get("/songs/:id/lyrics", async (req, res, next) => {
    const { id } = req.params;
    try {
      const lyrics = await deps.client.call<any>("lyric", { id }, buildRequestOptions(req));
      res.json(lyrics);
    } catch (error) {
      next(error);
    }
  });

  router.get("/songs/:id/stream", async (req, res, next) => {
    try {
      await serveSong(deps, req, res, false);
    } catch (error) {
      next(error);
    }
  });

  router.get("/songs/:id/download", async (req, res, next) => {
    try {
      await serveSong(deps, req, res, true);
    } catch (error) {
      next(error);
    }
  });

  // Bilibili helpers
  router.get("/bili/downloadByQuery", async (req, res, next) => {
    try {
      const q = String(req.query.q || req.query.keywords || "").trim();
      if (!q) {
        return next(createHttpError(400, "Missing query (?q=)"));
      }
      const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
      const tag = tagParam || defaultTag;
      const idRaw = req.query.id;
      const songId = Number.isFinite(Number(idRaw)) ? Number(idRaw) : Date.now();
      const entry = await fetchAndCacheFromBiliByKeywords({ cache: deps.cache, tag, songId, keywords: q });
      await streamFromCache(entry, res, true);
    } catch (error) {
      next(error);
    }
  });

  router.get("/bili/:bvid/:cid/download", async (req, res, next) => {
    try {
      const { bvid, cid } = req.params as { bvid: string; cid: string };
      const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
      const tag = tagParam || defaultTag;
      const songId = Number.parseInt(String(req.query.id || cid), 10);
      if (!bvid || !cid || !Number.isFinite(songId)) {
        return next(createHttpError(400, "Invalid bvid/cid/id"));
      }

      // Reuse the keyword based flow using bvid as keyword to keep code small
      const entry = await fetchAndCacheFromBiliByKeywords({ cache: deps.cache, tag, songId, keywords: bvid });
      await streamFromCache(entry, res, true);
    } catch (error) {
      next(error);
    }
  });

  // Bilibili stream proxy with proper headers
  router.get("/bilibili/stream-proxy", async (req, res, next) => {
    try {
      const url = String(req.query.url || "");
      if (!url) {
        return next(createHttpError(400, "Missing url"));
      }
      await createStreamProxy(url, {}, req, res);
    } catch (error) {
      next(error);
    }
  });

  // Bilibili cookie management
  router.post("/bilibili/update-cookie", async (req, res, next) => {
    try {
      const cookie = String(req.body?.cookie || "");
      if (!cookie) return next(createHttpError(400, "Missing cookie"));
      const ok = updateCookie(cookie);
      if (!ok) return next(createHttpError(400, "Invalid cookie"));
      res.json({ code: 0, message: "Cookie updated" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/bilibili/refresh-cookie", async (_req, res, next) => {
    try {
      const cookie = await getBilibiliCookies();
      if (cookie) updateCookie(cookie);
      res.json({ code: 0, message: "Cookie refreshed", hasCookie: Boolean(cookie) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/bilibili/clear-cache", async (_req, res, next) => {
    try {
      // reset in-memory cache
      biliCache.buvid = '';
      biliCache.wbiKeys = null;
      biliCache.lastWbiKeysFetchTime = 0;
      // remove cookie cache file
      const cookieCache = path.join(__dirname, "../../../vendor/cache/bilibili_cookies.json");
      try { if (fs.existsSync(cookieCache)) fs.rmSync(cookieCache); } catch {}
      res.json({ code: 0, message: "Bilibili cache cleared" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cache", async (_req, res, next) => {
    try {
      const entries = await deps.cache.list();
      res.json(
        entries.map((entry) => {
          const audioRelative = path.relative(config.cache.baseDir, entry.audioPath);
          const lyricsRelative = entry.lyricsPath ? path.relative(config.cache.baseDir, entry.lyricsPath) : undefined;
          const coverRelative = entry.coverPath ? path.relative(config.cache.baseDir, entry.coverPath) : undefined;
          return {
            id: entry.metadata.id,
            tag: entry.metadata.tag,
            title: entry.metadata.title,
            artists: entry.metadata.artists,
            album: entry.metadata.album,
            size: entry.metadata.size,
            mimeType: entry.metadata.mimeType,
            createdAt: entry.metadata.createdAt,
            lastAccessedAt: entry.metadata.lastAccessedAt,
            audioFile: entry.metadata.audioFile,
            lyricsFile: entry.metadata.lyricsFile,
            coverFile: entry.metadata.coverFile,
            folder: entry.metadata.folder,
            audioPath: audioRelative,
            lyricsPath: lyricsRelative,
            coverPath: coverRelative,
            hasLyrics: Boolean(entry.metadata.lyricsFile && entry.lyricsPath),
            hasCover: Boolean(entry.metadata.coverFile && entry.coverPath),
            durationSeconds: entry.metadata.durationSeconds,
            bitrateKbps: entry.metadata.bitrateKbps,
          };
        }),
      );
    } catch (error) {
      next(error);
    }
  });

  return router;
};




















