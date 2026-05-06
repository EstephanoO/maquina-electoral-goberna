import { X } from "lucide-react";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: string;
};

export function Modal({ open, title, onClose, children, footer, maxWidth = "max-w-3xl" }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className={`bg-white rounded-lg ${maxWidth} w-full max-h-[92vh] overflow-y-auto shadow-xl`}>
        <header className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={20} />
          </button>
        </header>

        <div className="p-6 space-y-4">{children}</div>

        {footer && (
          <footer className="sticky bottom-0 bg-white border-t px-6 py-3 flex justify-end gap-2">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
