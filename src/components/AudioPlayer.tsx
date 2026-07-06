import React, { useEffect, useMemo, useState } from "react";
import {
  Bookmark,
  ChevronDown,
  ChevronUp,
  Clock,
  FastForward,
  Link2,
  MapPin,
  Music2,
  Pause,
  Play,
  Plus,
  Rewind,
  RotateCcw,
  Upload,
  Volume2,
} from "lucide-react";
import { Annotation, PlayableAudioSource } from "../types";
import { usePlayer } from "../app/player/PlayerProvider";

interface AudioPlayerProps {
  audioSources: PlayableAudioSource[];
  annotations: Annotation[];
  onAddAnnotation: (timestampSeconds: number, text: string) => void;
  onSelectAudioSource: (sourceId: string) => void;
  selectedAudioSourceId: string | null;
  canAnnotate: boolean;
  onRequestUploadFile?: () => void;
  onRequestAddLink?: () => void;
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const whole = Math.floor(seconds);
  const m = Math.floor(whole / 60);
  const s = whole % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export default function AudioPlayer({
  audioSources,
  annotations,
  onAddAnnotation,
  onSelectAudioSource,
  selectedAudioSourceId,
  canAnnotate,
  onRequestUploadFile,
  onRequestAddLink,
}: AudioPlayerProps) {
  const activeVersion = audioSources.find((v) => v.id === selectedAudioSourceId) || audioSources[0] || null;
  const sourceUrl = activeVersion?.streamUrl || null;
  const externalUrl = activeVersion?.externalUrl || null;
  const hasActiveSource = !!sourceUrl;
  const hasExternalSource = !sourceUrl && !!externalUrl;

  // Use shared player from PlayerProvider
  const player = usePlayer();

  // Local state for loop markers (not shared with sticky player)
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [isLoopEnabled, setIsLoopEnabled] = useState(false);

  // Local state for annotation dialog
  const [showAnnotDialog, setShowAnnotDialog] = useState(false);
  const [annotText, setAnnotText] = useState("");
  const [annotTime, setAnnotTime] = useState<number | null>(null);
  const [showAnnotationsList, setShowAnnotationsList] = useState(false);

  const safeDuration = Number.isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
  const safeCurrentTime = Number.isFinite(player.currentTime) && player.currentTime >= 0 ? Math.min(player.currentTime, safeDuration || player.currentTime) : 0;
  const loopEnd = loopB !== null ? loopB : safeDuration;

  const createdAtLabel = useMemo(() => {
    if (!activeVersion?.createdAt) return "";
    const d = new Date(activeVersion.createdAt);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
  }, [activeVersion?.createdAt]);

  // Load source when activeVersion changes
  useEffect(() => {
    player.loadSource(sourceUrl);
    setLoopA(null);
    setLoopB(null);
    setIsLoopEnabled(false);
  }, [activeVersion?.id, sourceUrl, player]);

  // Handle A/B loop
  useEffect(() => {
    if (!isLoopEnabled || loopA === null || loopB === null) return;
    if (player.currentTime >= loopB) {
      player.seekTo(loopA);
    }
  }, [player.currentTime, isLoopEnabled, loopA, loopB, player]);

  const seekBy = (delta: number) => {
    if (!hasActiveSource) return;
    const next = Math.min(Math.max(player.currentTime + delta, 0), safeDuration || Number.MAX_SAFE_INTEGER);
    player.seekTo(next);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!hasActiveSource) return;
    const time = Number(e.target.value);
    player.seekTo(time);
  };

  const setMarkerA = () => {
    if (!hasActiveSource) return;
    setLoopA(safeCurrentTime);
    setIsLoopEnabled(true);
  };

  const setMarkerB = () => {
    if (!hasActiveSource) return;
    if (loopA !== null && safeCurrentTime > loopA) {
      setLoopB(safeCurrentTime);
      setIsLoopEnabled(true);
      return;
    }
    setLoopB(safeDuration);
    setIsLoopEnabled(true);
  };

  const clearLoop = () => {
    setLoopA(null);
    setLoopB(null);
    setIsLoopEnabled(false);
  };

  const handleOpenAnnotation = () => {
    if (!canAnnotate || !hasActiveSource) return;
    setAnnotTime(safeCurrentTime);
    setAnnotText("");
    setShowAnnotDialog(true);
  };

