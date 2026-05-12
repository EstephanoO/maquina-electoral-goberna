/**
 * Dashboard shared types + helpers.
 */
import type { MaterialIcons } from '@expo/vector-icons';

export type FormStatus = 'synced' | 'pending' | 'syncing' | 'failed' | 'rejected' | 'ghost';

export interface StatusConfig {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  description: string;
  bgColor: string;
  fgColor: string;
  badgeBg: string;
  iconBg: string;
  tappable: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export const STATUS_MAP: Record<FormStatus, StatusConfig> = {
  synced: {
    icon: 'cloud-done',
    label: 'Sincronizado',
    description: 'Registro guardado en el servidor.',
    bgColor: '#ffffff',
    fgColor: '#16a34a',
    badgeBg: '#dcfce7',
    iconBg: '#f0fdf4',
    tappable: true,
    canEdit: false,
    canDelete: false,
  },
  pending: {
    icon: 'cloud-upload',
    label: 'Pendiente',
    description: 'Esperando conexion para sincronizar.',
    bgColor: '#ffffff',
    fgColor: '#d97706',
    badgeBg: '#fef3c7',
    iconBg: '#fffbeb',
    tappable: false,
    canEdit: false,
    canDelete: false,
  },
  syncing: {
    icon: 'cloud-upload',
    label: 'Sincronizando',
    description: 'Enviando al servidor...',
    bgColor: '#ffffff',
    fgColor: '#d97706',
    badgeBg: '#fef3c7',
    iconBg: '#fffbeb',
    tappable: false,
    canEdit: false,
    canDelete: false,
  },
  ghost: {
    icon: 'sync-problem',
    label: 'Reintentando',
    description: 'El servidor no confirmo este registro. Se reintentara automaticamente.',
    bgColor: '#fff7ed',
    fgColor: '#c2410c',
    badgeBg: '#ffedd5',
    iconBg: '#fed7aa',
    tappable: true,
    canEdit: false,
    canDelete: true,
  },
  failed: {
    icon: 'error-outline',
    label: 'Error',
    description: 'No se pudo sincronizar con el servidor.',
    bgColor: '#fef2f2',
    fgColor: '#dc2626',
    badgeBg: '#fee2e2',
    iconBg: '#fecaca',
    tappable: true,
    canEdit: true,
    canDelete: true,
  },
  rejected: {
    icon: 'cancel',
    label: 'Rechazado',
    description: 'El servidor no acepto este registro.',
    bgColor: '#fef2f2',
    fgColor: '#dc2626',
    badgeBg: '#fee2e2',
    iconBg: '#fecaca',
    tappable: true,
    canEdit: true,
    canDelete: true,
  },
};

export interface LocalFormData {
  nombre?: string;
  telefono?: string;
  fecha?: string;
}

export function buildValidationWaLink(
  telefono: string,
  agentName: string,
  candidateName: string,
  waTarget: string,
): string {
  const firstName = agentName.split(' ')[0] ?? agentName;
  const rawPhone = telefono.replace(/\D/g, '');
  const contactNum = rawPhone.length === 9 ? '51' + rawPhone : rawPhone;
  const msg = encodeURIComponent(
    `Hola, soy ${firstName} de la campaña de ${candidateName}. ` +
      `Por favor comunícate al número de campaña: ${waTarget} para más información. ¡Gracias!`,
  );
  return `https://wa.me/${contactNum}?text=${msg}`;
}
