/**
 * Reuniones + Mapa de Agentes en tiempo real.
 *
 * Tab "Mapa" shows live agent positions via SSE from GET /api/agents/stream.
 * Tab "Reuniones" shows upcoming meetings (placeholder data for now).
 *
 * Colors driven by AppConfig.
 */

import { useState } from 'react';
import { StyleSheet, Text, View, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useCandidate, useAgent } from '@/lib/app-context';
import { useAgentsStream } from '@/hooks/useAgentsStream';

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';

type TabType = 'reuniones' | 'mapa';

function formatTimeSince(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

export default function ReunionesScreen() {
  const candidate = useCandidate();
  const agent = useAgent();
  const [activeTab, setActiveTab] = useState<TabType>('mapa');

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={[styles.header, { backgroundColor: primary }]}>
        <Text style={styles.title}>Operaciones</Text>
        <Text style={styles.subtitle}>Mapa de campo y reuniones</Text>
      </View>

      {/* Sub-tabs */}
      <View style={styles.tabBar}>
        <Pressable
          style={[styles.tab, activeTab === 'mapa' && [styles.tabActive, { backgroundColor: primary }]]}
          onPress={() => setActiveTab('mapa')}
        >
          <Text style={[styles.tabText, activeTab === 'mapa' && styles.tabTextActive]}>
            Mapa
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tab, activeTab === 'reuniones' && [styles.tabActive, { backgroundColor: primary }]]}
          onPress={() => setActiveTab('reuniones')}
        >
          <Text style={[styles.tabText, activeTab === 'reuniones' && styles.tabTextActive]}>
            Reuniones
          </Text>
        </Pressable>
      </View>

      <View style={styles.content}>
        {activeTab === 'mapa' ? (
          <AgentsMapView primary={primary} secondary={secondary} currentAgentId={agent.id} />
        ) : (
          <ReunionesView primary={primary} secondary={secondary} />
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Agents Map View ────────────────────────────────────────────

function AgentsMapView({
  primary,
  secondary,
  currentAgentId,
}: {
  primary: string;
  secondary: string;
  currentAgentId: string;
}) {
  const { agents, connected, error } = useAgentsStream();

  return (
    <View style={styles.mapContainer}>
      {/* Connection status bar */}
      <View style={[styles.statusBar, { backgroundColor: connected ? '#22C55E' : '#EF4444' }]}>
        <View style={styles.statusDot} />
        <Text style={styles.statusText}>
          {connected
            ? `${agents.length} agente${agents.length !== 1 ? 's' : ''} en linea`
            : error ?? 'Conectando...'}
        </Text>
      </View>

      {/* Agent cards list */}
      <ScrollView style={styles.agentsList} contentContainerStyle={styles.agentsListContent}>
        {agents.length === 0 && connected ? (
          <View style={styles.emptyMapState}>
            <Text style={[styles.emptyMapTitle, { color: primary }]}>Sin agentes en linea</Text>
            <Text style={styles.emptyMapText}>
              Los agentes apareceran aqui cuando inicien su jornada de campo.
            </Text>
          </View>
        ) : (
          agents.map((a) => {
            const isMe = a.agent_id === currentAgentId;
            return (
              <View
                key={a.agent_id}
                style={[
                  styles.agentCard,
                  isMe && { borderColor: secondary, borderWidth: 2 },
                ]}
              >
                <View style={styles.agentCardHeader}>
                  <View style={[styles.agentAvatar, { backgroundColor: isMe ? secondary : primary }]}>
                    <Text style={[styles.agentAvatarText, { color: isMe ? primary : '#FFFFFF' }]}>
                      {a.agent_id.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <View style={styles.agentCardInfo}>
                    <Text style={[styles.agentName, { color: primary }]} numberOfLines={1}>
                      {isMe ? 'Tu (yo)' : a.agent_id.slice(0, 8)}
                    </Text>
                    <Text style={styles.agentUpdated}>
                      Hace {formatTimeSince(a.ts)} · seq {a.seq}
                    </Text>
                  </View>
                  <View style={styles.agentOnlineDot} />
                </View>

                <View style={styles.agentCardBody}>
                  <View style={styles.coordRow}>
                    <Text style={styles.coordLabel}>Lat</Text>
                    <Text style={styles.coordValue}>{a.lat.toFixed(6)}</Text>
                  </View>
                  <View style={styles.coordRow}>
                    <Text style={styles.coordLabel}>Lng</Text>
                    <Text style={styles.coordValue}>{a.lng.toFixed(6)}</Text>
                  </View>
                  {a.accuracy != null && (
                    <View style={styles.coordRow}>
                      <Text style={styles.coordLabel}>Precision</Text>
                      <Text style={styles.coordValue}>{a.accuracy.toFixed(0)}m</Text>
                    </View>
                  )}
                  {a.speed != null && (
                    <View style={styles.coordRow}>
                      <Text style={styles.coordLabel}>Velocidad</Text>
                      <Text style={styles.coordValue}>{(a.speed * 3.6).toFixed(1)} km/h</Text>
                    </View>
                  )}
                  {a.battery != null && (
                    <View style={styles.coordRow}>
                      <Text style={styles.coordLabel}>Bateria</Text>
                      <Text style={styles.coordValue}>{a.battery.toFixed(0)}%</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

// ─── Reuniones View ─────────────────────────────────────────────

function ReunionesView({ primary, secondary }: { primary: string; secondary: string }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: 'rgba(22, 57, 96, 0.7)' }]}>
        Proximas reuniones
      </Text>

      <View style={styles.meetingCard}>
        <View style={[styles.meetingDate, { backgroundColor: secondary }]}>
          <Text style={[styles.meetingDay, { color: primary }]}>15</Text>
          <Text style={[styles.meetingMonth, { color: primary }]}>FEB</Text>
        </View>
        <View style={styles.meetingInfo}>
          <Text style={[styles.meetingTitle, { color: primary }]}>Reunion de coordinacion</Text>
          <Text style={styles.meetingLocation}>Plaza de Armas - 10:00 AM</Text>
        </View>
      </View>

      <View style={styles.meetingCard}>
        <View style={[styles.meetingDate, { backgroundColor: secondary }]}>
          <Text style={[styles.meetingDay, { color: primary }]}>18</Text>
          <Text style={[styles.meetingMonth, { color: primary }]}>FEB</Text>
        </View>
        <View style={styles.meetingInfo}>
          <Text style={[styles.meetingTitle, { color: primary }]}>Capacitacion agentes</Text>
          <Text style={styles.meetingLocation}>Local partidario - 3:00 PM</Text>
        </View>
      </View>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    padding: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: FONT,
  },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.7)',
    fontFamily: FONT,
    marginTop: 4,
  },

  /* Sub-tabs */
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  tabActive: {},
  tabText: {
    fontSize: 14,
    fontFamily: FONT,
    color: 'rgba(22, 57, 96, 0.7)',
  },
  tabTextActive: {
    color: '#FFFFFF',
  },

  content: {
    flex: 1,
    padding: 16,
    gap: 20,
  },

  /* Agents map */
  mapContainer: {
    flex: 1,
    gap: 12,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  statusText: {
    fontSize: 13,
    color: '#FFFFFF',
    fontFamily: FONT,
  },
  agentsList: {
    flex: 1,
  },
  agentsListContent: {
    gap: 10,
    paddingBottom: 20,
  },
  emptyMapState: {
    padding: 32,
    alignItems: 'center',
    gap: 8,
  },
  emptyMapTitle: {
    fontSize: 16,
    fontFamily: FONT,
  },
  emptyMapText: {
    fontSize: 13,
    color: 'rgba(22, 57, 96, 0.6)',
    fontFamily: FONT,
    textAlign: 'center',
    lineHeight: 20,
  },

  /* Agent card */
  agentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  agentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  agentAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agentAvatarText: {
    fontSize: 12,
    fontFamily: FONT,
  },
  agentCardInfo: {
    flex: 1,
  },
  agentName: {
    fontSize: 14,
    fontFamily: FONT,
  },
  agentUpdated: {
    fontSize: 11,
    color: 'rgba(22, 57, 96, 0.5)',
    fontFamily: FONT,
    marginTop: 1,
  },
  agentOnlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22C55E',
  },
  agentCardBody: {
    gap: 4,
    paddingLeft: 46,
  },
  coordRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  coordLabel: {
    fontSize: 12,
    color: 'rgba(22, 57, 96, 0.5)',
    fontFamily: FONT,
  },
  coordValue: {
    fontSize: 12,
    color: 'rgba(22, 57, 96, 0.8)',
    fontFamily: FONT,
    fontVariant: ['tabular-nums'],
  },

  /* Reuniones */
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  meetingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  meetingDate: {
    width: 56,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meetingDay: {
    fontSize: 20,
    fontFamily: FONT,
  },
  meetingMonth: {
    fontSize: 10,
    fontFamily: FONT,
    textTransform: 'uppercase',
  },
  meetingInfo: {
    flex: 1,
  },
  meetingTitle: {
    fontSize: 15,
    fontFamily: FONT,
  },
  meetingLocation: {
    fontSize: 13,
    color: 'rgba(22, 57, 96, 0.7)',
    fontFamily: FONT,
    marginTop: 2,
  },
});
