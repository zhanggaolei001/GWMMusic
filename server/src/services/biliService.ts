import axios from "axios";
import mime from "mime-types";
import { config } from "../utils/config";

import { AudioCache } from "./audioCache";
import type { NeteaseClient } from "./neteaseClient";

// Use music_api's Bili request util to handle WBI signature and headers
// The music_api folder lives inside server (./music_api)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { biliRequest } = require("../../music_api/util/biliRequest");

export interface BiliFetchParams {
  cache: AudioCache;
  tag: string;
  // We will save under the caller's numeric id to keep consistency with routes
  songId: number;
  keywords: string;
  format?: string;
}

async function pickBestAudioUrl(playurl: any): Promise<string | undefined> {
  const dashAudio = playurl?.data?.dash?.audio || [];
  if (!Array.isArray(dashAudio) || dashAudio.length === 0) return undefined;
  dashAudio.sort((a: any, b: any) => (b?.bandwidth || 0) - (a?.bandwidth || 0));
  const top = dashAudio[0];
  return top?.baseUrl || top?.backupUrl?.[0];
}

async function maybeTranscode(stream: NodeJS.ReadableStream, targetFormat?: string): Promise<{ stream: NodeJS.ReadableStream; mimeType: string; extension: string }> {
  const fmt = (targetFormat || "").toLowerCase();
  if (!fmt || fmt === "original") {
    return { stream, mimeType: "audio/mp4", extension: "m4a" };
  }
  // Supported targets: mp3, flac (APE encoding is not reliably supported by ffmpeg => skip)
  try {
    // dynamic import to avoid hard dependency if ffmpeg missing
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const ffmpeg = require("fluent-ffmpeg");
    try {
      // Try to use packaged static ffmpeg if available
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const ffmpegPath = require("ffmpeg-static");
      if (ffmpegPath) {
        ffmpeg.setFfmpegPath(ffmpegPath);
      }
    } catch { }
    const { PassThrough } = require("stream");
    const out = new PassThrough();
    const cmd = ffmpeg(stream).on("error", () => {
      out.emit("error", new Error("ffmpeg transcode failed"));
    });
    if (fmt === "mp3") {
      cmd.format("mp3").audioBitrate(192);
      cmd.pipe(out, { end: true });
      return { stream: out, mimeType: "audio/mpeg", extension: "mp3" };
    }
    if (fmt === "flac") {
      cmd.format("flac");
      cmd.pipe(out, { end: true });
      return { stream: out, mimeType: "audio/flac", extension: "flac" };
    }
    // Unknown format -> passthrough original
    return { stream, mimeType: "audio/mp4", extension: "m4a" };
  } catch {
    return { stream, mimeType: "audio/mp4", extension: "m4a" };
  }
}

