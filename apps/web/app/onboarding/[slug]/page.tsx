import { redirect } from "next/navigation";

export default async function CandidatoOnboardingPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  redirect(`/onboarding/${slug}/fase-1`);
}
