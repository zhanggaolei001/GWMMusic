import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, setApiCookie } from "./lib/api";

type TabKey = "tracks" | "albums" | "playlist" | "cache";

interface SongSummary {
  id: number;
  name: string;
  artists: string[];
  album?: string;
  durationMs: number;
  bvid?: string;
}

interface CacheEntry {
  id: number;
  tag: string;
  title?: string;
  artists?: string[];
  album?: string;
  size: number;
  mimeType: string;
  createdAt: string;
  lastAccessedAt: string;
  audioFile: string;
  lyricsFile?: string;
  coverFile?: string;
  folder: string;
  audioPath: string;
  lyricsPath?: string;
  coverPath?: string;
  hasLyrics: boolean;
  hasCover: boolean;
  durationSeconds?: number;
  bitrateKbps?: number;
}

interface AlbumSummary {
  id: number;
  name: string;
  artist?: string;
  artists: string[];
  size?: number;
  picUrl?: string;
  publishTime?: number;
  company?: string;
  description?: string;
}

interface AlbumTrack extends SongSummary {
  bitrate?: number;
}

interface AlbumDetail {
  album: {
    id: number;
    name: string;
    description?: string;
    picUrl?: string;
    publishTime?: number;
    company?: string;
    size?: number;
  };
  tracks: AlbumTrack[];
}

type PlaylistItem = SongSummary & { albumId?: number };

const tabs: { key: TabKey; label: string }[] = [
  { key: "tracks", label: "歌曲" },
  { key: "albums", label: "专辑" },
  { key: "playlist", label: "播放列表" },
  { key: "cache", label: "缓存" },
];

const formatDuration = (ms: number) => {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const formatPlaybackDuration = (seconds?: number) => {
  if (!seconds || Number.isNaN(seconds)) return "—";
  const whole = Math.round(seconds);
  const mins = Math.floor(whole / 60);
  const secs = whole % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
};

const formatBytes = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, exponent);
  return `${size.toFixed(1)} ${units[exponent]}`;
};

const devApiBase = () => {
  const { protocol, hostname } = window.location;
  return `${protocol}//${hostname}:4000`;
};
const API_BASE = import.meta.env.DEV ? devApiBase() : "";
const AUDIO_BASE = `${API_BASE}/api/songs`;

