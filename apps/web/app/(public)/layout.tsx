import { PublicHeader } from "./_components/public-header";
import { PublicFooter } from "./_components/public-footer";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicHeader />
      <main style={{ minHeight: "100vh", paddingTop: 64 }}>
        {children}
      </main>
      <PublicFooter />
    </>
  );
}
