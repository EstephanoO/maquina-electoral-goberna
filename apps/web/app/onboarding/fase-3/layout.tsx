import { AuthProvider } from "@/lib/auth-context";

export default function Fase3Layout({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
