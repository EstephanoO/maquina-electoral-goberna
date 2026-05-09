import { CartaClient } from "./_components/CartaClient";

export const metadata = {
  title: "Tu carta · Goberna Electoral",
  description: "Carta del candidato — jurisdicción, datos y avance.",
};

export default function CartaPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign_id?: string }>;
}) {
  return <CartaClient searchParamsPromise={searchParams} />;
}
