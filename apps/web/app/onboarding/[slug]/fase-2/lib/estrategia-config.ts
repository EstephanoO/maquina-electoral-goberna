export const JORGE_VALDEZ_ESTRATEGIA = {
  candidato: {
    nombre: "Jorge Valdez Oyola",
    partido: "A.N.T.A.U.R.O",
    cargo: "Candidato a Alcalde · Santiago de Surco",
    profesion: "Abogado · Sociólogo",
    foto: "/candidatos/jorge-valdez/foto-profesional.jpg",
    fotoCasual: "/candidatos/jorge-valdez/foto-casual.jpg",
    bio: {
      nacimiento: { year: 1971, lugar: "Casma, Áncash" },
      formacion: [
        { inst: "Univ. Nac. Mayor de San Marcos", titulo: "Lic. en Sociología",        color: "#3b82f6" },
        { inst: "Univ. Inca Garcilaso de la Vega", titulo: "Abogado · CAL N°48577",   color: "#3b82f6" },
        { inst: "Institución privada",              titulo: "Máster en Gerencia Pública", color: "#8b5cf6" },
      ],
      carrera: [
        { year: 2002, cargo: "Regidor Provincial Lima",          elegido: true  },
        { year: 2010, cargo: "Regidor Distrital Santiago Surco", elegido: true  },
        { year: 2018, cargo: "Regidor Provincial Lima",          elegido: true  },
        { year: 2026, cargo: "Candidato Alcalde Surco",          elegido: false },
      ],
    },
  },
  padron: {
    total: 353867,
    poblacion_inei_2025: 378000,
    validos_estimados: 280000,
    meta_votos: 72000,
    abstenciones_pct: 18,
    blanco_nulo_pct: 3.5,
  },
  encuesta: {
    fuente: "encuestas.com.pe",
    fecha: "Abril 2026",
    tipo: "online · n=514 · referencial",
    candidatos: [
      { nombre: "David Vera Trujillo", partido: "PPC",               pct: 31.52, color: "#3b82f6" },
      { nombre: "Roberto Gómez Baca",  partido: "Avanza País",       pct: 13.81, color: "#f97316" },
      { nombre: "Narváez",             partido: "Acción Popular",     pct: 12.84, color: "#eab308" },
      { nombre: "Juan Palma Aurazo",   partido: "Renovación Popular", pct: 11.67, color: "#a78bfa" },
      { nombre: "Toledo",              partido: "Somos Perú",         pct: 7.59,  color: "#64748b" },
      { nombre: "Gálvez",              partido: "Varios",             pct: 5.84,  color: "#64748b" },
    ],
  },
  diagnostico: {
    critico: [
      { label: "jorgevaldez.com",     detalle: "Dominio caído · sin web de campaña",          icono: "Globe"       },
      { label: "S/0 en Meta Ads",     detalle: "Sin pauta activa · competidores invierten",   icono: "DollarSign"  },
      { label: "5,800 seguidores FB", detalle: "Gómez Baca tiene 29,000 · brecha 5×",         icono: "Users"       },
      { label: "Sin equipo digital",  detalle: "Gestión personal · sin CM · sin producción",  icono: "Zap"         },
    ],
    activo: {
      label: "Exitosa 1.22M subs",
      detalle: "Show semanal propio 'Exitosa Te Escucha' · activo único entre todos los candidatos",
      icono: "Radio",
    },
    pentad: { valdez: 3.4, vera: 2.4, gomez: 4.0 },
  },
  issues: [
    { tema: "Seguridad ciudadana",    pct: 75, color: "#ef4444" },
    { tema: "Tráfico y movilidad",    pct: 55, color: "#f97316" },
    { tema: "Limpieza / residuos",    pct: 40, color: "#eab308" },
    { tema: "Parques y áreas verdes", pct: 35, color: "#22c55e" },
    { tema: "Obras / infraestructura",pct: 30, color: "#22c55e" },
    { tema: "Animalismo / fauna",     pct: 20, color: "#10b981" },
  ],
  segmentos: [
    { nombre: "Familias NSE A/B",      pct: 35, color: "#3b82f6", problema: "Seguridad · limpieza · valor de propiedad", medio: "WhatsApp JV · Facebook · TV cable" },
    { nombre: "Jóvenes profesionales", pct: 25, color: "#8b5cf6", problema: "Tráfico · medioambiente · gestión moderna",  medio: "Instagram · TikTok · Podcast"      },
    { nombre: "Adultos mayores",       pct: 20, color: "#f59e0b", problema: "Seguridad · salud · parques",                medio: "TV · WhatsApp · radio · reuniones" },
    { nombre: "Comerciantes",          pct: 12, color: "#06b6d4", problema: "Licencias · ambulantes · extorsión",         medio: "WhatsApp · reuniones Cámara"       },
    { nombre: "Animalistas",           pct: 8,  color: "#10b981", problema: "Fauna callejera · CAS · ciclovías",          medio: "Instagram · grupos FB animalistas" },
  ],
  oportunidad: {
    bruce_pct: 39.98,
    bruce_eleccion: 2022,
    minimo_ganador_historico: 25.78,
    anio_referencia: 2018,
    competidores_debilidades: [
      { nombre: "Gómez Baca", debilidad: "Investigado lavado de activos 2013-2015"       },
      { nombre: "David Vera",  debilidad: "Sin gestión propia · PPC en declive nacional"  },
      { nombre: "Palma (RP)", debilidad: "Depende de López Aliaga · Vía Expresa cuestionada" },
    ],
  },
  estrategia: {
    pasos: [
      {
        num: 1,
        titulo: "Consolidar la base propia",
        descripcion: "Animalistas 8% + ecologistas — nicho sin competencia real en Surco. Activar con propuesta concreta: CAS municipal, ciclovías, 100+ parques.",
        segmento: "Animalistas · ecologistas",
        color: "#fbbf24",
      },
      {
        num: 2,
        titulo: "Captar el voto de Bruce",
        descripcion: "Familias NSE A/B conservadoras (35%) con propuesta sólida en seguridad. Bruce se va → su 39.98% busca sucesor. Mensaje: gestión, orden, experiencia.",
        segmento: "Familias NSE A/B · conservadores",
        color: "#f97316",
      },
      {
        num: 3,
        titulo: "Persuadir indecisos jóvenes",
        descripcion: "Jóvenes profesionales 25% valoran modernidad, transparencia y gestión digital. Show Exitosa es la plataforma. Propuesta: tráfico, ciclovías, gobierno abierto.",
        segmento: "Jóvenes 25-44",
        color: "#22c55e",
      },
    ],
  },
  herramientas: [
    {
      nombre: "Social Listening",
      descripcion: "Monitoreo en tiempo real de conversaciones sobre seguridad, tráfico y animalismo en Santiago de Surco. Detecta narrativas, influencers y ataques digitales.",
      imagen: "/candidatos/jorge-valdez/tools/social-listening.jpg",
      color: "#3b82f6",
      badge: "Monitoreo en tiempo real",
    },
    {
      nombre: "CRM Territorial",
      descripcion: "Gestión de contactos por zona: Monterrico, Los Cóndores, La Aurora, Pancho Fierro. Clasifica voto duro, blando y flotante. Coordina equipo en campo.",
      imagen: "/candidatos/jorge-valdez/tools/crm.jpg",
      color: "#8b5cf6",
      badge: "Gestión de voto",
    },
    {
      nombre: "Plataforma Territorio",
      descripcion: "Mapeo de 100+ juntas vecinales, agentes y activistas por área. Visualiza densidad de contactos, zonas calientes y cobertura territorial en tiempo real.",
      imagen: "/candidatos/jorge-valdez/tools/territorio.jpg",
      color: "#10b981",
      badge: "Cobertura territorial",
    },
  ],
  warRoom: {
    items: [
      "Diseño e implementación del War Room",
      "Estructura territorial de campaña · 100+ juntas vecinales",
      "Formación del equipo de operadores",
      "Monitoreo digital 24/7 · Social Listening",
      "Pautas Meta — captación, persuasión, conversión",
      "CRM de contactos por zona · gestión de voto",
      "Protocolos y flujos de operación de campaña",
      "Coordinación estratégica y entrenamiento semanal",
    ],
  },
} as const;

export type EstrategiaConfig = typeof JORGE_VALDEZ_ESTRATEGIA;