const App = () => {
  const [activeTab, setActiveTab] = useState<TabKey>("tracks");
  const [searchTerm, setSearchTerm] = useState("");
  const [source, setSource] = useState<string>(() => localStorage.getItem("gwm-source") || "netease");
  const [searchResults, setSearchResults] = useState<SongSummary[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tag, setTag] = useState<string>(() => localStorage.getItem("gwm-tag") || "favorites");
  const [bitrate, setBitrate] = useState<string>("999000");
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioKey, setAudioKey] = useState(0);
  const [cookie, setCookie] = useState<string>(() => localStorage.getItem("gwm-netease-cookie") || "");
  const [biliCookie, setBiliCookie] = useState<string>("");
  const [cacheEntries, setCacheEntries] = useState<CacheEntry[]>([]);
  const [cacheLoading, setCacheLoading] = useState(false);
  const [cachePage, setCachePage] = useState(1);
  const [cacheLimit, setCacheLimit] = useState(20);
  const [cacheTotal, setCacheTotal] = useState(0);
  const [cacheQuery, setCacheQuery] = useState("");
  const [playlistQueue, setPlaylistQueue] = useState<PlaylistItem[]>(() => {
    const stored = localStorage.getItem("gwm-playlist-queue");
    return stored ? (JSON.parse(stored) as PlaylistItem[]) : [];
  });

  const [albumKeyword, setAlbumKeyword] = useState("");
  const [albumLoading, setAlbumLoading] = useState(false);
  const [albumError, setAlbumError] = useState<string | null>(null);
  const [albumResults, setAlbumResults] = useState<AlbumSummary[]>([]);
  const [albumDetail, setAlbumDetail] = useState<AlbumDetail | null>(null);
  const [selectedTrackIds, setSelectedTrackIds] = useState<number[]>([]);

  const [health, setHealth] = useState<{ status: string; cacheDir: string } | null>(null);
  // Download dialog (mobile-friendly)
  const [showDownloadDialog, setShowDownloadDialog] = useState(false);
  const [pendingSong, setPendingSong] = useState<SongSummary | null>(null);
  const [filenameInput, setFilenameInput] = useState("");
  const [formatInput, setFormatInput] = useState<"mp3" | "flac" | "original">("mp3");
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    setApiCookie(cookie);
    if (cookie.trim()) {
      localStorage.setItem("gwm-netease-cookie", cookie);
    } else {
      localStorage.removeItem("gwm-netease-cookie");
    }
  }, [cookie]);

  const updateBiliCookie = async () => {
    try {
      await api.post("/bilibili/update-cookie", { cookie: biliCookie });
      alert("Bilibili Cookie 已更新");
    } catch (e: any) {
      alert(e?.response?.data?.message || e.message || "更新失败");
    }
  };

  const refreshBiliCookie = async () => {
    try {
      await api.get("/bilibili/refresh-cookie");
      alert("Bilibili Cookie 已刷新");
    } catch (e: any) {
      alert(e?.response?.data?.message || e.message || "刷新失败");
    }
  };

  const clearBiliCache = async () => {
    try {
      await api.get("/bilibili/clear-cache");
      alert("Bilibili 缓存已清理");
    } catch (e: any) {
      alert(e?.response?.data?.message || e.message || "清理失败");
    }
  };

  useEffect(() => {
    localStorage.setItem("gwm-tag", tag);
  }, [tag]);

  useEffect(() => {
    localStorage.setItem("gwm-playlist-queue", JSON.stringify(playlistQueue));
  }, [playlistQueue]);

  useEffect(() => {
    api
      .get("/health")
      .then((res) => setHealth(res.data))
      .catch(() => setHealth(null));
  }, []);

  const fetchCache = () => {
    setCacheLoading(true);
    const params: any = { limit: cacheLimit, offset: (cachePage - 1) * cacheLimit };
    if (tag && tag.trim()) params.tag = tag.trim();
    if (cacheQuery && cacheQuery.trim()) params.q = cacheQuery.trim();
    api
      .get<CacheEntry[]>("/cache", { params })
      .then((res) => {
        setCacheEntries(res.data);
        const totalHeader = res.headers && (res.headers["x-total-count"] as any);
        setCacheTotal(totalHeader ? parseInt(String(totalHeader), 10) || res.data.length : res.data.length);
      })
      .catch(() => { setCacheEntries([]); setCacheTotal(0); })
      .finally(() => setCacheLoading(false));
  };

  useEffect(() => {
    if (activeTab === "cache") fetchCache();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, cachePage, cacheLimit]);

  const handleSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!searchTerm.trim()) return;
    setError(null);
    setSearchLoading(true);
    try {
      const { data } = await api.get("/search", { params: { q: searchTerm, limit: 30, type: 1, source } });
      const neteaseSongs = data.songs || data.result?.songs || [];
      const biliItems = data.items || [];
      const songs: SongSummary[] = (source === "bili" ? biliItems : neteaseSongs).map((song: any, idx: number) => ({
        id: source === "bili" ? idx + 1 : song.id,
        name: song.name || song.title,
        artists: source === "bili" ? [song.author || "Bilibili"] : (song.ar || song.artists || []).map((artist: any) => artist.name || artist),
        album: source === "bili" ? undefined : song.al?.name || song.album?.name,
        durationMs: song.dt || song.duration || 0,
        bvid: source === "bili" ? (song.bvid || song.bvid_new || song.bvid_old) : undefined,
      }));
      setSearchResults(songs);
    } catch (err: any) {
      setError(err?.response?.data?.message || err.message || "搜索失败");
    } finally {
      setSearchLoading(false);
    }
  };

  const handleAlbumSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!albumKeyword.trim()) return;
    setAlbumError(null);
    setAlbumLoading(true);
    setAlbumDetail(null);
    setSelectedTrackIds([]);
    try {
      const { data } = await api.get("/albums/search", {
        params: {
          q: albumKeyword,
          limit: 24,
        },
      });
      setAlbumResults(data.albums || []);
    } catch (err: any) {
      setAlbumError(err?.response?.data?.message || err.message || "专辑搜索失败");
      setAlbumResults([]);
    } finally {
      setAlbumLoading(false);
    }
  };

  const loadAlbumDetail = async (albumId: number) => {
    setAlbumDetail(null);
    setSelectedTrackIds([]);
    try {
      const { data } = await api.get(`/albums/${albumId}`);
      setAlbumDetail(data);
    } catch (err: any) {
      setAlbumError(err?.response?.data?.message || err.message || "加载专辑详情失败");
    }
  };

  const toggleTrackSelection = (trackId: number) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId],
    );
  };

  const selectAllTracks = () => {
    if (!albumDetail) return;
    setSelectedTrackIds(albumDetail.tracks.map((track) => track.id));
  };

  const clearSelection = () => setSelectedTrackIds([]);

  const buildStreamUrl = (songId: number, asDownload = false) => {
    const params = new URLSearchParams();
    if (tag) params.set("tag", tag);
    if (bitrate) params.set("br", bitrate);
    if (asDownload) params.set("download", "1");
    return `${AUDIO_BASE}/${songId}/${asDownload ? "download" : "stream"}?${params.toString()}`;
  };

  const handlePlay = (song: { id: number; bvid?: string }) => {
    if (source === "bili" && song.bvid) {
      const u = `${API_BASE}/api/bili/${encodeURIComponent(song.bvid)}/stream?tag=${encodeURIComponent(tag)}`;
      setAudioSrc(u);
    } else {
      const src = buildStreamUrl(song.id, false);
      setAudioSrc(src);
    }
    setAudioKey((prev) => prev + 1);
    setTimeout(fetchCache, 2000);
  };

  const openDownloadDialog = (song: any) => {
    setPendingSong(song as any);
    const base = [searchTerm, ...(searchTerm.includes(" ") ? searchTerm.split(/\s+/).filter(Boolean) : []), (song && song.name) || ""].filter(Boolean) as string[];
    setSuggestions(base);
    setFilenameInput(base[0] || (song && song.name) || "");
    setFormatInput("mp3");
    setShowDownloadDialog(true);
  };

  const confirmDownload = () => {
    if (!pendingSong) return;
    const s: any = pendingSong;
    setShowDownloadDialog(false);
    if (source === "bili" && s.bvid) {
      const url = `${API_BASE}/api/bili/${encodeURIComponent(s.bvid)}/download?tag=${encodeURIComponent(tag)}&filename=${encodeURIComponent(filenameInput)}&format=${encodeURIComponent(formatInput)}`;
      window.open(url, "_blank");
    } else {
      const downloadUrl = buildStreamUrl(s.id, true);
      window.open(downloadUrl, "_blank");
    }
    setTimeout(fetchCache, 4000);
    setPendingSong(null);
  };

  const cancelDownload = () => {
    setShowDownloadDialog(false);
    setPendingSong(null);
  };

  const handleDownload = (song: { id: number; bvid?: string }) => {
    if (source === "bili" && song.bvid) {
      const suggested = [searchTerm, ...(searchTerm.includes(" ") ? searchTerm.split(/\s+/).filter(Boolean) : []), song.name].filter(Boolean);
      const input = window.prompt(`输入要保存的文件名（不含扩展名）：\n建议：\n1) ${suggested[0] || ''}\n2) ${suggested[1] || ''}\n3) ${suggested[2] || ''}`, suggested[0] || song.name || "");
      if (input === null) return;
      const format = window.prompt("选择格式（mp3 或 original）", "mp3") || "mp3";
      const url = `${API_BASE}/api/bili/${encodeURIComponent(song.bvid)}/download?tag=${encodeURIComponent(tag)}&filename=${encodeURIComponent(input)}&format=${encodeURIComponent(format)}`;
      window.open(url, "_blank");
    } else {
      const downloadUrl = buildStreamUrl(song.id, true);
      window.open(downloadUrl, "_blank");
    }
    setTimeout(fetchCache, 4000);
  };

  const addSelectedToPlaylist = () => {
    if (!albumDetail) return;
    const selected = albumDetail.tracks.filter((track) => selectedTrackIds.includes(track.id));
    if (!selected.length) return;
    setPlaylistQueue((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      const merged = [...prev];
      selected.forEach((track) => {
        if (!existingIds.has(track.id)) {
          merged.push({
            id: track.id,
            name: track.name,
            artists: track.artists,
            album: albumDetail.album.name,
            durationMs: track.durationMs,
            albumId: albumDetail.album.id,
          });
        }
      });
      return merged;
    });
  };

  const removePlaylistItem = (trackId: number) => {
    setPlaylistQueue((prev) => prev.filter((item) => item.id !== trackId));
  };

  const handleBatchCache = async () => {
    if (!albumDetail || selectedTrackIds.length === 0) return;
    try {
      await api.post(`/albums/${albumDetail.album.id}/cache`, {
        trackIds: selectedTrackIds,
        tag,
        bitrate,
      });
      fetchCache();
    } catch (err: any) {
      setAlbumError(err?.response?.data?.message || err.message || "批量缓存失败");
    }
  };

  const renderTabs = (position: "top" | "bottom") => (
    <nav className={`tabs tabs-${position}`}>
      {(['playlist','tracks','albums','cache'] as TabKey[]).map((k) => tabs.find(t => t.key === k)!).map((tab) => (
        <button
          key={tab.key}
          className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
          onClick={() => setActiveTab(tab.key)}
          type="button"
        >
          <span>{tab.label}</span>
        </button>
      ))}
    </nav>
  );

  const totalCacheSize = useMemo(() => cacheEntries.reduce((acc, entry) => acc + entry.size, 0), [cacheEntries]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-title">
          <strong>GWM Music</strong>
          {health && (
            <small className="hero-status">{health.status} · {health.cacheDir}</small>
          )}
        </div>
        <button className="icon-button" onClick={() => setShowSettings(true)} aria-label="设置">⚙️</button>
      </header>
      <header className="hero">
        <div>
          <h1>GWM NetEase 音乐中心</h1>
          <p>搜索、缓存并播放来自网易云音乐的曲目（仅限个人使用）。</p>
          {health && (
            <small className="hero-status">服务状态：{health.status} · 缓存目录：{health.cacheDir}</small>
          )}
        </div>
        <section className="cookie-box">
          <label htmlFor="cookie">VIP Cookie（可选）</label>
          <textarea
            id="cookie"
            value={cookie}
            placeholder="在此粘贴 MUSIC_U 等 Cookie"
            onChange={(event) => setCookie(event.target.value)}
          />
          <small>若需高品质音源，请粘贴网易云 VIP Cookie，服务器会将其附加到请求头。</small>
        </section>
        <section className="cookie-box">
          <label htmlFor="bili-cookie">Bilibili Cookie（可选）</label>
          <textarea
            id="bili-cookie"
            value={biliCookie}
            placeholder="在此粘贴 B站 Cookie（提高清晰度与可用性）"
            onChange={(e) => setBiliCookie(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={updateBiliCookie}>更新 Cookie</button>
            <button type="button" onClick={refreshBiliCookie}>刷新 Cookie</button>
            <button type="button" onClick={clearBiliCache}>清理 B站缓存</button>
          </div>
        </section>
      </header>

      {renderTabs("top")}

      <main className="tab-panels">
        <section className={`tab-panel ${activeTab === "tracks" ? "active" : ""}`}>
          <h2>歌曲搜索</h2>
          <form onSubmit={handleSearch} className="search-form">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="输入歌曲、歌手或专辑关键词"
            />
            <button type="submit" disabled={searchLoading}>
              {searchLoading ? "搜索中..." : "搜索"}
            </button>
          </form>
          <div className="search-options">
            <label>
              缓存标签
              <input value={tag} onChange={(event) => setTag(event.target.value)} />
            </label>
            <label>
              首选码率
              <select value={bitrate} onChange={(event) => setBitrate(event.target.value)}>
                <option value="128000">128 kbps</option>
                <option value="192000">192 kbps</option>
                <option value="320000">320 kbps</option>
                <option value="999000">无损优先</option>
              </select>
            </label>
            <label>
              来源
              <select value={source} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; setSource(v); localStorage.setItem("gwm-source", v); }}>
                <option value="netease">NetEase</option>
                <option value="bili">Bilibili</option>
              </select>
            </label>
          </div>
          {error && <div className="error-box">{error}</div>}
          <ul className="song-list">
            {searchResults.map((song) => (
              <li key={song.id}>
                <div>
                  <span className="song-title">{song.name}</span>
                  <span className="song-meta">
                    {song.artists.join(" / ")} · {song.album || "未知专辑"} · {formatDuration(song.durationMs)}
                  </span>
                </div>
                <div className="actions">
                  <button onClick={() => handlePlay(song)}>播放</button>
                  <button onClick={() => handleDownload(song)}>缓存 / 下载</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className={`tab-panel ${activeTab === "albums" ? "active" : ""}`}>
          <h2>专辑搜索</h2>
          <form onSubmit={handleAlbumSearch} className="search-form">
            <input
              value={albumKeyword}
              onChange={(event) => setAlbumKeyword(event.target.value)}
              placeholder="输入专辑关键词"
            />
            <button type="submit" disabled={albumLoading}>
              {albumLoading ? "搜索中..." : "搜索"}
            </button>
          </form>
          {albumError && <div className="error-box">{albumError}</div>}
          <div className="album-grid">
            {albumResults.map((album) => (
              <button key={album.id} className="album-card" type="button" onClick={() => loadAlbumDetail(album.id)}>
                {album.picUrl && <img src={`${album.picUrl}?param=200y200`} alt={album.name} />}
                <div className="album-card-body">
                  <strong>{album.name}</strong>
                  <span>{album.artists.join(" / ")}</span>
                  {album.publishTime && (
                    <small>{new Date(album.publishTime).toLocaleDateString()}</small>
                  )}
                </div>
              </button>
            ))}
          </div>

          {albumDetail && (
            <div className="album-detail">
              <header className="album-header">
                {albumDetail.album.picUrl && (
                  <img src={`${albumDetail.album.picUrl}?param=200y200`} alt={albumDetail.album.name} />
                )}
                <div>
                  <h3>{albumDetail.album.name}</h3>
                  {albumDetail.album.company && <p>发行公司：{albumDetail.album.company}</p>}
                  {albumDetail.album.publishTime && (
                    <p>发行时间：{new Date(albumDetail.album.publishTime).toLocaleDateString()}</p>
                  )}
                  <div className="album-actions">
                    <button type="button" onClick={selectAllTracks}>全选</button>
                    <button type="button" onClick={clearSelection}>清空</button>
                    <button type="button" onClick={addSelectedToPlaylist} disabled={!selectedTrackIds.length}>
                      加入播放列表
                    </button>
                    <button type="button" onClick={handleBatchCache} disabled={!selectedTrackIds.length}>
                      缓存所选
                    </button>
                  </div>
                </div>
              </header>
              <table className="album-tracks">
                <thead>
                  <tr>
                    <th>
                      <input
                        type="checkbox"
                        checked={albumDetail.tracks.length > 0 && selectedTrackIds.length === albumDetail.tracks.length}
                        onChange={(event) => {
                          if (event.target.checked) {
                            selectAllTracks();
                          } else {
                            clearSelection();
                          }
                        }}
                      />
                    </th>
                    <th>歌曲</th>
                    <th>时长</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {albumDetail.tracks.map((track) => (
                    <tr key={track.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedTrackIds.includes(track.id)}
                          onChange={() => toggleTrackSelection(track.id)}
                        />
                      </td>
                      <td>
                        <div className="song-title">{track.name}</div>
                        <div className="song-meta">{track.artists.join(" / ")}</div>
                      </td>
                      <td>{formatDuration(track.durationMs)}</td>
                      <td className="actions">
                        <button onClick={() => handlePlay(track)}>播放</button>
                        <button onClick={() => handleDownload(track)}>缓存 / 下载</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className={`tab-panel ${activeTab === "playlist" ? "active" : ""}`}>
          <h2>播放队列</h2>
          {!playlistQueue.length ? (
            <p>播放列表为空，可在歌曲或专辑页面中添加。</p>
          ) : (
            <ul className="song-list">
              {playlistQueue.map((item) => (
                <li key={item.id}>
                  <div>
                    <span className="song-title">{item.name}</span>
                    <span className="song-meta">
                      {item.artists.join(" / ")}
                      {item.album ? ` · ${item.album}` : ""} · {formatDuration(item.durationMs)}
                    </span>
                  </div>
                  <div className="actions">
                    <button onClick={() => handlePlay(item)}>播放</button>
                    <button onClick={() => handleDownload(item)}>缓存 / 下载</button>
                    <button onClick={() => removePlaylistItem(item.id)}>移除</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`tab-panel ${activeTab === "cache" ? "active" : ""}`}>
          <h2>缓存概览</h2>
          <div className="cache-summary">
            <span>已缓存：{cacheEntries.length} 首</span>
            <span>总占用：{formatBytes(totalCacheSize)}</span>
            <button onClick={fetchCache} disabled={cacheLoading}>
              {cacheLoading ? "刷新中..." : "刷新"}
            </button>
          </div>
          <table className="cache-table">
            <thead>
              <tr>
                <th>歌曲</th>
                <th>标签</th>
                <th>大小</th>
                <th>时长</th>
                <th>码率</th>
                <th>最近访问</th>
                <th>备注</th>
              </tr>
            </thead>
            <tbody>
              {cacheEntries.map((entry) => (
                <tr key={`${entry.tag}-${entry.id}`}>
                  <td>
                    <strong>{entry.title || entry.audioFile}</strong>
                    <div className="song-meta">
                      {entry.artists?.join(" / ") ?? "未知艺人"}
                      {entry.album ? ` · ${entry.album}` : ""}
                    </div>
                    <div className="song-meta small">{entry.audioFile}</div>
                    <div className="actions">
                      <button onClick={() => { const url = `${API_BASE}/api/songs/${entry.id}/stream?tag=${encodeURIComponent(entry.tag)}`; setAudioSrc(url); setAudioKey((k) => k + 1); }}>播放</button>
                      <button onClick={() => { const url = `${API_BASE}/api/songs/${entry.id}/download?tag=${encodeURIComponent(entry.tag)}&filename=${encodeURIComponent(entry.audioFile)}`; window.open(url, "_blank"); }}>下载</button>
                      <button onClick={() => { const item = { id: entry.id, name: entry.title || entry.audioFile, artists: entry.artists || ["Unknown"], album: entry.album, durationMs: (entry.durationSeconds || 0) * 1000 } as PlaylistItem; setPlaylistQueue((prev) => prev.find((p) => p.id === item.id) ? prev : [...prev, item]); }}>加入播放列表</button>
                      <button onClick={() => { const item = { id: entry.id, name: entry.title || entry.audioFile, artists: entry.artists || ["Unknown"], album: entry.album, durationMs: (entry.durationSeconds || 0) * 1000 } as PlaylistItem; setPlaylistQueue((prev) => { if (prev.find((p) => p.id === item.id)) return prev; const next = [...prev]; next.splice(1, 0, item); return next; }); }}>下一首播放</button>
                      <button onClick={async () => { if (!window.confirm(`删除缓存：${entry.title || entry.audioFile}?`)) return; try { await api.delete(`/cache/${encodeURIComponent(entry.tag)}/${entry.id}`); } finally { fetchCache(); } }}>删除</button>
                    </div>
                  </td>
                  <td>{entry.tag}</td>
                  <td>{formatBytes(entry.size)}</td>
                  <td>{formatPlaybackDuration(entry.durationSeconds)}</td>
                  <td>{entry.bitrateKbps ? `${entry.bitrateKbps} kbps` : "—"}</td>
                  <td>{new Date(entry.lastAccessedAt).toLocaleString()}</td>
                  <td>
                    {entry.hasLyrics && <span className="badge">歌词</span>}
                    {entry.hasCover && <span className="badge">封面</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="cache-pager" style={{ display:'flex', gap:8, justifyContent:'flex-end', alignItems:'center', marginTop:8, flexWrap:'wrap' }}>
            <button onClick={() => setCachePage((p)=> Math.max(1,p-1))} disabled={cachePage<=1}>上一页</button>
            <span>{cachePage} / {cacheLimit > 0 ? Math.max(1, Math.ceil((cacheTotal || cacheEntries.length)/cacheLimit)) : 1}</span>
            <button onClick={() => setCachePage((p)=> p+1)} disabled={cacheLimit <= 0 || (cachePage >= Math.ceil((cacheTotal || cacheEntries.length)/cacheLimit))}>下一页</button>
            <label>
              每页
              <select value={cacheLimit} onChange={(e)=> { setCachePage(1); setCacheLimit(parseInt((e.target as HTMLSelectElement).value,10));}}>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </label>
            <label>
              筛选
              <input value={cacheQuery} onChange={(e)=> setCacheQuery((e.target as HTMLInputElement).value)} onKeyDown={(e)=> { if (e.key==='Enter'){ setCachePage(1); fetchCache(); }}} placeholder="标题/艺人/专辑" />
            </label>
            <button onClick={() => { setCachePage(1); fetchCache(); }} disabled={cacheLoading}>{cacheLoading ? '刷新中...' : '刷新'}</button>
          </div>
        </section>
      </main>

      {showSettings && (
        <div className="modal-overlay" onClick={() => setShowSettings(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3>设置</h3>
              <button className="icon-button" onClick={() => setShowSettings(false)} aria-label="关闭">✖</button>
            </header>
            <section className="modal-section">
              <label htmlFor="cookie">VIP Cookie（网易云）</label>
              <textarea
                id="cookie"
                value={cookie}
                placeholder="粘贴 MUSIC_U Cookie"
                onChange={(event) => setCookie(event.target.value)}
              />
              <small>用于解锁 VIP 资源。仅保存在浏览器并通过请求头传给服务端。</small>
            </section>
            <section className="modal-section">
              <label htmlFor="bili-cookie">Bilibili Cookie</label>
              <textarea
                id="bili-cookie"
                value={biliCookie}
                placeholder="粘贴 B站 Cookie（可选）"
                onChange={(e) => setBiliCookie(e.target.value)}
              />
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button type="button" onClick={updateBiliCookie}>更新 Cookie</button>
                <button type="button" onClick={refreshBiliCookie}>刷新 Cookie</button>
                <button type="button" onClick={clearBiliCache}>清除 B站缓存</button>
              </div>
            </section>
          </div>
        </div>
      )}

      {renderTabs("bottom")}

      <footer className="player-footer">
        <h3>正在播放</h3>
        {audioSrc ? (
          <audio key={audioKey} src={audioSrc} controls autoPlay />
        ) : (
          <p>选择一首歌曲开始播放。</p>
        )}
      </footer>
    </div>
  );
};

export default App;
