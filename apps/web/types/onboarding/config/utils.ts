import { 
  CampaignStrategy, 
  PoliticalLevel, 
  CampaignType,
  CAMPAIGN_STRATEGIES,
  POLITICAL_LEVELS,
  CAMPAIGN_TYPES 
} from '@/types/onboarding/core/constants';
import { validateCampaignStrategy, validatePoliticalLevel } from '@/types/onboarding/core/schemas';
import { OnboardingOption } from '@/types/onboarding/interfaces/options';
import { DragDropConfig } from '@/types/onboarding/interfaces/ui';

// Utility functions for type validation and transformation

export const isValidCampaignStrategy = (value: unknown): value is CampaignStrategy => {
  return typeof value === 'string' && CAMPAIGN_STRATEGIES.includes(value as CampaignStrategy);
};

export const isValidPoliticalLevel = (value: unknown): value is PoliticalLevel => {
  return typeof value === 'string' && POLITICAL_LEVELS.includes(value as PoliticalLevel);
};

export const isValidCampaignType = (value: unknown): value is CampaignType => {
  return typeof value === 'string' && CAMPAIGN_TYPES.includes(value as CampaignType);
};

// Transform legacy values to current schema
export const transformLegacyPoliticalLevel = (level: string): PoliticalLevel => {
  switch (level) {
    case 'LOCAL':
      return 'GOBIERNO_LOCAL';
    case 'GOBIERNO_LOCAL':
    case 'PARLAMENTARIO':
    case 'PRESIDENCIAL':
      return level as PoliticalLevel;
    default:
      return 'PRESIDENCIAL';
  }
};

// Extract strategy combinations from string representations
export const parseStrategyCombination = (combination: string): CampaignStrategy[] => {
  if (!combination) return [];
  
  if (combination === 'MIXTO') {
    return ['RACIONAL', 'EMOTIVA', 'INSTINTIVA'];
  }
  
  if (combination.includes('+')) {
    const parts = combination.split('+').map(s => s.trim());
    return parts.reduce<CampaignStrategy[]>((acc, part) => {
      const strategy = validateCampaignStrategy(part);
      if (strategy && !acc.includes(strategy)) {
        acc.push(strategy);
      }
      return acc;
    }, []);
  }
  
  const strategy = validateCampaignStrategy(combination);
  return strategy ? [strategy] : [];
};

// Generate strategy combination string
export const generateStrategyCombination = (strategies: CampaignStrategy[]): string => {
  if (strategies.length === 0) return '';
  if (strategies.length === 1) return strategies[0] || '';
  if (strategies.length === 3 && 
      strategies.includes('RACIONAL') && 
      strategies.includes('EMOTIVA') && 
      strategies.includes('INSTINTIVA')) {
    return 'MIXTO';
  }
  return strategies.join(' + ');
};

// Type guards for runtime validation
export const isStrategyArray = (value: unknown): value is CampaignStrategy[] => {
  return Array.isArray(value) && value.every(isValidCampaignStrategy);
};

export const isStrategyOrArray = (value: unknown): value is CampaignStrategy | CampaignStrategy[] => {
  return isValidCampaignStrategy(value) || isStrategyArray(value);
};

// Priority comparison utility
export const comparePriority = (a: 'high' | 'medium' | 'low', b: 'high' | 'medium' | 'low'): number => {
  const priorityOrder = { high: 3, medium: 2, low: 1 };
  return priorityOrder[b] - priorityOrder[a];
};

