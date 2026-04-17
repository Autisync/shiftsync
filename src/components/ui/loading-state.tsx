import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingStateProps {
  message?: string;
  className?: string;
  inline?: boolean;
}

export function LoadingState({
  message = "A carregar...",
  className,
  inline = false,
}: LoadingStateProps) {
  if (inline) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-2 text-sm text-slate-500",
          className,
        )}
        role="status"
        aria-live="polite"
      >
        <Spinner className="size-4 text-slate-500" />
        <span>{message}</span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex items-center justify-center py-6", className)}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Spinner className="size-4 text-slate-500" />
        <span>{message}</span>
      </div>
    </div>
  );
}

interface LoadingListSkeletonProps {
  rows?: number;
  className?: string;
}

export function LoadingListSkeleton({
  rows = 4,
  className,
}: LoadingListSkeletonProps) {
  return (
    <div className={cn("space-y-2", className)} aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={`loading-row-${index}`}
          className="rounded-md border border-slate-200 p-3"
        >
          <Skeleton className="h-4 w-2/5" />
          <Skeleton className="mt-2 h-3 w-4/5" />
          <Skeleton className="mt-2 h-3 w-3/5" />
        </div>
      ))}
    </div>
  );
}
