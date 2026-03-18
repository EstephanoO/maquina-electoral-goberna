"use client";

import { memo } from "react";
import type { CmsContact } from "@/lib/services/cms";
import { AnimatedList } from "@/registry/magicui/animated-list";
import { ContactCard } from "./contact-card";
import { ContactRow } from "./contact-row";

export type LevelConfig = {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  emptyLabel: string;
};

type Props = {
  level: LevelConfig;
  contacts: CmsContact[];
  compact?: boolean;
};

export const PipelineColumn = memo(function PipelineColumn({ level, contacts, compact }: Props) {
  return (
    <section className="min-h-0 flex flex-col border border-border rounded-2xl overflow-hidden bg-surface-hover/80 shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <header className="flex items-start justify-between gap-2 px-3 py-3 bg-surface-active/80">
        <div>
          <div className="text-[16px] font-extrabold text-text-primary">{level.title}</div>
          <div className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-text-tertiary">{level.subtitle}</div>
        </div>
        <span className="min-w-[28px] px-2 py-1 rounded-full text-center text-[12px] font-bold text-text-primary border border-border bg-surface tabular-nums">
          {contacts.length}
        </span>
      </header>

      {/* Accent bar */}
      <div className="h-[3px] mx-3 rounded-full" style={{ background: level.accent }} />

      {/* Body */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {contacts.length === 0 ? (
          <div className="m-3 p-4 rounded-xl border border-dashed border-border-strong text-center text-[12px] text-text-tertiary font-medium">
            {level.emptyLabel}
          </div>
        ) : compact ? (
          <div className="flex flex-col gap-0.5 p-1.5">
            {contacts.map((c) => (
              <ContactRow key={c.id} contact={c} accent={level.accent} />
            ))}
          </div>
        ) : (
          <AnimatedList className="flex flex-col gap-2.5 p-3" delay={90}>
            {contacts.map((c) => (
              <ContactCard key={c.id} contact={c} accent={level.accent} />
            ))}
          </AnimatedList>
        )}
      </div>
    </section>
  );
});
