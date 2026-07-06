import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import CommentsPanel from "../../../components/CommentsPanel";
import type { Comment } from "../../../types";
import { useI18n } from "../../../app/i18n/I18nProvider";

type LyricsCommentsSheetProps = {
  open: boolean;
  comments: Comment[];
  selectedLineIndex: number | null;
  lyricsLines: string[];
  canWrite: boolean;
  canResolve: boolean;
  onClose: () => void;
  onClearSelectedLine: () => void;
  onAddComment: (text: string, lineIndex?: number) => Promise<void> | void;
  onResolveComment: (commentId: string) => Promise<void> | void;
};

export function LyricsCommentsSheet({
  open,
  comments,
  selectedLineIndex,
  lyricsLines,
  canWrite,
  canResolve,
  onClose,
  onClearSelectedLine,
  onAddComment,
  onResolveComment,
}: LyricsCommentsSheetProps) {
  const { t } = useI18n();
  const pushedHistoryRef = useRef(false);

  useEffect(() => {
    if (!open) {
      pushedHistoryRef.current = false;
      return;
    }

    window.history.pushState({ lyricsCommentsSheet: true }, "");
    pushedHistoryRef.current = true;

    const handlePopState = () => {
      pushedHistoryRef.current = false;
      onClose();
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleClose = () => {
    if (pushedHistoryRef.current) {
      window.history.back();
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[65] lg:hidden" role="dialog" aria-modal="true" aria-label={t("lyrics.comments.dialog")}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        onClick={handleClose}
        aria-label={t("lyrics.comments.close")}
      />
      <div className="absolute inset-x-0 bottom-0 max-h-[82dvh] rounded-t-2xl border border-neutral-800 bg-neutral-950 p-3 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
        <div className="mb-2 flex justify-end">
          <button type="button" onClick={handleClose} className="min-h-11 min-w-11 rounded-lg text-neutral-300" aria-label={t("lyrics.comments.close")}>
            <X className="mx-auto h-5 w-5" />
          </button>
        </div>
        <div className="max-h-[calc(82dvh-4rem)] overflow-y-auto overscroll-contain pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <CommentsPanel
            comments={comments}
            onAddComment={onAddComment}
            onResolveComment={onResolveComment}
            canWrite={canWrite}
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
