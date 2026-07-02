import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FolderOpen } from "lucide-react";
import AppShell from "./AppShell";

describe("AppShell", () => {
  it("renders mobile nav with touch target buttons", async () => {
    const user = userEvent.setup();
    const onPress = vi.fn();

    render(
      <AppShell
        title="Title"
        showMobileNav
        mobileNavItems={[
          {
            key: "projects",
            label: "Projects",
            icon: FolderOpen,
            active: true,
            onPress,
          },
        ]}
      >
        <div>Body</div>
      </AppShell>,
    );

    expect(screen.getByRole("navigation", { name: "Mobile Navigation" })).toBeInTheDocument();
    const navButton = screen.getByRole("button", { name: "Projects" });
    expect(navButton.className).toContain("min-h-11");
    expect(navButton.className).toContain("min-w-11");
    await user.click(navButton);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
