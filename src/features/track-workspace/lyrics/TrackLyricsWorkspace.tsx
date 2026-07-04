import type React from "react";
import { FolderOpen } from "lucide-react";
import AudioPlayer from "../../../components/AudioPlayer";
import LyricsEditor, { type LyricsSaveStatus, type RestoreDraftSnapshot } from "../../../components/LyricsEditor";
import Button from "../../../shared/ui/Button";
import type { Annotation, LyricVersion, Track } from "../../../types";
import { featureFlags } from "../../../app/featureFlags";
import type { LyricsDocument } from "./lyricsDocument";
import type { LyricsEditState } from "./useLyricsEditLease";

type TrackLyricsWorkspaceProps = {
  projectTitle?: string;
  track: Track;
  canEdit: boolean;
  draftLyrics: string;
  draftDocument: LyricsDocument;
  isEditing: boolean;
  editState: LyricsEditState;
  saveStatus: LyricsSaveStatus;
  savedAt: string | null;
  statusMessage: string;
  restoreDraft: RestoreDraftSnapshot | null;
  selectedLineIndex: number | null;
  selectedAudioVersionId: string | null;
  onChangeDraftLyrics: (lyrics: string) => void;
  onChangeDraftDocument: (document: LyricsDocument) => void;
  onCreateVersion: (label: string) => Promise<void>;
  onRestoreVersion: (version: LyricVersion) => Promise<boolean>;
  onExportTxt: (version: LyricVersion | null) => void;
  onPinVersion: (versionId: string) => void;
  onSelectLine: (lineIndex: number | null) => void;
  onStartEdit: () => Promise<boolean>;
  onStopEdit: () => void;
  onRestoreLocalDraft: () => void;
  onUseServerDraft: () => void;
  onDownloadLocalDraft: () => void;
  onJumpToDiscussion: () => void;
  onRequestUpload: () => void;
  onAddAnnotation: (timestampSeconds: number, text: string) => void;
  onSelectAudioVersion: React.Dispatch<React.SetStateAction<string | null>>;
};

export function TrackLyricsWorkspace({
  projectTitle,
  track,
  canEdit,
  draftLyrics,
  draftDocument,
  isEditing,
  editState,
  saveStatus,
  savedAt,
  statusMessage,
  restoreDraft,
  selectedLineIndex,
  selectedAudioVersionId,
  onChangeDraftLyrics,
  onChangeDraftDocument,
  onCreateVersion,
  onRestoreVersion,
  onExportTxt,
  onPinVersion,
  onSelectLine,
  onStartEdit,
  onStopEdit,
  onRestoreLocalDraft,
  onUseServerDraft,
  onDownloadLocalDraft,
  onJumpToDiscussion,
  onRequestUpload,
  onAddAnnotation,
  onSelectAudioVersion,
}: TrackLyricsWorkspaceProps) {
  const commentsCount = (lineIndex: number) => track.comments.filter((comment) => comment.lineIndex === lineIndex && !comment.resolved).length;
  return (
    <>
      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 p-4 sm:flex-row sm:items-center">
        <div className="text-left">
          <div className="flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-neutral-500">
            <FolderOpen className="h-3.5 w-3.5 text-indigo-400" />
            {projectTitle}
          </div>
          <h2 className="mt-0.5 text-base font-bold text-white">{track.title}</h2>
        </div>
        {canEdit && <Button onClick={onRequestUpload} variant="primary" size="sm">Загрузить аудио</Button>}
      </div>

      <LyricsEditor
        draftLyrics={draftLyrics}
        onChangeDraftLyrics={onChangeDraftLyrics}
        onCreateVersion={onCreateVersion}
        onRestoreVersion={onRestoreVersion}
        onExportTxt={onExportTxt}
        draftDocument={draftDocument}
        structuredEditorEnabled={featureFlags.lyricsStructuredEditor}
        onChangeDraftDocument={onChangeDraftDocument}
        onPinVersion={onPinVersion}
        versionHistory={track.lyricVersions as LyricVersion[]}
        selectedLineIndex={selectedLineIndex}
        onSelectLine={onSelectLine}
        trackCommentsCount={commentsCount}
        canEdit={canEdit}
        isEditing={isEditing}
        editState={editState}
        onStartEdit={onStartEdit}
        onStopEdit={onStopEdit}
        saveStatus={saveStatus}
        savedAt={savedAt}
        statusMessage={statusMessage}
        restoreDraft={restoreDraft}
        onRestoreLocalDraft={onRestoreLocalDraft}
        onUseServerDraft={onUseServerDraft}
        onDownloadLocalDraft={onDownloadLocalDraft}
        onJumpToDiscussion={onJumpToDiscussion}
      />

      <AudioPlayer
        audioVersions={track.audioVersions}
        annotations={track.annotations as Annotation[]}
        onAddAnnotation={onAddAnnotation}
        onSelectAudioVersion={onSelectAudioVersion}
        selectedAudioVersionId={selectedAudioVersionId}
        canAnnotate={canEdit}
        onRequestUploadFile={onRequestUpload}
        onRequestAddLink={onRequestUpload}
      />
    </>
  );
}
