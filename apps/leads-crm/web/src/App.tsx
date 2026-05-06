import { useState, useEffect } from "react";
import LoginPage from "./pages/LoginPage";
import LeadsPage from "./pages/LeadsPage";
import DashboardPage from "./pages/DashboardPage";
import ReportsPage from "./pages/ReportsPage";
import ChatPage from "./pages/ChatPage";
import TrainingPage from "./pages/TrainingPage";
import ProductsPage from "./pages/ProductsPage";
import SettingsPage from "./pages/SettingsPage";
import { LeadDetail } from "./views/LeadDetail";
import { LayoutDashboard, Users, LogOut, ChevronDown, FileBarChart, MessageCircle, Brain, Package, Settings } from "lucide-react";
import { cn } from "./lib/utils";

type View = "dashboard" | "leads" | "chat" | "reports" | "training" | "products" | "settings";

export default function App() {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("chat");
  const [openLeadId, setOpenLeadId] = useState<number | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [userMenu, setUserMenu] = useState(false);

  // Load token from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("auth_token");
    if (stored) {
      setToken(stored);
      setUser({ name: "Usuario", email: "usuario@goberna.pe" }); // Placeholder
    }
    setLoading(false);
  }, []);

  // Cross-page navigation: child cards dispatch CustomEvent("nav:goto", { detail: "products" })
  useEffect(() => {
    const handler = (e: Event) => {
      const target = (e as CustomEvent<string>).detail;
      if (target) setView(target as View);
    };
    window.addEventListener("nav:goto", handler);
    return () => window.removeEventListener("nav:goto", handler);
  }, []);

  const handleLogin = (newToken: string) => {
    setToken(newToken);
    setUser({ name: "Usuario", email: "usuario@goberna.pe" });
  };

  const handleLogout = () => {
    localStorage.removeItem("auth_token");
    setToken(null);
    setUser(null);
    setUserMenu(false);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-screen bg-[#F7F8FA]" />;
  }

  if (!token) {
    return <LoginPage onLogin={handleLogin} />;
  }

  const nav = [
    { key: "chat" as const, label: "Chat", icon: MessageCircle },
    { key: "leads" as const, label: "Leads", icon: Users },
    { key: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
    { key: "reports" as const, label: "Reportes", icon: FileBarChart },
    { key: "training" as const, label: "Entrenamiento IA", icon: Brain },
    { key: "products" as const, label: "Productos", icon: Package },
    { key: "settings" as const, label: "Configuración", icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen h-[100dvh] bg-[#F7F8FA]">
      {/* Desktop Header */}
      <header className="hidden md:flex h-[48px] bg-[#1a3a6b] items-center px-5 shrink-0 z-30">
        <div className="flex items-center gap-2.5 mr-8">
          <img src="/goberna-logo.png" alt="Goberna" className="h-6 w-6 object-contain" />
          <span className="text-sm font-extrabold tracking-wider text-white">
            CRM <span className="text-blue-300">GOBERNA</span>
          </span>
        </div>
        <nav className="flex items-center gap-0.5">
          {nav.map((n) => (
            <button key={n.key} onClick={() => setView(n.key)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[13px] font-medium transition-all",
                view === n.key ? "bg-white/15 text-white" : "text-white/50 hover:text-white/80 hover:bg-white/5"
              )}>
              <n.icon className="w-4 h-4" />
              {n.label}
            </button>
          ))}
        </nav>
        <div className="flex-1" />
        <div className="relative">
          <button onClick={() => setUserMenu(!userMenu)}
            className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-white/10 transition-all">
            <div className="w-6 h-6 rounded-full bg-blue-300 flex items-center justify-center text-[#1a3a6b] text-[10px] font-bold">
              {user?.name?.charAt(0).toUpperCase() || "U"}
            </div>
            <span className="text-xs font-medium text-white/80">{user?.name || "Usuario"}</span>
            <ChevronDown className="w-3 h-3 text-white/40" />
          </button>
          {userMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setUserMenu(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl z-50 py-1 border">
                <div className="px-3 py-2 border-b border-slate-100">
                  <div className="text-xs font-semibold text-slate-800">{user?.name}</div>
                  <div className="text-[10px] text-slate-400">{user?.email}</div>
                </div>
                <button onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50">
                  <LogOut className="w-3.5 h-3.5" /> Cerrar sesión
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-auto min-h-0">
        {view === "dashboard" && <DashboardPage />}
        {view === "leads" && <LeadsPage onOpenLead={(id) => setOpenLeadId(id)} key={refreshKey} />}
        {view === "chat" && <ChatPage />}
        {view === "reports" && <ReportsPage />}
        {view === "training" && <TrainingPage />}
        {view === "products" && <ProductsPage />}
        {view === "settings" && <SettingsPage />}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden flex items-center bg-white border-t border-slate-200 shrink-0 safe-bottom">
        {nav.map((n) => (
          <button key={n.key} onClick={() => setView(n.key)}
            className={cn(
              "flex-1 flex flex-col items-center gap-0.5 py-2 transition-all",
              view === n.key ? "text-[#2a4f8a]" : "text-slate-400"
            )}>
            <n.icon className="w-5 h-5" />
            <span className="text-[10px] font-semibold">{n.label}</span>
          </button>
        ))}
        <button onClick={() => setUserMenu(!userMenu)}
          className="flex-1 flex flex-col items-center gap-0.5 py-2 text-slate-400">
          <div className="w-5 h-5 rounded-full bg-blue-300 flex items-center justify-center text-[#1a3a6b] text-[8px] font-bold">
            {user?.name?.charAt(0).toUpperCase() || "U"}
          </div>
          <span className="text-[10px] font-semibold">Perfil</span>
        </button>
      </nav>

      {/* Mobile user menu */}
      {userMenu && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/30 flex items-end" onClick={() => setUserMenu(false)}>
          <div className="w-full bg-white rounded-t-2xl p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-blue-300 flex items-center justify-center text-[#1a3a6b] text-sm font-bold">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>
              <div>
                <div className="text-sm font-bold text-slate-900">{user?.name}</div>
                <div className="text-xs text-slate-400">{user?.email}</div>
              </div>
            </div>
            <button onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-red-50 text-red-600 text-sm font-semibold">
              <LogOut className="w-4 h-4" /> Cerrar sesión
            </button>
          </div>
        </div>
      )}

      {openLeadId !== null && (
        <LeadDetail
          leadId={openLeadId}
          onClose={() => setOpenLeadId(null)}
          onSaved={() => setRefreshKey((k) => k + 1)}
          onDeleted={() => { setOpenLeadId(null); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
