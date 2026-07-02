import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Button from "./Button";

describe("Button primitive", () => {
  it("provides touch target and keyboard focus classes", () => {
    render(<Button>Action</Button>);
    const button = screen.getByRole("button", { name: "Action" });
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("min-w-11");
    expect(button.className).toContain("focus-visible:outline");
  });
});
