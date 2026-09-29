import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "./Button";

interface PaginationProps {
  page: number;
  totalPages: number;
  count: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, count, pageSize, onPageChange }: PaginationProps) {
  if (count === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  return (
    <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3" aria-label="Pagination">
      <p className="text-xs text-ink-3 tabular">
        Showing <span className="text-ink-2">{from}</span>–<span className="text-ink-2">{to}</span> of <span className="text-ink-2">{count}</span>
      </p>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => onPageChange(page - 1)} disabled={page <= 1} aria-label="Previous page" icon={<ChevronLeft className="size-4" />}>
          Prev
        </Button>
        <span className="px-2 text-xs text-ink-2 tabular">
          {page} / {Math.max(totalPages, 1)}
        </span>
        <Button size="sm" variant="ghost" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} aria-label="Next page">
          Next
          <ChevronRight className="size-4" />
        </Button>
      </div>
    </nav>
  );
}
