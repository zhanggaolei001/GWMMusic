import axios from "axios";

const runtimeApiBase = import.meta.env.DEV ? "" : (import.meta.env.VITE_API_BASE || "");
export const api = axios.create({
  baseURL: `${runtimeApiBase}/api`,
});

type SearchResultSong = {
  id: number;
  name: string;
  artists?: string[];
  album?: string;
  duration?: number;
  [k: string]: any;
};

export const searchTracks = async (q: string, source = 'netease') => {
  const res = await api.get('/search', { params: { q, type: 1, source } });
  // server returns either { result: { songs: [...] } } or { songs: [...] } for bili
  const data = res.data || {};
  const songs: SearchResultSong[] = (data.result && data.result.songs) || data.songs || data.items || [];
  // normalize minimal fields
  return songs.map((s: any) => ({
    id: Number(s.id || s.songId || s.sid || s.videoId || 0),
    name: s.name || s.title || s.songName || s.title || '',
    artists: s.artists ? s.artists.map((a: any) => a.name || a) : (s.ar ? s.ar.map((a: any) => a.name) : (s.artist ? [s.artist] : [])),
    album: (s.album && (s.album.name || s.album)) || s.al || s.albumName || undefined,
    duration: s.duration || s.dt || s.durationSeconds || undefined,
    raw: s,
  }));
};

export const getStreamUrl = (id: number | string) => {
  const base = runtimeApiBase || '';
  if (!id) {
    return (_tag?: string) => '';
  }
  return (tag?: string) => `${base}/api/songs/${id}/stream${tag ? `?tag=${encodeURIComponent(tag)}` : ''}`;
};

export const getCacheSummary = async () => {
  const res = await api.get('/cache');
  return res.data || [];
};

// trigger server to fetch/cache a song by requesting its stream (fire-and-forget)
export const cacheTrack = async (id: number | string, tag?: string) => {
  // request as blob to trigger server fetch but not keep in memory large text
  try {
    if (!id) return { ok: false, error: 'invalid id' };
    const url = `/songs/${id}/stream` + (tag ? `?tag=${encodeURIComponent(tag)}` : '');
    await api.get(url, { responseType: 'blob' });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
};
