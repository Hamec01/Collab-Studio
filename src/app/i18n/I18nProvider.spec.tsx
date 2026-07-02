import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { I18nProvider, useI18n } from "./I18nProvider";

function Probe() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="brand">{t("shell.brand")}</span>
      <button onClick={() => setLocale("en")}>en</button>
    </div>
  );
}

describe("I18nProvider", () => {
  it("switches locale and returns translated strings", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );

    expect(screen.getByTestId("locale").textContent).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "en" }));
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("brand").textContent).toBe("collabStudio Stage 4");
  });
});
