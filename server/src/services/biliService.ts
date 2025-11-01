import axios from "axios";
import mime from "mime-types";

import { AudioCache } from "./audioCache";

// Use vendor's Bili request util to handle WBI signature and headers
// The vendor folder is adjacent to server (../vendor)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { biliRequest } = require("../../../vendor/util/biliRequest");

export interface BiliFetchParams {
  cache: AudioCache;
  tag: string;
  // We will save under the caller's numeric id to keep consistency with routes
  songId: number;
  keywords: string;
}

export async function fetchAndCacheFromBiliByKeywords({ cache, tag, songId, keywords }: BiliFetchParams) {
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

  const dashAudio = playurl?.data?.dash?.audio || [];
  const audioItem = Array.isArray(dashAudio) && dashAudio.length > 0 ? dashAudio[0] : undefined;
  const audioUrl: string | undefined = audioItem?.baseUrl || audioItem?.backupUrl?.[0];
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
  const ext = (mime.extension(mimeTypeHeader) || "m4a").toString();

  return cache.save({
    tag,
    songId,
    stream: audioResponse.data,
    mimeType: mimeTypeHeader,
    extension: ext,
    sourceUrl: audioUrl,
    metadata: {
      title: title || keywords,
      artists: undefined,
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
