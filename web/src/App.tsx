import React, { useState, useRef } from 'react'
import Navigation from './components/Navigation'
import RightPanel from './components/RightPanel'
import Player, { PlayerHandle } from './components/Player'
import SearchPage from './components/SearchPage'
import SettingsPage from './components/SettingsPage'
import { getStreamUrl } from './lib/api'

const App: React.FC = () => {
  const [navCollapsed, setNavCollapsed] = useState(false)
  const [activeTab, setActiveTab] = useState<'tracks' | 'albums' | 'playlists'>('tracks')
  const [playlistQueue, setPlaylistQueue] = useState<any[]>([
    { id: 1, name: 'Example Song', src: 'https://example.com/audio.mp3', artists: ['Artist'] }
  ])
  const [audioSrc, setAudioSrc] = useState<string | null>(null)
  const [play, setPlay] = useState<boolean | undefined>(undefined)
  const [currentTrack, setCurrentTrack] = useState<any | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const playerRef = useRef<PlayerHandle | null>(null)

  return (
    <div className="app-shell">
      <aside>
        <Navigation navCollapsed={navCollapsed} setNavCollapsed={setNavCollapsed} activeTab={activeTab} setActiveTab={setActiveTab} openSettings={() => setShowSettings(true)} />
      </aside>
      <main>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {/* Player moved below to allow play ref to be available for SearchPage */}
          {showSettings ? (
            <>
              <div className="modal-overlay" style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} onClick={() => setShowSettings(false)} />
              <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', width: '90%', maxWidth: 520, zIndex: 210 }}>
                <SettingsPage onClose={() => setShowSettings(false)} />
              </div>
            </>
          ) : activeTab === 'tracks' ? (
            <div style={{ marginTop: 18 }}>
              <h1>GWM Music</h1>
              <SearchPage onPlay={(item) => { setCurrentTrack(item); const src = item.raw && item.raw.url ? item.raw.url : getStreamUrl(item.id)(); playerRef.current?.playAndSetSrc(src, item); setAudioSrc(src); setPlay(true); }} onCache={(id) => { /* optionally refresh cache */ }} />
            </div>
          ) : (
            <div style={{ marginTop: 18 }}>
              <h1>GWM Music</h1>
              <p>Simple shell: active tab: {activeTab}</p>
            </div>
          )}
          <Player ref={playerRef} audioSrc={audioSrc} audioKey={audioSrc ? 1 : 0} play={play} onPlayStateChange={(p) => setPlay(p)} currentTrack={currentTrack} />
        </div>
      </main>
      <aside>
        <RightPanel playlistQueue={playlistQueue} removePlaylistItem={(id) => setPlaylistQueue(q => q.filter(x => x.id !== id))} fetchCache={() => { }} cacheEntries={[]} cacheLoading={false} setMiniPlayer={() => { }} onPlayItem={(item) => { setCurrentTrack(item); const src = item.raw && item.raw.url ? item.raw.url : (item.src || getStreamUrl(item.id)()); playerRef.current?.playAndSetSrc(src, item); setAudioSrc(src); setPlay(true); }} />
      </aside>
    </div>
  )
}

export default App
