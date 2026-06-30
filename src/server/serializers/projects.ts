import type { LyricVersion, Project, ProjectMember, Track, User } from "@prisma/client";

export type MemberWithUser = ProjectMember & {
  user: Pick<User, "id" | "username" | "email" | "displayName" | "avatarUrl" | "role">;
};

export type TrackWithVersions = Track & {
  lyricVersions?: LyricVersion[];
};

export type ProjectWithRelations = Project & {
  members?: MemberWithUser[];
  tracks?: TrackWithVersions[];
};

export function serializeProjectMember(member: MemberWithUser) {
  return {
    userId: member.userId,
    username: member.user.username,
    email: member.user.email,
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

export function serializeTrack(track: TrackWithVersions) {
  const versions = track.lyricVersions ?? [];
  return {
    id: track.id,
    title: track.title,
    lyrics: track.lyrics,
    tags: track.tags,
    versionHistory: versions.map(serializeLyricVersion),
    lyricVersions: versions.map(serializeLyricVersion),
    audioVersions: [],
    comments: [],
    chat: [],
    tasks: [],
    annotations: [],
    createdAt: track.createdAt.toISOString(),
    updatedAt: track.updatedAt.toISOString(),
  };
}

export function serializeProject(project: ProjectWithRelations) {
  return {
    id: project.id,
    title: project.title,
    type: project.type,
    coverUrl: project.coverUrl,
    tags: project.tags,
    participants: (project.members ?? []).map(serializeProjectMember),
    members: (project.members ?? []).map(serializeProjectMember),
    tracks: (project.tracks ?? []).map(serializeTrack),
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}
