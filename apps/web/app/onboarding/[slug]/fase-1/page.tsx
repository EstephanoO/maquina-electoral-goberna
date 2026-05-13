import { Fase1RapidaClient } from "./_components/Fase1RapidaClient";

export function generateMetadata({
  params,
}: {
  params: { slug: string };
}) {
  return {
    title: `Fase 1 · ${params.slug} — Goberna Electoral`,
  };
}

export default async function Fase1Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <Fase1RapidaClient slug={slug} />;
}
