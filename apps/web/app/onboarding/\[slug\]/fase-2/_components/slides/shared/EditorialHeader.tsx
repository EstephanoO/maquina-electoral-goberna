"use client";

interface EditorialHeaderProps {
  microLabel: string;
  headline: string;
  accentColor?: string;
  headlineSize?: "sm" | "md" | "lg";
}

const HEADLINE_SIZE: Record<NonNullable<EditorialHeaderProps["headlineSize"]>, string> = {
  sm: "text-2xl sm:text-3xl",
  md: "text-3xl sm:text-4xl",
  lg: "text-4xl sm:text-5xl",
};

export function EditorialHeader({
  microLabel,
  headline,
  accentColor = "#fbbf24",
  headlineSize = "md",
}: EditorialHeaderProps) {
  const sizeClass = HEADLINE_SIZE[headlineSize];

  return (
    <div
      style={{ borderLeft: `3px solid ${accentColor}`, paddingLeft: "16px" }}
    >
      <p
        className="font-semibold uppercase tracking-widest mb-2"
        style={{ fontSize: "9px", color: `${accentColor}80` }}
      >
        {microLabel}
      </p>
      <h2 className={`${sizeClass} font-black text-white leading-tight`}>
        {headline}
      </h2>
      <div
        className="mt-3"
        style={{ width: "40px", height: "2px", backgroundColor: accentColor }}
      />
    </div>
  );
}
