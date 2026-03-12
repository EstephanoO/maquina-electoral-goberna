/**
 * Ranking — Material Design 3 aligned ranking screen.
 *
 * Sections:
 * 1. Hero card — agent's position, department, personal count (prominent)
 * 2. Agent ranking — top agents in the agent's department with medals, progress bars
 * 3. Department ranking — all departments ranked by total, with progress bars
 *
 * M3 compliance:
 * - 48dp+ touch targets (R6.5)
 * - Color + icon + text status indicators, never color alone (R6.8)
 * - Semantic accessibility labels (R6.1, R6.2, R6.3)
 * - Haptic feedback on pull-to-refresh
 * - Reanimated enter animations
 */

import { memo, useCallback, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useCandidate, useAgent } from '@/lib/app-context';
import { getMyDeptRanking, getDepartmentsRanking } from '@/lib/api';

const FONT = 'Montserrat-Bold';

// ─── Types ──────────────────────────────────────────────────────

type RankingAgent = { id: string; name: string; count: number; today: number };
type RankingData = {
  departamento: string | null;
  my_position: number;
  my_count: number;
  total_agents: number;
  ranking: RankingAgent[];
};
type DeptSummary = { departamento: string; total: number; today: number; agents: number };

// Medal config for top 3
const MEDALS: Record<number, { icon: string; bg: string; fg: string }> = {
  0: { icon: '1', bg: '#fbbf24', fg: '#78350f' },  // gold
  1: { icon: '2', bg: '#94a3b8', fg: '#1e293b' },  // silver
  2: { icon: '3', bg: '#d97706', fg: '#fff7ed' },  // bronze
};

// ─── Progress Bar ───────────────────────────────────────────────

const ProgressBar = memo(function ProgressBar({
  ratio,
  color,
  height = 4,
}: {
  ratio: number;
  color: string;
  height?: number;
}) {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  return (
    <View style={[progStyles.track, { height }]}>
      <View
        style={[
          progStyles.fill,
          { width: `${clampedRatio * 100}%`, backgroundColor: color, height },
        ]}
      />
    </View>
  );
});

const progStyles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: '#f1f5f9',
    borderRadius: 99,
    overflow: 'hidden',
  },
  fill: {
    borderRadius: 99,
  },
});

// ─── Hero Card ──────────────────────────────────────────────────

const HeroCard = memo(function HeroCard({
  ranking,
  primaryColor,
}: {
  ranking: RankingData | null;
  primaryColor: string;
}) {
  if (!ranking || !ranking.departamento) {
    return (
      <View
        style={s.heroEmpty}
        accessibilityRole="summary"
        accessibilityLabel="Sin departamento asignado. Registra datos para aparecer en el ranking."
      >
        <View style={s.heroEmptyIcon}>
          <MaterialIcons name="emoji-events" size={40} color="#cbd5e1" />
        </View>
        <Text style={s.heroEmptyTitle}>Sin departamento asignado</Text>
        <Text style={s.heroEmptyHint}>
          Registra datos para aparecer en el ranking de tu departamento
        </Text>
      </View>
    );
  }

  const posLabel = ranking.my_position > 0
    ? `#${ranking.my_position}`
    : '--';
  const ofLabel = ranking.total_agents > 0
    ? `de ${ranking.total_agents} agente${ranking.total_agents !== 1 ? 's' : ''}`
    : '';

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(100)}
      style={[s.hero, { backgroundColor: primaryColor }]}
      accessibilityRole="summary"
      accessibilityLabel={`Tu posicion: numero ${ranking.my_position} de ${ranking.total_agents} agentes en ${ranking.departamento}. ${ranking.my_count} registros.`}
    >
      {/* Department label */}
      <View style={s.heroDeptRow}>
        <MaterialIcons name="location-on" size={14} color="rgba(255,255,255,0.7)" />
        <Text style={s.heroDeptText}>{ranking.departamento}</Text>
      </View>

      {/* Main stats row */}
      <View style={s.heroStatsRow}>
        {/* Position */}
        <View style={s.heroStatBlock}>
          <Text style={s.heroPosition}>{posLabel}</Text>
          <Text style={s.heroStatSubtitle}>{ofLabel}</Text>
        </View>

        {/* Divider */}
        <View style={s.heroDivider} />

        {/* Count */}
        <View style={s.heroStatBlock}>
          <Text style={s.heroCount}>{ranking.my_count}</Text>
          <Text style={s.heroStatSubtitle}>registros</Text>
        </View>
      </View>

      {/* Trophy icon watermark */}
      <View style={s.heroWatermark} pointerEvents="none">
        <MaterialIcons name="emoji-events" size={80} color="rgba(255,255,255,0.08)" />
      </View>
    </Animated.View>
  );
});

