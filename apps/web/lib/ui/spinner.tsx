import { cn } from "@/lib/utils";

type SpinnerProps = {
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
};

const SIZE_MAP = {
  xs: "size-3 border-[1.5px]",
  sm: "size-4 border-2",
  md: "size-5 border-2",
  lg: "size-7 border-[3px]",
} as const;

export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block rounded-full border-goberna-blue-500 border-t-transparent animate-spin align-middle shrink-0",
        SIZE_MAP[size],
        className,
      )}
      role="status"
      aria-label="Cargando"
    />
  );
}
