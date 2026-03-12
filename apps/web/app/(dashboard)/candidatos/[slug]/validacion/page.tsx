"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function ValidacionPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  useEffect(() => {
    router.replace(`/candidatos/${slug}/monitor`);
  }, [router, slug]);

  return null;
}
