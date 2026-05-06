import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type ToastKind = "ok" | "err" | "warn" | "info";
type Toast = { id: number; msg: string; kind: ToastKind };

const ToastCtx = createContext<(msg: string, kind?: ToastKind) => void>(() => {});

let seq = 0;
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback((msg: string, kind: ToastKind = "ok") => {
    const id = ++seq;
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            {t.kind === "ok" && "✓ "}
            {t.kind === "err" && "⚠ "}
            {t.kind === "warn" && "⚠ "}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}
