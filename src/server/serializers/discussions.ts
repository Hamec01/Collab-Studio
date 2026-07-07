import { Prisma, type Comment } from "@prisma/client";
import { buildLyricsLineAnchors, resolveLyricsAnchor } from "../../features/track-workspace/lyrics/lyricsDiscussions";
import type { LyricsDocument } from "../../features/track-workspace/lyrics/lyricsDocument";
import { collaborationUserSelect, serializeCollaborationUser } from "./collaboration";

const discussionMessageInclude = {
  author: { select: collaborationUserSelect },
} satisfies Prisma.DiscussionMessageInclude;

export const discussionThreadInclude = {
  createdBy: { select: collaborationUserSelect },
  resolvedBy: { select: collaborationUserSelect },
  messages: {
    include: discussionMessageInclude,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.DiscussionThreadInclude;

export type DiscussionThreadWithRelations = Prisma.DiscussionThreadGetPayload<{
  include: typeof discussionThreadInclude;
}>;

export type LegacyCommentWithUsers = Comment & {
  author: Prisma.UserGetPayload<{ select: typeof collaborationUserSelect }> | null;
  resolvedBy: Prisma.UserGetPayload<{ select: typeof collaborationUserSelect }> | null;
};

function serializeLyricsDiscussionMessage(message: DiscussionThreadWithRelations["messages"][number]) {
  return {
    id: message.id,
    threadId: message.threadId,
    authorId: message.authorId,
    author: message.author?.displayName ?? "Deleted user",
    authorUser: serializeCollaborationUser(message.author),
    body: message.deletedAt ? "Message deleted" : message.body,
    mentions: message.mentions ?? [],
    editedAt: message.editedAt?.toISOString() ?? null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
    updatedAt: message.updatedAt.toISOString(),
    timestamp: message.createdAt.toISOString(),
    legacy: false,
  };
}

export function serializeLyricsDiscussionThread(thread: DiscussionThreadWithRelations, document: LyricsDocument) {
  const anchor = thread.anchorBlockId
    ? {
        blockId: thread.anchorBlockId,
        quote: thread.anchorQuote ?? null,
        prefix: thread.anchorPrefix ?? null,
        suffix: thread.anchorSuffix ?? null,
        startOffsetHint: thread.anchorStartOffsetHint ?? null,
        endOffsetHint: thread.anchorEndOffsetHint ?? null,
      }
    : null;
  const resolvedAnchor = resolveLyricsAnchor(document, anchor);

  return {
    id: thread.id,
    kind: "discussion" as const,
    projectId: thread.projectId,
    trackId: thread.trackId,
    targetType: "lyrics" as const,
    createdById: thread.createdById,
    createdBy: serializeCollaborationUser(thread.createdBy),
    resolved: Boolean(thread.resolvedAt),
    resolvedById: thread.resolvedById,
    resolvedBy: serializeCollaborationUser(thread.resolvedBy),
    resolvedAt: thread.resolvedAt?.toISOString() ?? null,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    timestamp: thread.createdAt.toISOString(),
    anchor: {
      blockId: thread.anchorBlockId ?? null,
      matchedBlockId: resolvedAnchor?.matchedBlockId ?? thread.anchorBlockId ?? null,
      state: thread.anchorBlockId ? resolvedAnchor?.state ?? "orphaned" : null,
      quote: thread.anchorQuote ?? null,
      matchedText: resolvedAnchor?.matchedText ?? thread.anchorQuote ?? null,
      prefix: thread.anchorPrefix ?? null,
      suffix: thread.anchorSuffix ?? null,
      startOffsetHint: thread.anchorStartOffsetHint ?? null,
      endOffsetHint: thread.anchorEndOffsetHint ?? null,
      blockPreview: resolvedAnchor?.blockPreview ?? null,
      isGeneral: !thread.anchorBlockId,
    },
    messages: thread.messages.map(serializeLyricsDiscussionMessage),
    canReply: true,
    legacyCommentId: null,
  };
}

export function serializeLegacyCommentAsDiscussion(comment: LegacyCommentWithUsers, document: LyricsDocument) {
  const lines = buildLyricsLineAnchors(document);
  const line = typeof comment.lineIndex === "number" ? lines.find((entry) => entry.lineIndex === comment.lineIndex) ?? null : null;
  const resolvedAnchor = line?.blockId
    ? resolveLyricsAnchor(document, {
        blockId: line.blockId,
        quote: line.lineText || null,
        prefix: null,
        suffix: null,
        startOffsetHint: line.lineStartOffset,
        endOffsetHint: line.lineEndOffset,
      })
    : null;

  return {
    id: `legacy-${comment.id}`,
    kind: "legacy_comment" as const,
    projectId: "",
    trackId: comment.trackId,
    targetType: "lyrics" as const,
    createdById: comment.authorId,
    createdBy: serializeCollaborationUser(comment.author),
    resolved: comment.resolved,
    resolvedById: comment.resolvedById,
    resolvedBy: serializeCollaborationUser(comment.resolvedBy),
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
    timestamp: comment.createdAt.toISOString(),
    anchor: {
      blockId: line?.blockId ?? null,
      matchedBlockId: resolvedAnchor?.matchedBlockId ?? line?.blockId ?? null,
      state: line?.blockId ? resolvedAnchor?.state ?? "exact" : (typeof comment.lineIndex === "number" ? "orphaned" : null),
      quote: line?.lineText || null,
      matchedText: resolvedAnchor?.matchedText ?? line?.lineText ?? null,
      prefix: null,
      suffix: null,
      startOffsetHint: line?.lineStartOffset ?? null,
      endOffsetHint: line?.lineEndOffset ?? null,
      blockPreview: resolvedAnchor?.blockPreview ?? line?.blockText ?? null,
      isGeneral: comment.lineIndex === null,
      legacyLineIndex: comment.lineIndex ?? undefined,
    },
    messages: [{
      id: `legacy-message-${comment.id}`,
      threadId: `legacy-${comment.id}`,
      authorId: comment.authorId,
      author: comment.author?.displayName ?? "Deleted user",
      authorUser: serializeCollaborationUser(comment.author),
      body: comment.text,
      mentions: comment.mentions ?? [],
      editedAt: null,
      deletedAt: null,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      timestamp: comment.createdAt.toISOString(),
      legacy: true,
    }],
    canReply: false,
    legacyCommentId: comment.id,
  };
}
