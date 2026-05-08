import { redirect } from "next/navigation";

type Props = { params: Promise<{ slug: string }> };

export default async function DatosIndexPage({ params }: Props) {
  const { slug } = await params;
  redirect(`/candidatos/${slug}/datos/voluntarios`);
}
