import Link from "next/link";
import { ChevronLeft } from "lucide-react";

import { CandidatoDetailClient } from "./_components/CandidatoDetailClient";

export const metadata = {
  title: "Candidato · CRM Goberna",
};

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export default async function CandidatoDetailPage({ params }: Props) {
  const { slug } = await params;
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-6 py-5">
          <Link
            href="/admin/candidatos"
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-[#0a1f4a] transition"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            Candidatos
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <CandidatoDetailClient slug={slug} />
      </main>
    </div>
  );
}
