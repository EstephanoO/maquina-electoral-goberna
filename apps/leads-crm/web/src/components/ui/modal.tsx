import { cn } from "../../lib/utils";

type Props = { open: boolean; onClose: () => void; children: React.ReactNode; className?: string };

export function Modal({ open, onClose, children, className }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-in fade-in" onClick={onClose}>
      <div className={cn("bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-auto animate-in zoom-in-95", className)} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function ModalHeader({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div className={cn("flex items-center gap-3 px-5 py-4 rounded-t-2xl text-white", color || "bg-indigo-600")}>
      {children}
    </div>
  );
}

export function ModalBody({ children }: { children: React.ReactNode }) {
  return <div className="p-5">{children}</div>;
}
