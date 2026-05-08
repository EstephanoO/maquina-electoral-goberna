"use client";

/**
 * /candidatos/[slug]/digital/metricas
 * Reusa el componente de candidatos/[slug]/cms-metrics (ya scoped por slug).
 */

import CandidatoCmsMetricsPage from "@/app/(dashboard)/candidatos/[slug]/cms-metrics/page";

export default function DigitalMetricasTab() {
  return <CandidatoCmsMetricsPage />;
}