// Strategy sub-options utility
export function getStrategySubOptions(strategy: CampaignStrategy): OnboardingOption[] {
  switch (strategy) {
    case "RACIONAL":
      return [
        {
          value: "plan_gobierno",
          label: "Plan de gobierno",
          description: "Propuestas técnicas y planes detallados",
          icon: "briefcase",
          detailedDescription:
            "Desarrollo de propuestas concretas, cifras y planes de ejecución técnica para la gestión gubernamental.",
        },
        {
          value: "equipo_tecnico",
          label: "Equipo técnico",
          description: "Expertos y especialistas del área",
          icon: "users-round",
          detailedDescription:
            "Conformación de equipos de expertos técnicos que validen y respalden las propuestas del candidato.",
        },
      ];

    case "EMOTIVA":
      return [
        {
          value: "esperanza",
          label: "Esperanza",
          description: "Narrativas de futuro positivo",
          icon: "sun",
          detailedDescription:
            "Comunicación centrada en generar optimismo y visión de un mejor futuro para la sociedad.",
        },
        {
          value: "amor",
          label: "Amor",
          description: "Conexión emocional y afectiva",
          icon: "heart",
          detailedDescription:
            "Estrategias que buscan generar vínculos emocionales profundos y sentido de pertenencia.",
        },
      ];

    case "INSTINTIVA":
      return [
        {
          value: "odio",
          label: "Odio",
          description: "Identificación del enemigo común",
          icon: "alert-triangle",
          detailedDescription:
            "Estrategias basadas en la confrontación directa con adversarios y críticas al sistema establecido.",
        },
        {
          value: "miedo",
          label: "Miedo",
          description: "Percepción de amenaza y defensa",
          icon: "shield-alert",
          detailedDescription:
            "Comunicación que genera sensación de riesgo y necesidad de protección contra amenazas reales o percibidas.",
        },
      ];

    case "MIXTO":
      return [
        {
          value: "esperanza",
          label: "Esperanza",
          description: "Narrativas de futuro positivo",
          icon: "sun",
          detailedDescription:
            "Comunicación centrada en generar optimismo y visión de un mejor futuro para la sociedad.",
        },
        {
          value: "amor",
          label: "Amor",
          description: "Conexión emocional y afectiva",
          icon: "heart",
          detailedDescription:
            "Estrategias que buscan generar vínculos emocionales profundos y sentido de pertenencia.",
        },
      ];

    default:
      return [];
  }
}

export function getFrontOptionsByStrategy(
  strategy: CampaignStrategy,
  campaignType: CampaignType,
): OnboardingOption[] {
  if (strategy === "RACIONAL") {
    return [
      {
        value: "mar",
        label: "Mar Institucional",
        description: "Datos, análisis y gestión técnica",
        icon: "droplet",
        detailedDescription:
          "Análisis de datos, encuestas y gestión de información para decisiones basadas en evidencia.",
      },
      {
        value: "tierra",
        label: "Tierra Institucional",
        description: "Estructura organizativa formal y territorial",
        icon: "footprints",
        detailedDescription:
          "Organización territorial con estructura formal y presencia institucional.",
      },
    ];
  }

  if (strategy === "EMOTIVA") {
    return [
      {
        value: "aire",
        label: "Aire Emotiva",
        description: "Radio y TV con mensaje inspirador",
        icon: "cloud",
        detailedDescription:
          "Medios tradicionales con narrativas emocionales que conecten con aspiraciones ciudadanas.",
      },
      {
        value: "mar",
        label: "Mar Emotiva",
        description: "Redes sociales y contenido digital emotivo",
        icon: "waves",
        detailedDescription:
          "Contenido digital diseñado para generar conexión emocional y viralidad positiva.",
      },
      {
        value: "tierra",
        label: "Tierra Emotiva",
        description: "Presencia física con conexión personal",
        icon: "footprints",
        detailedDescription:
          "Actividades territoriales centradas en el contacto directo humano.",
      },
    ];
  }

  if (strategy === "INSTINTIVA") {
    return [
      {
        value: "aire",
        label: "Aire Instintivo",
        description: "Medios con mensaje de defensa",
        icon: "alert-circle",
        detailedDescription:
          "Comunicación estratégica basada en identificación de amenazas y construcción de narrativas protectoras.",
      },
      {
        value: "mar",
        label: "Mar Instintivo",
        description: "Identificación del enemigo y movilización",
        icon: "shield",
        detailedDescription:
          "Estrategia digital centrada en exponer adversarios y generar movimiento defensivo.",
      },
      {
        value: "tierra",
        label: "Tierra Instintiva",
        description: "Defensa territorial y organización comunitaria",
        icon: "users",
        detailedDescription:
          "Organización territorial para defensa del voto y protección de comunidades.",
      },
    ];
  }

  if (strategy === "MIXTO") {
    return [
      {
        value: "aire",
        label: "Aire Mixto",
        description: "Medios tradicionales balanceados",
        icon: "cloud",
        detailedDescription:
          "Presencia completa en medios tradicionales con enfoque equilibrado entre información y emoción.",
      },
      {
        value: "mar",
        label: "Mar Mixto",
        description: "Presencia digital completa",
        icon: "waves",
        detailedDescription:
          "Estrategia digital integral combinando comunicación, organización y movilización.",
      },
      {
        value: "tierra",
        label: "Tierra Mixta",
        description: "Presencia territorial organizada",
        icon: "footprints",
        detailedDescription:
          "Organización territorial completa con estructura y actividades coordinadas.",
      },
    ];
  }

  return [
    {
      value: "aire",
      label: "Aire",
      description: "Radio y TV - medios de comunicación tradicional",
      icon: "cloud",
    },
    {
      value: "mar",
      label: "Mar",
      description: "Web, redes sociales y análisis de datos",
      icon: "waves",
    },
    {
      value: "tierra",
      label: "Tierra",
      description: "Cartografía, territorio y presencia física",
      icon: "footprints",
    },
    {
      value: "gestion",
      label: "Gestión",
      description: "Coordinación y logística de campaña",
      icon: "bar-chart",
    },
  ];
}

