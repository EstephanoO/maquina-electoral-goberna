import type { Metadata } from "next";
import { PerfilHubClient } from "./_components/PerfilHubClient";

export const metadata: Metadata = {
  title: "Perfil del Candidato · Goberna",
};

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PerfilHubClient slug={slug} />;
}
