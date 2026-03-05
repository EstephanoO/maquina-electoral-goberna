/**
 * Layout propio del Extension Monitor — sin header/footer público.
 * Esta página es un dashboard standalone tipo "war room".
 */
export default function ExtensionMonitorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: "100vh" }}>
      {children}
    </div>
  );
}
