/**
 * Map layout — overrides the padding from the public layout
 * so the map can use the full viewport height below the header.
 * Footer is hidden for the immersive map experience.
 */
export default function MapLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "fixed", top: 64, left: 0, right: 0, bottom: 0 }}>
      {children}
    </div>
  );
}
