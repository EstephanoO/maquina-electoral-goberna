"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AuthProvider, useAuth } from "@/lib/auth-context";

function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.role !== "admin" && user.role !== "consultor") {
      router.replace("/home");
    }
  }, [user, isLoading, router]);

  if (isLoading) return null;
  if (!user || (user.role !== "admin" && user.role !== "consultor")) return null;

  return <>{children}</>;
}

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <OnboardingGuard>{children}</OnboardingGuard>
    </AuthProvider>
  );
}
