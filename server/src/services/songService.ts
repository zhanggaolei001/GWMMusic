import axios from "axios";
import mime from "mime-types";

import { AudioCache } from "./audioCache";
import { NeteaseClient, NeteaseRequestOptions } from "./neteaseClient";
import { config } from "../utils/config";

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
  const songUrlResponse = await client.call<any>("song_url", {
    id: String(songId),
    br: bitrate,
  }, requestOptions);

  const first = songUrlResponse?.data?.[0];
  if (!first || !first.url) {
    throw new Error("Failed to resolve song stream URL");
  }

  const audioResponse = await axios.get(first.url, {
    responseType: "stream",
    timeout: config.netease.timeoutMs,
  });

  const mimeTypeHeader = (audioResponse.headers["content-type"] as string) || "audio/mpeg";
  const preferred = ["flac", "ape", "mp3"];
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

  const resolvedMimeType =
    mimeTypeHeader.includes("octet") || mimeTypeHeader.includes("application")
      ? (mime.lookup(extension) as string) || mimeTypeHeader
      : mimeTypeHeader;

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
