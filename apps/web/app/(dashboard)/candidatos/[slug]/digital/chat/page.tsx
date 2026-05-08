"use client";

/**
 * /candidatos/[slug]/digital/chat
 * Re-monta la UI completa de /cms (chat + contactos + tags) bajo el hub Digital.
 * El componente fuente sigue viviendo en /cms y mantiene su propio estado.
 */

import CmsPage from "@/app/(dashboard)/cms/page";

export default function DigitalChatTab() {
  return <CmsPage />;
}
