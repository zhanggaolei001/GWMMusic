import axios from "axios";
import mime from "mime-types";

import { AudioCache } from "./audioCache";
import { NeteaseClient, NeteaseRequestOptions } from "./neteaseClient";
import { config } from "../utils/config";
import { fetchAndCacheFromBiliWithOptions } from "./biliService";

interface FetchParams {
  cache: AudioCache;
  client: NeteaseClient;
  songId: number;
  tag: string;
  bitrate?: number;
  requestOptions: NeteaseRequestOptions;
}

export async function fetchAndCacheSong({
  cache,
  client,
  songId,
  tag,
  bitrate,
  requestOptions,
}: FetchParams) {
  let songUrlResponse: any | undefined;
  let first: any | undefined;
  try {
    songUrlResponse = await client.call<any>("song_url", {
      id: String(songId),
      br: bitrate,
    }, requestOptions);
    const candidates = Array.isArray(songUrlResponse?.data) ? songUrlResponse.data : [];
    const preferFormats = ["mp3", "m4a", "aac", "mp4"];
    first = candidates.find((item: any) => {
      const url = (item?.url || "") as string;
      const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
      const type = typeof item?.type === "string" ? item.type.toLowerCase() : undefined;
      return Boolean(url) && Boolean(ext && preferFormats.includes(ext) || type && preferFormats.includes(type));
    }) || candidates[0];
  } catch {
    // ignore and handle fallback below
  }

  if (!first || !first.url) {
    // fallback to bilibili by searching title/artist
    try {
      const detail = await client.call<any>("song_detail", { ids: String(songId) }, requestOptions);
      const song = detail?.songs?.[0];
      const title = song?.name as string | undefined;
      const primaryArtist = song?.ar?.[0]?.name as string | undefined;
      const keywords = [title, primaryArtist].filter(Boolean).join(" ") || String(songId);

      return fetchAndCacheFromBiliWithOptions({
        cache,
        tag,
        songId,
        keywords,
        desiredName: title,
        desiredArtist: primaryArtist,
        client,
      });
    } catch (e) {
      throw new Error("Failed to resolve song stream URL (netease) and fallback (bili) also failed");
    }
  }

  const extFromUrl = first.url.split("?")[0].split(".").pop()?.toLowerCase();
  const typeFromApi = typeof first.type === "string" ? first.type.toLowerCase() : undefined;
  const incompatible = ["flac", "ape"]; // common unsupported formats in browsers
  if (extFromUrl && incompatible.includes(extFromUrl) || typeFromApi && incompatible.includes(typeFromApi)) {
    try {
      const detail = await client.call<any>("song_detail", { ids: String(songId) }, requestOptions);
      const song = detail?.songs?.[0];
      const title = song?.name as string | undefined;
      const primaryArtist = song?.ar?.[0]?.name as string | undefined;
      const keywords = [title, primaryArtist].filter(Boolean).join(" ") || String(songId);

      return fetchAndCacheFromBiliWithOptions({
        cache,
        tag,
        songId,
        keywords,
        desiredName: title,
        desiredArtist: primaryArtist,
        client,
        format: "mp3",
      });
    } catch {
      // continue with original if fallback fails
    }
  }

  const audioResponse = await axios.get(first.url, {
    responseType: "stream",
    timeout: config.netease.timeoutMs,
  });

  const mimeTypeHeader = (audioResponse.headers["content-type"] as string) || "audio/mpeg";
  const preferred = ["mp3", "m4a", "aac", "mp4", "flac", "ape"];
  const urlExt = first.url.split("?")[0].split(".").pop()?.toLowerCase();
  const typeExt = typeof first.type === "string" ? first.type.toLowerCase() : undefined;
  const mimeExt = (mime.extension(mimeTypeHeader) || "bin").toString().toLowerCase();

  const pickExtension = () => {
    const candidates = [urlExt, typeExt, mimeExt].filter(Boolean) as string[];
    for (const ext of candidates) {
      if (preferred.includes(ext)) return ext;
    }
    return candidates[0] || "bin";
  };

  const extension = pickExtension();
  const bitrateKbps = typeof first.br === "number" ? Math.round(first.br / 1000) : undefined;

  let title: string | undefined;
  let artists: string[] | undefined;
  let album: string | undefined;
  let coverBuffer: Buffer | undefined;
  let coverFileName: string | undefined;
  let lyricContent: string | undefined;
  try {
    const detail = await client.call<any>("song_detail", { ids: String(songId) }, requestOptions);
    const song = detail?.songs?.[0];
    title = song?.name;
    artists = song?.ar?.map((item: any) => item.name);
    album = song?.al?.name;

    const coverUrl = song?.al?.picUrl;
    if (coverUrl) {
      const coverResponse = await axios.get(`${coverUrl}?param=600y600`, {
        responseType: "arraybuffer",
        timeout: config.netease.timeoutMs,
      });
      if (coverResponse.data) {
        coverBuffer = Buffer.from(coverResponse.data);
        const coverType = (coverResponse.headers["content-type"] as string) || "image/jpeg";
        const coverExt = (mime.extension(coverType) || "jpg").toString();
        coverFileName = `cover.${coverExt}`;
      }
    }

    try {
      const lyric = await client.call<any>("lyric", { id: songId }, requestOptions);
      lyricContent = lyric?.lrc?.lyric || lyric?.tlyric?.lyric;
    } catch {
      // ignore lyric failures
    }
  } catch {
    // ignore metadata failures
  }

  const extensionMime = (mime.lookup(extension) as string) || undefined;
  const resolvedMimeType =
    extensionMime ||
    (mimeTypeHeader.includes("octet") || mimeTypeHeader.includes("application")
      ? (mime.lookup(extension) as string) || mimeTypeHeader
      : mimeTypeHeader);

  return cache.save({
    tag,
    songId,
    stream: audioResponse.data,
    mimeType: resolvedMimeType,
    extension,
    sourceUrl: first.url,
    metadata: { title, artists, album, bitrateKbps },
    lyrics: lyricContent ? { content: lyricContent } : undefined,
    cover: coverBuffer ? { buffer: coverBuffer, fileName: coverFileName } : undefined,
  });
}
