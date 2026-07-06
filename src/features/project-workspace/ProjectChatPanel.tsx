import ChatRoom from "../../components/ChatRoom";
import type { AuthUser, Project } from "../../types";

type ProjectChatPanelProps = {
  project: Project;
  currentUser: AuthUser | null;
  canSend: boolean;
  onSendMessage: (text: string) => Promise<void> | void;
};

export function ProjectChatPanel({ project, currentUser, canSend, onSendMessage }: ProjectChatPanelProps) {
  return (
    <ChatRoom
      chat={project.chat ?? []}
      onSendMessage={onSendMessage}
      currentUser={currentUser}
      canSend={canSend}
      title="ЧАТ ПРОЕКТА"
      description="Общие сообщения по проекту без привязки к конкретному треку"
      emptyMessage="В проектном чате пока нет сообщений."
      inputPlaceholder="Напишите участникам проекта..."
      readOnlyPlaceholder="Чат проекта доступен только редакторам"
      readOnlyMessage="У вас нет прав на отправку сообщений в чат проекта."
    />
  );
}
