import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { cn } from "../lib/utils";
import { LogIn } from "lucide-react";

const LOGIN_LOGO = "/goberna-logo.png";

export default function LoginPage(props?: { onLogin?: (token: string) => void }) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      setError("Email y contraseña son requeridos");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const response = await api.post<{ token: string; user: any }>("/auth/login", { email, password });
      if (response?.token) {
        localStorage.setItem("auth_token", response.token);
        if (response.user) localStorage.setItem("user", JSON.stringify(response.user));
        if (props?.onLogin) props.onLogin(response.token);
        navigate("/", { replace: true });
      } else {
        setError("Login fallido");
      }
    } catch (err: any) {
      setError(err?.message || "Credenciales inválidas");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1a3a6b] to-[#2a4f8a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <img src={LOGIN_LOGO} alt="Goberna"
              className="w-20 h-20 rounded-full mx-auto mb-4 object-cover border-4 border-[#2a4f8a] bg-white p-2"
              onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <h1 className="text-2xl font-bold text-[#1a3a6b] mb-1">CRM Goberna</h1>
            <p className="text-sm text-slate-500">Acceso operadores</p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#2a4f8a] focus:border-transparent"
                placeholder="correo@goberna.pe"
                disabled={loading}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#2a4f8a] focus:border-transparent"
                placeholder="••••••••"
                disabled={loading}
                onKeyDown={(e) => e.key === "Enter" && handleLogin(e as any)}
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-2 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all",
                loading
                  ? "bg-slate-200 text-slate-500 cursor-not-allowed"
                  : "bg-[#1a3a6b] text-white hover:bg-[#2a4f8a] active:scale-95"
              )}
            >
              <LogIn className="w-4 h-4" />
              {loading ? "Ingresando..." : "Ingresar"}
            </button>
          </form>

        </div>

        {/* Footer */}
        <p className="text-center text-white/60 text-xs mt-6">
          CRM Goberna • Plataforma interna
        </p>
      </div>
    </div>
  );
}
