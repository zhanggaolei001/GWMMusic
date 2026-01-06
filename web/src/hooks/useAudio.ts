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

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        const onTime = () => {
            setCurrentTime(a.currentTime || 0);
            setDuration(a.duration || 0);
            setProgress((a.currentTime / (a.duration || 1)) * 100 || 0);
        };
        const onPlay = () => setPlaying(true);
        const onPause = () => setPlaying(false);
        const onEnd = () => setPlaying(false);

        a.addEventListener('timeupdate', onTime);
        a.addEventListener('play', onPlay);
        a.addEventListener('pause', onPause);
        a.addEventListener('ended', onEnd);
        a.addEventListener('loadedmetadata', onTime);

        return () => {
            a.removeEventListener('timeupdate', onTime);
            a.removeEventListener('play', onPlay);
            a.removeEventListener('pause', onPause);
            a.removeEventListener('ended', onEnd);
            a.removeEventListener('loadedmetadata', onTime);
        };
    }, [audioRef.current]);

    useEffect(() => {
        const a = audioRef.current;
        if (!a) return;
        if (srcRef.current) {
            try { a.load(); } catch (e) { }
            try {
                const p = a.play();
                if (p && typeof (p as any).catch === 'function') (p as any).catch(() => { });
            } catch (e) { }
        } else {
            try { a.pause(); } catch (e) { }
        }
    }, [audioRef.current, srcRef.current]);

    const setSrc = (s: string | null) => {
        srcRef.current = s;
        if (audioRef.current) {
            if (s) {
                audioRef.current.src = s as any;
            } else {
                try { audioRef.current.removeAttribute('src'); } catch (e) { }
                try { audioRef.current.pause(); } catch (e) { }
            }
        }
    };

    const play = async () => {
        const a = audioRef.current;
        if (!a) return;
        try {
            const p = a.play();
            if (p && typeof (p as any).catch === 'function') (p as any).catch(() => { });
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
