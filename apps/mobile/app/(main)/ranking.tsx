/**
 * Ranking — Material Design 3 aligned ranking screen.
 *
 * Sections:
 * 1. Hero KPI — today's active agents + today's total registrations (department scope)
 * 2. Agent ranking — collapsible accordion, top agents in dept with medals + progress bars
 * 3. Department ranking — collapsible accordion, all departments with progress bars
 *
 * M3 compliance:
 * - 48dp+ touch targets (R6.5)
 * - Color + icon + text status indicators, never color alone (R6.8)
 * - Semantic accessibility labels (R6.1, R6.2, R6.3)
 * - Haptic feedback on pull-to-refresh and accordion toggle
 * - Reanimated enter animations + accordion expand/collapse
 */

import { memo, useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeInDown, FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

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
const MEDALS: Record<number, { bg: string; fg: string }> = {
  0: { bg: '#fbbf24', fg: '#78350f' },  // gold
  1: { bg: '#94a3b8', fg: '#1e293b' },  // silver
  2: { bg: '#d97706', fg: '#fff7ed' },  // bronze
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

// ─── Hero KPI Card ──────────────────────────────────────────────

const HeroKPI = memo(function HeroKPI({
  agentsActiveToday,
  registrosHoy,
  departamento,
  primaryColor,
}: {
  agentsActiveToday: number;
  registrosHoy: number;
  departamento: string | null;
  primaryColor: string;
}) {
  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(100)}
      style={[s.hero, { backgroundColor: primaryColor }]}
      accessibilityRole="summary"
      accessibilityLabel={`Hoy: ${agentsActiveToday} agentes activos, ${registrosHoy} registros${departamento ? `, departamento ${departamento}` : ''}`}
    >
      {/* Department label */}
      {departamento && (
        <View style={s.heroDeptRow}>
          <MaterialIcons name="location-on" size={14} color="rgba(255,255,255,0.7)" />
          <Text style={s.heroDeptText}>{departamento}</Text>
        </View>
      )}

      {/* KPI row */}
      <View style={s.heroStatsRow}>
        {/* Active agents today */}
        <View style={s.heroStatBlock}>
          <Text style={s.heroNumber}>{agentsActiveToday}</Text>
          <Text style={s.heroLabel}>Agentes activos hoy</Text>
        </View>

        {/* Divider */}
        <View style={s.heroDivider} />

        {/* Registrations today */}
        <View style={s.heroStatBlock}>
          <Text style={s.heroNumber}>{registrosHoy}</Text>
          <Text style={s.heroLabel}>Registros hoy</Text>
        </View>
      </View>

      {/* Watermark */}
      <View style={s.heroWatermark} pointerEvents="none">
        <MaterialIcons name="trending-up" size={80} color="rgba(255,255,255,0.08)" />
      </View>
    </Animated.View>
  );
});

// ─── Hero Empty State ───────────────────────────────────────────

