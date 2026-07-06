import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { PlayableAudioSource } from "../../types";

type PlayerContextValue = {
  // Source selection
  selectedAudioSourceId: string | null;
  setSelectedAudioSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  syncSelectedAudioSource: (audioSources: PlayableAudioSource[]) => void;

  // Playback engine
  audioElement: HTMLAudioElement | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playbackRate: number;
  sourceUrl: string | null;

  // Playback controls
  play: () => Promise<void>;
  pause: () => void;
  togglePlay: () => Promise<void>;
  seekTo: (time: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  loadSource: (url: string | null) => void;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [selectedAudioSourceId, setSelectedAudioSourceId] = useState<string | null>(null);

  // Shared audio element - create once and reuse
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);

  // Create audio element once
  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.volume = volume;
      audioRef.current.playbackRate = playbackRate;
    }

    const audio = audioRef.current;

    const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
    const handleLoadedMetadata = () => {
      const d = audio.duration;
      setDuration(Number.isFinite(d) && d > 0 ? d : 0);
    };
    const handleEnded = () => setIsPlaying(false);
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("play", handlePlay);

    return () => {
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("play", handlePlay);
    };
  }, []);

  // Sync volume
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Sync playback rate
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  const syncSelectedAudioSource = useCallback((audioSources: PlayableAudioSource[]) => {
    setSelectedAudioSourceId((prev) => {
      if (prev && audioSources.some((source) => source.id === prev)) {
        return prev;
      }
      return audioSources[0]?.id ?? null;
    });
  }, []);

  const loadSource = useCallback((url: string | null) => {
    if (!audioRef.current) return;

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setSourceUrl(url);

    if (url) {
      audioRef.current.src = url;
      audioRef.current.load();
    } else {
      audioRef.current.removeAttribute("src");
    }
  }, []);

  const play = useCallback(async () => {
    if (!audioRef.current || !sourceUrl) return;
    try {
      await audioRef.current.play();
      setIsPlaying(true);
    } catch (error) {
      console.error("Playback failed:", error);
      setIsPlaying(false);
    }
  }, [sourceUrl]);

  const pause = useCallback(() => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    setIsPlaying(false);
  }, []);

  const togglePlay = useCallback(async () => {
    if (isPlaying) {
      pause();
    } else {
      await play();
    }
  }, [isPlaying, play, pause]);

  const seekTo = useCallback((time: number) => {
    if (!audioRef.current || !sourceUrl) return;
    const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : Number.MAX_SAFE_INTEGER;
    const safeTime = Math.min(Math.max(time, 0), safeDuration);
    audioRef.current.currentTime = safeTime;
    setCurrentTime(safeTime);
  }, [sourceUrl, duration]);

  const value = useMemo(
    () => ({
      // Source selection
      selectedAudioSourceId,
      setSelectedAudioSourceId,
      syncSelectedAudioSource,

      // Playback engine
      audioElement: audioRef.current,
      isPlaying,
      currentTime,
      duration,
      volume,
      playbackRate,
      sourceUrl,

      // Playback controls
      play,
      pause,
      togglePlay,
      seekTo,
      setVolume,
      setPlaybackRate,
      loadSource,
    }),
    [
      selectedAudioSourceId,
      syncSelectedAudioSource,
      isPlaying,
      currentTime,
      duration,
      volume,
      playbackRate,
      sourceUrl,
      play,
      pause,
      togglePlay,
      seekTo,
      loadSource,
    ],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return context;
}
