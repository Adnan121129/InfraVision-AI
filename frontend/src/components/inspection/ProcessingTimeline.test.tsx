import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProcessingTimeline } from "./ProcessingTimeline";

describe("ProcessingTimeline", () => {
  it("marks the active stage", () => {
    render(<ProcessingTimeline stage="INFERENCE" status="PROCESSING" detail="image 1 of 2" />);
    const active = screen.getAllByRole("listitem").find((li) => li.getAttribute("aria-current") === "step");
    expect(active).toHaveTextContent("AI inference");
    expect(active).toHaveTextContent("image 1 of 2");
  });

  it("marks every stage done when completed", () => {
    render(<ProcessingTimeline stage="COMPLETED" status="COMPLETED" />);
    expect(screen.getAllByRole("listitem").some((li) => li.getAttribute("aria-current") === "step")).toBe(false);
  });

  it("shows where processing failed", () => {
    render(<ProcessingTimeline stage="FAILED" status="FAILED" failedAt="INFERENCE" />);
    expect(screen.getByText("Processing stopped — see error below")).toBeInTheDocument();
  });
});
