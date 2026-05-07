type Props = { tag: string | null | undefined; pattern: string | null | undefined };

export function ClassifierBadge({ tag, pattern }: Props) {
  if (!pattern || !tag) return null;
  return (
    <div className="bg-amber-50 border border-amber-200 rounded p-2 mb-3 text-[11px]">
      <div className="font-medium text-amber-800 flex items-center gap-1">
        🤖 Auto-clasifica → <span className="font-mono bg-white px-1 rounded">{tag}</span>
      </div>
      <div className="font-mono text-amber-700 mt-1 truncate">/{pattern}/i</div>
    </div>
  );
}
