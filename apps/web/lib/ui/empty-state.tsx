import type { ReactNode } from "react";
import { CheckCircle, Users } from "lucide-react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={cn("text-center py-12 px-6 text-text-tertiary", className)}>
      {icon && <div className="mb-4 opacity-50">{icon}</div>}
      <p className={cn("text-[15px] font-semibold m-0", description && "mb-1")}>{title}</p>
      {description && <p className="text-[13px] m-0">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* Preset icons — kept for backward compatibility */
export function CheckCircleIcon() {
  return <CheckCircle className="size-12 text-border-strong" strokeWidth={1.5} />;
}

export function UsersIcon() {
  return <Users className="size-12 text-border-strong" strokeWidth={1.5} />;
}
