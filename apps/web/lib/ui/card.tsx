import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardProps = {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  className?: string;
  onClick?: () => void;
  hoverable?: boolean;
  style?: CSSProperties;
};

const PADDING_MAP = {
  none: "",
  sm: "px-4 py-3",
  md: "px-5 py-4",
  lg: "px-7 py-6",
} as const;

export function Card({ children, padding = "md", onClick, hoverable, className, style }: CardProps) {
  const interactive = !!(onClick || hoverable);

  return (
    <div
      className={cn(
        "bg-surface border border-border rounded-lg shadow-xs",
        PADDING_MAP[padding],
        interactive && "card-interactive cursor-pointer",
        className,
      )}
      style={style}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: string | number;
  icon?: ReactNode;
  trend?: { value: number; label?: string };
  className?: string;
};

export function StatCard({ label, value, icon, trend, className }: StatCardProps) {
  return (
    <Card padding="md" className={className}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
            {label}
          </div>
          <div className="text-[28px] font-extrabold text-text-primary leading-none tracking-tight">
            {value}
          </div>
          {trend && (
            <div className={cn("flex items-center gap-1 mt-1.5 text-xs font-semibold", trend.value >= 0 ? "text-success" : "text-error")}>
              <span>{trend.value >= 0 ? "+" : ""}{trend.value}%</span>
              {trend.label && <span className="text-text-tertiary font-normal">{trend.label}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className="size-10 rounded-md bg-goberna-blue-50 text-goberna-blue-600 flex items-center justify-center shrink-0">
            {icon}
          </div>
        )}
      </div>
    </Card>
  );
}
