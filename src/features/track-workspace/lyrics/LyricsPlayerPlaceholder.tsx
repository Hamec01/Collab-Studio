import { Music2 } from "lucide-react";
import type { PlayableAudioSource } from "../../../types";
import { useI18n } from "../../../app/i18n/I18nProvider";

type LyricsPlayerPlaceholderProps = {
  trackTitle: string;
  selectedAudio: PlayableAudioSource | null;
};

export function LyricsPlayerPlaceholder({ trackTitle, selectedAudio }: LyricsPlayerPlaceholderProps) {
  const { t } = useI18n();

  return (
    <div
      className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-xl items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-950/95 px-4 py-2.5 shadow-xl backdrop-blur lg:bottom-4"
      aria-label={t("lyrics.player.label")}
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-950 text-indigo-300">
        <Music2 className="h-4 w-4" />
      </div>
      <div className="min-w-0 text-left">
        <div className="truncate text-xs font-semibold text-white">{trackTitle}</div>
        <div className="truncate text-[11px] text-neutral-400">
          {selectedAudio ? selectedAudio.originalFilename : t("lyrics.player.empty")}
        </div>
      </div>
      <span className="ml-auto text-[10px] font-medium text-neutral-500">{t("lyrics.player.available")}</span>
    </div>
  );
}