export async function fetchAndCacheFromBiliByKeywords({ cache, tag, songId, keywords, format }: BiliFetchParams) {
  // 1) search video by keywords
  const searchRes = await biliRequest({
    url: "https://api.bilibili.com/x/web-interface/wbi/search/type",
    useWbi: true,
    params: {
      search_type: "video",
      keyword: keywords,
      page: 1,
      pagesize: 10,
    },
  });

  const items = searchRes?.data?.result || searchRes?.result || [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("Bili search returned no results");
  }
  const first = items[0];
  const bvid: string | undefined = first?.bvid || first?.bvid_new || first?.bvid_old;
  if (!bvid) throw new Error("Bili search item missing bvid");

  // 2) get video detail to obtain cids
  const detailRes = await biliRequest({
    url: "https://api.bilibili.com/x/web-interface/wbi/view",
    useWbi: true,
    params: { bvid },
  });
  const pages = detailRes?.data?.pages || detailRes?.pages || [];
  const title: string | undefined = detailRes?.data?.title || first?.title;
  const ownerName: string | undefined = (detailRes?.data?.owner && detailRes?.data?.owner.name) as string | undefined;
  const cid: number | undefined = pages[0]?.cid || detailRes?.data?.cid;
  if (!cid) throw new Error("Bili detail missing cid");

  // 3) get playurl (DASH) and pick first audio stream
  const playurl = await biliRequest({
    url: "https://api.bilibili.com/x/player/wbi/playurl",
    useWbi: true,
    params: {
      bvid,
      cid,
      qn: 0,
      fnval: 80,
      fnver: 0,
      fourk: 1,
    },
  });

  const audioUrl: string | undefined = await pickBestAudioUrl(playurl);
  console.info(`[bili] pick audio url: ${audioUrl ? 'ok' : 'missing'} for ${keywords}`);
  if (!audioUrl) {
    throw new Error("Bili playurl missing audio stream");
  }

  // 4) stream download and cache via AudioCache
  const audioResponse = await axios.get(audioUrl, {
    responseType: "stream",
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });

  const mimeTypeHeader = (audioResponse.headers["content-type"] as string) || "audio/mp4";
  const extFromHeader = (mime.extension(mimeTypeHeader) || "m4a").toString();

  const chosenFormat = format || config.bili.targetFormat || 'original';
  console.info(`[bili] transcode format=${chosenFormat}`);
  const transcoded = await maybeTranscode(audioResponse.data, chosenFormat);

  // infer artist fallback from bilibili owner or first token of keywords
  const inferArtistFromKeywords = (): string | undefined => {
    const parts = String(keywords).split(/\s+/).filter(Boolean);
    return parts.length ? parts[0] : undefined;
  };
  const artistFallback = ownerName || (first && (first.author || first.up_name || first.uploader)) || inferArtistFromKeywords();

  return cache.save({
    tag,
    songId,
    stream: transcoded.stream,
    mimeType: transcoded.mimeType || mimeTypeHeader,
    extension: transcoded.extension || extFromHeader,
    sourceUrl: audioUrl,
    metadata: {
      title: title || keywords,
      artists: artistFallback ? [String(artistFallback)] : undefined,
      album: undefined,
      bitrateKbps: undefined,
    },
  });
}

export async function searchBiliVideos(keywords: string, limit = 30, offset = 0) {
  const page = Math.floor(offset / Math.max(1, limit)) + 1;
  const pagesize = limit;
  const res = await biliRequest({
    url: "https://api.bilibili.com/x/web-interface/wbi/search/type",
    useWbi: true,
    params: {
      search_type: "video",
      keyword: keywords,
      page,
      pagesize,
    },
  });
  const list = res?.data?.result || res?.result || [];
  return Array.isArray(list) ? list : [];
}

