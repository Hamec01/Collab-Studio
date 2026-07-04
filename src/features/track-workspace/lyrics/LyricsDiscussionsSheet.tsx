import { X } from "lucide-react";
import type { LyricsDiscussionThread } from "../../../types";
import type { LyricsDiscussionSelection } from "./lyricsDiscussions";
import { LyricsDiscussionsPanel } from "./LyricsDiscussionsPanel";
import { useI18n } from "../../../app/i18n/I18nProvider";

type LyricsDiscussionsSheetProps = {
  open: boolean;
  threads: LyricsDiscussionThread[];
  selection: LyricsDiscussionSelection | null;
  availableAnchors: LyricsDiscussionSelection[];
  canWrite: boolean;
  canResolve: boolean;
  onClose: () => void;
  onClearSelection: () => void;
  onCreateThread: (body: string, selection: LyricsDiscussionSelection | null) => void;
  onReply: (threadId: string, body: string) => void;
  onResolveThread: (threadId: string, resolved: boolean) => void;
  onReanchorThread: (threadId: string, selection: LyricsDiscussionSelection) => void;
};

export function LyricsDiscussionsSheet(props: LyricsDiscussionsSheetProps) {
  const { t } = useI18n();
  if (!props.open) return null;

  return (
    <div className="fixed inset-0 z-[65] lg:hidden" role="dialog" aria-modal="true" aria-label={t("lyrics.comments.dialog")}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={props.onClose}
        aria-label={t("lyrics.comments.close")}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl border border-neutral-800 bg-neutral-950 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={props.onClose} className="min-h-11 min-w-11 rounded-lg text-neutral-300" aria-label={t("lyrics.comments.close")}>
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(78dvh-4rem)] overflow-y-auto">
          <LyricsDiscussionsPanel
            threads={props.threads}
            selection={props.selection}
            availableAnchors={props.availableAnchors}
            canWrite={props.canWrite}
            canResolve={props.canResolve}
            onCreateThread={props.onCreateThread}
            onReply={props.onReply}
            onResolveThread={props.onResolveThread}
            onReanchorThread={props.onReanchorThread}
            onClearSelection={props.onClearSelection}
          />
        </div>
      </div>
    </div>
  );
}
