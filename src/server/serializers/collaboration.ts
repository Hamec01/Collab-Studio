import type { Annotation, ChatMessage, Comment, Notification, Project, ProjectChatMessage, ProjectTask, Task, Track, User } from "@prisma/client";

export const collaborationUserSelect = {
  id: true,
  username: true,
  displayName: true,
  avatarUrl: true,
} as const;

type CollaborationUser = Pick<User, "id" | "username" | "displayName" | "avatarUrl">;

type CommentWithUsers = Comment & {
  author: CollaborationUser | null;
  resolvedBy: CollaborationUser | null;
};

type ChatMessageWithAuthor = ChatMessage & {
  author: CollaborationUser | null;
};

type ProjectChatMessageWithAuthor = ProjectChatMessage & {
  author: CollaborationUser | null;
};

type TaskWithUsers = Task & {
  createdBy: CollaborationUser | null;
  assignedTo: CollaborationUser | null;
};

type ProjectTaskWithUsers = ProjectTask & {
  createdBy: CollaborationUser | null;
  assignedTo: CollaborationUser | null;
};

type AnnotationWithAuthor = Annotation & {
  author: CollaborationUser | null;
};

export type NotificationWithRelations = Notification & {
  actor: CollaborationUser | null;
  project: Pick<Project, "id" | "title">;
  track: Pick<Track, "id" | "title"> | null;
};

export function serializeCollaborationUser(user: CollaborationUser | null) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl,
  };
}

export function serializeComment(comment: CommentWithUsers) {
  return {
    id: comment.id,
    authorId: comment.authorId,
    author: comment.author?.displayName ?? "Deleted user",
    authorUser: serializeCollaborationUser(comment.author),
    lineIndex: comment.lineIndex ?? undefined,
    text: comment.text,
    resolved: comment.resolved,
    resolvedById: comment.resolvedById,
    resolvedBy: serializeCollaborationUser(comment.resolvedBy),
    resolvedAt: comment.resolvedAt?.toISOString() ?? null,
    timestamp: comment.createdAt.toISOString(),
    createdAt: comment.createdAt.toISOString(),
    updatedAt: comment.updatedAt.toISOString(),
  };
}

function serializeChatMessageBase(message: { id: string; authorId: string | null; text: string; createdAt: Date; author: CollaborationUser | null }) {
  return {
    id: message.id,
    authorId: message.authorId,
    author: message.author?.displayName ?? "Deleted user",
    authorUser: serializeCollaborationUser(message.author),
    text: message.text,
    timestamp: message.createdAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
  };
}

export function serializeChatMessage(message: ChatMessageWithAuthor) {
  return serializeChatMessageBase(message);
}

export function serializeProjectChatMessage(message: ProjectChatMessageWithAuthor) {
  return serializeChatMessageBase(message);
}

function serializeTaskBase(task: {
  id: string;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  createdById: string | null;
  createdBy: CollaborationUser | null;
  assignedToId: string | null;
  assignedTo: CollaborationUser | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: task.id,
    title: task.title,
    description: task.description,
    status: task.status === "in_progress" ? "in-progress" : task.status,
    createdById: task.createdById,
    createdBy: serializeCollaborationUser(task.createdBy),
    assignedToId: task.assignedToId,
    assignedTo: task.assignedTo?.displayName ?? undefined,
    assignedToUser: serializeCollaborationUser(task.assignedTo),
    timestamp: task.createdAt.toISOString(),
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

export function serializeTask(task: TaskWithUsers) {
  return serializeTaskBase(task);
}

export function serializeProjectTask(task: ProjectTaskWithUsers) {
  return serializeTaskBase(task);
}

export function serializeAnnotation(annotation: AnnotationWithAuthor) {
  return {
    id: annotation.id,
    trackAssetId: annotation.trackAssetId,
    authorId: annotation.authorId,
    author: annotation.author?.displayName ?? "Deleted user",
    authorUser: serializeCollaborationUser(annotation.author),
    timestampSeconds: annotation.timestampSeconds,
    text: annotation.text,
    createdAt: annotation.createdAt.toISOString(),
  };
}

export function serializeNotification(notification: NotificationWithRelations) {
  return {
    id: notification.id,
    projectId: notification.projectId,
    projectName: notification.project.title,
    trackId: notification.trackId,
    trackName: notification.track?.title,
    type: notification.type,
    message: notification.message,
    actorId: notification.actorId,
    author: notification.actorName ?? notification.actor?.displayName ?? "System",
    actor: serializeCollaborationUser(notification.actor),
    read: notification.read,
    timestamp: notification.createdAt.toISOString(),
    createdAt: notification.createdAt.toISOString(),
  };
}
