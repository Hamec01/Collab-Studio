import React, { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  Bookmark,
  FastForward,
  Clock,
  Plus,
  Trash2,
  MapPin,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { AudioVersion, AudioAnnotation } from "../types";

interface AudioPlayerProps {
  currentTrack: any;
  audioVersions: AudioVersion[];
  annotations: AudioAnnotation[];
  onAddAnnotation: (timestampSeconds: number, text: string) => void;
  onSelectAudioVersion: (versionId: string) => void;
  selectedAudioVersionId: string | null;
}

export default function AudioPlayer({
  currentTrack,
  audioVersions,
  annotations,
  onAddAnnotation,
  onSelectAudioVersion,
  selectedAudioVersionId,
}: AudioPlayerProps) {
  const activeVersion = audioVersions.find((v) => v.id === selectedAudioVersionId) || audioVersions[0];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [volume, setVolume] = useState(0.8);

  // A-B Looping State
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);

  // Annotation dialog state
  const [showAnnotDialog, setShowAnnotDialog] = useState(false);
  const [annotText, setAnnotText] = useState("");
  const [annotTime, setAnnotTime] = useState<number | null>(null);
  const [showAnnotationsList, setShowAnnotationsList] = useState(false);

  // Effect to reload audio when the active version changes
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
      setIsPlaying(false);
      setCurrentTime(0);
      setLoopA(null);
      setLoopB(null);
    }
  }, [activeVersion?.id]);

  // Handle Playback rate change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Handle Volume change
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Check A-B Loop boundaries during playback
  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    const curr = audioRef.current.currentTime;
    setCurrentTime(curr);

    if (isLoopEnabled && loopA !== null && loopB !== null) {
      if (curr >= loopB) {
        audioRef.current.currentTime = loopA;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch((e) => console.log("Playback interrupted", e));
      setIsPlaying(true);
    }
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // Setting Loop Markers
  const setMarkerA = () => {
    setLoopA(currentTime);
    setIsLoopEnabled(true);
  };

  const setMarkerB = () => {
    if (loopA !== null && currentTime > loopA) {
      setLoopB(currentTime);
      setIsLoopEnabled(true);
    } else {
      setLoopB(duration);
      setIsLoopEnabled(true);
    }
  };

  const clearLoop = () => {
    setLoopA(null);
    setLoopB(null);
    setIsLoopEnabled(false);
  };

  // Open note taker at current timestamp
  const handleOpenAnnotation = () => {
    if (audioRef.current) {
      // Pause or hold time
      setAnnotTime(currentTime);
      setAnnotText("");
      setShowAnnotDialog(true);
    }
  };

  const saveAnnotation = () => {
    if (annotTime !== null && annotText.trim()) {
      onAddAnnotation(annotTime, annotText.trim());
      setShowAnnotDialog(false);
      setAnnotText("");
      setAnnotTime(null);
    }
  };

  const seekTo = (seconds: number) => {
    setCurrentTime(seconds);
    if (audioRef.current) {
      audioRef.current.currentTime = seconds;
      if (!isPlaying) {
        audioRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    }
  };

  return (
    <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 flex flex-col gap-3 relative shadow-xl overflow-hidden">
      {/* Decorative gradient light */}
      <div className="absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-indigo-500 to-teal-500" />

      {/* Hidden Audio Element */}
      {activeVersion?.url && (
        <audio
          ref={audioRef}
          src={activeVersion.url}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={() => setIsPlaying(false)}
        />
      )}

      {/* Player Top row: Track Title / Version selection */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
        <div className="text-left">
          <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-indigo-400" />
            АКТИВНАЯ ДЕМКА ТРЕКА
          </div>
          <h4 className="text-sm font-semibold text-white truncate max-w-[280px]">
            {activeVersion ? activeVersion.filename : "Аудио не загружено"}
          </h4>
          <p className="text-[11px] text-neutral-400">
            {activeVersion
              ? `Версия #${activeVersion.versionNumber} от ${activeVersion.uploadedBy}`
              : "Пожалуйста, загрузите mp3 или вставьте ссылку на демо"}
          </p>
        </div>

        {/* Audio version selector */}
        {audioVersions.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-neutral-400">ВЕРСИИ:</span>
            <select
              value={selectedAudioVersionId || ""}
              onChange={(e) => onSelectAudioVersion(e.target.value)}
              className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {audioVersions.map((av) => (
                <option key={av.id} value={av.id}>
                  v{av.versionNumber} ({av.filename})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Progress slider and times */}
      <div className="flex items-center gap-3 w-full px-1">
        <span className="text-xs font-mono text-neutral-400 w-8 text-right">
          {formatTime(currentTime)}
        </span>

        {/* Custom seek bar with A-B loops visual display */}
        <div className="relative flex-1 flex items-center h-5">
          {/* A-B loop colored region */}
          {loopA !== null && duration > 0 && (
            <div
              className="absolute h-1 bg-indigo-500/30 rounded"
              style={{
                left: `${(loopA / duration) * 100}%`,
                width: `${(((loopB !== null ? loopB : duration) - loopA) / duration) * 100}%`,
              }}
            />
          )}

          {/* Markers */}
          {loopA !== null && duration > 0 && (
            <div
              className="absolute w-1.5 h-3 bg-red-500 rounded-sm top-1"
              style={{ left: `${(loopA / duration) * 100}%` }}
              title="Начало петли (A)"
            />
          )}
          {loopB !== null && duration > 0 && (
            <div
              className="absolute w-1.5 h-3 bg-red-500 rounded-sm top-1"
              style={{ left: `${(loopB / duration) * 100}%` }}
              title="Конец петли (B)"
            />
          )}

          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeekChange}
            className="w-full h-1 bg-neutral-850 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        <span className="text-xs font-mono text-neutral-400 w-8 text-left">
          {formatTime(duration)}
        </span>
      </div>

      {/* Player controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 border-t border-neutral-900 pt-3">
        {/* Play controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={togglePlay}
            disabled={!activeVersion}
            className="p-3 rounded-full bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-neutral-900 disabled:text-neutral-700 transition-all shadow-md flex items-center justify-center cursor-pointer transform hover:scale-105 active:scale-95"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
          </button>

          {/* Quick Annotation button */}
          <button
            onClick={handleOpenAnnotation}
            disabled={!activeVersion}
            className="flex items-center gap-1 text-[11px] font-semibold bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-950 text-indigo-400 px-3 py-2 rounded-lg border border-neutral-800 hover:border-indigo-500/30 transition-all cursor-pointer"
            title="Оставить заметку на текущей секунде трека"
          >
            <Plus className="w-3.5 h-3.5" />
            Заметка ({formatTime(currentTime)})
          </button>
        </div>

        {/* Looping Panel (A-B Looping) */}
        <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-850 p-1 rounded-lg">
          <button
            onClick={setMarkerA}
            disabled={!activeVersion}
            className={`text-[10px] px-2 py-1 rounded transition-colors cursor-pointer ${
              loopA !== null ? "bg-indigo-900/40 text-indigo-300 font-bold" : "text-neutral-400 hover:text-white"
            }`}
          >
            {loopA !== null ? `A: ${formatTime(loopA)}` : "[ Поставить A ]"}
          </button>
          <button
            onClick={setMarkerB}
            disabled={!activeVersion || loopA === null}
            className={`text-[10px] px-2 py-1 rounded transition-colors cursor-pointer ${
              loopB !== null ? "bg-indigo-900/40 text-indigo-300 font-bold" : "text-neutral-400 hover:text-white"
            }`}
          >
            {loopB !== null ? `B: ${formatTime(loopB)}` : "[ Поставить B ]"}
          </button>
          {(loopA !== null || loopB !== null) && (
            <button
              onClick={clearLoop}
              className="p-1 text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
              title="Сбросить петлю"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Speed Controls */}
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-neutral-500">СКОРОСТЬ:</span>
          <select
            value={playbackSpeed}
            onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
            className="bg-neutral-900 border border-neutral-800 rounded p-1 text-xs text-neutral-300 focus:outline-none cursor-pointer"
          >
            <option value={0.5}>0.5x (Слоу)</option>
            <option value={0.75}>0.75x</option>
            <option value={1}>1.0x (Норм)</option>
            <option value={1.25}>1.25x</option>
            <option value={1.5}>1.5x</option>
            <option value={2}>2.0x (Фаст)</option>
          </select>
        </div>

        {/* Volume */}
        <div className="flex items-center gap-2">
          <Volume2 className="w-3.5 h-3.5 text-neutral-400" />
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-16 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
        </div>

        {/* Toggle Annotations button */}
        {annotations.length > 0 && (
          <button
            onClick={() => setShowAnnotationsList(!showAnnotationsList)}
            className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors bg-neutral-900 border border-neutral-800 px-2.5 py-1.5 rounded-lg cursor-pointer"
          >
            <Bookmark className="w-3.5 h-3.5" />
            Заметки ({annotations.length})
            {showAnnotationsList ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      {/* Note-Taker Dialog Panel Overlay */}
      {showAnnotDialog && (
        <div className="mt-2 bg-neutral-900 border border-neutral-800 p-3 rounded-lg text-xs space-y-2 flex flex-col">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-semibold flex items-center gap-1 text-indigo-400">
              <MapPin className="w-3.5 h-3.5" />
              Добавить заметку на таймкоде: {annotTime !== null ? formatTime(annotTime) : ""}
            </span>
            <button
              onClick={() => setShowAnnotDialog(false)}
              className="text-neutral-500 hover:text-neutral-300"
            >
              отмена
            </button>
          </div>
          <input
            type="text"
            required
            value={annotText}
            onChange={(e) => setAnnotText(e.target.value)}
            placeholder="Что происходит в этот момент? (Например: Вокальный хук)"
            className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:border-indigo-500"
          />
          <button
            onClick={saveAnnotation}
            disabled={!annotText.trim()}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-850 disabled:text-neutral-600 text-white font-medium p-1.5 rounded text-xs transition-colors self-end"
          >
            Сохранить заметку
          </button>
        </div>
      )}

      {/* Annotations List */}
      {showAnnotationsList && annotations.length > 0 && (
        <div className="mt-2 bg-neutral-900/60 border border-neutral-850 p-3 rounded-lg text-xs space-y-1.5 max-h-[140px] overflow-y-auto">
          <div className="text-[10px] font-mono text-neutral-500 border-b border-neutral-850 pb-1 mb-2">
            ЗАМЕТКИ К ТАЙМКОДАМ (Нажмите на таймкод для перехода)
          </div>
          {annotations
            .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
            .map((annot) => (
              <div
                key={annot.id}
                className="flex items-start justify-between gap-3 p-1.5 hover:bg-neutral-900/80 rounded transition-colors"
              >
                <div className="flex items-start gap-2 text-left">
                  <button
                    onClick={() => seekTo(annot.timestampSeconds)}
                    className="font-mono bg-indigo-950 text-indigo-400 border border-indigo-900/50 hover:bg-indigo-900 hover:text-white transition-colors p-1 px-1.5 rounded text-[10px] leading-none cursor-pointer"
                  >
                    {formatTime(annot.timestampSeconds)}
                  </button>
                  <div className="text-neutral-300 text-[11px] leading-snug">
                    <span className="font-medium text-white mr-1.5">[{annot.author}]:</span>
                    {annot.text}
                  </div>
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
