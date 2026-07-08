import type { LyricsAnchorState } from "./features/track-workspace/lyrics/lyricsDiscussions";
import type { LyricsDocument } from "./features/track-workspace/lyrics/lyricsDocument";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
  isPublicProfile?: boolean;
  bio?: string | null;
  location?: string | null;
  website?: string | null;
  role: "admin" | "user";
  emailVerifiedAt?: string | null;
  ageAcknowledgedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  location: string | null;
  website: string | null;
  followersCount: number;
  followingCount: number;
  isFollowing?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PublicationAuthorSummary {
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  publicProfileUrl: string | null;
}

export interface PublicationLyricsSnapshot {
  snapshotId: string;
  title: string;
  plainText: string;
}

export interface PrivatePublication {
  id: string;
  kind: "WORK" | "COLLAB";
  status: "PUBLISHED" | "ARCHIVED";
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  tags: string[];
  language: string | null;
  projectId: string;
  projectTitle: string;
  trackId: string;
  trackTitle: string;
  snapshotId: string;
  selectedAssetId: string;
  publicUrl: string;
  streamUrl: string | null;
  downloadUrl: string | null;
  publishedAt: string;
  archivedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  likeCount: number;
  playCount: number;
  hasLiked: boolean;
  author: PublicationAuthorSummary;
  lyrics: PublicationLyricsSnapshot | null;
  collabDetails?: {
    budget: string | null;
    terms: string | null;
    rolesNeeded: string[];
  };
}

export interface PublicWork {
  id: string;
  slug: string;
  kind: "WORK" | "COLLAB";
  title: string;
  description: string | null;
  coverImageUrl: string | null;
  tags: string[];
  language: string | null;
  publishedAt: string;
  expiresAt: string | null;
  likeCount: number;
  playCount: number;
  hasLiked: boolean;
  author: PublicationAuthorSummary;
  authorUserId: string | null;
  commentsClosed: boolean;
  collabDetails?: {
    budget: string | null;
    terms: string | null;
    rolesNeeded: string[];
  };
  lyrics: PublicationLyricsSnapshot | null;
  audio: {
    originalFilename: string;
    mimeType: string | null;
    sizeBytes: number | null;
    durationMs: number | null;
    streamUrl: string;
    downloadUrl: string;
  } | null;
}

export interface ProjectMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: "owner" | "editor" | "viewer";
  createdAt: string;
}

export interface ProjectOwnerSummary {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface LyricVersion {
  id: string;
  lyrics: string;
  document?: LyricsDocument;
  plainText?: string;
  schemaVersion?: number;
  authorId: string | null;
  label: string;
  isOriginal: boolean;
  timestamp: string;
  createdAt: string;
}

export interface AudioVersion {
  id: string;
  originalFilename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  durationSeconds: number | null;
  versionNumber: number;
  uploadedBy: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  };
  createdAt: string;
  streamUrl: string | null;
  isExternal: boolean;
  externalUrl: string | null;
  externalProvider: "google" | "yandex" | "telegram" | "other" | null;
}

export interface TrackAsset {
  id: string;
  trackId: string;
  projectId: string;
  uploadedByUserId: string | null;
  kind: "MASTER" | "AUDIO_VERSION" | "INSTRUMENTAL" | "ACAPELLA" | "STEM" | "DEMO" | "REFERENCE" | "OTHER";
  status: "UPLOADING" | "READY" | "FAILED" | "DELETED";
  title: string | null;
  originalFilename: string;
  storageProvider: string;
  externalUrl: string | null;
  externalProvider: "google" | "yandex" | "telegram" | "other" | null;
  mimeType: string | null;
  sizeBytes: number | null;
  durationMs: number | null;
  waveformData: unknown | null;
  metadata: unknown;
  sourceAssetId: string | null;
  legacyAudioVersionId: string | null;
  versionNumber: number | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  streamUrl: string | null;
  downloadUrl: string | null;
  uploadedBy: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  } | null;
}

export interface PlayableAudioSource {
  sourceType: "asset" | "legacy";
  id: string;
  trackAssetId: string | null;
  legacyAudioVersionId: string | null;
  versionNumber: number | null;
  title: string;
  originalFilename: string;
  streamUrl: string | null;
  downloadUrl: string | null;
  externalUrl: string | null;
  externalProvider: "google" | "yandex" | "telegram" | "other" | null;
  mimeType: string | null;
  durationMs: number | null;
  isPrimary: boolean;
  createdAt: string;
  uploadedBy: {
    id: string | null;
    displayName: string;
    avatarUrl: string | null;
  } | null;
  canDelete: boolean;
  supportsTimestampAnnotations: boolean;
}

