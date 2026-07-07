import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NotificationsPanel from "./NotificationsPanel";
import type { AppNotification } from "../types";
import type { WorkspaceActivityItem } from "../features/notifications/workspaceInbox";

const notifications: AppNotification[] = [{
  id: "notification-1",
  projectId: "project-1",
  projectName: "Project",
  trackId: "track-1",
  trackName: "Track",
  type: "comment_created",
  message: "left a comment",
  actorId: "user-2",
  author: "Writer",
  actor: null,
  createdAt: "2026-07-07T00:00:00.000Z",
  timestamp: "2026-07-07T00:00:00.000Z",
  read: false,
}];

const activityItems: WorkspaceActivityItem[] = [{
  id: "activity-1",
  projectId: "project-1",
  projectName: "Project",
  trackId: "track-1",
  trackName: "Track",
  actorId: "user-2",
  actor: {
    id: "user-2",
    username: "writer",
    displayName: "Writer",
    avatarUrl: null,
  },
  type: "comment_created",
  payload: { trackId: "track-1", trackTitle: "Track" },
  createdAt: "2026-07-07T00:00:00.000Z",
  timestamp: "2026-07-07T00:00:00.000Z",
}];

describe("NotificationsPanel", () => {
  it("opens a notification when the card is clicked", async () => {
    const user = userEvent.setup();
    const onOpenNotification = vi.fn();

    render(
      <NotificationsPanel
        notifications={notifications}
        activityItems={activityItems}
        onMarkAsRead={vi.fn()}
        onReadAll={vi.fn()}
        onOpenNotification={onOpenNotification}
        onOpenActivity={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сообщения / запросы" }));
    await user.click(screen.getByRole("button", { name: /Writer/i }));

    expect(onOpenNotification).toHaveBeenCalledTimes(1);
    expect(onOpenNotification).toHaveBeenCalledWith(notifications[0]);
  });

  it("marks a notification as read without opening it", async () => {
    const user = userEvent.setup();
    const onMarkAsRead = vi.fn();
    const onOpenNotification = vi.fn();

    render(
      <NotificationsPanel
        notifications={notifications}
        activityItems={activityItems}
        onMarkAsRead={onMarkAsRead}
        onReadAll={vi.fn()}
        onOpenNotification={onOpenNotification}
        onOpenActivity={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сообщения / запросы" }));
    await user.click(screen.getByTitle("Отметить как прочитанное"));

    expect(onMarkAsRead).toHaveBeenCalledWith("notification-1");
    expect(onOpenNotification).not.toHaveBeenCalled();
  });

  it("disables notification actions while the same notification is pending", async () => {
    const user = userEvent.setup();

    render(
      <NotificationsPanel
        notifications={notifications}
        activityItems={activityItems}
        onMarkAsRead={vi.fn()}
        onReadAll={vi.fn()}
        onOpenNotification={vi.fn()}
        onOpenActivity={vi.fn()}
        pendingNotificationId="notification-1"
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сообщения / запросы" }));
    expect(screen.getByRole("button", { name: /Writer/i })).toBeDisabled();
    expect(screen.getByTitle("Отметить как прочитанное")).toBeDisabled();
  });

  it("shows syncing state and disables read-all while batch read is pending", async () => {
    const user = userEvent.setup();

    render(
      <NotificationsPanel
        notifications={notifications}
        activityItems={activityItems}
        onMarkAsRead={vi.fn()}
        onReadAll={vi.fn()}
        onOpenNotification={vi.fn()}
        onOpenActivity={vi.fn()}
        isRefreshing
        readAllPending
      />,
    );

    await user.click(screen.getByRole("button", { name: "Сообщения / запросы" }));
    expect(screen.getByText("Синхронизация уведомлений…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Обновление…" })).toBeDisabled();
  });

  it("opens activity items from the activity tab", async () => {
    const user = userEvent.setup();
    const onOpenActivity = vi.fn();

    render(
      <NotificationsPanel
        notifications={notifications}
        activityItems={activityItems}
        onMarkAsRead={vi.fn()}
        onReadAll={vi.fn()}
        onOpenNotification={vi.fn()}
        onOpenActivity={onOpenActivity}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Writer оставил комментарий/i }));

    expect(onOpenActivity).toHaveBeenCalledTimes(1);
    expect(onOpenActivity).toHaveBeenCalledWith(activityItems[0]);
  });
});
