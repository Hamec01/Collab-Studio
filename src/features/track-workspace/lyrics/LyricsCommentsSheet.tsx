import { X } from "lucide-react";
import CommentsPanel from "../../../components/CommentsPanel";
import type { Comment } from "../../../types";
import { useI18n } from "../../../app/i18n/I18nProvider";

type LyricsCommentsSheetProps = {
  open: boolean;
  comments: Comment[];
  selectedLineIndex: number | null;
  lyricsLines: string[];
  canResolve: boolean;
  onClose: () => void;
  onClearSelectedLine: () => void;
  onAddComment: (text: string, lineIndex?: number) => void;
  onResolveComment: (commentId: string) => void;
};

export function LyricsCommentsSheet({
  open,
  comments,
  selectedLineIndex,
  lyricsLines,
  canResolve,
  onClose,
  onClearSelectedLine,
  onAddComment,
  onResolveComment,
}: LyricsCommentsSheetProps) {
  const { t } = useI18n();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[65] lg:hidden" role="dialog" aria-modal="true" aria-label={t("lyrics.comments.dialog")}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
        aria-label={t("lyrics.comments.close")}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[78dvh] rounded-t-2xl border border-neutral-800 bg-neutral-950 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={onClose} className="min-h-11 min-w-11 rounded-lg text-neutral-300" aria-label={t("lyrics.comments.close")}>
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(78dvh-4rem)] overflow-y-auto">
          <CommentsPanel
            comments={comments}
            onAddComment={onAddComment}
            onResolveComment={onResolveComment}
            canResolve={canResolve}
            selectedLineIndex={selectedLineIndex}
            onClearSelectedLine={onClearSelectedLine}
            lyricsLines={lyricsLines}
          />
        </div>
      </div>
    </div>
  );
}
