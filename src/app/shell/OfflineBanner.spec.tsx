import React from "react";
import { render, screen, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import OfflineBanner from "./OfflineBanner";
import { I18nProvider } from "../i18n/I18nProvider";

describe("OfflineBanner", () => {
  let originalOnLine: boolean;

  beforeEach(() => {
    originalOnLine = navigator.onLine;
  });

  afterEach(() => {
    Object.defineProperty(navigator, "onLine", {
      value: originalOnLine,
      configurable: true,
    });
  });

  it("does not render when online", () => {
    Object.defineProperty(navigator, "onLine", {
      value: true,
      configurable: true,
    });

    render(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>
    );

    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();
  });

  it("renders when offline and responds to online/offline events", () => {
    Object.defineProperty(navigator, "onLine", {
      value: false,
      configurable: true,
    });

    const { rerender } = render(
      <I18nProvider>
        <OfflineBanner />
      </I18nProvider>
    );

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
    expect(screen.getByText("Offline mode")).toBeInTheDocument();

    // Trigger online event
    act(() => {
      window.dispatchEvent(new Event("online"));
    });

    expect(screen.queryByTestId("offline-banner")).not.toBeInTheDocument();

    // Trigger offline event
    act(() => {
      window.dispatchEvent(new Event("offline"));
    });

    expect(screen.getByTestId("offline-banner")).toBeInTheDocument();
  });
});