// ─── Agent Row ──────────────────────────────────────────────────

const AgentRow = memo(function AgentRow({
  agent,
  idx,
  isMe,
  maxCount,
  primaryColor,
}: {
  agent: RankingAgent;
  idx: number;
  isMe: boolean;
  maxCount: number;
  primaryColor: string;
}) {
  const medal = MEDALS[idx];
  const ratio = maxCount > 0 ? agent.count / maxCount : 0;
  const displayName = isMe ? 'Tu' : agent.name.split(' ').slice(0, 2).join(' ');

  return (
    <View
      style={[s.agentRow, isMe && { backgroundColor: `${primaryColor}0D` }]}
      accessibilityRole="text"
      accessibilityLabel={`Posicion ${idx + 1}: ${isMe ? 'Tu' : agent.name}, ${agent.count} registros${agent.today > 0 ? `, ${agent.today} hoy` : ''}`}
    >
      {/* Rank badge */}
      <View
        style={[
          s.rankBadge,
          medal
            ? { backgroundColor: medal.bg }
            : { backgroundColor: '#f1f5f9' },
        ]}
      >
        <Text
          style={[
            s.rankNum,
            medal
              ? { color: medal.fg }
              : { color: '#64748b' },
          ]}
        >
          {idx + 1}
        </Text>
      </View>

      {/* Name + progress */}
      <View style={s.agentContent}>
        <View style={s.agentNameRow}>
          <Text
            style={[
              s.agentName,
              isMe && { color: primaryColor, fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {isMe && (
            <View style={[s.youBadge, { backgroundColor: `${primaryColor}1A` }]}>
              <MaterialIcons name="person" size={10} color={primaryColor} />
              <Text style={[s.youBadgeText, { color: primaryColor }]}>Tu</Text>
            </View>
          )}
          {agent.today > 0 && (
            <View style={s.todayBadge}>
              <Text style={s.todayText}>+{agent.today} hoy</Text>
            </View>
          )}
        </View>
        <ProgressBar
          ratio={ratio}
          color={isMe ? primaryColor : (medal ? medal.bg : '#cbd5e1')}
        />
      </View>

      {/* Count */}
      <Text style={[s.agentCount, isMe && { color: primaryColor }]}>
        {agent.count}
      </Text>
    </View>
  );
});

// ─── Agent Ranking Section ──────────────────────────────────────

const AgentRankingSection = memo(function AgentRankingSection({
  ranking,
  myUserId,
  primaryColor,
}: {
  ranking: RankingData | null;
  myUserId: string;
  primaryColor: string;
}) {
  if (!ranking || !ranking.departamento) return null;

  if (ranking.ranking.length === 0) {
    return (
      <View style={s.card}>
        <View style={s.sectionHeader}>
          <MaterialIcons name="group" size={18} color={primaryColor} />
          <View style={s.sectionHeaderText}>
            <Text style={[s.sectionTitle, { color: primaryColor }]}>
              Agentes en {ranking.departamento}
            </Text>
            <Text style={s.sectionSubtitle}>Aun no hay registros en este departamento</Text>
          </View>
        </View>
      </View>
    );
  }

  const maxCount = ranking.ranking[0]?.count ?? 1;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(200)}
      style={s.card}
    >
      <View style={s.sectionHeader}>
        <MaterialIcons name="group" size={18} color={primaryColor} />
        <View style={s.sectionHeaderText}>
          <Text style={[s.sectionTitle, { color: primaryColor }]}>
            Agentes en {ranking.departamento}
          </Text>
          <Text style={s.sectionSubtitle}>
            Clasificacion por registros unicos (telefono)
          </Text>
        </View>
      </View>

      {ranking.ranking.map((agent, idx) => (
        <AgentRow
          key={agent.id}
          agent={agent}
          idx={idx}
          isMe={agent.id === myUserId}
          maxCount={maxCount}
          primaryColor={primaryColor}
        />
      ))}
    </Animated.View>
  );
});

// ─── Department Row ─────────────────────────────────────────────

const DeptRow = memo(function DeptRow({
  dept,
  idx,
  maxTotal,
  primaryColor,
  isMyDept,
}: {
  dept: DeptSummary;
  idx: number;
  maxTotal: number;
  primaryColor: string;
  isMyDept: boolean;
}) {
  const medal = MEDALS[idx];
  const ratio = maxTotal > 0 ? dept.total / maxTotal : 0;

  return (
    <View
      style={[s.deptRow, isMyDept && { backgroundColor: `${primaryColor}0D` }]}
      accessibilityRole="text"
      accessibilityLabel={`Departamento ${dept.departamento}: posicion ${idx + 1}, ${dept.total} registros, ${dept.agents} agente${dept.agents !== 1 ? 's' : ''}${dept.today > 0 ? `, ${dept.today} hoy` : ''}`}
    >
      {/* Rank */}
      <View
        style={[
          s.rankBadge,
          medal
            ? { backgroundColor: medal.bg }
            : { backgroundColor: '#f1f5f9' },
        ]}
      >
        <Text
          style={[
            s.rankNum,
            medal
              ? { color: medal.fg }
              : { color: '#64748b' },
          ]}
        >
          {idx + 1}
        </Text>
      </View>

      {/* Content */}
      <View style={s.deptContent}>
        <View style={s.deptNameRow}>
          <Text
            style={[
              s.deptName,
              isMyDept && { color: primaryColor, fontWeight: '700' },
            ]}
            numberOfLines={1}
          >
            {dept.departamento}
          </Text>
          {isMyDept && (
            <View style={[s.youBadge, { backgroundColor: `${primaryColor}1A` }]}>
              <MaterialIcons name="home" size={10} color={primaryColor} />
              <Text style={[s.youBadgeText, { color: primaryColor }]}>Tu dept.</Text>
            </View>
          )}
        </View>
        <ProgressBar
          ratio={ratio}
          color={isMyDept ? primaryColor : (medal ? medal.bg : '#cbd5e1')}
        />
        <Text style={s.deptMeta}>
          {dept.agents} agente{dept.agents !== 1 ? 's' : ''}
          {dept.today > 0 ? `  ·  +${dept.today} hoy` : ''}
        </Text>
      </View>

      {/* Total */}
      <Text style={[s.deptTotal, isMyDept && { color: primaryColor }]}>
        {dept.total}
      </Text>
    </View>
  );
});

// ─── Departments Section ────────────────────────────────────────

const DepartmentsSection = memo(function DepartmentsSection({
  departments,
  myDept,
  primaryColor,
}: {
  departments: DeptSummary[];
  myDept: string | null;
  primaryColor: string;
}) {
  if (departments.length === 0) return null;

  const maxTotal = departments[0]?.total ?? 1;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(300)}
      style={s.card}
    >
      <View style={s.sectionHeader}>
        <MaterialIcons name="map" size={18} color={primaryColor} />
        <View style={s.sectionHeaderText}>
          <Text style={[s.sectionTitle, { color: primaryColor }]}>
            Ranking por departamento
          </Text>
          <Text style={s.sectionSubtitle}>
            Total de registros unicos por region
          </Text>
        </View>
      </View>

      {departments.map((dept, idx) => (
        <DeptRow
          key={dept.departamento}
          dept={dept}
          idx={idx}
          maxTotal={maxTotal}
          primaryColor={primaryColor}
          isMyDept={dept.departamento.toUpperCase() === myDept}
        />
      ))}
    </Animated.View>
  );
});

