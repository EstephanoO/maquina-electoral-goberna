export interface SectionIntro {
  subtitle: string;
  fuentes?: Array<{
    label: string;
    url:   string;
    pasos?: string[];
  }>;
  tip?: string;
}

export const SECTION_INTROS: Record<string, SectionIntro> = {
  // ── TERRENO — E (Estructura) ──────────────────────────────────────────────
  e1: {
    subtitle: "Demografía y geografía del territorio: población, extensión, distribución urbano-rural y grupos étnicos.",
    tip: "Buscá el padrón electoral en ONPE para la población habilitada. El INEI tiene censos detallados por distrito.",
    fuentes: [
      {
        label: "INEI — Censos de Población y Vivienda",
        url: "https://www.inei.gob.pe/estadisticas/indice-tematico/poblacion-y-vivienda/",
        pasos: ["Ir a 'Estadísticas'", "Seleccionar 'Población y Vivienda'", "Buscar tu departamento/provincia/distrito"],
      },
      {
        label: "ONPE — Padrón Electoral",
        url: "https://www.onpe.gob.pe",
        pasos: ["Ir a 'Información Electoral'", "Seleccionar 'Padrón Electoral'"],
      },
    ],
  },
  e2: {
    subtitle: "Capital económico del territorio: PBI per cápita, pobreza, sectores productivos y empleo formal.",
    tip: "El BCRP tiene notas regionales con datos económicos actualizados. El INEI publica el mapa de pobreza monetaria.",
    fuentes: [
      {
        label: "INEI — Estadísticas Económicas",
        url: "https://www.inei.gob.pe/estadisticas/indice-tematico/economia/",
        pasos: ["Ir a 'Estadísticas'", "Seleccionar 'Economía'", "Buscar indicadores por departamento"],
      },
      {
        label: "BCRP — Notas de Estudios del BCRP",
        url: "https://www.bcrp.gob.pe/publicaciones/notas-de-estudios.html",
        pasos: ["Buscar nota regional de tu departamento"],
      },
    ],
  },
  e3: {
    subtitle: "Capital cultural y social: organizaciones, líderes territoriales, identidades, fiestas y lenguas.",
    tip: "Completá con observación directa y entrevistas a actores locales. Los líderes son clave para la campaña.",
    fuentes: [
      {
        label: "INEI — Directorio de Organizaciones",
        url: "https://www.inei.gob.pe",
        pasos: ["Buscar directorio de organizaciones sociales"],
      },
      {
        label: "Observación directa y entrevistas",
        url: "https://www.inei.gob.pe",
      },
    ],
  },
  e4: {
    subtitle: "Campo político: figuras públicas, partidos con fuerza real, tendencia del voto histórico y nivel de polarización.",
    tip: "Infogob es la fuente oficial para historial de autoridades y partidos. Completar con análisis propio.",
    fuentes: [
      {
        label: "Infogob — Observatorio para la Gobernabilidad",
        url: "https://infogob.jne.gob.pe",
        pasos: ["Buscar por departamento/provincia", "Ver autoridades y partidos"],
      },
      {
        label: "JNE — Portal de Información Electoral",
        url: "https://applications.jne.gob.pe/candidatos",
        pasos: ["Elegí el proceso electoral", "Filtrá por tu jurisdicción"],
      },
    ],
  },
  e5: {
    subtitle: "Cleavages y fracturas sociales vigentes en el territorio: fracturas que dividen al electorado.",
    tip: "Las fracturas pueden ser ideológicas, étnicas, económicas o geográficas. Son el mapa de riesgo del territorio.",
    fuentes: [
      {
        label: "Hemerotecas locales y regionales",
        url: "https://news.google.com",
        pasos: ["Buscar el nombre del territorio en Google News", "Filtrar por último año"],
      },
      {
        label: "Observación directa del consultor",
        url: "https://infogob.jne.gob.pe",
      },
    ],
  },
  // ── TERRENO — C (Conciencia) ──────────────────────────────────────────────
  c1: {
    subtitle: "Identidades y percepciones del electorado: con qué partido o figura se identifican y cómo perciben la política.",
    tip: "Complementá con encuestas de IEP o Ipsos. La identificación partidaria predice el voto habitual.",
    fuentes: [
      {
        label: "IEP — Instituto de Estudios Peruanos",
        url: "https://iep.org.pe/publicaciones/encuestas/",
        pasos: ["Buscar encuestas electorales recientes de tu región"],
      },
      {
        label: "Ipsos Perú — Estudios de Opinión",
        url: "https://www.ipsos.com/es-pe/",
        pasos: ["Ver sección de estudios de opinión pública"],
      },
    ],
  },
  c2: {
    subtitle: "Segmentos psicográficos del electorado: grupos con valores, aspiraciones, temores y problemas compartidos.",
    tip: "Cada segmento debe tener un nombre memorable. Usá los datos de encuestas y focus groups para validarlos.",
    fuentes: [
      {
        label: "Encuestas y estudios cualitativos",
        url: "https://iep.org.pe/publicaciones/encuestas/",
      },
      {
        label: "Focus groups y entrevistas locales",
        url: "https://www.ipsos.com/es-pe/",
      },
    ],
  },
  c3: {
    subtitle: "Memoria política del territorio: hitos electorales pasados, partidos desprestigiados y figuras recordadas.",
    tip: "Los hitos negativos (escándalos, promesas rotas) pesan mucho en el voto. Identificarlos es clave.",
    fuentes: [
      {
        label: "Infogob — Historial Electoral",
        url: "https://infogob.jne.gob.pe",
        pasos: ["Buscar historial de elecciones en tu jurisdicción"],
      },
      {
        label: "Hemerotecas y archivos periodísticos",
        url: "https://news.google.com",
      },
    ],
  },
  c4: {
    subtitle: "Issues prioritarios para el electorado: los problemas más mencionados y su importancia relativa.",
    tip: "Preguntá directamente a la gente qué les preocupa. Las encuestas abiertas dan los mejores resultados.",
    fuentes: [
      {
        label: "Encuestas locales y sondeos",
        url: "https://iep.org.pe/publicaciones/encuestas/",
        pasos: ["Buscar encuestas de opinión para tu región"],
      },
      {
        label: "Observación directa y sondeos del equipo",
        url: "https://www.ipsos.com/es-pe/",
      },
    ],
  },
  c5: {
    subtitle: "Ecosistema de medios y encuestas: periodistas influyentes, medios relevantes y encuestas disponibles.",
    tip: "Los medios locales tienen más influencia que los nacionales en elecciones subnacionales.",
    fuentes: [
      {
        label: "Observación directa del ecosistema mediático",
        url: "https://news.google.com",
        pasos: ["Buscar el territorio en Google News", "Identificar los medios que aparecen"],
      },
      {
        label: "Google News — Cobertura local",
        url: "https://news.google.com",
      },
    ],
  },
  // ── TERRENO — D (Decisión) ────────────────────────────────────────────────
  d1: {
    subtitle: "Universo electoral: padrón total y habilitado, votos válidos estimados y votos necesarios para ganar.",
    tip: "Con el padrón y el historial de abstención podés calcular cuántos votos reales necesitás. Es la aritmética base.",
    fuentes: [
      {
        label: "ONPE — Padrón Electoral",
        url: "https://www.onpe.gob.pe",
        pasos: ["Ir a 'Información Electoral'", "Seleccionar 'Padrón Electoral'", "Filtrar por tu distrito"],
      },
      {
        label: "JNE — Resultados Electorales",
        url: "https://resultados.onpe.gob.pe",
        pasos: ["Seleccionar la elección anterior", "Filtrar por tu jurisdicción", "Anotar votos emitidos y válidos"],
      },
    ],
  },
  d2: {
    subtitle: "Historial electoral de la jurisdicción: quién ganó, con cuántos votos y cómo quedó nuestro candidato.",
    tip: "El historial muestra la curva de tendencia. Si venís segundo, fijate cuánto se necesita para dar el salto.",
    fuentes: [
      {
        label: "ONPE — Resultados Electorales",
        url: "https://resultados.onpe.gob.pe",
        pasos: ["Seleccionar la elección municipal/regional", "Filtrar por tu distrito/provincia"],
      },
      {
        label: "Infogob — Historial de Elecciones",
        url: "https://infogob.jne.gob.pe",
        pasos: ["Ir a 'Elecciones'", "Buscar por jurisdicción"],
      },
    ],
  },
  d3: {
    subtitle: "Oferta política actual: candidatos inscritos, sus partidos, nivel de amenaza y fortalezas/debilidades.",
    tip: "Analizá cada rival con la misma objetividad que al candidato propio. El error más común es subestimarlos.",
    fuentes: [
      {
        label: "JNE — Candidatos Inscritos",
        url: "https://applications.jne.gob.pe/candidatos",
        pasos: ["Elegí el proceso electoral", "Filtrá por tu distrito"],
      },
      {
        label: "Prensa local y redes sociales de rivales",
        url: "https://news.google.com",
      },
    ],
  },
  d4: {
    subtitle: "Lógica del votante: cómo decide el electorado (habitual, racional, emotivo, presión social) y qué lo mueve.",
    tip: "La mayoría vota de forma habitual o emotiva. Identificar los catalizadores de cambio es el trabajo del consultor.",
    fuentes: [
      {
        label: "Encuestas y análisis del consultor",
        url: "https://iep.org.pe/publicaciones/encuestas/",
      },
    ],
  },
  d5: {
    subtitle: "Matriz de decisión: para cada segmento, a quién vota, por qué y qué mensaje puede cambiar su voto.",
    tip: "Este es el output más estratégico del ECD. Requiere que C2 y D4 estén bien completados.",
    fuentes: [
      {
        label: "Análisis interno del consultor (output del ECD)",
        url: "https://infogob.jne.gob.pe",
      },
    ],
  },
  // ── PERFIL — 5N ───────────────────────────────────────────────────────────
  n1: {
    subtitle: "Identidad del candidato: datos personales verificables, DNI, lugar de nacimiento y nacionalidad.",
    tip: "Verificá la exactitud del nombre en el DNI. Las diferencias con el JNE pueden generar problemas de inscripción.",
    fuentes: [
      {
        label: "RENIEC — Consulta de DNI",
        url: "https://www.reniec.gob.pe",
        pasos: ["Ir a 'Servicios en Línea'", "Consultar datos del candidato"],
      },
      {
        label: "Infogob — Hoja de vida del candidato",
        url: "https://infogob.jne.gob.pe",
        pasos: ["Buscar al candidato por nombre completo"],
      },
    ],
  },
  n2: {
    subtitle: "Trayectoria y vida personal: estudios, historial laboral, trayectoria política y posiciones públicas.",
    tip: "Verificá los títulos con SUNEDU. Un título falso es el error más costoso y más fácil de evitar.",
    fuentes: [
      {
        label: "SUNEDU — Verificación de Títulos y Grados",
        url: "https://enlinea.sunedu.gob.pe/validar-grado",
        pasos: ["Ingresar el número de DNI del candidato", "Verificar cada grado declarado"],
      },
      {
        label: "JNE — ROP Registro de Organizaciones Políticas",
        url: "https://declara.jne.gob.pe",
        pasos: ["Buscar al candidato por nombre completo"],
      },
      {
        label: "SUNAT — Ficha RUC",
        url: "https://ww1.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias",
        pasos: ["Buscar por número de DNI"],
      },
    ],
  },
  n3: {
    subtitle: "Riesgo legal y reputacional: antecedentes penales, policiales, fiscales, deudas y escándalos mediáticos.",
    tip: "Mejor encontrar los riesgos antes que los rivales. Cada riesgo encontrado es una vulnerabilidad que se puede preparar.",
    fuentes: [
      {
        label: "Poder Judicial — Consulta de Expedientes",
        url: "https://cej.pj.gob.pe/cej/forms/busquedaform.html",
        pasos: ["Buscar por nombre completo del candidato"],
      },
      {
        label: "INPE — Consulta de Situación Legal",
        url: "https://www.inpe.gob.pe",
      },
      {
        label: "REDAM — Registro de Deudores Alimentarios",
        url: "https://www.minjus.gob.pe/redam/",
        pasos: ["Buscar por nombre completo o DNI"],
      },
      {
        label: "IDL Reporteros y Ojo Público",
        url: "https://idlreporteros.pe",
      },
    ],
  },
  n4: {
    subtitle: "Solvencia y patrimonio: ingresos declarados, empresas, inmuebles, vehículos y origen de fondos.",
    tip: "La coherencia entre ingresos declarados y patrimonio visible es clave. Las inconsistencias son munición para rivales.",
    fuentes: [
      {
        label: "SUNAT — Consulta de Ficha RUC y Declaraciones",
        url: "https://ww1.sunat.gob.pe/cl-ti-itmrconsruc/jcrS00Alias",
      },
      {
        label: "SUNARP — Consulta de Propiedades",
        url: "https://www.sunarp.gob.pe",
        pasos: ["Ir a 'Consultas en Línea'", "Buscar por nombre del propietario"],
      },
      {
        label: "ICIJ — Offshore Leaks Database",
        url: "https://offshoreleaks.icij.org",
        pasos: ["Buscar el nombre completo del candidato"],
      },
    ],
  },
  n5: {
    subtitle: "Salud y capacidad funcional: condiciones médicas, salud mental, resistencia física y hábitos.",
    tip: "Esta información es sensible. Usar solo fuentes internas y con total confidencialidad.",
    fuentes: [
      {
        label: "Evaluación médica interna (confidencial)",
        url: "https://www.minsa.gob.pe",
      },
      {
        label: "Observación directa del equipo de campaña",
        url: "https://www.minsa.gob.pe",
      },
    ],
  },
  // ── PRESENCIA — PENTA-D ───────────────────────────────────────────────────
  pd0: {
    subtitle: "Configuración del universo competitivo: período de observación y candidatos a comparar en el PentaD.",
    tip: "Definí el período antes de empezar. La comparación pierde validez si los datos son de fechas distintas.",
    fuentes: [
      {
        label: "Facebook Ads Library",
        url: "https://www.facebook.com/ads/library",
        pasos: ["Seleccionar 'Anuncios sobre política'", "Buscar por nombre del candidato"],
      },
      {
        label: "TikTok Creative Center",
        url: "https://ads.tiktok.com/business/creativecenter",
      },
    ],
  },
  pd1: {
    subtitle: "Eje 1 — Presencia: existencia y calidad de perfiles activos en todas las plataformas relevantes.",
    tip: "Un perfil inactivo es peor que no tener perfil. Evaluá presencia real, no solo existencia.",
    fuentes: [
      {
        label: "Social Blade — Estadísticas de Redes",
        url: "https://socialblade.com",
        pasos: ["Buscar el usuario en cada red social"],
      },
      {
        label: "Facebook Ads Library",
        url: "https://www.facebook.com/ads/library",
      },
    ],
  },
  pd2: {
    subtitle: "Eje 2 — Desempeño: crecimiento, engagement, frecuencia, diversidad de formatos y alcance.",
    tip: "El engagement rate es más importante que los seguidores. Un 3% en política local es muy bueno.",
    fuentes: [
      {
        label: "Social Blade — Análisis de Crecimiento",
        url: "https://socialblade.com",
        pasos: ["Ver gráficos de crecimiento de seguidores por semana"],
      },
      {
        label: "Google Ads Transparency Center",
        url: "https://adstransparency.google.com",
      },
    ],
  },
  pd3: {
    subtitle: "Eje 3 — Inversión: anuncios pagados en Meta, TikTok y Google, calidad creativa y uso de influencers.",
    tip: "La Biblioteca de Anuncios de Meta muestra cuánto gasta el rival. Es inteligencia competitiva gratuita.",
    fuentes: [
      {
        label: "Facebook Ads Library — Transparencia en Anuncios",
        url: "https://www.facebook.com/ads/library",
        pasos: ["Ir a 'Transparencia de anuncios'", "Buscar el nombre del candidato rival"],
      },
      {
        label: "TikTok Creative Center — Ads",
        url: "https://ads.tiktok.com/business/creativecenter",
      },
      {
        label: "Google Ads Transparency Center",
        url: "https://adstransparency.google.com",
      },
    ],
  },
  pd4: {
    subtitle: "Eje 4 — Reputación: sentimiento de comentarios, menciones espontáneas, manejo de crisis y fake news.",
    tip: "El sentiment analysis manual (leer 50 comentarios al azar) da más contexto que las herramientas automáticas.",
    fuentes: [
      {
        label: "Google News — Menciones del candidato",
        url: "https://news.google.com",
        pasos: ["Buscar el nombre completo del candidato", "Filtrar por fecha reciente"],
      },
      {
        label: "Social Blade — Estadísticas de canal",
        url: "https://socialblade.com",
      },
    ],
  },
  pd5: {
    subtitle: "Eje 5 — Operativa: equipo digital, tiempo de respuesta, producción audiovisual y sistematización.",
    tip: "Un equipo digital de 3 personas bien organizadas supera a 10 personas sin coordinación.",
    fuentes: [
      {
        label: "Facebook Ads Library — Actividad reciente",
        url: "https://www.facebook.com/ads/library",
        pasos: ["Ver fechas de últimos anuncios activos del candidato"],
      },
      {
        label: "Observación directa de perfiles",
        url: "https://socialblade.com",
      },
    ],
  },
};
