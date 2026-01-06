import { useEffect, useRef, useState, MutableRefObject } from 'react';

export type UseAudioControls = {
    audioRef: MutableRefObject<HTMLAudioElement | null>;
    playing: boolean;
    currentTime: number;
    duration: number;
    progress: number; // 0-100
    setSrc: (src: string | null) => void;
    play: () => Promise<void> | void;
    pause: () => void;
    toggle: () => Promise<void> | void;
    seek: (seconds: number) => void;
};

export function useAudio(initialSrc: string | null = null): UseAudioControls {
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [progress, setProgress] = useState(0);
    const srcRef = useRef<string | null>(initialSrc);
    const loadingRef = useRef<boolean>(false);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const onTime = () => {
            setCurrentTime(a.currentTime || 0);
            setDuration(a.duration || 0);
            setProgress((a.currentTime / (a.duration || 1)) * 100 || 0);
        };
        const onLoadStart = () => {
            loadingRef.current = true;
            try { console.debug('[audio] loadstart', a.currentSrc); } catch (e) { }
        };
        const onCanPlay = () => {
            loadingRef.current = false;
            try { console.debug('[audio] canplay', a.currentSrc); } catch (e) { }
        };
        const onAudioError = () => {
            loadingRef.current = false;
            try { console.warn('[audio] error', a.currentSrc); } catch (e) { }
        };
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onEnd = () => setPlaying(false);

        a.addEventListener('timeupdate', onTime);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnd);
        a.addEventListener('loadedmetadata', onTime);
        a.addEventListener('loadstart', onLoadStart);
        a.addEventListener('canplay', onCanPlay);
        a.addEventListener('canplaythrough', onCanPlay);
        a.addEventListener('error', onAudioError);

        return () => {
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('play', onPlay);
            a.removeEventListener('pause', onPause);
            a.removeEventListener('ended', onEnd);
            a.removeEventListener('loadedmetadata', onTime);
            a.removeEventListener('loadstart', onLoadStart);
            a.removeEventListener('canplay', onCanPlay);
            a.removeEventListener('canplaythrough', onCanPlay);
            a.removeEventListener('error', onAudioError);
        };
    }, [audioRef.current]);

    // NOTE: loading/playing is explicitly handled by `setSrc` and the
    // Player imperative `playAndSetSrc` to avoid duplicate `load()`/`play()`
    // calls which can provoke multiple network requests. Do not auto-play
    // from here based on `srcRef` changes.

    const setSrc = (s: string | null) => {
        // if source unchanged, avoid re-setting to prevent duplicate network requests
        if (srcRef.current === s) return;

        const a = audioRef.current;
        // if we are already loading the same src, ignore
        if (a && s && loadingRef.current && srcRef.current === s) return;

        // update desired src
        srcRef.current = s;
        if (!a) return;
        if (s) {
            try {
                // set src and attempt to load once; mark loading flag
                loadingRef.current = true;
                a.src = s as any;
            } catch (e) { }
            try { a.load(); } catch (e) { }
        } else {
            try { a.removeAttribute('src'); } catch (e) { }
            try { a.pause(); } catch (e) { }
            loadingRef.current = false;
        }
    };

    const play = async () => {
        const a = audioRef.current;
        if (!a) return;
        try {
            const p = a.play();
            if (p && typeof (p as any).catch === 'function') (p as any).catch((err: any) => { console.error('audio.play() rejected', err); });
        } catch (e) { }
    };

    const pause = () => {
        const a = audioRef.current;
        if (!a) return;
        try { a.pause(); } catch (e) { }
    };

    const toggle = () => (playing ? pause() : play());

    const seek = (seconds: number) => {
        const a = audioRef.current;
        if (!a) return;
        try { a.currentTime = seconds; } catch (e) { }
    };

    return { audioRef, playing, currentTime, duration, progress, setSrc, play, pause, toggle, seek };
}