// ─── Loading State ──────────────────────────────────────────────

const LoadingSkeleton = memo(function LoadingSkeleton({ primaryColor }: { primaryColor: string }) {
  return (
    <View style={s.loadingContainer}>
      <View style={s.loadingIconWrap}>
        <MaterialIcons name="leaderboard" size={32} color={primaryColor} />
      </View>
      <Text style={[s.loadingTitle, { color: primaryColor }]}>Cargando ranking</Text>
      <Text style={s.loadingHint}>Obteniendo datos del servidor...</Text>

      {/* Skeleton cards */}
      {[1, 2].map((i) => (
        <View key={i} style={s.skeletonCard}>
          <View style={s.skeletonLine} />
          <View style={[s.skeletonLine, { width: '60%' }]} />
          <View style={[s.skeletonLine, { width: '40%' }]} />
        </View>
      ))}
    </View>
  );
});

// ─── Screen ─────────────────────────────────────────────────────

export default function RankingScreen() {
  const candidate = useCandidate();
  const agent = useAgent();
  const primary = candidate.color_primario;

  const [refreshing, setRefreshing] = useState(false);
  const [agentRanking, setAgentRanking] = useState<RankingData | null>(null);
  const [departments, setDepartments] = useState<DeptSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [rankRes, deptRes] = await Promise.all([
        getMyDeptRanking(),
        getDepartmentsRanking(),
      ]);
      if (rankRes.ok && rankRes.data) setAgentRanking(rankRes.data);
      if (deptRes.ok && deptRes.data) setDepartments(deptRes.data.departments);
    } catch (err) {
      console.warn('Failed to load ranking data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const myDept = agentRanking?.departamento?.toUpperCase() ?? null;

  // Use a single-item FlatList to get pull-to-refresh on all content
  const renderContent = useCallback(() => (
    <>
      {/* Hero card */}
      <HeroCard ranking={agentRanking} primaryColor={primary} />

      {/* Agent ranking */}
      <AgentRankingSection
        ranking={agentRanking}
        myUserId={agent.id}
        primaryColor={primary}
      />

      {/* Departments */}
      <DepartmentsSection
        departments={departments}
        myDept={myDept}
        primaryColor={primary}
      />

      {/* Bottom spacer */}
      <View style={{ height: 40 }} />
    </>
  ), [agentRanking, agent.id, primary, departments, myDept]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <LoadingSkeleton primaryColor={primary} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={[1]}
        keyExtractor={() => 'ranking-content'}
        renderItem={renderContent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={primary} />
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ─────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  listContent: {
    flexGrow: 1,
    paddingTop: 8,
  },

  // ── Hero card ──────────────────────────────────────────────────

  hero: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    elevation: 4,
  },
  heroDeptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 16,
  },
  heroDeptText: {
    fontSize: 12,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroStatBlock: {
    flex: 1,
    alignItems: 'center',
  },
  heroPosition: {
    fontSize: 40,
    fontFamily: FONT,
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    lineHeight: 48,
  },
  heroCount: {
    fontSize: 40,
    fontFamily: FONT,
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    lineHeight: 48,
  },
  heroStatSubtitle: {
    fontSize: 12,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 2,
  },
  heroDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 16,
  },
  heroWatermark: {
    position: 'absolute',
    right: -8,
    bottom: -8,
  },

  // Hero empty
  heroEmpty: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  heroEmptyIcon: {
    marginBottom: 4,
  },
  heroEmptyTitle: {
    fontSize: 16,
    fontFamily: FONT,
    color: '#64748b',
  },
  heroEmptyHint: {
    fontSize: 13,
    fontFamily: FONT,
    color: '#94a3b8',
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── Card container ─────────────────────────────────────────────

  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },

  // ── Section header ─────────────────────────────────────────────

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  sectionHeaderText: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionSubtitle: {
    fontSize: 11,
    fontFamily: FONT,
    color: '#94a3b8',
    marginTop: 2,
    lineHeight: 16,
  },

  // ── Agent row ──────────────────────────────────────────────────

  agentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    minHeight: 52,
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  rankNum: {
    fontSize: 12,
    fontFamily: FONT,
  },
  agentContent: {
    flex: 1,
    gap: 4,
  },
  agentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  agentName: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#1e293b',
    flexShrink: 1,
  },
  youBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  youBadgeText: {
    fontSize: 9,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  todayBadge: {
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  todayText: {
    fontSize: 10,
    fontFamily: FONT,
    color: '#16a34a',
  },
  agentCount: {
    fontSize: 16,
    fontFamily: FONT,
    color: '#334155',
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    marginLeft: 10,
  },

  // ── Department row ─────────────────────────────────────────────

  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
    minHeight: 56,
  },
  deptContent: {
    flex: 1,
    gap: 4,
  },
  deptNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deptName: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#1e293b',
    flexShrink: 1,
  },
  deptMeta: {
    fontSize: 11,
    fontFamily: FONT,
    color: '#94a3b8',
  },
  deptTotal: {
    fontSize: 18,
    fontFamily: FONT,
    color: '#334155',
    minWidth: 40,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    marginLeft: 10,
  },

  // ── Loading state ──────────────────────────────────────────────

  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  loadingIconWrap: {
    marginBottom: 12,
  },
  loadingTitle: {
    fontSize: 16,
    fontFamily: FONT,
    marginBottom: 4,
  },
  loadingHint: {
    fontSize: 13,
    fontFamily: FONT,
    color: '#94a3b8',
    marginBottom: 24,
  },
  skeletonCard: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    gap: 8,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    width: '80%',
  },
});
