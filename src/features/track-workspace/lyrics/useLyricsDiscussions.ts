import { useMemo, useState } from "react";
import {
  createLyricsDiscussionMessage,
  createLyricsDiscussionThread,
  reanchorLyricsDiscussionThread,
  resolveLyricsDiscussionThread,
} from "../../../api/projects";
import type { Track, Project } from "../../../types";
import { buildLyricsLineAnchors, selectionFromLineAnchor, type LyricsDiscussionSelection } from "./lyricsDiscussions";
import type { LyricsDocument } from "./lyricsDocument";

type UseLyricsDiscussionsArgs = {
  activeProject: Project | null;
  activeTrack: Track | null;
  draftDocument: LyricsDocument;
  withAuth: <T>(operation: () => Promise<T>) => Promise<T>;
  refreshCurrentTrack: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
};

export function useLyricsDiscussions({
  activeProject,
  activeTrack,
  draftDocument,
  withAuth,
  refreshCurrentTrack,
  refreshNotifications,
}: UseLyricsDiscussionsArgs) {
  const [showLyricsComments, setShowLyricsComments] = useState(false);
  const [discussionSelection, setDiscussionSelection] = useState<LyricsDiscussionSelection | null>(null);

  const discussionAnchors = useMemo(() => {
    if (!activeTrack) return [] as LyricsDiscussionSelection[];
    const document = activeTrack.lyricsDocument ?? draftDocument;
    return buildLyricsLineAnchors(document)
      .map((line) => selectionFromLineAnchor(line))
      .filter((line): line is LyricsDiscussionSelection => line !== null && Boolean(line.blockId));
  }, [activeTrack, draftDocument]);

  const clearDiscussionState = () => {
    setShowLyricsComments(false);
    setDiscussionSelection(null);
  };

  const handleCreateDiscussionThread = async (body: string, selection: LyricsDiscussionSelection | null) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createLyricsDiscussionThread(activeProject.id, activeTrack.id, { body, selection }));
    await Promise.all([refreshCurrentTrack(), refreshNotifications()]);
  };

  const handleReplyDiscussionThread = async (threadId: string, body: string) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => createLyricsDiscussionMessage(activeProject.id, activeTrack.id, threadId, { body }));
    await Promise.all([refreshCurrentTrack(), refreshNotifications()]);
  };

  const handleResolveDiscussionThread = async (threadId: string, resolved: boolean) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => resolveLyricsDiscussionThread(activeProject.id, activeTrack.id, threadId, { resolved }));
    await refreshCurrentTrack();
  };

  const handleReanchorDiscussionThread = async (threadId: string, selection: LyricsDiscussionSelection) => {
    if (!activeProject || !activeTrack) return;
    await withAuth(() => reanchorLyricsDiscussionThread(activeProject.id, activeTrack.id, threadId, selection));
    setDiscussionSelection(selection);
    await refreshCurrentTrack();
  };

  return {
    showLyricsComments,
    setShowLyricsComments,
    discussionSelection,
    setDiscussionSelection,
    discussionAnchors,
    clearDiscussionState,
    handleCreateDiscussionThread,
    handleReplyDiscussionThread,
    handleResolveDiscussionThread,
    handleReanchorDiscussionThread,
  };
}
