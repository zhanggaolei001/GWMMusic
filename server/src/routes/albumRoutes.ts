import { Router, Request, Response, NextFunction } from "express";
import createHttpError from "http-errors";

import { AudioCache } from "../services/audioCache";
import { NeteaseClient, NeteaseRequestOptions } from "../services/neteaseClient";
import { fetchAndCacheSong } from "../services/songService";
import { config, defaultTag } from "../utils/config";

interface AlbumDeps {
  cache: AudioCache;
  client: NeteaseClient;
}

const buildRequestOptions = (req: Request): NeteaseRequestOptions => ({
  cookie: req.get("x-netease-cookie") || config.netease.cookie,
  realIP: req.get("x-real-ip") || config.netease.realIp,
  proxy: config.netease.proxy,
  timeout: config.netease.timeoutMs,
});

export const createAlbumRouter = (deps: AlbumDeps): Router => {
  const router = Router();

  router.get("/albums/search", async (req: Request, res: Response, next: NextFunction) => {
    const keywords = (req.query.q || req.query.keywords) as string | undefined;
    if (!keywords || keywords.trim() === "") {
      return next(createHttpError(400, "Missing album search query (?q=)"));
    }

    const limit = Number.parseInt(String(req.query.limit || "20"), 10);
    const offset = Number.parseInt(String(req.query.offset || "0"), 10);

    try {
      const response = await deps.client.call<any>("cloudsearch", {
        keywords,
        type: 10,
        limit,
        offset,
      }, buildRequestOptions(req));

      const result = response?.result || {};
      const albums = (result.albums || []).map((album: any) => ({
        id: album.id,
        name: album.name,
        artist: album.artist?.name,
        artists: album.artists?.map((artist: any) => artist.name) || [],
        size: album.size,
        picUrl: album.picUrl,
        publishTime: album.publishTime,
        company: album.company,
        description: album.description,
      }));

      res.json({ albums, total: result.albumCount ?? albums.length });
    } catch (error) {
      next(error);
    }
  });

  router.get("/albums/:id", async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    if (!id) {
      return next(createHttpError(400, "Missing album id"));
    }

    try {
      const data = await deps.client.call<any>("album", { id }, buildRequestOptions(req));
      const album = data?.album || {};
      const songs = (data?.songs || []).map((song: any) => ({
        id: song.id,
        name: song.name,
        artists: (song.ar || song.artists || []).map((artist: any) => artist.name),
        durationMs: song.dt || song.duration || 0,
        bitrate: song.privilege?.br,
      }));

      res.json({
        album: {
          id: album.id,
          name: album.name,
          description: album.description,
          picUrl: album.picUrl,
          publishTime: album.publishTime,
          company: album.company,
          size: album.size,
        },
        tracks: songs,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/albums/:id/cache", async (req: Request, res: Response, next: NextFunction) => {
    const { id } = req.params;
    const { trackIds, tag = defaultTag, bitrate } = req.body || {};

    if (!Array.isArray(trackIds) || trackIds.length === 0) {
      return next(createHttpError(400, "trackIds must be a non-empty array"));
    }

    const uniqueIds = Array.from(new Set(trackIds.map((value: any) => Number.parseInt(String(value), 10)).filter(Number.isFinite)));
    if (uniqueIds.length === 0) {
      return next(createHttpError(400, "trackIds must contain valid numeric values"));
    }

    const requestOptions = buildRequestOptions(req);
    const results: Array<{ id: number; status: string; transient?: boolean; message?: string }> = [];

    for (const trackId of uniqueIds) {
      try {
        const existing = await deps.cache.get(tag, trackId);
        if (existing && !existing.transient) {
          results.push({ id: trackId, status: "cached" });
          continue;
        }

        const entry = await fetchAndCacheSong({
          cache: deps.cache,
          client: deps.client,
          songId: trackId,
          tag,
          bitrate,
          requestOptions,
        });

        results.push({ id: trackId, status: entry.transient ? "transient" : "cached", transient: entry.transient });

        if (entry.transient) {
          await deps.cache.remove(tag, trackId).catch(() => undefined);
        }
      } catch (error: any) {
        results.push({ id: trackId, status: "error", message: error?.message || "download failed" });
      }
    }

    res.json({ albumId: id, tag, results });
  });

  router.post("/songs/details", async (req: Request, res: Response, next: NextFunction) => {
    const { ids } = req.body || {};
    if (!Array.isArray(ids) || ids.length === 0) {
      return next(createHttpError(400, "ids must be a non-empty array"));
    }

    const uniqueIds = Array.from(new Set(ids.map((value: any) => Number.parseInt(String(value), 10)).filter(Number.isFinite)));
    if (uniqueIds.length === 0) {
      return next(createHttpError(400, "ids must contain valid numeric values"));
    }

    try {
      const detail = await deps.client.call<any>("song_detail", { ids: uniqueIds.join(",") }, buildRequestOptions(req));
      const songs = (detail?.songs || []).map((song: any) => ({
        id: song.id,
        name: song.name,
        artists: (song.ar || song.artists || []).map((artist: any) => artist.name),
        album: song.al?.name,
        durationMs: song.dt || song.duration || 0,
      }));
      res.json({ songs });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
