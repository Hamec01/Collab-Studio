import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import Button from "../shared/ui/Button";
import StateView from "../shared/ui/StateView";

describe("Stage 2 accessibility primitives", () => {
  it("exposes semantic roles for state widgets", () => {
    render(<StateView kind="error" message="boom" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps touch-safe min dimensions", () => {
    render(<Button>Tap</Button>);
    const button = screen.getByRole("button", { name: "Tap" });
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
  });
});
