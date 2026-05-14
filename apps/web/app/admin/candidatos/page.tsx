import Link from "next/link";
import { CandidatosListClient } from "./_components/CandidatosListClient";

export const metadata = {
  title: "Candidatos · CRM Goberna",
  description: "Pipeline interno de candidatos en proceso de onboarding.",
};

export const dynamic = "force-dynamic";

export default function CandidatosListPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Candidatos</h1>
            <p className="text-sm text-slate-500 mt-1">
              Pipeline interno · onboarding_fase1
            </p>
          </div>
          <Link
            href="/admin/candidatos/nuevo"
            className="inline-flex items-center gap-2 rounded-xl bg-[#0a1f4a] text-white px-4 py-2 text-sm font-medium hover:bg-[#06122e] transition"
          >
            <span className="text-lg leading-none">+</span>
            Nuevo candidato
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <CandidatosListClient />
      </main>
    </div>
  );
}
