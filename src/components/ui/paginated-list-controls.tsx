import { Button } from "@/components/ui/button";
import { getPaginationSummary, shouldShowPagination } from "@/lib/pagination";

interface PaginatedListControlsProps {
  page: number;
  pageSize: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

export function PaginatedListControls({
  page,
  pageSize,
  total,
  loading = false,
  onPageChange,
}: PaginatedListControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  if (!shouldShowPagination(total, pageSize)) {
    return (
      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {getPaginationSummary(page, pageSize, total)}
      </div>
    );
  }

  return (
    <div
      className="mt-3 flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 sm:flex-row sm:items-center sm:justify-between"
      aria-label="Paginação"
    >
      <span>{getPaginationSummary(page, pageSize, total)}</span>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasPrevious || loading}
          onClick={() => onPageChange(page - 1)}
          className="h-7 px-2 text-xs"
        >
          Anterior
        </Button>
        <span aria-live="polite">
          Página {page} / {totalPages}
        </span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!hasNext || loading}
          onClick={() => onPageChange(page + 1)}
          className="h-7 px-2 text-xs"
        >
          Seguinte
        </Button>
      </div>
    </div>
  );
}
