import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { FolderOpen } from "lucide-react";
import AppShell from "../app/shell/AppShell";
import { I18nProvider } from "../app/i18n/I18nProvider";

const viewports = [
  { width: 320, height: 568 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
];

describe("Stage 2 viewport coverage", () => {
  for (const viewport of viewports) {
    it(`renders shell at ${viewport.width}x${viewport.height}`, () => {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: viewport.width });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: viewport.height });
      window.dispatchEvent(new Event("resize"));

      render(
        <I18nProvider>
          <AppShell
            title="collabStudio Stage 4"
            showMobileNav={viewport.width < 1024}
            mobileNavItems={[
              {
                key: "projects",
                label: "Projects",
                icon: FolderOpen,
                active: true,
                onPress: () => undefined,
              },
            ]}
          >
            <div>viewport body</div>
          </AppShell>
        </I18nProvider>,
      );

      expect(screen.getByText("viewport body")).toBeInTheDocument();
      if (viewport.width < 1024) {
        expect(screen.getByRole("navigation", { name: "Mobile Navigation" })).toBeInTheDocument();
      }
    });
  }
});