export async function fetchAndCacheFromBiliByBvidCid(options: { cache: AudioCache; tag: string; songId: number; bvid: string; cid: number | string; titleHint?: string; format?: string; client?: NeteaseClient }) {
  const { cache, tag, songId, bvid, cid, titleHint, format, client } = options;
  const playurl = await biliRequest({
    url: "https://api.bilibili.com/x/player/wbi/playurl",
    useWbi: true,
    params: {
      bvid,
      cid,
      qn: 0,
      fnval: 80,
      fnver: 0,
      fourk: 1,
    },
  });
  const audioUrl: string | undefined = await pickBestAudioUrl(playurl);
  console.info(`[bili] pick audio by bvid/cid: ${audioUrl ? 'ok' : 'missing'} bvid=${bvid} cid=${cid}`);
  if (!audioUrl) throw new Error("Bili playurl missing audio stream");

  const audioResponse = await axios.get(audioUrl, {
    responseType: "stream",
    headers: {
      Referer: "https://www.bilibili.com/",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    },
  });
  const mimeTypeHeader = (audioResponse.headers["content-type"] as string) || "audio/mp4";
  const extFromHeader = (mime.extension(mimeTypeHeader) || "m4a").toString();
  const chosenFormat = format || process.env.BILI_TARGET_FORMAT || 'original';
  console.info(`[bili] transcode format=${chosenFormat}`);
  const transcoded = await maybeTranscode(audioResponse.data, chosenFormat);
  // try get owner as artist fallback
  let ownerName: string | undefined;
  try {
    const view = await biliRequest({ url: "https://api.bilibili.com/x/web-interface/wbi/view", useWbi: true, params: { bvid } });
    ownerName = (view?.data?.owner && view?.data?.owner.name) as string | undefined;
  } catch { }

  const entry = await cache.save({
    tag,
    songId,
    stream: transcoded.stream,
    mimeType: transcoded.mimeType || mimeTypeHeader,
    extension: transcoded.extension || extFromHeader,
    sourceUrl: audioUrl,
    metadata: { title: titleHint || `${bvid}`, artists: ownerName ? [String(ownerName)] : undefined, album: undefined },
  });
  // Try enriching metadata if client supplied
  if (client && titleHint) {
    try {
      const res = await client.call<any>("cloudsearch", { keywords: titleHint, type: 1, limit: 10 }, {});
      const songs = res?.result?.songs || [];
      const norm = (s: string) => s.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
      const tnorm = norm(String(titleHint));
      let best: any | undefined; let bestScore = 0;
      for (const s of songs) {
        const name = String(s?.name || "");
        const snorm = norm(name);
        const len = Math.max(tnorm.length, snorm.length, 1);
        let i = 0, j = 0, k = 0; while (i < tnorm.length && j < snorm.length) { if (tnorm[i] === snorm[j]) { k++; i++; j++; } else { j++; } }
        const score = k / len;
        if (score > bestScore) { bestScore = score; best = s; }
      }
      if (best && bestScore >= 0.5) {
        entry.metadata.title = best.name || entry.metadata.title;
        entry.metadata.artists = (best.ar || []).map((a: any) => a.name);
        entry.metadata.album = best.al?.name;
      }
    } catch { }
  }
  return entry;
}

