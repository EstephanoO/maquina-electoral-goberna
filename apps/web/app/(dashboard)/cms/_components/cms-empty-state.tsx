"use client";

/**
 * CMS Empty State — shown when no contact is selected in the conversation pane.
 * Also used for the sidebar when no contacts match the current filter.
 */

type CmsEmptyStateProps = {
  variant: "no-selection" | "no-contacts" | "no-results" | "error";
  message?: string;
  onRetry?: () => void;
};

export function CmsEmptyState({ variant, message, onRetry }: CmsEmptyStateProps) {
  const config = VARIANTS[variant];

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center select-none">
      <div className="w-16 h-16 mb-4 rounded-2xl bg-slate-100 flex items-center justify-center">
        <span className="text-2xl text-slate-400">{config.icon}</span>
      </div>
      <h3 className="text-sm font-semibold text-slate-600 mb-1">{config.title}</h3>
      <p className="text-xs text-slate-400 max-w-[260px] leading-relaxed">
        {message || config.description}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 px-4 py-1.5 text-xs font-medium text-white bg-[var(--goberna-blue-700)] rounded-lg hover:bg-[var(--goberna-blue-800)] transition-colors"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

const VARIANTS = {
  "no-selection": {
    icon: "\u{1F4AC}",
    title: "Selecciona un contacto",
    description: "Elige un contacto del panel izquierdo para ver la conversacion y gestionar su estado.",
  },
  "no-contacts": {
    icon: "\u{1F4CB}",
    title: "Sin contactos",
    description: "No hay contactos en esta campana todavia. Los contactos aparecen cuando se reciben formularios.",
  },
  "no-results": {
    icon: "\u{1F50D}",
    title: "Sin resultados",
    description: "No se encontraron contactos con los filtros actuales. Prueba cambiando la busqueda o el tab.",
  },
  error: {
    icon: "\u{26A0}\u{FE0F}",
    title: "Error al cargar",
    description: "No se pudieron cargar los contactos. Verifica tu conexion e intenta de nuevo.",
  },
} as const;
