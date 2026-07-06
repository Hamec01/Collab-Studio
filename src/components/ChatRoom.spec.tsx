import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChatRoom from "./ChatRoom";
import type { AuthUser, ChatMessage } from "../types";

const currentUser: AuthUser = {
  id: "user-1",
  username: "writer",
  displayName: "Writer",
  avatarUrl: null,
  email: null,
  role: "user",
  createdAt: "2026-07-06T00:00:00.000Z",
  updatedAt: "2026-07-06T00:00:00.000Z",
};

function makeMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? "message-1",
    authorId: overrides.authorId ?? "user-1",
    author: overrides.author ?? "Writer",
    authorUser: overrides.authorUser ?? { id: "user-1", username: "writer", displayName: "Writer", avatarUrl: null },
    text: overrides.text ?? "Hello",
    timestamp: overrides.timestamp ?? "2026-07-06T10:00:00.000Z",
    createdAt: overrides.createdAt ?? "2026-07-06T10:00:00.000Z",
  };
}

describe("ChatRoom", () => {
  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("sends a message once and clears the input", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn(async () => {});

    render(
      <ChatRoom
        chat={[]}
        onSendMessage={onSendMessage}
        currentUser={currentUser}
        canSend
      />,
    );

    await user.type(screen.getByPlaceholderText("Напишите соавторам..."), "New message");
    await user.click(screen.getByRole("button"));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(onSendMessage).toHaveBeenCalledWith("New message");
    expect(screen.getByPlaceholderText("Напишите соавторам...")).toHaveValue("");
  });

  it("shows read-only state for users without chat permission", () => {
    render(
      <ChatRoom
        chat={[]}
        onSendMessage={vi.fn()}
        currentUser={currentUser}
        canSend={false}
      />,
    );

    expect(screen.getByPlaceholderText("Чат доступен только редакторам")).toBeDisabled();
    expect(screen.getByText("У вас нет прав на отправку сообщений в чат трека.")).toBeInTheDocument();
  });

  it("shows send errors without duplicating messages", async () => {
    const user = userEvent.setup();
    const onSendMessage = vi.fn(async () => {
      throw new Error("boom");
    });

    render(
      <ChatRoom
        chat={[makeMessage({ id: "existing", text: "Existing" })]}
        onSendMessage={onSendMessage}
        currentUser={currentUser}
        canSend
      />,
    );

    await user.type(screen.getByPlaceholderText("Напишите соавторам..."), "Will fail");
    await user.click(screen.getByRole("button"));

    expect(onSendMessage).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("alert")).toHaveTextContent("Не удалось отправить сообщение.");
    expect(screen.getByText("Existing")).toBeInTheDocument();
  });
});
