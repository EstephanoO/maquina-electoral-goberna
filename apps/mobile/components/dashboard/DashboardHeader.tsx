/**
 * DashboardHeader — Card con foto del candidato + stats + agent bar.
 */
import { MaterialIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FontFamily } from '@/constants/theme';

interface HeaderProps {
  candidateName: string;
  candidateCargo: string;
  candidatePartido: string;
  candidateNumero: number;
  photoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  agentName: string;
  agentRole: string;
  trackingActive: boolean;
  stats: { total: number; synced: number; pending: number; rejected: number };
  onMenuPress: () => void;
}

export const DashboardHeader = memo(function DashboardHeader({
  candidateName,
  candidateCargo,
  candidatePartido,
  candidateNumero,
  photoUrl,
  primaryColor,
  secondaryColor,
  agentName,
  agentRole,
  trackingActive,
  stats,
  onMenuPress,
}: HeaderProps) {
  return (
    <View style={[styles.header, { backgroundColor: primaryColor }]}>
      <Pressable style={styles.menuButton} onPress={onMenuPress} hitSlop={12}>
        <MaterialIcons name="settings" size={22} color="rgba(255,255,255,0.8)" />
      </Pressable>

      <View style={styles.candidateCard}>
        {photoUrl ? (
          <Image
            source={{ uri: photoUrl }}
            style={styles.candidatePhoto}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.candidatePhotoPlaceholder, { backgroundColor: secondaryColor }]}>
            <Text style={[styles.placeholderInitial, { color: primaryColor }]}>
              {candidateName.charAt(0)}
            </Text>
          </View>
        )}
        <View style={styles.candidateInfo}>
          <Text style={styles.candidateName}>{candidateName}</Text>
          <Text style={styles.candidateCargo}>{candidateCargo}</Text>
          <Text style={[styles.candidatePartido, { color: secondaryColor }]}>
            {candidatePartido} · #{candidateNumero}
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Registros</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: '#4ade80' }]}>{stats.synced}</Text>
          <Text style={styles.statLabel}>Sincronizados</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={styles.statItem}>
          <Text style={[styles.statNumber, { color: secondaryColor }]}>{stats.pending}</Text>
          <Text style={styles.statLabel}>Pendientes</Text>
        </View>
      </View>

      <View style={styles.agentBar}>
        <View style={styles.agentInfo}>
          <Text style={styles.agentLabel}>{agentRole === 'admin' ? 'Admin:' : 'Agente:'}</Text>
          <Text style={styles.agentName}>{agentName}</Text>
        </View>
        <View style={styles.gpsStatus}>
          <View style={[styles.gpsDot, { backgroundColor: trackingActive ? '#4ade80' : '#94a3b8' }]} />
          <Text style={styles.gpsLabel}>{trackingActive ? 'GPS' : 'GPS off'}</Text>
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  menuButton: {
    position: 'absolute',
    top: 8,
    right: 12,
    padding: 8,
    zIndex: 10,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 20,
  },
  candidatePhoto: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#e2e8f0',
  },
  candidatePhotoPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderInitial: {
    fontSize: 28,
    fontFamily: FontFamily.bold,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    fontSize: 20,
    fontFamily: FontFamily.bold,
    color: '#ffffff',
  },
  candidateCargo: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    fontFamily: FontFamily.bold,
    marginTop: 2,
  },
  candidatePartido: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    marginTop: 4,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
    marginBottom: 12,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: '100%',
  },
  statNumber: {
    fontSize: 24,
    fontFamily: FontFamily.bold,
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FontFamily.bold,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  agentBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  agentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentLabel: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FontFamily.bold,
  },
  agentName: {
    fontSize: 12,
    color: '#ffffff',
    fontFamily: FontFamily.bold,
  },
  gpsStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  gpsDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  gpsLabel: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    fontFamily: FontFamily.bold,
  },
});