  const saveAnnotation = () => {
    if (annotTime === null || !annotText.trim()) return;
    onAddAnnotation(annotTime, annotText.trim());
    setShowAnnotDialog(false);
    setAnnotText("");
    setAnnotTime(null);
  };

  const seekToAndPlay = async (seconds: number) => {
    if (!hasActiveSource) return;
    player.seekTo(seconds);
    if (!player.isPlaying) {
      await player.play();
    }
  };

  return (
    <section className="bg-neutral-950 border border-neutral-800 rounded-xl p-3 sm:p-4 flex flex-col gap-3 shadow-xl w-full">
      <div className="h-0.5 w-full rounded-full bg-gradient-to-r from-indigo-500/80 to-teal-500/80" />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="text-left min-w-0">
          <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3 text-indigo-400" />
            АКТИВНАЯ ДЕМКА ТРЕКА
          </div>
          <h4 className="text-sm font-semibold text-white truncate" title={activeVersion?.originalFilename || "Аудио не загружено"}>
            {activeVersion?.originalFilename || "Аудио не загружено"}
          </h4>
          <p className="text-[11px] text-neutral-400 truncate">
            {activeVersion
              ? `${activeVersion.versionNumber !== null ? `Версия #${activeVersion.versionNumber}` : "Аудио"} · ${activeVersion.uploadedBy?.displayName ?? "Неизвестный пользователь"}${createdAtLabel ? ` · ${createdAtLabel}` : ""}`
              : "Загрузите файл или добавьте ссылку, чтобы включить плеер."}
          </p>
        </div>

        {audioSources.length > 0 && (
          <div className="flex items-center gap-1.5 shrink-0 sm:pl-2">
            <span className="text-[10px] font-mono text-neutral-400">ВЕРСИИ:</span>
            <select
              value={selectedAudioSourceId || ""}
              onChange={(e) => onSelectAudioSource(e.target.value)}
              className="max-w-[170px] bg-neutral-900 border border-neutral-800 rounded p-1.5 text-[11px] text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60 cursor-pointer"
              aria-label="Выбор версии аудио"
              title="Выбор версии аудио"
            >
              {audioSources.map((av, index) => (
                <option key={av.id} value={av.id}>
                  {av.versionNumber !== null ? `v${av.versionNumber}` : `audio-${index + 1}`} ({av.originalFilename.length > 15 ? `${av.originalFilename.substring(0, 15)}...` : av.originalFilename})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!hasActiveSource ? (
        <div className="border border-dashed border-neutral-800 rounded-lg bg-neutral-900/30 p-4 min-h-[120px] flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center shrink-0">
              <Music2 className="w-5 h-5 text-neutral-500" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">{hasExternalSource ? "Внешний аудиоисточник" : "Аудио не загружено"}</p>
              <p className="text-xs text-neutral-400">
                {hasExternalSource
                  ? "Для этой версии доступна только внешняя ссылка."
                  : "Добавьте файл или ссылку, чтобы активировать плеер и таймлайн."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto sm:justify-end">
            {hasExternalSource && externalUrl && (
              <a
                href={externalUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-sky-800 bg-sky-950/40 text-sky-200 hover:bg-sky-900/40 focus:outline-none focus:ring-2 focus:ring-sky-500/60"
              >
                <Link2 className="w-3.5 h-3.5" />
                Открыть ссылку
              </a>
            )}
            <button
              type="button"
              onClick={onRequestUploadFile}
              disabled={!canAnnotate}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              title="Загрузить файл"
              aria-label="Загрузить файл"
            >
              <Upload className="w-3.5 h-3.5" />
              Загрузить файл
            </button>
            <button
              type="button"
              onClick={onRequestAddLink}
              disabled={!canAnnotate}
              className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
              title="Добавить ссылку"
              aria-label="Добавить ссылку"
            >
              <Link2 className="w-3.5 h-3.5" />
              Добавить ссылку
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="space-y-1.5">
            <div className="relative w-full h-5 flex items-center">
              {loopA !== null && safeDuration > 0 && (
                <div
                  className="absolute h-1.5 bg-indigo-500/30 rounded"
                  style={{
                    left: `${(loopA / safeDuration) * 100}%`,
                    width: `${(Math.max(loopEnd - loopA, 0) / safeDuration) * 100}%`,
                  }}
                />
              )}

              {loopA !== null && safeDuration > 0 && (
                <div
                  className="absolute w-1.5 h-3 bg-rose-500 rounded-sm top-1"
                  style={{ left: `${(loopA / safeDuration) * 100}%` }}
                  title="Начало петли (A)"
                />
              )}
              {loopB !== null && safeDuration > 0 && (
                <div
                  className="absolute w-1.5 h-3 bg-rose-500 rounded-sm top-1"
                  style={{ left: `${(loopB / safeDuration) * 100}%` }}
                  title="Конец петли (B)"
                />
              )}

              <input
                type="range"
                min={0}
                max={safeDuration || 1}
                step={0.01}
                value={Math.min(safeCurrentTime, safeDuration || safeCurrentTime)}
                onChange={handleSeekChange}
                disabled={!hasActiveSource}
                className="w-full h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                aria-label="Прогресс воспроизведения"
                title="Прогресс воспроизведения"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-neutral-400">
              <span>{formatTime(safeCurrentTime)}</span>
              <span>{formatTime(safeDuration)}</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-neutral-900 pt-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => player.togglePlay()}
                disabled={!hasActiveSource}
                className="w-9 h-9 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-neutral-900 disabled:text-neutral-700 transition-colors flex items-center justify-center cursor-pointer disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/70"
                title={player.isPlaying ? "Пауза" : "Воспроизвести"}
                aria-label={player.isPlaying ? "Пауза" : "Воспроизвести"}
              >
                {player.isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white ml-0.5" />}
              </button>

              <button
                onClick={() => seekBy(-10)}
                disabled={!hasActiveSource}
                className="w-9 h-9 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                title="Назад на 10 секунд"
                aria-label="Назад на 10 секунд"
              >
                <Rewind className="w-4 h-4 mx-auto" />
              </button>

              <button
                onClick={() => seekBy(10)}
                disabled={!hasActiveSource}
                className="w-9 h-9 rounded-lg border border-neutral-800 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                title="Вперед на 10 секунд"
                aria-label="Вперед на 10 секунд"
              >
                <FastForward className="w-4 h-4 mx-auto" />
              </button>
            </div>

            <div className="flex items-center gap-2 min-w-[150px]">
              <Volume2 className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={player.volume}
                onChange={(e) => player.setVolume(Number(e.target.value))}
                disabled={!hasActiveSource}
                className="w-24 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                aria-label="Громкость"
                title="Громкость"
              />
            </div>

            <div className="flex items-center gap-1 bg-neutral-900 border border-neutral-800 p-1 rounded-lg">
              <button
                onClick={setMarkerA}
                disabled={!hasActiveSource}
                className={`text-[10px] py-1 px-2.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
                  loopA !== null ? "bg-indigo-900/40 text-indigo-300 font-semibold" : "text-neutral-400 hover:text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Поставить точку A"
                aria-label="Поставить точку A"
              >
                {loopA !== null ? `A ${formatTime(loopA)}` : "A"}
              </button>
              <button
                onClick={setMarkerB}
                disabled={!hasActiveSource || loopA === null}
                className={`text-[10px] py-1 px-2.5 rounded transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60 ${
                  loopB !== null ? "bg-indigo-900/40 text-indigo-300 font-semibold" : "text-neutral-400 hover:text-white"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
                title="Поставить точку B"
                aria-label="Поставить точку B"
              >
                {loopB !== null ? `B ${formatTime(loopB)}` : "B"}
              </button>
              {(loopA !== null || loopB !== null) && (
                <button
                  onClick={clearLoop}
                  className="p-1.5 text-neutral-400 hover:text-rose-400 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                  title="Сбросить A/B"
                  aria-label="Сбросить A/B"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-neutral-500">СКОРОСТЬ</span>
              <select
                value={player.playbackRate}
                onChange={(e) => player.setPlaybackRate(Number(e.target.value))}
                className="bg-neutral-900 border border-neutral-800 rounded p-1.5 text-xs text-neutral-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 cursor-pointer"
                aria-label="Скорость воспроизведения"
                title="Скорость воспроизведения"
              >
                <option value={0.5}>0.5x</option>
                <option value={0.75}>0.75x</option>
                <option value={1}>1.0x</option>
                <option value={1.25}>1.25x</option>
                <option value={1.5}>1.5x</option>
                <option value={2}>2.0x</option>
              </select>
            </div>

            <div className="ml-auto flex items-center gap-2 w-full sm:w-auto sm:justify-end">
              <button
                onClick={handleOpenAnnotation}
                disabled={!hasActiveSource || !canAnnotate}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 text-[11px] font-semibold bg-neutral-900 hover:bg-neutral-800 disabled:bg-neutral-950 text-indigo-400 px-3 py-2 rounded-lg border border-neutral-800 hover:border-indigo-500/30 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                title="Добавить заметку на текущем таймкоде"
                aria-label="Добавить заметку"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Заметка ({formatTime(safeCurrentTime)})</span>
              </button>

              <button
                type="button"
                onClick={onRequestUploadFile}
                disabled={!canAnnotate}
                className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                title="Загрузить новую версию"
                aria-label="Загрузить новую версию"
              >
                <Upload className="w-3.5 h-3.5" />
                Загрузить
              </button>
              <button
                type="button"
                onClick={onRequestAddLink}
                disabled={!canAnnotate}
                className="inline-flex items-center justify-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                title="Добавить версию по ссылке"
                aria-label="Добавить версию по ссылке"
              >
                <Link2 className="w-3.5 h-3.5" />
                Ссылка
              </button>
            </div>
          </div>

          {annotations.length > 0 && (
            <div>
              <button
                onClick={() => setShowAnnotationsList(!showAnnotationsList)}
                className="w-full sm:w-auto flex items-center justify-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors bg-neutral-900 border border-neutral-800 px-2.5 py-2 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                title="Показать заметки"
                aria-label="Показать заметки"
              >
                <Bookmark className="w-3.5 h-3.5" />
                <span>Заметки ({annotations.length})</span>
                {showAnnotationsList ? <ChevronDown className="w-3.5 h-3.5 ml-1" /> : <ChevronUp className="w-3.5 h-3.5 ml-1" />}
              </button>
            </div>
          )}
        </>
      )}

      {showAnnotDialog && (
        <div className="mt-1 bg-neutral-900 border border-neutral-800 p-3 rounded-lg text-xs space-y-2 flex flex-col">
          <div className="flex items-center justify-between text-neutral-400">
            <span className="font-semibold flex items-center gap-1 text-indigo-400">
              <MapPin className="w-3.5 h-3.5" />
              Добавить заметку на таймкоде: {annotTime !== null ? formatTime(annotTime) : "0:00"}
            </span>
            <button
              onClick={() => setShowAnnotDialog(false)}
              className="text-neutral-500 hover:text-neutral-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 rounded px-1"
              title="Отмена"
              aria-label="Отмена"
            >
              отмена
            </button>
          </div>
          <input
            type="text"
            required
            value={annotText}
            onChange={(e) => setAnnotText(e.target.value)}
            placeholder="Что происходит в этот момент?"
            className="w-full bg-neutral-950 border border-neutral-800 rounded p-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          />
          <button
            onClick={saveAnnotation}
            disabled={!annotText.trim() || !canAnnotate}
            className="bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-850 disabled:text-neutral-600 text-white font-medium p-1.5 rounded text-xs transition-colors self-end focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
          >
            Сохранить заметку
          </button>
        </div>
      )}

      {showAnnotationsList && annotations.length > 0 && (
        <div className="mt-1 bg-neutral-900/60 border border-neutral-850 p-3 rounded-lg text-xs space-y-1.5 max-h-[140px] overflow-y-auto">
          <div className="text-[10px] font-mono text-neutral-500 border-b border-neutral-850 pb-1 mb-2">
            ЗАМЕТКИ К ТАЙМКОДАМ
          </div>
          {annotations
            .slice()
            .sort((a, b) => a.timestampSeconds - b.timestampSeconds)
            .map((annot) => (
              <div
                key={annot.id}
                className="flex items-start justify-between gap-3 p-1.5 hover:bg-neutral-900/80 rounded transition-colors"
              >
                <div className="flex items-start gap-2 text-left">
                  <button
                    onClick={() => seekToAndPlay(annot.timestampSeconds)}
                    className="font-mono bg-indigo-950 text-indigo-400 border border-indigo-900/50 hover:bg-indigo-900 hover:text-white transition-colors p-1 px-1.5 rounded text-[10px] leading-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/60"
                    title="Перейти к таймкоду"
                    aria-label={`Перейти к таймкоду ${formatTime(annot.timestampSeconds)}`}
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
    </section>
  );
}
