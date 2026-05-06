import { cn } from "../../lib/utils";

type Props = { className?: string };

export function Skeleton({ className }: Props) {
  return <div className={cn("skeleton", className)} />;
}

export function SkeletonText({ lines = 1, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3", i === lines - 1 ? "w-3/4" : "w-full")}
        />
      ))}
    </div>
  );
}

export function SkeletonAvatar({ size = 40, className }: { size?: number; className?: string }) {
  return <div className={cn("skeleton rounded-full", className)} style={{ width: size, height: size }} />;
}

export function ChatRowSkeleton() {
  return (
    <div className="flex gap-3 px-3 py-2.5 border-b border-slate-100/60">
      <SkeletonAvatar size={40} />
      <div className="flex-1 space-y-2">
        <div className="flex justify-between">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-8" />
        </div>
        <Skeleton className="h-2.5 w-3/4" />
        <Skeleton className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <SkeletonAvatar size={36} />
        <div className="flex-1">
          <Skeleton className="h-3 w-32 mb-2" />
          <Skeleton className="h-2 w-20" />
        </div>
      </div>
      <SkeletonText lines={3} />
    </div>
  );
}
