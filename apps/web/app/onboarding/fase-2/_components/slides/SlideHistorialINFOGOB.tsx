"use client";

import { motion } from "motion/react";
import { Construction, ExternalLink, FileSearch } from "lucide-react";

import type { CandidatoContext } from "@/lib/onboarding-api";

import { EditableText } from "../EditableText";
import { EditableT } from "../EditableT";
import { useEditing } from "../EditingContext";
import { SlideShell } from "./SlideShell";

interface SlideHistorialINFOGOBProps {
  ctx: CandidatoContext;
}

export function SlideHistorialINFOGOB({ ctx }: SlideHistorialINFOGOBProps) {
  const dni = ""; // a futuro: pull desde candidatos.candidato.documento_numero
  const historial = ctx.consultor_form?.historial;
  const entries = historial?.entries ?? [];
  const nuncaPostulo = historial?.nunca_postulo;
  const observaciones = historial?.observaciones;
  const hayEntradas = entries.length > 0;
  const { editing } = useEditing();

  return (
    <SlideShell
      slideId="historial"
      kicker="04 · Tu trayectoria electoral"
      title={`Historial político de ${ctx.user.full_name.split(/\s+/).slice(0, 2).join(" ")}`}
    >
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-10">
        {/* Mockup de tabla INFOGOB */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="rounded-2xl border-2 border-gray-700/60 bg-white/[0.04] p-5 backdrop-blur-sm"
        >
          <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700/40">
            <div className="flex items-center gap-2">
              <FileSearch className="size-4 text-amber-400" />
              <span className="text-xs uppercase tracking-widest text-amber-400/80">
                INFOGOB · Fuente JNE
              </span>
            </div>
            <a
              href="https://infogob.jne.gob.pe/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-amber-400"
            >
              Abrir <ExternalLink className="size-3" />
            </a>
          </div>

          <div className="space-y-3">
            {nuncaPostulo ? (
              <div className="py-6 text-center text-sm text-gray-400 italic">
                Primera postulación. Sin historial electoral previo.
              </div>
            ) : hayEntradas ? (
              entries
                .slice()
                .sort((a, b) => b.anio - a.anio)
                .map((e, idx) => (
                  <RowMock
                    key={`${e.anio}-${idx}`}
                    proceso={`${e.cargo.toUpperCase()} ${e.anio}${e.jurisdiccion ? ` · ${e.jurisdiccion}` : ""}`}
                    cargo={e.partido ?? "—"}
                    partido={typeof e.porcentaje === "number" ? `${e.porcentaje.toFixed(1)}%` : "—"}
                    elegido={
                      e.resultado
                        ? e.resultado.toLowerCase().includes("gan") ||
                          e.resultado.toLowerCase().includes("elec")
                          ? true
                          : false
                        : null
                    }
                  />
                ))
            ) : (
              <>
                <RowMock proceso="ELECCIONES MUNICIPALES 2022" cargo="—" partido="—" elegido={null} />
                <RowMock proceso="ELECCIONES MUNICIPALES 2018" cargo="—" partido="—" elegido={null} />
                <RowMock proceso="ELECCIONES MUNICIPALES 2014" cargo="—" partido="—" elegido={null} />
              </>
            )}
          </div>

          {!hayEntradas && !nuncaPostulo && (
            <div className="mt-4 inline-flex items-center gap-1 rounded-full bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-400/80">
              <Construction className="size-2.5" />
              Datos en construcción · Pendiente de scraping JNE
            </div>
          )}
        </motion.div>

        {/* Análisis */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-5 self-center"
        >
          <p className="text-xl sm:text-2xl text-white leading-relaxed">
            <EditableT k="historial.lead" multiline>
              Tu historial político se va a llenar automáticamente desde INFOGOB con tu DNI.
            </EditableT>
          </p>
          <p className="text-base text-gray-400 leading-relaxed">
            <EditableT k="historial.descripcion" multiline>
              Vamos a mostrar tus participaciones electorales pasadas, partidos con los que postulaste y resultados — para que tu equipo sepa de dónde vienes y pueda construir narrativa.
            </EditableT>
          </p>

          <div className="pt-4 border-t border-gray-800">
            <p className="text-xs uppercase tracking-widest text-amber-400/70 mb-2">
              <EditableT k="historial.porque.kicker">¿Por qué importa?</EditableT>
            </p>
            <ul className="space-y-1.5 text-sm text-gray-300">
              <li>· <EditableT k="historial.porque.item1">Apoyo del electorado a tu nombre vs al partido</EditableT></li>
              <li>· <EditableT k="historial.porque.item2">Tasa de éxito electoral (elecciones ganadas / postuladas)</EditableT></li>
              <li>· <EditableT k="historial.porque.item3">Estabilidad partidaria y movimientos entre orgs</EditableT></li>
            </ul>
          </div>

          {(observaciones || editing) && (
            <div className="pt-4 border-t border-gray-800">
              <p className="text-xs uppercase tracking-widest text-amber-400/70 mb-2">
                <EditableT k="historial.lectura.kicker">Lectura del consultor</EditableT>
              </p>
              <p className="text-sm text-gray-200 leading-relaxed">
                <EditableText
                  section="historial"
                  field="observaciones"
                  value={observaciones}
                  placeholder="[Patrón observable, contexto, lectura del histórico]"
                  multiline
                />
              </p>
            </div>
          )}
        </motion.div>
      </div>
    </SlideShell>
  );
}

interface RowMockProps {
  proceso: string;
  cargo: string;
  partido: string;
  elegido: boolean | null;
}

function RowMock({ proceso, cargo, partido, elegido }: RowMockProps) {
  return (
    <div className="grid grid-cols-12 gap-2 items-center text-xs">
      <span className="col-span-6 text-gray-300 truncate">{proceso}</span>
      <span className="col-span-3 text-gray-500 truncate">{cargo}</span>
      <span className="col-span-2 text-gray-500 truncate">{partido}</span>
      <span className="col-span-1 flex justify-end">
        {elegido === null ? (
          <span className="size-4 rounded-full bg-gray-700 border border-gray-600" />
        ) : elegido ? (
          <span className="size-4 rounded-full bg-emerald-500" />
        ) : (
          <span className="size-4 rounded-full bg-red-500" />
        )}
      </span>
    </div>
  );
}
