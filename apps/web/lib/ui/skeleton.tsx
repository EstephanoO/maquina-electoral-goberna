import { cn } from "@/lib/utils";

type SkeletonProps = {
  className?: string;
};

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("skeleton rounded-sm", className)} aria-hidden="true" />;
}

export function SkeletonCard() {
  return (
    <div className="bg-surface border border-border rounded-lg px-5 py-4">
      <Skeleton className="w-[120px] h-3 mb-3" />
      <Skeleton className="w-[80px] h-7 mb-2" />
      <Skeleton className="w-[160px] h-3" />
    </div>
  );
}

export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex gap-4 px-4 py-3 border-b border-border">
        <Skeleton className="w-[120px] h-3" />
        <Skeleton className="w-[80px] h-3" />
        <Skeleton className="w-[100px] h-3" />
        <Skeleton className="w-[60px] h-3" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex gap-4 px-4 py-3.5 border-b border-border"
          style={{ opacity: 1 - i * 0.12 }}
        >
          <Skeleton className="w-[120px] h-3.5" />
          <Skeleton className="w-[80px] h-3.5" />
          <Skeleton className="w-[100px] h-3.5" />
          <Skeleton className="w-[60px] h-3.5" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonList({ items = 4 }: { items?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: items }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 py-3"
          style={{ opacity: 1 - i * 0.15 }}
        >
          <Skeleton className="size-10 rounded-full" />
          <div className="flex-1">
            <Skeleton className="w-3/5 h-3.5 mb-1.5" />
            <Skeleton className="w-2/5 h-[11px]" />
          </div>
        </div>
      ))}
    </div>
  );
}