const HeroEmpty = memo(function HeroEmpty() {
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
      style={[s.row, isMe && { backgroundColor: `${primaryColor}0D` }]}
      accessibilityRole="text"
      accessibilityLabel={`Posicion ${idx + 1}: ${isMe ? 'Tu' : agent.name}, ${agent.count} registros${agent.today > 0 ? `, ${agent.today} hoy` : ''}`}
    >
      {/* Rank badge */}
      <View style={[s.rankBadge, { backgroundColor: medal?.bg ?? '#f1f5f9' }]}>
        <Text style={[s.rankNum, { color: medal?.fg ?? '#64748b' }]}>
          {idx + 1}
        </Text>
      </View>

      {/* Name + progress */}
      <View style={s.rowContent}>
        <View style={s.nameRow}>
          <Text
            style={[s.nameText, isMe && { color: primaryColor, fontWeight: '700' }]}
            numberOfLines={1}
          >
            {displayName}
          </Text>
          {isMe && (
            <View style={[s.tagBadge, { backgroundColor: `${primaryColor}1A` }]}>
              <MaterialIcons name="person" size={10} color={primaryColor} />
              <Text style={[s.tagText, { color: primaryColor }]}>Tu</Text>
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
          color={isMe ? primaryColor : (medal?.bg ?? '#cbd5e1')}
        />
      </View>

      {/* Count */}
      <Text style={[s.countText, isMe && { color: primaryColor }]}>
        {agent.count}
      </Text>
    </View>
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
      style={[s.row, isMyDept && { backgroundColor: `${primaryColor}0D` }]}
      accessibilityRole="text"
      accessibilityLabel={`Departamento ${dept.departamento}: posicion ${idx + 1}, ${dept.total} registros, ${dept.agents} agentes${dept.today > 0 ? `, ${dept.today} hoy` : ''}`}
    >
      {/* Rank */}
      <View style={[s.rankBadge, { backgroundColor: medal?.bg ?? '#f1f5f9' }]}>
        <Text style={[s.rankNum, { color: medal?.fg ?? '#64748b' }]}>
          {idx + 1}
        </Text>
      </View>

      {/* Content */}
      <View style={s.rowContent}>
        <View style={s.nameRow}>
          <Text
            style={[s.nameText, isMyDept && { color: primaryColor, fontWeight: '700' }]}
            numberOfLines={1}
          >
            {dept.departamento}
          </Text>
          {isMyDept && (
            <View style={[s.tagBadge, { backgroundColor: `${primaryColor}1A` }]}>
              <MaterialIcons name="home" size={10} color={primaryColor} />
              <Text style={[s.tagText, { color: primaryColor }]}>Tu dept.</Text>
            </View>
          )}
        </View>
        <ProgressBar
          ratio={ratio}
          color={isMyDept ? primaryColor : (medal?.bg ?? '#cbd5e1')}
        />
        <Text style={s.metaText}>
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

// ─── Collapsible Accordion Card ─────────────────────────────────

const AccordionCard = memo(function AccordionCard({
  icon,
  title,
  subtitle,
  summaryText,
  primaryColor,
  children,
  defaultExpanded = false,
  delay = 200,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  subtitle: string;
  summaryText: string;
  primaryColor: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
  delay?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const toggle = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((prev) => !prev);
  }, []);

  return (
    <Animated.View
      entering={FadeInDown.duration(400).delay(delay)}
      layout={LinearTransition.springify().damping(20).stiffness(200)}
      style={s.card}
    >
      {/* Tappable header */}
      <Pressable
        onPress={toggle}
        style={s.accordionHeader}
        android_ripple={{ color: `${primaryColor}15` }}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${summaryText}. ${expanded ? 'Toca para colapsar' : 'Toca para expandir'}`}
        accessibilityState={{ expanded }}
      >
        <View style={[s.accordionIconWrap, { backgroundColor: `${primaryColor}12` }]}>
          <MaterialIcons name={icon} size={20} color={primaryColor} />
        </View>
        <View style={s.accordionText}>
          <Text style={[s.accordionTitle, { color: primaryColor }]}>{title}</Text>
          <Text style={s.accordionSubtitle} numberOfLines={1}>{subtitle}</Text>
          {/* Summary line visible always */}
          <Text style={[s.accordionSummary, { color: primaryColor }]} numberOfLines={1}>
            {summaryText}
          </Text>
        </View>
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={24}
          color="#94a3b8"
        />
      </Pressable>

      {/* Expanded content */}
      {expanded && (
        <Animated.View
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(150)}
        >
          {children}
        </Animated.View>
      )}
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

  // Derive hero KPI from available data
  const heroKPIs = useMemo(() => {
    // Active agents today: agents in my dept ranking who have today > 0
    const agentsActiveToday = agentRanking?.ranking?.filter((a) => a.today > 0).length ?? 0;
    // Registros hoy: sum of today from ALL departments
    const registrosHoy = departments.reduce((sum, d) => sum + d.today, 0);
    return { agentsActiveToday, registrosHoy };
  }, [agentRanking, departments]);

  // Agent ranking summary text
  const agentSummary = useMemo(() => {
    if (!agentRanking || !agentRanking.departamento) return '';
    if (agentRanking.ranking.length === 0) return 'Sin registros aun';
    const top = agentRanking.ranking[0];
    const myPos = agentRanking.my_position;
    if (myPos > 0) {
      return `Tu posicion: #${myPos} de ${agentRanking.total_agents}  ·  ${agentRanking.my_count} registros`;
    }
    return `${agentRanking.total_agents} agentes  ·  Lider: ${top.name.split(' ')[0]} (${top.count})`;
  }, [agentRanking]);

  // Department summary text
  const deptSummary = useMemo(() => {
    if (departments.length === 0) return 'Sin datos';
    const totalRegs = departments.reduce((sum, d) => sum + d.total, 0);
    return `${departments.length} departamentos  ·  ${totalRegs} registros totales`;
  }, [departments]);

  // Agent ranking content
  const agentMaxCount = agentRanking?.ranking?.[0]?.count ?? 1;

  // Dept ranking content
  const deptMaxTotal = departments[0]?.total ?? 1;

  // Render all content
  const renderContent = useCallback(() => (
    <>
      {/* Hero KPI card */}
      {agentRanking?.departamento ? (
        <HeroKPI
          agentsActiveToday={heroKPIs.agentsActiveToday}
          registrosHoy={heroKPIs.registrosHoy}
          departamento={agentRanking.departamento}
          primaryColor={primary}
        />
      ) : (
        <HeroEmpty />
      )}

      {/* Agent ranking — collapsible */}
      {agentRanking?.departamento && agentRanking.ranking.length > 0 && (
        <AccordionCard
          icon="group"
          title={`Agentes — ${agentRanking.departamento}`}
          subtitle="Clasificacion por registros unicos (telefono)"
          summaryText={agentSummary}
          primaryColor={primary}
          defaultExpanded={false}
          delay={200}
        >
          {agentRanking.ranking.map((ag, idx) => (
            <AgentRow
              key={ag.id}
              agent={ag}
              idx={idx}
              isMe={ag.id === agent.id}
              maxCount={agentMaxCount}
              primaryColor={primary}
            />
          ))}
        </AccordionCard>
      )}

      {/* Departments ranking — collapsible */}
      {departments.length > 0 && (
        <AccordionCard
          icon="map"
          title="Ranking por departamento"
          subtitle="Total de registros unicos por region"
          summaryText={deptSummary}
          primaryColor={primary}
          defaultExpanded={false}
          delay={300}
        >
          {departments.map((dept, idx) => (
            <DeptRow
              key={dept.departamento}
              dept={dept}
              idx={idx}
              maxTotal={deptMaxTotal}
              primaryColor={primary}
              isMyDept={dept.departamento.toUpperCase() === myDept}
            />
          ))}
        </AccordionCard>
      )}

      {/* Bottom spacer */}
      <View style={{ height: 40 }} />
    </>
  ), [agentRanking, heroKPIs, primary, agent.id, agentMaxCount, agentSummary, departments, deptSummary, deptMaxTotal, myDept]);

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

  // ── Hero KPI ───────────────────────────────────────────────────

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
  heroNumber: {
    fontSize: 40,
    fontFamily: FONT,
    color: '#ffffff',
    fontVariant: ['tabular-nums'],
    lineHeight: 48,
  },
  heroLabel: {
    fontSize: 11,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    textAlign: 'center',
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

  // ── Accordion header ───────────────────────────────────────────

  accordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
    minHeight: 72,
  },
  accordionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accordionText: {
    flex: 1,
  },
  accordionTitle: {
    fontSize: 13,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  accordionSubtitle: {
    fontSize: 11,
    fontFamily: FONT,
    color: '#94a3b8',
    marginTop: 1,
  },
  accordionSummary: {
    fontSize: 12,
    fontFamily: FONT,
    marginTop: 4,
  },

  // ── Shared row ─────────────────────────────────────────────────

  row: {
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
  rowContent: {
    flex: 1,
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  nameText: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#1e293b',
    flexShrink: 1,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  tagText: {
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
  countText: {
    fontSize: 16,
    fontFamily: FONT,
    color: '#334155',
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    marginLeft: 10,
  },
  metaText: {
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
