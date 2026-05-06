import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, Users, LogOut, ChevronDown, FileBarChart,
  MessageCircle, Brain, Package, Settings, Search,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { CommandPalette, useCommandPalette } from "../components/ui";

const NAV: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: "/chat",      label: "Chat",            icon: MessageCircle },
  { to: "/leads",     label: "Leads",           icon: Users },
  { to: "/dashboard", label: "Dashboard",       icon: LayoutDashboard },
  { to: "/reports",   label: "Reportes",        icon: FileBarChart },
  { to: "/training",  label: "Entrenamiento IA", icon: Brain },
  { to: "/products",  label: "Productos",       icon: Package },
  { to: "/settings",  label: "Configuración",   icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [userMenu, setUserMenu] = useState(false);
  const cmdk = useCommandPalette();
  const userName = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null")?.name; } catch { return null; }
  })();
  const userEmail = (() => {
    try { return JSON.parse(localStorage.getItem("user") || "null")?.email; } catch { return null; }
  })();

  function logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user");
    navigate("/login", { replace: true });
  }

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#F7F8FA]">
      {/* Desktop header */}
      <header className="hidden md:flex h-[48px] bg-[#1a3a6b] items-center px-5 shrink-0 z-30">
        <div className="flex items-center gap-2.5 mr-8">
          <img src="/goberna-logo.png" alt="Goberna" className="h-6 w-6 object-contain" />
          <span className="text-sm font-extrabold tracking-wider text-white">
            CRM <span className="text-blue-300">GOBERNA</span>
          </span>
        </div>

        <nav className="flex items-center gap-0.5">
          {NAV.map(n => (
            <NavLink
              key={n.to} to={n.to}
              className={({ isActive }) => cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all",
                isActive ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}
            >
              <n.icon className="w-4 h-4" /> {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Command palette trigger — Linear/Vercel pattern */}
        <button
          onClick={() => cmdk.setOpen(true)}
          className="hidden lg:flex items-center gap-2 mr-3 px-2.5 py-1 rounded-md bg-white/10 hover:bg-white/15 transition border border-white/10 text-white/70 text-xs"
          title="Buscar / navegar (⌘K)"
        >
          <Search className="w-3.5 h-3.5" />
          <span>Buscar…</span>
          <kbd className="ml-2 text-[10px] !bg-white/10 !border-white/20 !text-white/70">⌘K</kbd>
        </button>

        <div className="relative">
          <button onClick={() => setUserMenu(!userMenu)}
                  className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-all">
            <div className="w-6 h-6 rounded-full bg-blue-300 flex items-center justify-center text-[#1a3a6b] text-[10px] font-bold">
              {userName?.charAt(0)?.toUpperCase() || "U"}
            </div>
            <span className="text-xs font-medium text-white/80">{userName || "Usuario"}</span>
            <ChevronDown className="w-3 h-3 text-white/40" />
          </button>
          {userMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl z-50 py-1 border">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-800">{userName || "—"}</div>
                  <div className="text-[10px] text-slate-400">{userEmail || ""}</div>
                </div>
                <button onClick={logout}
                        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50">
                  <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Page content */}
      <main className="flex-1 overflow-auto min-h-0">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden flex items-center bg-white border-t border-slate-200 shrink-0 safe-bottom">
        {NAV.slice(0, 5).map(n => (
          <NavLink
            key={n.to} to={n.to}
            className={({ isActive }) => cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 transition-all",
              isActive ? "text-[#2a4f8a]" : "text-slate-400"
            )}
          >
            <n.icon className="w-5 h-5" />
            <span className="text-[10px] font-semibold">{n.label}</span>
          </NavLink>
        ))}
        <button onClick={logout}
                className="flex-1 flex flex-col items-center gap-0.5 py-2 text-slate-400">
          <LogOut className="w-5 h-5" />
          <span className="text-[10px] font-semibold">Salir</span>
        </button>
      </nav>

      <CommandPalette open={cmdk.open} onClose={cmdk.close} />
    </div>
  );
}
