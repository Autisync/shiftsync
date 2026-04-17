import { Button } from "@/components/ui/button";

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
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
      <span>
        {total === 0 ? "Sem resultados" : `${from}-${to} de ${total}`}
      </span>
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
        <span>
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
