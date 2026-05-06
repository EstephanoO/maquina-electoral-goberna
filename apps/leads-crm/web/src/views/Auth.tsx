import { useState } from "react";
import { useAuth } from "../auth";

export function AuthView() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password, name, phone || undefined);
    } catch (e: any) {
      setError(friendlyError(e?.message ?? "Error"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-brand">
          <img src="/goberna-logo.png" alt="Goberna" style={{ height: 40, width: 40, objectFit: "contain" }} />
          <div>
            <h1>GOBERNA LEADS</h1>
            <div className="brand-sub">CRM para tu equipo de ventas</div>
          </div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => setMode("login")}>
            Iniciar sesión
          </button>
          <button className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => setMode("register")}>
            Crear cuenta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="auth-form">
          {mode === "register" && (
            <>
              <label className="field">
                <span className="label">Nombre completo</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span className="label">Teléfono (opcional)</span>
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+51 ..." />
              </label>
            </>
          )}
          <label className="field">
            <span className="label">Email</span>
            <input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label className="field">
            <span className="label">Contraseña</span>
            <input type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)}
                   minLength={6} required />
          </label>

          {error && <div className="error">{error}</div>}

          <button className="btn" type="submit" disabled={submitting}>
            {submitting ? "…" : (mode === "login" ? "Entrar" : "Crear cuenta")}
          </button>
        </form>

        {mode === "register" && (
          <div className="auth-hint">
            La primera cuenta se crea como <strong>admin</strong>. Las siguientes son operadoras.
          </div>
        )}
      </div>
    </div>
  );
}

function friendlyError(msg: string): string {
  const map: Record<string, string> = {
    "invalid_credentials": "Email o contraseña incorrectos",
    "email_already_registered": "Ya existe una cuenta con ese email",
    "email_password_required": "Ingresa email y contraseña",
    "email_password_name_required": "Completa todos los campos",
    "password_too_short": "La contraseña debe tener al menos 6 caracteres",
  };
  return map[msg] ?? msg;
}
