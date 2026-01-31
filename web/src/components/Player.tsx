import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { useAudio } from '../hooks/useAudio';

type Props = {
    audioSrc: string | null;
    audioKey: number;
    onEnded?: () => void;
    onPlayStateChange?: (playing: boolean) => void;
    play?: boolean;
    currentTrack?: any | null;
};

export type PlayerHandle = {
    playAndSetSrc: (src: string | null, track?: any) => Promise<void> | void;
};

export const Player = forwardRef<PlayerHandle, Props>(({ audioSrc, audioKey, onEnded, onPlayStateChange, play, currentTrack }, ref) => {
    const { audioRef, playing, progress, currentTime, duration, play: playAudio, pause, toggle, setSrc, seek } = useAudio(null);

    // sync external audioSrc prop into hook
    useEffect(() => {
        // defensive: only set when a non-empty string is provided
        if (audioSrc) setSrc(audioSrc); else setSrc(null);
    }, [audioSrc, setSrc]);

    useImperativeHandle(ref, () => ({
        async playAndSetSrc(src: string | null) {
            if (src) {
                setSrc(src);
                const a = audioRef.current;
                if (a) {
                    try {
                        const p = a.play();
                        if (p && typeof (p as any).catch === 'function') (p as any).catch(() => { });
                    } catch (e) { }
                }
            } else {
                setSrc(null);
            }
        }
    }));

    // expose onPlayStateChange and onEnded through hook state
    useEffect(() => {
        onPlayStateChange && onPlayStateChange(playing);
    }, [playing, onPlayStateChange]);

    useEffect(() => {
        if (duration > 0 && currentTime >= duration) {
            onEnded && onEnded();
        }
    }, [currentTime, duration, onEnded]);

    // ensure external callbacks are called when DOM audio fires events
    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const _onPlay = () => onPlayStateChange && onPlayStateChange(true);
        const _onPause = () => onPlayStateChange && onPlayStateChange(false);
        const _onEnded = () => onEnded && onEnded();
        a.addEventListener('play', _onPlay);
        a.addEventListener('pause', _onPause);
        a.addEventListener('ended', _onEnded);
        return () => {
            a.removeEventListener('play', _onPlay);
            a.removeEventListener('pause', _onPause);
            a.removeEventListener('ended', _onEnded);
        };
    }, [audioKey, onPlayStateChange, onEnded, audioRef]);

    const togglePlay = () => {
        toggle();
    };

    // sync external boolean `play` prop into audio hook
    useEffect(() => {
        if (typeof play !== 'undefined') {
            if (play) playAudio(); else pause();
        }
    }, [play, playAudio, pause]);

    const onSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
        const el = e.currentTarget as HTMLDivElement;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const seconds = (duration || 0) * pct;
        seek(seconds);
    };

    // pointer drag / touch support
    const dragging = useRef(false);
    const progressRef = useRef<HTMLDivElement | null>(null);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPct, setTooltipPct] = useState(0);
    const [tooltipTime, setTooltipTime] = useState(0);
    const lastSeekAt = useRef(0);
    const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
        const el = e.currentTarget as HTMLDivElement;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        dragging.current = true;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const secs = (duration || 0) * pct;
        setTooltipPct(pct);
        setTooltipTime(secs);
        setShowTooltip(true);
        const now = Date.now();
        if (now - lastSeekAt.current >= 50) { seek(secs); lastSeekAt.current = now; }
    };
    const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
        if (!dragging.current) return;
        const el = e.currentTarget as HTMLDivElement;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const secs = (duration || 0) * pct;
        setTooltipPct(pct);
        setTooltipTime(secs);
        const now = Date.now();
        if (now - lastSeekAt.current >= 50) { seek(secs); lastSeekAt.current = now; }
    };
    const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
        dragging.current = false;
        try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch (e) { }
        // final seek to ensure precise position
        const el = e.currentTarget as HTMLDivElement;
        const rect = el.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, x / rect.width));
        const secs = (duration || 0) * pct;
        seek(secs);
        setTimeout(() => setShowTooltip(false), 150);
    };

    const formatTime = (t: number) => {
        if (!isFinite(t) || t <= 0) return '0:00';
        const m = Math.floor(t / 60);
        const s = Math.floor(t % 60).toString().padStart(2, '0');
        return `${m}:${s}`;
    };

    const _artistsRaw = (currentTrack?.artists ?? currentTrack?.raw?.artists) as any;
    const artistsText = Array.isArray(_artistsRaw) ? _artistsRaw.join(' / ') : (_artistsRaw ? String(_artistsRaw) : null);

    return (
        <>
            {/* hidden audio element for playback control (kept in DOM) */}
            <audio ref={audioRef} key={audioKey} controls={false} className="player-audio-hidden" />

            <div className="player-footer" role="region" aria-label="mini-player">
                <div ref={progressRef} className="player-progress" style={{ height: 6, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginTop: 8, marginRight: 8 }} onClick={onSeekClick} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
                    <div style={{ width: `${progress}%`, height: '100%', background: 'linear-gradient(90deg,var(--accent),var(--accent-2))', borderRadius: 6 }} />
                    {showTooltip && (
                        <div className="player-progress-tooltip" style={{ left: `${tooltipPct * 100}%` }}>{formatTime(tooltipTime)}</div>
                    )}
                </div>
                <div className="player-art" style={{ width: 44, height: 44, borderRadius: 8, background: 'linear-gradient(135deg,var(--accent),var(--accent-2))' }} />
                <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <div className="player-title">{currentTrack?.name || currentTrack?.raw?.name || (audioSrc ? 'Playing' : 'Stopped')}</div>
                    <div className="player-sub small muted">{artistsText ?? (formatTime(currentTime) + ' / ' + formatTime(duration))}</div>
                </div>
                <div className="player-controls">
                    <button className="action-btn" onClick={togglePlay} aria-label="toggle-play">{playing ? '⏸' : '▶'}</button>
                </div>
            </div>
        </>
    );
});

export default Player;
