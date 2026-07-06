import { Music2, Pause, Play } from "lucide-react";
import type { PlayableAudioSource } from "../types";
import { usePlayer } from "../app/player/PlayerProvider";

type StickyAudioPlayerProps = {
  trackTitle: string;
  selectedAudio: PlayableAudioSource | null;
  onOpenTrack?: () => void;
};

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function StickyAudioPlayer({ trackTitle, selectedAudio, onOpenTrack }: StickyAudioPlayerProps) {
  const player = usePlayer();
  
  const hasPlayableSource = !!player.sourceUrl;
  const safeDuration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  const safeCurrentTime = Number.isFinite(player.currentTime) && player.currentTime >= 0 ? Math.min(player.currentTime, safeDuration || player.currentTime) : 0;
  const progressPercent = safeDuration > 0 ? (safeCurrentTime / safeDuration) * 100 : 0;

  if (!hasPlayableSource || !selectedAudio) {
    // Hide sticky player when no playable audio
    return null;
  }

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto max-w-xl lg:bottom-4"
      aria-label="Mini player"
    >
      <div className="relative overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950/95 shadow-xl backdrop-blur">
        {/* Progress bar background */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-neutral-900">
          <div
            className="h-full bg-gradient-to-r from-indigo-500 to-teal-500 transition-all duration-100"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        <div className="flex items-center gap-3 px-4 py-2.5">
          {/* Play/Pause button */}
          <button
            onClick={() => player.togglePlay()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition-colors hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
            title={player.isPlaying ? "Пауза" : "Воспроизвести"}
            aria-label={player.isPlaying ? "Пауза" : "Воспроизвести"}
          >
            {player.isPlaying ? (
              <Pause className="h-4 w-4 fill-white" />
            ) : (
              <Play className="ml-0.5 h-4 w-4 fill-white" />
            )}
          </button>

          {/* Track info - clickable to return to track */}
          <button
            onClick={onOpenTrack}
            className="min-w-0 flex-1 text-left transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 rounded px-1"
            title={`Открыть трек: ${trackTitle}`}
            aria-label={`Открыть трек: ${trackTitle}`}
          >
            <div className="truncate text-xs font-semibold text-white">{trackTitle}</div>
            <div className="truncate text-[11px] text-neutral-400">
              {selectedAudio.originalFilename}
            </div>
          </button>

          {/* Time display */}
          <div className="shrink-0 text-right">
            <div className="text-[10px] font-mono text-neutral-400">
              {formatTime(safeCurrentTime)}
            </div>
            <div className="text-[10px] font-mono text-neutral-500">
              {formatTime(safeDuration)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
