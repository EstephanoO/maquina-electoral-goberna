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
  candidato: {
    subtitle: "Datos personales del candidato. Nombre, foto, partido y cargo.",
  },
  postulacion: {
    subtitle: "Datos del proceso electoral. Necesitás el padrón y el número de candidatos.",
    fuentes: [
      {
        label: "ONPE — Padrón Electoral",
        url:   "https://www.onpe.gob.pe",
        pasos: ["Ir a 'Información Electoral'", "Seleccionar 'Padrón Electoral'", "Filtrar por departamento y provincia"],
      },
      {
        label: "JNE — Candidatos Inscritos",
        url:   "https://applications.jne.gob.pe/candidatos",
        pasos: ["Elegí el proceso electoral", "Filtrá por tu distrito"],
      },
    ],
  },
  estrategia: {
    subtitle: "Definiciones estratégicas de la campaña. El candidato y vos ya las conocen.",
  },
  diagnostico_inicial: {
    subtitle: "FODA y competidores principales. Análisis honesto del escenario.",
  },
  propuestas: {
    subtitle: "Las propuestas principales del candidato. Entre 3 y 6, ordenadas por importancia.",
  },
  branding: {
    subtitle: "Identidad de campaña: el slogan y los colores que identifican al candidato.",
  },
  contexto_territorio: {
    subtitle: "Datos básicos del territorio donde se postula.",
    fuentes: [
      {
        label: "INEI — Estadísticas de Población",
        url:   "https://www.inei.gob.pe/estadisticas/indice-tematico/poblacion-y-vivienda/",
      },
    ],
  },
  quien_es: {
    subtitle: "Trayectoria, valores y bio del candidato. La historia que conecta con el electorado.",
  },
  presencia: {
    subtitle: "Estado de la presencia digital del candidato en buscadores y redes.",
    tip: "Buscá el nombre completo del candidato en Google y revisá cada perfil social.",
  },
  debilidades: {
    subtitle: "Vulnerabilidades y riesgos del candidato. Mejor identificarlos antes que los rivales.",
    fuentes: [
      {
        label: "JNE — Hoja de Vida del candidato",
        url:   "https://declara.jne.gob.pe",
        pasos: ["Buscá al candidato por nombre completo"],
      },
    ],
  },
  votos: {
    subtitle: "Aritmética electoral: cuántos votos se necesitan para ganar.",
    fuentes: [
      {
        label: "ONPE — Resultados Electorales anteriores",
        url:   "https://resultados.onpe.gob.pe",
        pasos: ["Seleccioná la elección municipal/regional anterior", "Filtrá por tu distrito"],
      },
    ],
  },
  segmentos: {
    subtitle: "Segmentación del electorado: a quién le habla el candidato y qué le preocupa.",
  },
  recorrido: {
    subtitle: "Hitos de campaña y distribución de esfuerzo (fórmula Tierra / Mar / Aire).",
  },
};
