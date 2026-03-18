import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG } from "../constants";
import type { StatusType } from "../types";

const badgeVariants = cva(
  "inline-block whitespace-nowrap rounded-full font-bold uppercase tracking-wider",
  {
    variants: {
      size: {
        sm: "px-2 py-0.5 text-[10px]",
        md: "px-2.5 py-[3px] text-[11px]",
      },
    },
    defaultVariants: { size: "md" },
  },
);

type StatusBadgeProps = VariantProps<typeof badgeVariants> & {
  status: StatusType | string;
  className?: string;
};

export function StatusBadge({ status, size, className }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status as StatusType] ?? STATUS_CONFIG.pending;

  return (
    <span
      className={cn(badgeVariants({ size }), className)}
      style={{ background: config.bg, color: config.color }}
    >
      {config.label}
    </span>
  );
}
