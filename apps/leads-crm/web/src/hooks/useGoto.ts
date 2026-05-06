// Cross-page navigation helper. Now uses real react-router-dom routes.
// Mantiene la API legacy para no romper componentes que ya usan gotoView("chat").
const ROUTE_MAP: Record<string, string> = {
  chat: "/chat",
  leads: "/leads",
  dashboard: "/dashboard",
  reports: "/reports",
  training: "/training",
  products: "/products",
  settings: "/settings",
};

export function gotoView(view: string) {
  const path = ROUTE_MAP[view] ?? `/${view}`;
  // Programmatic navigate desde fuera del Router context — usamos el browser History API
  // y forzamos popstate para que React Router lo capture. Componentes nuevos deberían
  // usar useNavigate() directamente.
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function useGoto() {
  return gotoView;
}
