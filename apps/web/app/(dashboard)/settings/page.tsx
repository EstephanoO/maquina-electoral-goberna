"use client";

import { useAuth } from "../../../lib/auth-context";
import { useTheme } from "../../../lib/theme-context";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PageHeader } from "../../../lib/ui";
import { UserInfoCard, WaPhonesSection, WaConfigSection, ThemeSelector, PasswordForm } from "./_components";

export default function SettingsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading || !isAuthenticated) return null;

  return (
    <div
      style={{
        fontFamily: "var(--font-montserrat), system-ui, sans-serif",
        maxWidth: 600,
      }}
    >
      <PageHeader
        title="Configuracion"
        description="Gestione su cuenta y preferencias."
        breadcrumbs={[{ label: "Dashboard", href: "/home" }, { label: "Configuracion" }]}
      />

      <UserInfoCard user={user} />
      <WaConfigSection />
      <WaPhonesSection />
      <ThemeSelector theme={theme} setTheme={setTheme} />
      <PasswordForm />
    </div>
  );
}
