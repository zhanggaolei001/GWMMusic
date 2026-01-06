import React, { useEffect, useMemo, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import { Button, Slider, Space, Typography } from 'antd';
import { PauseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
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
    const lastPlaySrc = useRef<string | null>(null);
    const lastPlayAt = useRef<number>(0);
    const [seekingValue, setSeekingValue] = useState<number | null>(null);

    // sync external audioSrc prop into hook
    useEffect(() => {
        // defensive: only set when a non-empty string is provided
        if (audioSrc) setSrc(audioSrc); else setSrc(null);
    }, [audioSrc, setSrc]);

    useImperativeHandle(ref, () => ({
        async playAndSetSrc(src: string | null) {
            const now = Date.now();
            // debounce: ignore repeated calls to play same src within 500ms
            if (src && lastPlaySrc.current === src && now - lastPlayAt.current < 500) return;
            lastPlaySrc.current = src;
            lastPlayAt.current = now;
            if (src) {
                setSrc(src);
                const a = audioRef.current;
                if (a) {
                    try {
                        const p = a.play();
                        if (p && typeof (p as any).catch === 'function') (p as any).catch((err: any) => { console.error('audio.play() rejected', err); });
                    } catch (e) { console.error('audio.play() threw', e); }
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

    const safeDuration = useMemo(() => (Number.isFinite(duration) && duration > 0 ? duration : 0), [duration]);
    const sliderMax = safeDuration || 1;
    const sliderValue = seekingValue !== null ? seekingValue : (Number.isFinite(currentTime) ? currentTime : 0);

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
                <Space direction="vertical" size={6} style={{ flex: '1 1 auto' }}>
                    <Slider
                        className="player-slider"
                        min={0}
                        max={sliderMax}
                        step={0.2}
                        value={Math.max(0, Math.min(sliderMax, sliderValue))}
                        tooltip={{ formatter: (v) => formatTime(Number(v || 0)) }}
                        onChange={(v) => setSeekingValue(Number(v))}
                        onChangeComplete={(v) => {
                            const secs = Number(v || 0);
                            setSeekingValue(null);
                            seek(secs);
                        }}
                    />

                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div className="player-art" aria-hidden />
                        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
                            <Typography.Text className="player-title" ellipsis>
                                {currentTrack?.name || currentTrack?.raw?.name || (audioSrc ? 'Playing' : 'Stopped')}
                            </Typography.Text>
                            <Typography.Text className="player-sub" type="secondary" ellipsis>
                                {artistsText ?? (formatTime(currentTime) + ' / ' + formatTime(duration))}
                            </Typography.Text>
                        </div>
                        <Button
                            className="player-toggle"
                            onClick={togglePlay}
                            aria-label="toggle-play"
                            type="text"
                            icon={playing ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                        />
                    </div>
                </Space>
            </div>
        </>
    );
});

export default Player;
