import type { Metadata } from "next";
import { Montserrat } from "next/font/google";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";
import { ThemeProvider } from "../lib/theme-context";
import { TooltipProvider } from "@/lib/ui/tooltip";
import { Toaster } from "@/lib/ui/sonner";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "GOBERNA — Plataforma de Gestión Territorial",
  description: "Sistema de operación territorial, inteligencia geoespacial y gestión de campañas.",
  icons: { icon: "/branding/goberna-escudo.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className={`${montserrat.variable} antialiased`}>
        <ThemeProvider>
          <TooltipProvider>
            {children}
          </TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
