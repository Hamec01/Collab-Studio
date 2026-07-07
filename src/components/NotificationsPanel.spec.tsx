import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NotificationsPanel from "./NotificationsPanel";
import type { AppNotification } from "../types";

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

describe("NotificationsPanel", () => {
  it("opens a notification when the card is clicked", async () => {
    const user = userEvent.setup();
    const onOpenNotification = vi.fn();

    render(
      <NotificationsPanel
        notifications={notifications}
        onMarkAsRead={vi.fn()}
        onReadAll={vi.fn()}
        onOpenNotification={onOpenNotification}
      />,
    );

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
        onMarkAsRead={onMarkAsRead}
        onReadAll={vi.fn()}
        onOpenNotification={onOpenNotification}
      />,
    );

    await user.click(screen.getByTitle("Отметить как прочитанное"));

    expect(onMarkAsRead).toHaveBeenCalledWith("notification-1");
    expect(onOpenNotification).not.toHaveBeenCalled();
  });
});
