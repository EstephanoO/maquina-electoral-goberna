import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { NuevoCandidatoForm } from "./_components/NuevoCandidatoForm";

export const metadata = {
  title: "Nuevo candidato · CRM Goberna",
};

export default function NuevoCandidatoPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <Link
            href="/admin/candidatos"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#0a1f4a] transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Candidatos
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 mt-2">Nuevo candidato</h1>
          <p className="text-sm text-slate-500 mt-1">
            Cargamos un lead. La postulación y el wizard se llenan después.
          </p>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8">
        <NuevoCandidatoForm />
      </main>
    </div>
  );
}
