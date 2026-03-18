import { cva, type VariantProps } from "class-variance-authority";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "flex items-center gap-2.5 rounded-md border px-3.5 py-2.5 text-[13px] font-medium animate-fade-in",
  {
    variants: {
      variant: {
        error: "bg-error-bg text-error border-error-border",
        warning: "bg-warning-bg text-warning border-warning-border",
        success: "bg-success-bg text-success border-success-border",
        info: "bg-info-bg text-goberna-blue-700 border-info-border",
      },
    },
    defaultVariants: { variant: "error" },
  },
);

const VARIANT_ICONS = {
  error: AlertCircle,
  warning: AlertTriangle,
  success: CheckCircle2,
  info: Info,
} as const;

type AlertProps = VariantProps<typeof alertVariants> & {
  message: string;
  onDismiss?: () => void;
  className?: string;
};

export function Alert({ variant = "error", message, onDismiss, className }: AlertProps) {
  const Icon = VARIANT_ICONS[variant!];

  return (
    <div className={cn(alertVariants({ variant }), className)} role="alert">
      <Icon className="size-4 shrink-0" />
      <span className="flex-1">{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 flex items-center opacity-60 hover:opacity-100 transition-opacity cursor-pointer p-0.5 bg-transparent border-none"
          aria-label="Cerrar"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
}
