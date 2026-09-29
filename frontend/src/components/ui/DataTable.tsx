import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/utils/cn";

import { EmptyState } from "./EmptyState";
import { ErrorState } from "./ErrorState";
import { SkeletonRows } from "./Skeleton";

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  /** API ordering field; enables sortable header */
  sortKey?: string;
  className?: string;
  headerClassName?: string;
  align?: "left" | "right" | "center";
  hideBelow?: "sm" | "md" | "lg" | "xl";
}

interface DataTableProps<T> {
  rows: T[] | undefined;
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  ordering?: string;
  onOrderingChange?: (ordering: string) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  caption?: string;
  dense?: boolean;
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell" };

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  loading,
  refreshing,
  error,
  onRetry,
  onRowClick,
  ordering,
  onOrderingChange,
  emptyTitle = "No results",
  emptyDescription,
  emptyAction,
  caption,
  dense = false,
}: DataTableProps<T>) {
  if (loading && !rows) return <SkeletonRows rows={8} />;
  if (error && !rows) return <ErrorState message={error} onRetry={onRetry} />;
  if (rows && rows.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  const toggle = (key: string) => {
    if (!onOrderingChange) return;
    onOrderingChange(ordering === key ? `-${key}` : key);
  };

  return (
    <div className={cn("overflow-x-auto transition-opacity", refreshing && "opacity-60")}>
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr className="border-y border-line bg-surface-2/60">
            {columns.map((col) => {
              const active = ordering === col.sortKey || ordering === `-${col.sortKey}`;
              const desc = ordering === `-${col.sortKey}`;
              return (
                <th
                  key={col.key}
                  scope="col"
                  aria-sort={active ? (desc ? "descending" : "ascending") : undefined}
                  className={cn(
                    "px-4 py-2.5 text-[11px] font-semibold tracking-wide whitespace-nowrap text-ink-3 uppercase",
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.hideBelow && HIDE[col.hideBelow],
                    col.headerClassName,
                  )}
                >
                  {col.sortKey && onOrderingChange ? (
                    <button type="button" onClick={() => toggle(col.sortKey!)} className="inline-flex items-center gap-1 uppercase hover:text-ink-2">
                      {col.header}
                      {active ? desc ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" /> : <ChevronsUpDown className="size-3 opacity-50" />}
                    </button>
                  ) : (
                    col.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows?.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onRowClick(row)) : undefined}
              tabIndex={onRowClick ? 0 : undefined}
              className={cn("border-b border-line/70 transition-colors last:border-b-0", onRowClick && "cursor-pointer hover:bg-surface-2/70 focus-visible:bg-surface-2")}
            >
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={cn(
                    "px-4 align-middle text-ink-2",
                    dense ? "py-2" : "py-3",
                    col.align === "right" && "text-right tabular",
                    col.align === "center" && "text-center",
                    col.hideBelow && HIDE[col.hideBelow],
                    col.className,
                  )}
                >
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
