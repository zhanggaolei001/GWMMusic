import fs from "fs";
import path from "path";
import { Router, Request, Response } from "express";
import createHttpError from "http-errors";

import { AudioCache, CacheEntry } from "../services/audioCache";
import { NeteaseClient, NeteaseRequestOptions } from "../services/neteaseClient";
import { config, defaultTag } from "../utils/config";
import { fetchAndCacheSong } from "../services/songService";
import { searchBiliVideos, fetchAndCacheFromBiliByKeywords, fetchAndCacheFromBiliByBvidCid, resolveFirstCid, fetchAndCacheFromBiliWithOptions } from "../services/biliService";
import { getDefaultCookie, setDefaultCookie, getCookieStatus, clearDefaultCookie } from "../services/neteaseCookie";
// music_api bilibili helpers
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createStreamProxy, updateCookie, getBilibiliCookies } = require("../../../music_api/util/biliApiHandler");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cache: biliCache } = require("../../../music_api/util/biliRequest");

type MusicDeps = {
  cache: AudioCache;
  client: NeteaseClient;
};

const inflightDownloads = new Map<string, Promise<CacheEntry>>();

const buildRequestOptions = (req: Request): NeteaseRequestOptions => ({
  cookie: req.get("x-netease-cookie") || getDefaultCookie() || config.netease.cookie,
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

async function serveCover(deps: MusicDeps, req: Request, res: Response): Promise<void> {
  const songId = Number.parseInt(req.params.id, 10);
  if (!Number.isFinite(songId)) {
    throw createHttpError(400, "Invalid song id");
  }
  const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
  const tag = tagParam || defaultTag;
  const options = buildRequestOptions(req);

  let entry = await deps.cache.get(tag, songId);
  if (!entry) {
    const key = `${tag}:${songId}`;
    let downloadPromise = inflightDownloads.get(key);
    if (!downloadPromise) {
      downloadPromise = fetchAndCacheSong({
        cache: deps.cache,
        client: deps.client,
        songId,
        tag,
        requestOptions: options,
      }).finally(() => {
        inflightDownloads.delete(key);
      });
      inflightDownloads.set(key, downloadPromise);
    }
    entry = await downloadPromise;
  }

  if (!entry.coverPath || !fs.existsSync(entry.coverPath)) {
    throw createHttpError(404, "Cover not found");
  }

  const filename = entry.metadata.coverFile || "cover.jpg";
  res.setHeader("Content-Disposition", `inline; filename=\"${encodeURIComponent(filename)}\"`);
  const mimeType = entry.metadata.coverFile?.endsWith(".png") ? "image/png" : "image/jpeg";
  res.setHeader("Content-Type", mimeType);
  const stats = fs.statSync(entry.coverPath);
  res.setHeader("Content-Length", stats.size.toString());
  const readStream = fs.createReadStream(entry.coverPath);

  await new Promise<void>((resolve, reject) => {
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

  router.get("/songs/:id/cover", async (req, res, next) => {
    try {
      await serveCover(deps, req, res);
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
      const desiredName = typeof req.query.filename === "string" ? req.query.filename : undefined;
      const format = typeof req.query.format === "string" ? String(req.query.format) : undefined;
      let entry;
      try {
        entry = await fetchAndCacheFromBiliWithOptions({ cache: deps.cache, tag, songId, keywords: q, desiredName, format, client: deps.client });
      } catch (e) {
        // fallback: resolve bvid/cid from search then download by bvid/cid
        const items = await searchBiliVideos(q, 5, 0);
        const bvid = (items[0] && (items[0].bvid || items[0].bvid_new || items[0].bvid_old)) as string | undefined;
        if (!bvid) throw e;
        const { cid } = await resolveFirstCid(bvid);
        entry = await fetchAndCacheFromBiliByBvidCid({ cache: deps.cache, tag, songId, bvid, cid, titleHint: desiredName || items[0]?.title, format, client: deps.client });
      }
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

      const entry = await fetchAndCacheFromBiliByBvidCid({ cache: deps.cache, tag, songId, bvid, cid, titleHint: `${bvid}` });
      await streamFromCache(entry, res, true);
    } catch (error) {
      next(error);
    }
  });

  router.get("/bili/streamByQuery", async (req, res, next) => {
    try {
      const q = String(req.query.q || req.query.keywords || "").trim();
      if (!q) return next(createHttpError(400, "Missing query (?q=)"));
      const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
      const tag = tagParam || defaultTag;
      const songId = Date.now();
      const entry = await fetchAndCacheFromBiliByKeywords({ cache: deps.cache, tag, songId, keywords: q });
      await streamFromCache(entry, res, false);
    } catch (error) {
      next(error);
    }
  });

  router.get("/bili/:bvid/stream", async (req, res, next) => {
    try {
      const { bvid } = req.params as { bvid: string };
      const { cid, title } = await resolveFirstCid(bvid);
      const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
      const tag = tagParam || defaultTag;
      const songId = Number.parseInt(String(req.query.id || cid), 10);
      const entry = await fetchAndCacheFromBiliByBvidCid({ cache: deps.cache, tag, songId, bvid, cid, titleHint: title });
      await streamFromCache(entry, res, false);
    } catch (error) {
      next(error);
    }
  });

  router.get("/bili/:bvid/download", async (req, res, next) => {
    try {
      const { bvid } = req.params as { bvid: string };
      const { cid, title } = await resolveFirstCid(bvid);
      const tagParam = typeof req.query.tag === "string" && req.query.tag.trim() !== "" ? req.query.tag : defaultTag;
      const tag = tagParam || defaultTag;
      const songId = Number.parseInt(String(req.query.id || cid), 10);
      const desiredName = typeof req.query.filename === "string" ? req.query.filename : undefined;
      const format = typeof req.query.format === "string" ? String(req.query.format) : undefined;
      const entry = await fetchAndCacheFromBiliByBvidCid({ cache: deps.cache, tag, songId, bvid, cid, titleHint: desiredName || title, format, client: deps.client });
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
      const cookieCache = path.join(__dirname, "../../../music_api/cache/bilibili_cookies.json");
      try { if (fs.existsSync(cookieCache)) fs.rmSync(cookieCache); } catch { }
      res.json({ code: 0, message: "Bilibili cache cleared" });
    } catch (error) {
      next(error);
    }
  });

  // NetEase cookie management (persist for your own use)
  router.post("/netease/update-cookie", async (req, res, next) => {
    try {
      const cookie = String(req.body?.cookie || "").trim();
      if (!cookie) return next(createHttpError(400, "Missing cookie"));
      await setDefaultCookie(cookie);
      res.json({ code: 0, message: "NetEase cookie updated" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/netease/cookie", async (_req, res, next) => {
    try {
      const status = getCookieStatus();
      res.json({ code: 0, ...status });
    } catch (error) {
      next(error);
    }
  });

  router.get("/netease/clear-cookie", async (_req, res, next) => {
    try {
      await clearDefaultCookie();
      res.json({ code: 0, message: "NetEase cookie cleared" });
    } catch (error) {
      next(error);
    }
  });

  router.get("/cache", async (req, res, next) => {
    try {
      const limit = Number.parseInt(String(req.query.limit || 0), 10) || 0;
      const offset = Number.parseInt(String(req.query.offset || 0), 10) || 0;
      const tagFilter = typeof req.query.tag === 'string' ? String(req.query.tag).trim() : '';
      const q = typeof req.query.q === 'string' ? String(req.query.q).trim().toLowerCase() : '';
      const sort = typeof req.query.sort === 'string' ? String(req.query.sort) : 'lastAccessedAt:desc';

      const allEntries = await deps.cache.list();
      let items = allEntries;
      if (tagFilter) items = items.filter(e => e.metadata.tag === tagFilter);
      if (q) {
        items = items.filter(e => {
          const title = (e.metadata.title || e.metadata.audioFile || '').toLowerCase();
          const artists = (e.metadata.artists || []).join(' / ').toLowerCase();
          const album = (e.metadata.album || '').toLowerCase();
          return title.includes(q) || artists.includes(q) || album.includes(q);
        });
      }
      const [sortKey, sortDir] = sort.split(':');
      items.sort((a, b) => {
        const getVal = (e: typeof a) => {
          if (sortKey === 'size') return e.metadata.size;
          if (sortKey === 'createdAt') return new Date(e.metadata.createdAt).getTime();
          // default lastAccessedAt
          return new Date(e.metadata.lastAccessedAt).getTime();
        };
        const va = getVal(a);
        const vb = getVal(b);
        return (va - vb) * (sortDir?.toLowerCase() === 'asc' ? 1 : -1);
      });

      const total = items.length;
      const paged = limit > 0 ? items.slice(offset, offset + limit) : items;

      const mapped = paged.map((entry) => {
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
      });

      if (limit > 0) {
        res.setHeader('X-Total-Count', String(total));
        res.setHeader('X-Page-Limit', String(limit));
        res.setHeader('X-Page-Offset', String(offset));
      }
      res.json(mapped);
    } catch (error) {
      next(error);
    }
  });

  router.delete('/cache/:tag/:id', async (req, res, next) => {
    try {
      const tag = String(req.params.tag);
      const id = Number.parseInt(String(req.params.id), 10);
      if (!tag || !Number.isFinite(id)) return next(createHttpError(400, 'Invalid tag or id'));
      await deps.cache.remove(tag, id);
      res.json({ code: 0, message: 'Deleted' });
    } catch (error) {
      next(error);
    }
  });

  return router;
};




















