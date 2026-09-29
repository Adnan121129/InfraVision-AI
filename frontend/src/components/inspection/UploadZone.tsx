import { ImageUp } from "lucide-react";
import { useId, useRef, useState, type DragEvent } from "react";

import { cn } from "@/utils/cn";

export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const ACCEPTED_EXTENSIONS = ["jpg", "jpeg", "png", "webp"];

export interface RejectedFile {
  name: string;
  reason: string;
}

export function validateFiles(files: File[], maxMb: number): { accepted: File[]; rejected: RejectedFile[] } {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!ACCEPTED_EXTENSIONS.includes(ext) || (file.type && !ACCEPTED_TYPES.includes(file.type))) {
      rejected.push({ name: file.name, reason: "Unsupported format — use JPG, PNG or WEBP" });
    } else if (file.size === 0) {
      rejected.push({ name: file.name, reason: "File is empty" });
    } else if (file.size > maxMb * 1024 * 1024) {
      rejected.push({ name: file.name, reason: `Exceeds the ${maxMb} MB limit` });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

interface UploadZoneProps {
  onFiles: (accepted: File[], rejected: RejectedFile[]) => void;
  maxMb?: number;
  disabled?: boolean;
  compact?: boolean;
}

export function UploadZone({ onFiles, maxMb = 25, disabled = false, compact = false }: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragging, setDragging] = useState(false);

  const handle = (list: FileList | null) => {
    if (!list || disabled) return;
    const { accepted, rejected } = validateFiles(Array.from(list), maxMb);
    onFiles(accepted, rejected);
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setDragging(false);
    handle(event.dataTransfer.files);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={cn(
        "relative flex flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors",
        compact ? "gap-2 px-4 py-5" : "gap-3 px-6 py-12",
        dragging ? "border-accent bg-accent/[0.06]" : "border-line-strong bg-surface-2/40 hover:border-accent/50",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      <div className={cn("flex items-center justify-center rounded-xl border border-accent/25 bg-accent/10 text-accent", compact ? "size-9" : "size-12")}>
        <ImageUp className={compact ? "size-4" : "size-6"} aria-hidden />
      </div>
      <div>
        <p className={cn("font-medium text-ink", compact ? "text-sm" : "text-base")}>
          Drag structural images here or{" "}
          <label htmlFor={inputId} className="cursor-pointer text-accent underline-offset-4 hover:underline">
            browse files
          </label>
        </p>
        {!compact && <p className="mt-1 text-xs text-ink-3">Drone, fixed-camera or handheld imagery · JPG, JPEG, PNG, WEBP · up to {maxMb} MB each</p>}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={ACCEPTED_TYPES.join(",")}
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
    </div>
  );
}
