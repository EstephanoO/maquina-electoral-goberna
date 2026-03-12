"use client";

import { useEffect } from "react";
import { AuthProvider } from "../../lib/auth-context";

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prevHtmlTheme = document.documentElement.dataset.theme;
    const prevBodyTheme = document.body.dataset.theme;
    const prevScheme = document.documentElement.style.colorScheme;

    document.documentElement.dataset.theme = "light";
    document.body.dataset.theme = "light";
    document.documentElement.style.colorScheme = "light";

    return () => {
      if (prevHtmlTheme) document.documentElement.dataset.theme = prevHtmlTheme;
      else delete document.documentElement.dataset.theme;
      if (prevBodyTheme) document.body.dataset.theme = prevBodyTheme;
      else delete document.body.dataset.theme;
      document.documentElement.style.colorScheme = prevScheme;
    };
  }, []);

  return <AuthProvider>{children}</AuthProvider>;
}
