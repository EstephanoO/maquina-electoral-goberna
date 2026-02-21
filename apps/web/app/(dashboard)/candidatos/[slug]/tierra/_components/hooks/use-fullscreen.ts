/* ========== Fullscreen Hook ========== */

import { useCallback, useSyncExternalStore } from "react";

/** Zero-rerender fullscreen hook — subscribes to native fullscreenchange event */
export function useFullscreen(ref: React.RefObject<HTMLElement | null>) {
  const subscribe = useCallback((cb: () => void) => {
    document.addEventListener("fullscreenchange", cb);
    return () => document.removeEventListener("fullscreenchange", cb);
  }, []);

  const getSnapshot = useCallback(() => document.fullscreenElement === ref.current, [ref]);
  const isFullscreen = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const toggle = useCallback(() => {
    if (!ref.current) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      ref.current.requestFullscreen().catch(() => {});
    }
  }, [ref]);

  return { isFullscreen, toggle } as const;
}
