import { Prisma, type LyricVersion, type Project, type ProjectMember, type User } from "@prisma/client";
import {
  collaborationUserSelect,
  serializeAnnotation,
  serializeChatMessage,
  serializeComment,
  serializeTask,
} from "./collaboration";
import { httpsExternalAudioUrl } from "../schemas/tracks";

export const trackRelationsInclude = {
  lyricVersions: {
    orderBy: [{ createdAt: "desc" as const }, { id: "asc" as const }],
  },
  audioVersions: {
    include: { uploadedBy: { select: collaborationUserSelect } },
    orderBy: [{ versionNumber: "desc" as const }, { id: "asc" as const }],
  },
  comments: {
    include: {
      author: { select: collaborationUserSelect },
      resolvedBy: { select: collaborationUserSelect },
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  chatMessages: {
    include: { author: { select: collaborationUserSelect } },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  tasks: {
    include: {
      createdBy: { select: collaborationUserSelect },
      assignedTo: { select: collaborationUserSelect },
    },
    orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }],
  },
  annotations: {
    include: { author: { select: collaborationUserSelect } },
    orderBy: [{ timestampSeconds: "asc" as const }, { createdAt: "asc" as const }, { id: "asc" as const }],
  },
} satisfies Prisma.TrackInclude;

export type MemberWithUser = ProjectMember & {
  user: Pick<User, "id" | "username" | "email" | "displayName" | "avatarUrl" | "role">;
};

export type TrackWithRelations = Prisma.TrackGetPayload<{
  include: typeof trackRelationsInclude;
}>;

export type ProjectWithRelations = Project & {
  members?: MemberWithUser[];
  tracks?: TrackWithRelations[];
};

export function serializeProjectMember(member: MemberWithUser) {
  return {
    userId: member.userId,
    username: member.user.username,
    displayName: member.user.displayName,
    avatarUrl: member.user.avatarUrl,
    role: member.role,
    createdAt: member.createdAt.toISOString(),
  };
}

export function serializeLyricVersion(version: LyricVersion) {
  return {
    id: version.id,
    lyrics: version.lyrics,
    authorId: version.authorId,
    label: version.label,
    isOriginal: version.isOriginal,
    timestamp: version.createdAt.toISOString(),
    createdAt: version.createdAt.toISOString(),
  };
}

export function serializeAudioVersion(audio: TrackWithRelations["audioVersions"][number], projectId: string) {
  const streamUrl = audio.isExternal ? null : `/api/projects/${projectId}/tracks/${audio.trackId}/audio/${audio.id}/stream`;
  const externalUrl = audio.isExternal && audio.externalUrl && httpsExternalAudioUrl.safeParse(audio.externalUrl).success ? audio.externalUrl : null;
  return {
    id: audio.id,
    originalFilename: audio.originalFilename,
    mimeType: audio.mimeType,
    sizeBytes: audio.sizeBytes,
    durationSeconds: audio.durationSeconds,
    versionNumber: audio.versionNumber,
    uploadedBy: {
      id: audio.uploadedBy?.id ?? null,
      displayName: audio.uploadedBy?.displayName ?? "Deleted user",
      avatarUrl: audio.uploadedBy?.avatarUrl ?? null,
    },
    isExternal: audio.isExternal,
    externalUrl,
    externalProvider: audio.externalProvider,
    streamUrl,
    createdAt: audio.createdAt.toISOString(),
  };
}

export function serializeTrack(track: TrackWithRelations) {
  return {
    id: track.id,
    title: track.title,
    lyrics: track.lyrics,
    lyricsRevision: track.lyricsRevision,
    tags: track.tags,
    versionHistory: track.lyricVersions.map(serializeLyricVersion),
    lyricVersions: track.lyricVersions.map(serializeLyricVersion),
    audioVersions: track.audioVersions.map((audio) => serializeAudioVersion(audio, track.projectId)),
    comments: track.comments.map(serializeComment),
    chat: track.chatMessages.map(serializeChatMessage),
    tasks: track.tasks.map(serializeTask),
    annotations: track.annotations.map(serializeAnnotation),
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  };
}

export function serializeProject(project: ProjectWithRelations, currentUserId?: string) {
  const members = (project.members ?? []).map(serializeProjectMember);
  const owner = members.find((member) => member.role === "owner") ?? null;
  const currentUserRole = currentUserId
    ? (members.find((member) => member.userId === currentUserId)?.role ?? null)
    : null;

  return {
    id: project.id,
    title: project.title,
    type: project.type,
    coverUrl: project.coverUrl,
    tags: project.tags,
    currentUserRole,
    owner: owner
      ? {
          userId: owner.userId,
          username: owner.username,
          displayName: owner.displayName,
          avatarUrl: owner.avatarUrl,
        }
      : null,
    participants: members,
    members,
    tracks: (project.tracks ?? []).map(serializeTrack),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