export async function fetchAndCacheFromBiliWithOptions(options: {
  cache: AudioCache;
  tag: string;
  songId: number;
  keywords: string;
  desiredName?: string;
  desiredArtist?: string;
  format?: string;
  client?: NeteaseClient;
}) {
  const { cache, tag, songId, keywords, desiredName, desiredArtist, format, client } = options;
  const entry = await fetchAndCacheFromBiliByKeywords({ cache, tag, songId, keywords, format });

  // Prepare candidate names for matching
  const candidates: string[] = [];
  if (desiredName && desiredName.trim()) candidates.push(desiredName.trim());
  candidates.push(keywords);
  if (keywords.includes(" ")) candidates.push(...keywords.split(/\s+/).filter(Boolean));
  if (entry.metadata.title) candidates.push(entry.metadata.title);

  // Pick best metadata from NetEase by fuzzy matching
  if (client) {
    const norm = (s: string) => s.toLowerCase().replace(/[^\p{Letter}\p{Number}]+/gu, "");
    const uniq = Array.from(new Set(candidates.map((s) => s.trim()).filter(Boolean)));
    for (const cand of uniq) {
      try {
        const res = await client.call<any>("cloudsearch", { keywords: cand, type: 1, limit: 10 }, {});
        const songs = res?.result?.songs || [];
        const cnorm = norm(cand);
        let best: any | undefined;
        let bestScore = 0;
        for (const s of songs) {
          const name = String(s?.name || "");
          const snorm = norm(name);
          // simple similarity: overlap length / max length
          const len = Math.max(cnorm.length, snorm.length, 1);
          const overlap = (() => {
            let i = 0, j = 0, k = 0;
            while (i < cnorm.length && j < snorm.length) {
              if (cnorm[i] === snorm[j]) { k++; i++; j++; } else { j++; }
            }
            return k;
          })();
          const score = overlap / len;
          if (score > bestScore) { bestScore = score; best = s; }
        }
        if (best && bestScore >= 0.5) {
          entry.metadata.title = best.name || entry.metadata.title;
          entry.metadata.artists = (best.ar || []).map((a: any) => a.name);
          entry.metadata.album = best.al?.name;
          // fetch cover and lyrics
          try {
            const detail = await client.call<any>("song_detail", { ids: String(best.id) }, {});
            const song = detail?.songs?.[0];
            const coverUrl = song?.al?.picUrl;
            let coverBuffer: Buffer | undefined;
            let coverFileName: string | undefined;
            if (coverUrl) {
              const coverResp = await axios.get(`${coverUrl}?param=600y600`, { responseType: "arraybuffer" });
              coverBuffer = Buffer.from(coverResp.data);
              const coverType = (coverResp.headers["content-type"] as string) || "image/jpeg";
              const coverExt = (mime.extension(coverType) || "jpg").toString();
              coverFileName = `cover.${coverExt}`;
            }
            let lyricContent: string | undefined;
            try {
              const lyric = await client.call<any>("lyric", { id: best.id }, {});
              lyricContent = lyric?.lrc?.lyric || lyric?.tlyric?.lyric;
            } catch { }
            // augment files if present by re-saving metadata (will embed for mp3)
            await cache.save({
              tag,
              songId: entry.metadata.id,
              stream: (await axios.get(entry.metadata.sourceUrl, { responseType: "stream", headers: { Referer: "https://www.bilibili.com/" } })).data,
              mimeType: entry.metadata.mimeType,
              extension: entry.metadata.extension,
              sourceUrl: entry.metadata.sourceUrl,
              metadata: {
                title: entry.metadata.title,
                artists: entry.metadata.artists,
                album: entry.metadata.album,
                bitrateKbps: entry.metadata.bitrateKbps,
              },
              lyrics: lyricContent ? { content: lyricContent } : undefined,
              cover: coverBuffer ? { buffer: coverBuffer, fileName: coverFileName } : undefined,
            });
          } catch { }
          break;
        }
      } catch {
        // try next candidate
      }
    }
  }

  // As a final step, if caller provided desired NetEase naming, enforce it (configurable)
  if (config.features.forceNeteaseNaming && (desiredName || desiredArtist)) {
    entry.metadata.title = desiredName || entry.metadata.title;
    if (desiredArtist) entry.metadata.artists = [desiredArtist];
  }

  // Optional: MusicBrainz fallback enrichment when NetEase didn't help
  if ((!entry.metadata.artists || entry.metadata.artists.length === 0) && (!entry.metadata.title || entry.metadata.title === keywords)) {
    try {
      const useMb = config.features.mbFallback;
      if (useMb) {
        const ua = config.features.mbUserAgent || 'GWMMusic/0.1 (+https://github.com/zhanggaolei001/GWMMusic)';
        const qlist = Array.from(new Set(candidates));
        let best: any | undefined; let bestScore = 0;
        for (const q of qlist) {
          const resp = await axios.get('https://musicbrainz.org/ws/2/recording', {
            params: { query: q, fmt: 'json', limit: 5 },
            headers: { 'User-Agent': ua, 'Accept': 'application/json' },
            timeout: 8000,
          });
          const recs: any[] = (resp.data && resp.data.recordings) || [];
          for (const r of recs) {
            const score = typeof r.score === 'number' ? r.score : 0;
            if (score > bestScore) { bestScore = score; best = r; }
          }
          if (bestScore >= 80) break;
        }
        if (best) {
          const artist = Array.isArray(best['artist-credit']) && best['artist-credit'][0]?.name ? String(best['artist-credit'][0].name) : undefined;
          const titleMb = typeof best.title === 'string' ? best.title : undefined;
          if (artist) entry.metadata.artists = [artist];
          if (titleMb) entry.metadata.title = titleMb;
        }
      }
    } catch {
      // ignore MB failures
    }
  }
  return entry;
}

export async function resolveFirstCid(bvid: string): Promise<{ cid: number; title?: string }> {
  const detailRes = await biliRequest({
    url: "https://api.bilibili.com/x/web-interface/wbi/view",
    useWbi: true,
    params: { bvid },
  });
  const pages = detailRes?.data?.pages || detailRes?.pages || [];
  const cid: number | undefined = pages[0]?.cid || detailRes?.data?.cid;
  if (!cid) throw new Error("Bili detail missing cid");
  const title: string | undefined = detailRes?.data?.title;
  return { cid: Number(cid), title };
}
