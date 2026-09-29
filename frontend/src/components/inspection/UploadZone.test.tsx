import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { UploadZone, validateFiles } from "./UploadZone";

const file = (name: string, type: string, size = 1024) => new File([new Uint8Array(size)], name, { type });

describe("validateFiles", () => {
  it("accepts supported images and rejects others with reasons", () => {
    const { accepted, rejected } = validateFiles(
      [file("deck.jpg", "image/jpeg"), file("pier.webp", "image/webp"), file("scan.gif", "image/gif"), file("empty.png", "image/png", 0), file("huge.png", "image/png", 3 * 1024 * 1024)],
      2,
    );
    expect(accepted.map((f) => f.name)).toEqual(["deck.jpg", "pier.webp"]);
    expect(rejected).toEqual([
      { name: "scan.gif", reason: "Unsupported format — use JPG, PNG or WEBP" },
      { name: "empty.png", reason: "File is empty" },
      { name: "huge.png", reason: "Exceeds the 2 MB limit" },
    ]);
  });
});

describe("UploadZone", () => {
  it("passes validated files from the file picker", () => {
    const onFiles = vi.fn();
    render(<UploadZone onFiles={onFiles} maxMb={5} />);
    const input = screen.getByLabelText("browse files") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file("a.jpg", "image/jpeg"), file("b.txt", "text/plain")] } });
    expect(onFiles).toHaveBeenCalledTimes(1);
    const [accepted, rejected] = onFiles.mock.calls[0];
    expect(accepted).toHaveLength(1);
    expect(rejected[0].name).toBe("b.txt");
  });

  it("handles drag and drop", () => {
    const onFiles = vi.fn();
    const { container } = render(<UploadZone onFiles={onFiles} />);
    fireEvent.drop(container.firstChild as Element, { dataTransfer: { files: [file("drone.png", "image/png")] } });
    expect(onFiles.mock.calls[0][0][0].name).toBe("drone.png");
  });
});
