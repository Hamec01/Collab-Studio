import type { ActivityEvent } from "../../types";

const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function payloadString(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function payloadNumber(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function formatActivityEventSummary(event: ActivityEvent) {
  const actor = event.actor?.displayName ?? "Система";
  const trackTitle = payloadString(event.payload, "trackTitle");
  const taskTitle = payloadString(event.payload, "taskTitle");
  const status = payloadString(event.payload, "status");
  const preview = payloadString(event.payload, "preview");
  const filename = payloadString(event.payload, "originalFilename");
  const versionNumber = payloadNumber(event.payload, "versionNumber");

  switch (event.type) {
    case "comment_created":
      return `${actor} оставил комментарий${trackTitle ? ` в треке «${trackTitle}»` : ""}`;
    case "comment_resolved":
      return `${actor} ${event.payload.resolved === false ? "снова открыл" : "разрешил"} комментарий${trackTitle ? ` в треке «${trackTitle}»` : ""}`;
    case "project_chat_message_created":
      return `${actor} написал в чат проекта${preview ? `: «${preview}»` : ""}`;
    case "track_chat_message_created":
      return `${actor} написал в чат трека${trackTitle ? ` «${trackTitle}»` : ""}${preview ? `: «${preview}»` : ""}`;
    case "project_task_created":
      return `${actor} создал задачу проекта${taskTitle ? ` «${taskTitle}»` : ""}`;
    case "project_task_updated":
      return `${actor} обновил задачу проекта${taskTitle ? ` «${taskTitle}»` : ""}${status ? ` (${status})` : ""}`;
    case "track_task_created":
      return `${actor} создал задачу${trackTitle ? ` для трека «${trackTitle}»` : ""}${taskTitle ? `: «${taskTitle}»` : ""}`;
    case "track_task_updated":
      return `${actor} обновил задачу${trackTitle ? ` в треке «${trackTitle}»` : ""}${taskTitle ? ` «${taskTitle}»` : ""}${status ? ` (${status})` : ""}`;
    case "audio_uploaded":
      return `${actor} загрузил аудио${trackTitle ? ` для трека «${trackTitle}»` : ""}${versionNumber ? ` v${versionNumber}` : ""}${filename ? `: ${filename}` : ""}`;
    case "invite_created":
      return `${actor} создал приглашение`;
    case "invite_accepted":
      return `${actor} принял приглашение`;
    case "invite_revoked":
      return `${actor} отозвал приглашение`;
    case "owner_transferred":
      return `${actor} передал владение проектом`;
    case "track_grant_upserted":
      return `${actor} обновил доступ к треку`;
    case "guest_link_created":
      return `${actor} создал гостевую ссылку`;
    case "guest_link_revoked":
      return `${actor} отозвал гостевую ссылку`;
    default:
      return `${actor} выполнил действие: ${event.type}`;
  }
}

export function formatActivityEventTimestamp(timestamp: string) {
  return dateTimeFormatter.format(new Date(timestamp));
}
