"use client";

/**
 * Modal de edición de perfil — abre desde la pantalla Carta.
 * Solo muestra los campos que faltan / son editables: foto, phone,
 * email (si querés cambiarlo), partido (lookup en organizacion_politica),
 * y password (si has_password=false → "set initial").
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, Loader2, Camera } from "lucide-react";

import { api } from "@/lib/api-client";

type OrgOption = { codigo: string; nombre: string; siglas: string | null };

type Props = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: {
    full_name: string;
    email: string;
    phone: string | null;
    foto_url: string | null;
    has_password: boolean;
    organizacion_politica_codigo: string | null;
  };
};

export function EditProfileModal({ open, onClose, onSaved, initial }: Props) {
  const [fullName, setFullName] = useState(initial.full_name);
  const [email, setEmail] = useState(initial.email);
  const [phone, setPhone] = useState(initial.phone ?? "");
  const [fotoUrl, setFotoUrl] = useState(initial.foto_url ?? "");
  const [orgCodigo, setOrgCodigo] = useState(initial.organizacion_politica_codigo ?? "");
  const [orgs, setOrgs] = useState<OrgOption[]>([]);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingFoto, setUploadingFoto] = useState(false);

  useEffect(() => {
    if (!open) return;
    setFullName(initial.full_name);
    setEmail(initial.email);
    setPhone(initial.phone ?? "");
    setFotoUrl(initial.foto_url ?? "");
    setOrgCodigo(initial.organizacion_politica_codigo ?? "");
    setPassword("");
    setError(null);
  }, [open, initial]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const res = await api.get<{ ok: boolean; organizaciones: OrgOption[] }>(
        "/api/catalogos/organizaciones-politicas?pais=PE",
      );
      if (cancelled) return;
      if (res.ok && res.data) setOrgs(res.data.organizaciones ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const handleFotoUpload = async (file: File) => {
    setUploadingFoto(true);
    setError(null);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch("/api/uploads", {
        method: "POST",
        headers: {
          "Content-Type": file.type || "image/jpeg",
          "x-upload-folder": "candidatos",
        },
        body: buf,
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error("upload failed");
      const data = (await res.json()) as {
        ok: boolean;
        upload?: { path: string };
      };
      if (data.ok && data.upload?.path) {
        setFotoUrl(data.upload.path);
      } else {
        throw new Error("upload no devolvió url");
      }
    } catch {
      setError("No pudimos subir la foto (max 5MB, jpg/png/webp)");
    } finally {
      setUploadingFoto(false);
    }
  };

  const handleSave = async () => {
    setBusy(true);
    setError(null);
    const patch: Record<string, unknown> = {};
    if (fullName.trim() !== initial.full_name) patch.full_name = fullName.trim();
    if (email.trim() !== initial.email) patch.email = email.trim();
    if ((phone || null) !== (initial.phone || null)) patch.phone = phone.trim() || null;
    if ((fotoUrl || null) !== (initial.foto_url || null)) patch.foto_url = fotoUrl.trim() || null;
    if ((orgCodigo || null) !== (initial.organizacion_politica_codigo || null))
      patch.organizacion_politica_codigo = orgCodigo || null;

    try {
      if (Object.keys(patch).length > 0) {
        const res = await api.patch<{ ok: boolean }>("/api/onboarding/profile", patch);
        if (!res.ok) throw new Error("patch failed");
      }
      if (!initial.has_password && password.length >= 8) {
        const res = await api.post<{ ok: boolean }>("/api/auth/set-initial-password", {
          new_password: password,
        });
        if (!res.ok) throw new Error("password failed");
      }
      onSaved();
      onClose();
    } catch {
      setError("No pudimos guardar — revisá los datos");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-30 flex items-center justify-center"
        >
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm border-none cursor-default"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: 40, scale: 0.96, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 40, scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
            className="relative w-full max-w-[520px] max-h-[90vh] overflow-y-auto rounded-2xl border border-amber-300/30 bg-[#0a1f4a]/95 backdrop-blur-xl p-7 mx-4 shadow-2xl text-white font-sans"
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-300/80 mb-1">
                  Editar perfil
                </div>
                <h2 className="text-2xl font-black tracking-tight m-0">Tus datos</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="size-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Foto */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-2">
                  Foto
                </label>
                <div className="flex items-center gap-4">
                  {fotoUrl ? (
                    <img
                      src={fotoUrl}
                      alt="foto"
                      className="size-16 rounded-full object-cover border border-amber-300/40"
                    />
                  ) : (
                    <div className="size-16 rounded-full bg-white/10 flex items-center justify-center text-white/40">
                      <Camera className="size-5" />
                    </div>
                  )}
                  <label className="cursor-pointer rounded-md border border-white/20 bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors">
                    {uploadingFoto ? (
                      <Loader2 className="size-3.5 animate-spin inline mr-1" />
                    ) : null}
                    Subir
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleFotoUpload(f);
                      }}
                    />
                  </label>
                </div>
              </div>

              {/* Full name */}
              <Field
                label="Nombre completo"
                value={fullName}
                onChange={setFullName}
                placeholder="Roberto Sánchez"
              />

              {/* Email */}
              <Field
                label="Email"
                value={email}
                onChange={setEmail}
                placeholder="roberto@ejemplo.pe"
                type="email"
              />

              {/* Phone */}
              <Field
                label="Teléfono"
                value={phone}
                onChange={setPhone}
                placeholder="+51 999 999 999"
                type="tel"
              />

              {/* Partido */}
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-2">
                  Partido político
                </label>
                <select
                  value={orgCodigo}
                  onChange={(e) => setOrgCodigo(e.target.value)}
                  className="w-full rounded-md border border-white/15 bg-white/5 hover:bg-white/8 px-3 py-2.5 text-sm outline-none transition-colors"
                >
                  <option value="" className="bg-[#0a1f4a]">
                    — sin partido —
                  </option>
                  {orgs.map((o) => (
                    <option key={o.codigo} value={o.codigo} className="bg-[#0a1f4a]">
                      {o.nombre}
                      {o.siglas ? ` (${o.siglas})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Password (solo si no tiene) */}
              {!initial.has_password ? (
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-2">
                    Contraseña <span className="text-white/40 normal-case">(opcional, mín 8 chars)</span>
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full rounded-md border border-white/15 bg-white/5 hover:bg-white/8 px-3 py-2.5 text-sm outline-none transition-colors"
                  />
                </div>
              ) : null}

              {error ? (
                <div className="text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md p-2">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="mt-7 flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="rounded-full border border-white/20 px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/5 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={busy || uploadingFoto}
                className="inline-flex items-center gap-2 rounded-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 px-5 py-2 text-xs font-black uppercase tracking-wider text-[#0a1f4a] transition-colors"
              >
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
                Guardar
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-[10px] font-bold uppercase tracking-wider text-white/60 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-md border border-white/15 bg-white/5 hover:bg-white/8 px-3 py-2.5 text-sm outline-none transition-colors"
      />
    </div>
  );
}