export function getRoleOptionsByLevel(level: PoliticalLevel): OnboardingOption[] {
  switch (level) {
    case "GOBIERNO_LOCAL":
      return [
        {
          value: "gobernador_regional",
          label: "Gobernador Regional",
          description: "Autoridad ejecutiva a nivel regional",
          icon: "map",
        },
        {
          value: "alcalde_provincial",
          label: "Alcalde Provincial",
          description: "Autoridad municipal provincial",
          icon: "building",
        },
        {
          value: "alcalde_distrital",
          label: "Alcalde Distrital",
          description: "Autoridad municipal distrital",
          icon: "home",
        },
      ];

    case "PARLAMENTARIO":
      return [
        {
          value: "senador_nacional",
          label: "Senador Nacional",
          description: "Senador de la República",
          icon: "landmark",
        },
        {
          value: "senador_regional",
          label: "Senador Regional",
          description: "Senador por circunscripción departamental",
          icon: "layers",
        },
        {
          value: "diputado",
          label: "Diputado",
          description: "Miembro de la Cámara de Diputados",
          icon: "users",
        },
        {
          value: "parlamento_andino",
          label: "Parlamento Andino",
          description: "Representante ante Parlamento Andino",
          icon: "globe",
        },
      ];

    case "PRESIDENCIAL":
      return [
        {
          value: "presidente",
          label: "Presidente",
          description: "Presidente de la República del Perú",
          icon: "crown",
        },
      ];

    default:
      return [
        {
          value: "alcalde_distrital",
          label: "Alcalde Distrital",
          description: "Gobierno municipal local",
          icon: "building",
        },
        {
          value: "diputado",
          label: "Diputado",
          description: "Poder legislativo nacional",
          icon: "users",
        },
        {
          value: "presidente",
          label: "Presidente",
          description: "Liderazgo ejecutivo nacional",
          icon: "crown",
        },
      ];
  }
}

export function getDragDropConfigByStrategies(
  strategies: (CampaignStrategy | string)[],
): DragDropConfig {
  const normalized = normalizeStrategies(strategies);

  console.log("Normalized strategies:", normalized);

  return {
    campaignTypes: {
      OFICIAL: { movable: normalized },
      NO_OFICIAL: { movable: normalized },
    },
    rules: {
      allowBothCampaigns: true,
      requireAtLeastOne: true,
    },
  };
}

export function getStrategyDragDropConfig(
  strategies: (CampaignStrategy | string)[],
): DragDropConfig {
  const normalized = normalizeStrategies(strategies);

  console.log("getStrategyDragDropConfig normalized:", normalized);

  return {
    campaignTypes: {
      OFICIAL: { movable: normalized },
      NO_OFICIAL: { movable: normalized },
    },
    rules: {
      allowBothCampaigns: true,
      requireAtLeastOne: true,
    },
  };
}

export function normalizeStrategies(
  strategies: (CampaignStrategy | string)[],
): CampaignStrategy[] {
  const result: CampaignStrategy[] = [];

  for (const strategy of strategies) {
    if (typeof strategy === "string" && strategy.includes("+")) {
      const parts = strategy
        .split("+")
        .map((s) => s.trim()) as CampaignStrategy[];
      result.push(...parts);
    } else if (strategy === "MIXTO") {
      result.push("RACIONAL", "EMOTIVA", "INSTINTIVA");
    } else {
      result.push(strategy as CampaignStrategy);
    }
  }

  return Array.from(new Set(result));
}