import React from 'react';

type Props = {
    playlistQueue: any[];
    removePlaylistItem: (id: number) => void;
    fetchCache: () => void;
    cacheEntries: any[];
    cacheLoading: boolean;
    setMiniPlayer: (v: boolean) => void;
    onPlayItem?: (item: any) => void;
};

export const RightPanel: React.FC<Props> = ({ playlistQueue, removePlaylistItem, fetchCache, cacheEntries, cacheLoading, setMiniPlayer, onPlayItem }) => {
    return (
        <aside className="right-panel">
            <div className="card">
                <h3>播放队列</h3>
                {!playlistQueue.length ? (
                    <p className="muted">播放队列为空</p>
                ) : (
                    <ul className="playlist-compact">
                        {playlistQueue.slice(0, 10).map((item) => (
                            <li key={item.id} className="playlist-item">
                                <div className="playlist-meta" onClick={() => { onPlayItem && onPlayItem(item); setMiniPlayer(false); }} style={{ cursor: 'pointer' }}>
                                    <div className="song-title small">{item.name}</div>
                                    <div className="song-meta small muted">{item.artists?.join(' / ')}</div>
                                </div>
                                <div className="playlist-actions">
                                    <button className="action-btn" onClick={() => { onPlayItem && onPlayItem(item); setMiniPlayer(false); }}>▶</button>
                                    <button className="action-btn" onClick={() => removePlaylistItem(item.id)}>✖</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn secondary" onClick={() => { /* clear handled by parent */ }} disabled={!playlistQueue.length}>清空</button>
                    <button className="btn" onClick={() => setMiniPlayer(false)}>打开播放器</button>
                </div>
            </div>

            <div className="card" style={{ marginTop: 12 }}>
                <h3>缓存概览</h3>
                <div className="cache-summary">
                    <div>已缓存：{cacheEntries.length} 首</div>
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className="btn" onClick={fetchCache} disabled={cacheLoading}>{cacheLoading ? '刷新中...' : '刷新'}</button>
                </div>
            </div>
        </aside>
    );
};

export default RightPanel;
