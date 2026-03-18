"use client";

/**
 * Dashboard layout — thin orchestrator.
 * All UI logic lives in _components/dashboard-shell.tsx.
 *
 * Providers (QueryProvider, AuthProvider) wrap the shell so that
 * any child page can access auth + query context.
 */

import { AuthProvider } from "../../lib/auth-context";
import { QueryProvider } from "../../lib/query-provider";
import { DashboardShell } from "./_components/dashboard-shell";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <QueryProvider>
      <AuthProvider>
        <DashboardShell>{children}</DashboardShell>
      </AuthProvider>
    </QueryProvider>
  );
}
