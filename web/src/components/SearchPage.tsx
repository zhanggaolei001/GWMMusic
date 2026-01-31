import React, { useState } from 'react'
import { searchTracks, getStreamUrl, cacheTrack } from '../lib/api'

type Props = {
    onPlay: (item: any) => void;
    onCache?: (id: number) => void;
}

const STORAGE_KEY = 'gwm_settings_v1'

const loadSettings = () => {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { defaultSource: 'netease', cacheTag: 'default' }
        return JSON.parse(raw)
    } catch (e) {
        return { defaultSource: 'netease', cacheTag: 'default' }
    }
}

const SearchPage: React.FC<Props> = ({ onPlay, onCache }) => {
    const saved = loadSettings()
    const [q, setQ] = useState('')
    const [results, setResults] = useState<any[]>([])
    const [loading, setLoading] = useState(false)
    const [source, setSource] = useState<'netease' | 'bili'>(saved.defaultSource || 'netease')
    const [tag, setTag] = useState<string>(saved.cacheTag || 'default')

    const doSearch = async () => {
        if (!q.trim()) return
        setLoading(true)
        try {
            const items = await searchTracks(q)
            setResults(items)
        } catch (e) {
            setResults([])
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="card search-page">
            <div className="search-form" style={{ alignItems: 'center', marginBottom: 12 }}>
                <input aria-label="search-input" className="search-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜索歌曲/视频/专辑" />
                <select value={source} onChange={(e) => setSource(e.target.value as any)} style={{ marginLeft: 8 }}>
                    <option value="netease">网易云</option>
                    <option value="bili">Bilibili</option>
                </select>
                <button className="search-btn" onClick={doSearch} disabled={loading} aria-label="search-button">{loading ? '搜索中...' : '搜索'}</button>
            </div>
            <div>
                {results.length === 0 ? (
                    <p className="muted">未找到结果</p>
                ) : (
                    <ul className="song-list">
                        {results.map((r: any) => (
                            <li key={r.id} className="result-item">
                                <div className="song-left">
                                    <div className="art" aria-hidden>{(r.name || '').slice(0, 1)}</div>
                                    <div>
                                        <div className="song-title">{r.name}</div>
                                        <div className="song-meta small muted">{(r.artists || []).join(' / ')}</div>
                                    </div>
                                </div>
                                <div className="actions">
                                    <button className="result-play" onClick={() => onPlay(r)} aria-label={`play-${r.id}`}>▶</button>
                                    <button className="action-btn" onClick={async () => { await cacheTrack(r.id, tag); onCache && onCache(r.id); }}>缓存</button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    )
}

export default SearchPage