export interface CollaborationUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface Comment {
  id: string;
  authorId: string | null;
  author: string;
  authorUser: CollaborationUser | null;
  lineIndex?: number;
  text: string;
  mentions?: string[];
  resolved: boolean;
  resolvedById: string | null;
  resolvedBy: CollaborationUser | null;
  resolvedAt: string | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export interface LyricsDiscussionMessage {
  id: string;
  threadId: string;
  authorId: string | null;
  author: string;
  authorUser: CollaborationUser | null;
  body: string;
  mentions?: string[];
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  timestamp: string;
  legacy: boolean;
}

export interface LyricsDiscussionAnchor {
  blockId: string | null;
  matchedBlockId: string | null;
  state: LyricsAnchorState | null;
  quote: string | null;
  matchedText: string | null;
  prefix: string | null;
  suffix: string | null;
  startOffsetHint: number | null;
  endOffsetHint: number | null;
  blockPreview: string | null;
  isGeneral: boolean;
  legacyLineIndex?: number;
}

export interface LyricsDiscussionThread {
  id: string;
  kind: "discussion" | "legacy_comment";
  projectId: string;
  trackId: string;
  targetType: "lyrics";
  createdById: string | null;
  createdBy: CollaborationUser | null;
  resolved: boolean;
  resolvedById: string | null;
  resolvedBy: CollaborationUser | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  timestamp: string;
  anchor: LyricsDiscussionAnchor;
  messages: LyricsDiscussionMessage[];
  canReply: boolean;
  legacyCommentId: string | null;
}

export interface ChatMessage {
  id: string;
  authorId: string | null;
  author: string;
  authorUser: CollaborationUser | null;
  text: string;
  mentions?: string[];
  timestamp: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in-progress" | "done";
  createdById: string | null;
  createdBy: CollaborationUser | null;
  assignedToId: string | null;
  assignedTo?: string;
  assignedToUser: CollaborationUser | null;
  timestamp: string;
  createdAt: string;
  updatedAt: string;
}

export interface Annotation {
  id: string;
  trackAssetId: string | null;
  authorId: string | null;
  author: string;
  authorUser: CollaborationUser | null;
  timestampSeconds: number;
  text: string;
  createdAt: string;
}

export interface Track {
  id: string;
  title: string;
  lyrics: string;
  lyricsDocument?: LyricsDocument;
  lyricsPlainText?: string;
  lyricsRevision: number;
  tags: string[];
  versionHistory: LyricVersion[];
  lyricVersions: LyricVersion[];
  audioVersions: AudioVersion[];
  assets?: TrackAsset[];
  comments: Comment[];
  lyricsDiscussions?: LyricsDiscussionThread[];
  chat: ChatMessage[];
  tasks: Task[];
  annotations: Annotation[];
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  type: 'single' | 'album';
  coverUrl: string | null;
  tags: string[];
  currentUserRole: "owner" | "editor" | "viewer" | null;
  owner: ProjectOwnerSummary | null;
  participants: ProjectMember[];
  members: ProjectMember[];
  chat?: ChatMessage[];
  tasks?: Task[];
  activity?: ActivityEvent[];
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  projectId: string;
  projectName: string;
  trackId: string | null;
  trackName: string | null;
  type: string;
  message: string;
  actorId: string | null;
  author: string;
  actor: CollaborationUser | null;
  createdAt: string;
  timestamp: string;
  read: boolean;
}

export interface ActivityEvent {
  id: string;
  projectId: string;
  actorId: string | null;
  actor: CollaborationUser | null;
  type: string;
  payload: Record<string, unknown>;
  createdAt: string;
  timestamp: string;
}

export interface RhymeResult {
  word: string;
  rhymes: string[];
  suggestions?: string[];
}

export interface PublicationComment {
  id: string;
  publicationId: string;
  authorId: string;
  text: string;
  isHidden: boolean;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface ContentReport {
  id: string;
  reporterId: string;
  contentType: "PUBLICATION" | "COMMENT";
  contentId: string;
  reason: string;
  status: "PENDING" | "RESOLVED" | "DISMISSED";
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  reporter?: {
    id: string;
    username: string;
    displayName: string;
  };
}

export type ApiErrorCode = string;
