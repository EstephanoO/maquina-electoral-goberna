"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState, useCallback, useEffect } from "react";
import { FONT_STACK } from "@/lib/constants";

const NAV_LINKS = [
  { label: "Nosotros", href: "/#nosotros" },
  { label: "Planes", href: "/#planes" },
  { label: "Mapa", href: "/mapa" },
] as const;

export function PublicHeader() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleMobile = useCallback(() => setMobileOpen((o) => !o), []);

  return (
    <header
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 100,
        background: scrolled ? "rgba(13,34,64,0.97)" : "var(--goberna-blue-950)",
        backdropFilter: scrolled ? "blur(8px)" : undefined,
        borderBottom: "1px solid rgba(255,255,255,0.06)",
        transition: "background 0.3s ease",
      }}
    >
      <div
        style={{
          maxWidth: 1200,
          margin: "0 auto",
          padding: "0 24px",
          height: 64,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: FONT_STACK,
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            textDecoration: "none",
          }}
        >
          <Image
            src="/isotipo_2_-removebg-preview.png"
            alt="Goberna"
            width={32}
            height={32}
            style={{ borderRadius: 6, width: 32, height: 32 }}
            priority
          />
          <span
            style={{
              fontWeight: 800,
              fontSize: 16,
              letterSpacing: 3,
              color: "var(--goberna-gold)",
              fontFamily: FONT_STACK,
            }}
          >
            GOBERNA
          </span>
        </Link>

        {/* Desktop nav */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
          className="public-nav-desktop"
        >
          {NAV_LINKS.map((link) => {
            const isHash = link.href.startsWith("/#");
            const isActive = isHash ? pathname === "/" : pathname === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                style={{
                  padding: "8px 16px",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--goberna-gold)" : "rgba(255,255,255,0.75)",
                  textDecoration: "none",
                  borderRadius: "var(--radius-sm)",
                  transition: "color 0.15s ease, background 0.15s ease",
                  background: isActive ? "rgba(255,200,0,0.08)" : "transparent",
                  fontFamily: FONT_STACK,
                  cursor: "pointer",
                }}
              >
                {link.label}
              </a>
            );
          })}

          <div style={{ width: 1, height: 24, background: "rgba(255,255,255,0.12)", margin: "0 8px" }} />

          <Link
            href="/login"
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              textDecoration: "none",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(255,255,255,0.2)",
              transition: "all 0.15s ease",
              fontFamily: FONT_STACK,
            }}
          >
            Iniciar Sesión
          </Link>

          <Link
            href="/onboarding"
            style={{
              padding: "8px 18px",
              fontSize: 13,
              fontWeight: 700,
              color: "#0f172a",
              textDecoration: "none",
              borderRadius: "var(--radius-sm)",
              background: "var(--goberna-gold)",
              transition: "all 0.15s ease",
              fontFamily: FONT_STACK,
            }}
          >
            Registrarse
          </Link>
        </nav>

        {/* Mobile hamburger */}
        <button
          type="button"
          onClick={toggleMobile}
          className="public-nav-mobile-toggle"
          style={{
            display: "none",
            background: "none",
            border: "none",
            color: "#ffffff",
            cursor: "pointer",
            padding: 8,
          }}
          aria-label={mobileOpen ? "Cerrar menu" : "Abrir menu"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {mobileOpen ? (
              <>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="public-nav-mobile-menu"
          style={{
            background: "var(--goberna-blue-900)",
            borderTop: "1px solid rgba(255,255,255,0.06)",
            padding: "12px 24px 20px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {NAV_LINKS.map((link) => {
            const isHash = link.href.startsWith("/#");
            const isActive = isHash ? pathname === "/" : pathname === link.href;
            return (
              <a
                key={link.href}
                href={link.href}
                style={{
                  padding: "12px 16px",
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "var(--goberna-gold)" : "rgba(255,255,255,0.75)",
                  textDecoration: "none",
                  borderRadius: "var(--radius-sm)",
                  background: isActive ? "rgba(255,200,0,0.08)" : "transparent",
                  fontFamily: FONT_STACK,
                  cursor: "pointer",
                }}
              >
                {link.label}
              </a>
            );
          })}

          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "4px 0" }} />

          <Link
            href="/login"
            style={{
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              color: "rgba(255,255,255,0.85)",
              textDecoration: "none",
              textAlign: "center",
              borderRadius: "var(--radius-sm)",
              border: "1px solid rgba(255,255,255,0.2)",
              fontFamily: FONT_STACK,
            }}
          >
            Iniciar Sesión
          </Link>

          <Link
            href="/onboarding"
            style={{
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 700,
              color: "#0f172a",
              textDecoration: "none",
              textAlign: "center",
              borderRadius: "var(--radius-sm)",
              background: "var(--goberna-gold)",
              fontFamily: FONT_STACK,
            }}
          >
            Registrarse
          </Link>
        </div>
      )}

      {/* Responsive styles */}
      <style>{`
        @media (max-width: 768px) {
          .public-nav-desktop { display: none !important; }
          .public-nav-mobile-toggle { display: flex !important; }
        }
        @media (min-width: 769px) {
          .public-nav-mobile-menu { display: none !important; }
        }
      `}</style>
    </header>
  );
}
