import { Columns2, Eye, EyeOff, Maximize2 } from "lucide-react";
import { useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Tabs } from "@/components/ui/Tabs";
import type { Detection, ImageRecord } from "@/types/api";

import { BoundingBoxOverlay } from "./BoundingBoxOverlay";

type Mode = "split" | "annotated" | "original";

function Frame({ src, alt, image, detections, overlay, selectedId, onSelect, label }: {
  src: string | null;
  alt: string;
  image: ImageRecord;
  detections: Detection[];
  overlay: boolean;
  selectedId?: number | null;
  onSelect?: (id: number | null) => void;
  label: string;
}) {
  return (
    <figure className="min-w-0 flex-1">
      <div className="relative overflow-hidden rounded-lg border border-line bg-black/40">
        {src ? (
          <div className="relative" style={{ aspectRatio: `${image.image_width} / ${image.image_height}` }} onMouseLeave={() => onSelect?.(null)}>
            <img src={src} alt={alt} loading="lazy" decoding="async" className="absolute inset-0 size-full object-contain" />
            {overlay && <BoundingBoxOverlay detections={detections} imageWidth={image.image_width} imageHeight={image.image_height} selectedId={selectedId} onSelect={onSelect} />}
          </div>
        ) : (
          <div className="flex aspect-video items-center justify-center text-xs text-ink-3">Image unavailable</div>
        )}
        <figcaption className="absolute top-2 left-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-medium tracking-wide text-ink-2 uppercase backdrop-blur">{label}</figcaption>
      </div>
    </figure>
  );
}

export function ImageViewer({ image, detections, selectedId, onSelect }: { image: ImageRecord; detections: Detection[]; selectedId?: number | null; onSelect?: (id: number | null) => void }) {
  const [mode, setMode] = useState<Mode>("split");
  const [expanded, setExpanded] = useState(false);
  const src = image.preview_url ?? image.original_url;

  const body = (large: boolean) => (
    <div className={large ? "flex flex-col gap-3 lg:flex-row" : "flex flex-col gap-3 md:flex-row"}>
      {(mode === "split" || mode === "original") && <Frame src={src} alt={`Original inspection image ${image.original_filename}`} image={image} detections={detections} overlay={false} label="Original" />}
      {(mode === "split" || mode === "annotated") && (
        <Frame src={src} alt={`AI annotated image ${image.original_filename}`} image={image} detections={detections} overlay selectedId={selectedId} onSelect={onSelect} label="AI annotated" />
      )}
    </div>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          items={[
            { value: "split", label: <span className="inline-flex items-center gap-1"><Columns2 className="size-3.5" /> Side by side</span> },
            { value: "annotated", label: <span className="inline-flex items-center gap-1"><Eye className="size-3.5" /> Annotated</span> },
            { value: "original", label: <span className="inline-flex items-center gap-1"><EyeOff className="size-3.5" /> Original</span> },
          ]}
        />
        <button type="button" onClick={() => setExpanded(true)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink">
          <Maximize2 className="size-3.5" /> Expand
        </button>
      </div>
      {body(false)}
      <Modal open={expanded} onClose={() => setExpanded(false)} title={image.original_filename} description={`${image.image_width} × ${image.image_height}px · ${detections.length} detections`} size="xl">
        {body(true)}
      </Modal>
    </div>
  );
}
