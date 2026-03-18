import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type Breadcrumb = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  description?: string;
  breadcrumbs?: Breadcrumb[];
  actions?: ReactNode;
  badge?: ReactNode;
  className?: string;
};

export function PageHeader({ title, description, breadcrumbs, actions, badge, className }: PageHeaderProps) {
  return (
    <div className={cn("mb-7 animate-fade-in", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs font-medium text-text-tertiary mb-2 font-sans" aria-label="Breadcrumb">
          {breadcrumbs.map((crumb, i) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight className="size-3 opacity-40" />}
              {crumb.href ? (
                <a href={crumb.href} className="text-text-tertiary no-underline hover:text-goberna-blue-600 transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className={cn(i === breadcrumbs.length - 1 && "text-text-secondary")}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-text-primary m-0 tracking-tight leading-tight font-sans flex items-center gap-2.5">
            {title}
            {badge}
          </h1>
          {description && (
            <p className="text-sm text-text-secondary m-0 mt-1 leading-normal">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </div>
  );
}
