import {
  Crown,
  Users,
  MapPin,
  Brain,
  Heart,
  Zap,
  Layers,
  Tv,
  Waves,
  UsersRound,
  Network,
  UserCheck,
  Shield,
  RotateCcw,
  Building2,
  Flag,
  Building,
  Briefcase,
  Frown,
  Database,
  MapPinOff,
  BarChart2,
  Cloud,
  Droplet,
  Footprints,
  Gauge,
  Landmark,
  Globe,
  Star,
  AlertCircle,
  Sun,
  AlertTriangle,
  ShieldAlert,
  Target,
  Calendar,
  TrendingUp,
  FileText,
  Home,
  Map as MapIcon,
  Megaphone,
  Radio,
  Laptop,
  Smartphone,
  Settings,
  LucideIcon,
} from "lucide-react";
import type { FrontType, CampaignStrategy } from "@/types/onboarding";

const iconMap: Record<string, LucideIcon> = {
  // Original icons
  crown: Crown,
  users: Users,
  "map-pin": MapPin,
  brain: Brain,
  heart: Heart,
  zap: Zap,
  layers: Layers,
  tv: Tv,
  waves: Waves,
  "users-round": UsersRound,
  network: Network,
  
  // New icons for onboarding
  "user-check": UserCheck,
  shield: Shield,
  "rotate-ccw": RotateCcw,
  "building-2": Building2,
  flag: Flag,
  building: Building,
  briefcase: Briefcase,
  frown: Frown,
  database: Database,
  "map-pin-off": MapPinOff,
  "bar-chart-2": BarChart2,
  cloud: Cloud,
  droplet: Droplet,
  footprints: Footprints,
  gauge: Gauge,
  landmark: Landmark,
  globe: Globe,
  star: Star,
  "alert-circle": AlertCircle,
  
  // Additional icons for strategy sub-options
  sun: Sun,
  "alert-triangle": AlertTriangle,
  "shield-alert": ShieldAlert,
  "file-text": Briefcase,
  
  // Contextual action icons
  target: Target,
  calendar: Calendar,
  "trending-up": TrendingUp,
  megaphone: Megaphone,
  radio: Radio,
  laptop: Laptop,
  smartphone: Smartphone,
  settings: Settings,
  home: Home,
  map: MapIcon,
  
  circle: AlertCircle, // Fallback for unknown icons
};

export function getIcon(iconName?: string): LucideIcon | null {
  if (!iconName) return null;
  return iconMap[iconName] || iconMap["circle"] || AlertCircle;
}

// Centralized front information with context-appropriate icons
export const getFrontInfo = (front: FrontType) => {
  const frontMap = {
    aire: { label: "Aire", description: "Radio y TV - Medios tradicionales", icon: "tv" },
    mar: { label: "Mar", description: "Digital y redes sociales", icon: "network" },
    tierra: { label: "Tierra", description: "Territorio y presencia física", icon: "map-pin" },
    gestion: { label: "Gestión", description: "Logística y operación", icon: "database" }
  };
  return frontMap[front] || { label: front, description: "", icon: "alert-circle" };
};

// Political level icons with contextual meaning
export const getPoliticalLevelInfo = (level: string) => {
  const levelMap: Record<string, { label: string; description: string; icon: string }> = {
    "PRESIDENCIAL": { label: "Presidencial", description: "Nivel nacional", icon: "crown" },
    "PARLAMENTARIO": { label: "Parlamentario", description: "Poder legislativo", icon: "users" },
    "GOBIERNO_LOCAL": { label: "Gobierno Local", description: "Nivel municipal", icon: "building" }
  };
  return levelMap[level] || { label: level, description: "", icon: "alert-circle" };
};

// Role icons with contextual meaning
export const getRoleInfo = (role: string) => {
  const roleMap: Record<string, { label: string; description: string; icon: string }> = {
    "presidente": { label: "Presidente", description: "Jefe de estado", icon: "crown" },
    "alcalde": { label: "Alcalde", description: "Autoridad municipal", icon: "building-2" },
    "congresista": { label: "Congresista", description: "Legislador nacional", icon: "users" },
    "senador": { label: "Senador", description: "Senador de la República", icon: "landmark" }
  };
  return roleMap[role] || { label: role, description: "", icon: "user-check" };
};

// Centralized strategy information with contextual icons
export const getStrategyInfo = (strategy: CampaignStrategy) => {
  const strategyMap = {
    RACIONAL: { 
      label: "Racional", 
      description: "Plan de gobierno, equipo técnico",
      details: ["Gobernabilidad demostrada", "Credibilidad técnica", "Equipo especializado"],
      icon: "shield",
      color: "blue"
    },
    EMOTIVA: { 
      label: "Emotiva", 
      description: "Esperanza, amor",
      details: ["Conexión emocional", "Narrativas inspiradoras", "Movilización efectiva"],
      icon: "heart",
      color: "pink"
    },
    INSTINTIVA: { 
      label: "Instintiva", 
      description: "Odio y miedo",
      details: ["Movilización por miedo", "Identificación enemigo", "Mensaje protector"],
      icon: "shield-alert",
      color: "red"
    },
    TRES_FRENTES: {
      label: "Tres Frentes",
      description: "Presencia integral",
      details: ["Cobertura total", "Coordinación multidimensional", "Estrategia integrada"],
      icon: "layers",
      color: "amber"
    },
    MIXTO: {
      label: "Mixto",
      description: "Combinación integral",
      details: ["Cobertura total", "Sinergia estratégica", "Presencia masiva"],
      icon: "layers",
      color: "purple"
    }
  };
  return strategyMap[strategy] || { label: strategy, description: "", details: [], icon: "alert-circle", color: "gray" };
};

// Campaign type utilities with contextual icons
export const getCampaignTypeLabel = (campaignType: "OFICIAL" | "NO_OFICIAL") => {
  return campaignType === "OFICIAL" ? "Oficial" : "No Oficial";
};

export const getCampaignTypeColor = (campaignType: "OFICIAL" | "NO_OFICIAL") => {
  return campaignType === "OFICIAL" ? "blue" : "green";
};

export const getCampaignTypeInfo = (campaignType: "OFICIAL" | "NO_OFICIAL") => {
  return campaignType === "OFICIAL" 
    ? { label: "Campaña Oficial", description: "Partido político oficial", icon: "flag" }
    : { label: "Campaña No Oficial", description: "Movimiento independiente", icon: "users" };
};
