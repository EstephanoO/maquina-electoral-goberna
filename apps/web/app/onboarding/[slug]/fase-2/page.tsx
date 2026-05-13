import { Fase2SlugClient } from "./_components/Fase2SlugClient";

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  return {
    title: `Fase 2 · ${params.slug} — Goberna Electoral`,
  };
}

export default async function Fase2PerCandidatoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Fase2SlugClient slug={slug} />;
}
