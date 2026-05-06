import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type User = {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: "operator" | "admin";
  disabled: boolean;
  created_at: string;
};

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string, phone?: string) => Promise<void>;
  logout: () => void;
};

const TOKEN_KEY = "nx_auth_token";

const AuthCtx = createContext<AuthState | null>(null);

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

async function api(path: string, init?: RequestInit & { token?: string | null }) {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init?.headers as any ?? {}) };
  if (init?.token) headers["Authorization"] = `Bearer ${init.token}`;
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(data?.error || `${res.status} ${res.statusText}`);
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // On boot, if we have a token try /auth/me
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    api("/auth/me", { token })
      .then((u) => setUser(u))
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setToken(null); })
      .finally(() => setLoading(false));
  }, [token]);

  async function login(email: string, password: string) {
    const r = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    localStorage.setItem(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
  }

  async function register(email: string, password: string, name: string, phone?: string) {
    const r = await api("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name, phone }) });
    localStorage.setItem(TOKEN_KEY, r.token);
    setToken(r.token);
    setUser(r.user);
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }

  return <AuthCtx.Provider value={{ user, token, loading, login, register, logout }}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth outside AuthProvider");
  return c;
}
