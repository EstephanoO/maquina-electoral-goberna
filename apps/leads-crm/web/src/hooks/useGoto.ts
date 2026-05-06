// Cross-page navigation. App.tsx listens to "nav:goto" CustomEvent and switches view.
export function gotoView(view: string) {
  window.dispatchEvent(new CustomEvent("nav:goto", { detail: view }));
}

export function useGoto() {
  return gotoView;
}
