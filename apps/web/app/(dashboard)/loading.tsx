/**
 * Dashboard route-level loading fallback.
 *
 * Next.js shows this automatically during navigation between dashboard pages,
 * giving the user immediate visual feedback instead of a frozen UI.
 */
export default function DashboardLoading() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        gap: 12,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          border: "3px solid var(--goberna-blue-100)",
          borderTopColor: "var(--goberna-blue-900)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <span
        style={{
          fontFamily: "var(--font-montserrat), system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 2,
          color: "var(--goberna-blue-900)",
        }}
      >
        Cargando...
      </span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
