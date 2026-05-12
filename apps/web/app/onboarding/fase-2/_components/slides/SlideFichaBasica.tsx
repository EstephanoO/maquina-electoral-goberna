"use client";

import { motion } from "motion/react";
import { User, Globe2, IdCard, Phone, Calendar, Briefcase } from "lucide-react";
import { SlideShell } from "./SlideShell";
import { EditableText } from "../EditableText";
import { useEditing } from "../EditingContext";
import type { CandidatoContext } from "@/lib/onboarding-api";

interface Props {
  ctx: CandidatoContext;
}

const PLACEHOLDER = "[A completar]";

export function SlideFichaBasica({ ctx }: Props) {
  const fullName = ctx.user.full_name;
  const pais = ctx.jurisdiccion.pais.nombre;
  const phone = ctx.user.phone;
  const fotoUrl = ctx.user.foto_url;
  // Datos del formulario del consultor — caen a placeholder si no hay
  const fb = ctx.consultor_form?.ficha_basica;
  const qe = ctx.consultor_form?.quien_es;
  const dni = fb?.dni && fb.dni.length > 0 ? fb.dni : PLACEHOLDER;
  const edad =
    typeof fb?.edad === "number" ? String(fb.edad) : PLACEHOLDER;
  const profesion =
    fb?.profesion && fb.profesion.length > 0
      ? fb.profesion
      : qe?.trayectoria
        ? qe.trayectoria.split(/[,.]/)[0] ?? PLACEHOLDER
        : PLACEHOLDER;

  const initials = fullName
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  type Field = {
    icon: typeof User;
    label: string;
    real: boolean;
    /** Si tiene editKey, el value en modo edit se renderiza con EditableText. */
    editKey?: { field: "dni" | "edad" | "profesion"; numeric?: boolean };
    /** Si no es editable, se usa el value directo. */
    rawValue: string;
  };

  const fields: Field[] = [
    { icon: User, label: "Nombre completo", rawValue: fullName, real: true },
    { icon: Globe2, label: "País", rawValue: pais, real: true },
    { icon: IdCard, label: "DNI", rawValue: dni, real: dni !== PLACEHOLDER, editKey: { field: "dni" } },
    { icon: Phone, label: "Teléfono", rawValue: phone ?? PLACEHOLDER, real: !!phone },
    {
      icon: Calendar,
      label: "Edad",
      rawValue: edad,
      real: edad !== PLACEHOLDER,
      editKey: { field: "edad", numeric: true },
    },
    {
      icon: Briefcase,
      label: "Profesión",
      rawValue: profesion,
      real: profesion !== PLACEHOLDER,
      editKey: { field: "profesion" },
    },
  ];

  return (
    <SlideShell kicker="Lámina 1 · Ficha del candidato" title="FICHA BÁSICA">
      <div className="grid grid-cols-12 gap-6 sm:gap-8 px-2 sm:px-4 items-start">
        {/* Foto a la izquierda */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="col-span-12 md:col-span-4"
        >
          <div className="aspect-square w-full max-w-[280px] mx-auto md:mx-0 relative">
            {fotoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={fotoUrl}
                alt={fullName}
                className="w-full h-full object-cover border-4 border-amber-400 shadow-2xl shadow-amber-400/20"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0a1e4a] to-[#061633] flex items-center justify-center text-amber-400 text-7xl font-black border-4 border-amber-400">
                {initials}
              </div>
            )}
            <div className="absolute -bottom-3 -right-3 size-14 rounded-full bg-amber-400 text-[#0a1e4a] flex items-center justify-center font-black text-2xl shadow-lg">
              01
            </div>
          </div>
        </motion.div>

        {/* Tabla de datos */}
        <div className="col-span-12 md:col-span-8 space-y-3">
          {fields.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.label}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.07 }}
                className="grid grid-cols-12 gap-4 items-center border-b border-white/10 pb-3"
              >
                <div className="col-span-1 flex justify-center">
                  <Icon className="size-5 text-amber-400" strokeWidth={2} />
                </div>
                <div className="col-span-4">
                  <span className="text-[10px] uppercase tracking-[0.25em] text-white/60 font-bold">
                    {f.label}
                  </span>
                </div>
                <div className="col-span-7">
                  <span
                    className={
                      f.real
                        ? "text-xl sm:text-2xl font-extrabold text-white"
                        : "text-xl sm:text-2xl font-bold text-amber-400/70 italic"
                    }
                  >
                    {f.editKey ? (
                      <EditableText
                        section="ficha_basica"
                        field={f.editKey.field}
                        value={
                          f.editKey.field === "edad"
                            ? typeof fb?.edad === "number"
                              ? fb.edad
                              : undefined
                            : f.editKey.field === "dni"
                              ? fb?.dni
                              : fb?.profesion
                        }
                        numeric={f.editKey.numeric}
                        placeholder={PLACEHOLDER}
                      />
                    ) : (
                      f.rawValue
                    )}
                  </span>
                </div>
              </motion.div>
            );
          })}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="text-xs text-white/40 italic mt-4"
          >
            Los campos en{" "}
            <span className="text-amber-400/70 font-bold not-italic">amarillo</span> los completa el
            consultor en la siguiente fase.
          </motion.p>
        </div>
      </div>
    </SlideShell>
  );
}
