import { cn } from "@/lib/utils";

type Tab = {
  id: string;
  label: string;
  badge?: number;
  icon?: React.ReactNode;
};

type TabsProps = {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
  size?: "sm" | "md";
  className?: string;
};

export function Tabs({ tabs, activeTab, onChange, size = "md", className }: TabsProps) {
  return (
    <div
      className={cn(
        "flex gap-0 border-b-2 border-border",
        size === "sm" ? "mb-4" : "mb-6",
        className,
      )}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              "flex items-center gap-2 whitespace-nowrap uppercase tracking-wider cursor-pointer border-none bg-transparent -mb-[2px] border-b-2 transition-colors",
              size === "sm" ? "px-3.5 py-2 text-xs" : "px-5 py-2.5 text-[13px]",
              active
                ? "font-bold text-goberna-blue-800 border-b-goberna-gold"
                : "font-medium text-text-tertiary border-b-transparent hover:text-text-secondary",
            )}
          >
            {tab.icon && (
              <span className={cn("flex items-center", !active && "opacity-60")}>{tab.icon}</span>
            )}
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={cn(
                  "px-[7px] py-px text-[10px] font-bold rounded-full text-white leading-normal",
                  active ? "bg-goberna-blue-800" : "bg-text-tertiary",
                )}
              >
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
