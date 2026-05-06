type Props = { label: string; children: React.ReactNode; hint?: string };

export function Field({ label, children, hint }: Props) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1">{label}</div>
      {children}
      {hint && <div className="text-[10px] text-slate-400 mt-1">{hint}</div>}
    </label>
  );
}

const baseInputClass = "w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:border-[#2a4f8a] focus:ring-2 focus:ring-[#2a4f8a]/10";

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${baseInputClass} ${props.className || ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${baseInputClass} min-h-[60px] ${props.className || ""}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${baseInputClass} ${props.className || ""}`} />;
}
