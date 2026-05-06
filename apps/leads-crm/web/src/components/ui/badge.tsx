import { cn } from "../../lib/utils";

type Props = { children: React.ReactNode; className?: string; variant?: "default" | "success" | "warn" | "danger" };

export function Badge({ children, className, variant = "default" }: Props) {
  return (
    <span className={cn(
      "inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border",
      variant === "success" && "bg-green-50 text-green-700 border-green-200",
      variant === "warn" && "bg-amber-50 text-amber-700 border-amber-200",
      variant === "danger" && "bg-red-50 text-red-700 border-red-200",
      variant === "default" && "bg-slate-50 text-slate-600 border-slate-200",
      className,
    )}>
      {children}
    </span>
  );
}
