import type { Metadata } from "next";
import PerfilHubV2Client from "./_components/PerfilHubV2Client";

export const metadata: Metadata = {
  title: "Perfil del Candidato · Goberna",
};

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <PerfilHubV2Client slug={slug} />;
}
