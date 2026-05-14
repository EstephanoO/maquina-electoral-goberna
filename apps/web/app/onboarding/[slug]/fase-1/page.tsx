import { redirect } from "next/navigation";

export default async function Fase1Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/onboarding/${slug}/perfil`);
}
