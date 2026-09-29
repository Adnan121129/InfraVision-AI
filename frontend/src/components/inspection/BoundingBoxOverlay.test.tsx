import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Detection } from "@/types/api";

import { BoundingBoxOverlay } from "./BoundingBoxOverlay";

const detection = (overrides: Partial<Detection> = {}): Detection => ({
  id: 1,
  inspection: 1,
  image_record: 1,
  defect_type: "CRACK",
  defect_type_display: "Concrete crack",
  severity: "HIGH",
  confidence_score: 0.943,
  x_min: 100,
  y_min: 200,
  x_max: 300,
  y_max: 400,
  area_ratio: 0.05,
  description: "",
  review_status: "UNREVIEWED",
  reviewed_by_name: null,
  reviewed_at: null,
  created_at: "2026-09-01T00:00:00Z",
  ...overrides,
});

describe("BoundingBoxOverlay", () => {
  it("positions boxes as percentages of the original image", () => {
    render(<BoundingBoxOverlay detections={[detection()]} imageWidth={1000} imageHeight={800} />);
    const box = screen.getByRole("button", { name: /Concrete crack, High severity, 94.3% confidence/ });
    expect(box.style.left).toBe("10%");
    expect(box.style.top).toBe("25%");
    expect(box.style.width).toBe("20%");
    expect(box.style.height).toBe("25%");
    expect(box).toHaveTextContent("Concrete crack 94%");
  });

  it("reports selection and toggles off", () => {
    const onSelect = vi.fn();
    const { rerender } = render(<BoundingBoxOverlay detections={[detection()]} imageWidth={1000} imageHeight={800} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenLastCalledWith(1);
    rerender(<BoundingBoxOverlay detections={[detection()]} imageWidth={1000} imageHeight={800} onSelect={onSelect} selectedId={1} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button"));
    expect(onSelect).toHaveBeenLastCalledWith(null);
  });

  it("renders nothing without image dimensions", () => {
    const { container } = render(<BoundingBoxOverlay detections={[detection()]} imageWidth={0} imageHeight={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});
