/**
 * OptionsMenu — Modal con switcher de campaña + logout.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { memo } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily } from '@/constants/theme';
import type { CampaignMembership } from '@/lib/types';

interface OptionsMenuProps {
  visible: boolean;
  onClose: () => void;
  onLogout: () => void;
  onSwitchCampaign: (campaignId: string) => void;
  campaigns: CampaignMembership[];
  activeCampaignId: string;
  isAdmin: boolean;
  isConsultor: boolean;
  primaryColor: string;
}

export const OptionsMenu = memo(function OptionsMenu({
  visible,
  onClose,
  onLogout,
  onSwitchCampaign,
  campaigns,
  activeCampaignId,
  isAdmin,
  isConsultor,
  primaryColor,
}: OptionsMenuProps) {
  const showCampaignSwitcher = isAdmin || isConsultor || campaigns.length > 1;

  const handleLogout = () => {
    Alert.alert(
      'Cerrar Sesión',
      '¿Estás seguro que deseas cerrar sesión?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Cerrar Sesión', style: 'destructive', onPress: onLogout },
      ],
    );
  };

  const switcherLabel = isAdmin
    ? 'Cambiar Candidato (Admin)'
    : isConsultor
      ? 'Cambiar Candidato (Consultor)'
      : 'Cambiar Candidato';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: primaryColor }]}>Opciones</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <MaterialIcons name="close" size={20} color="#94a3b8" />
            </Pressable>
          </View>

          {showCampaignSwitcher && (
            <>
              <Text style={styles.sectionLabel}>{switcherLabel}</Text>
              <View style={styles.campaignList}>
                {campaigns.map((c) => (
                  <Pressable
                    key={c.id}
                    style={[
                      styles.campaignItem,
                      c.id === activeCampaignId && { backgroundColor: `${primaryColor}15` },
                    ]}
                    onPress={() => {
                      if (c.id !== activeCampaignId) {
                        onSwitchCampaign(c.id);
                        onClose();
                      }
                    }}
                  >
                    <View
                      style={[
                        styles.campaignIndicator,
                        { backgroundColor: c.id === activeCampaignId ? primaryColor : '#e2e8f0' },
                      ]}
                    />
                    <Text
                      style={[
                        styles.campaignName,
                        c.id === activeCampaignId && { color: primaryColor, fontWeight: '700' },
                      ]}
                    >
                      {c.name}
                    </Text>
                    {c.id === activeCampaignId && <Text style={styles.checkmark}>✓</Text>}
                  </Pressable>
                ))}
              </View>
              <View style={styles.divider} />
            </>
          )}

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <MaterialIcons name="logout" size={18} color="#dc2626" style={styles.logoutIcon} />
            <Text style={styles.logoutText}>Cerrar Sesión</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
});

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: '100%',
    maxWidth: 340,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: FontFamily.bold,
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  campaignList: {
    marginBottom: 12,
  },
  campaignItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  campaignIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12,
  },
  campaignName: {
    flex: 1,
    fontSize: 15,
    color: '#1e293b',
    fontFamily: FontFamily.bold,
  },
  checkmark: {
    fontSize: 14,
    color: '#4ade80',
    fontFamily: FontFamily.bold,
  },
  divider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginVertical: 12,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
  },
  logoutIcon: {
    marginRight: 10,
  },
  logoutText: {
    fontSize: 15,
    color: '#dc2626',
    fontFamily: FontFamily.bold,
  },
});
