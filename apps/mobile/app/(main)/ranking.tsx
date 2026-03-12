/**
 * Ranking — Department ranking + departments ranking.
 *
 * Top section: Agents ranked within the user's department.
 * Bottom section: All departments ranked by total registrations.
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

import { useCandidate, useAgent, useActiveCampaign } from '@/lib/app-context';
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
  if (!ranking || !ranking.departamento) {
    return (
      <View style={s.emptyCard}>
        <MaterialIcons name="leaderboard" size={32} color="#cbd5e1" />
        <Text style={s.emptyText}>Sin departamento asignado</Text>
        <Text style={s.emptyHint}>Registra datos para aparecer en el ranking</Text>
      </View>
    );
  }

  if (ranking.ranking.length === 0) {
    return (
      <View style={s.card}>
        <View style={s.cardHeader}>
          <MaterialIcons name="leaderboard" size={18} color={primaryColor} />
          <Text style={[s.cardTitle, { color: primaryColor }]}>
            Ranking — {ranking.departamento}
          </Text>
        </View>
        <Text style={s.emptyHint}>Aun no hay registros en este departamento</Text>
      </View>
    );
  }

  return (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <MaterialIcons name="leaderboard" size={18} color={primaryColor} />
        <Text style={[s.cardTitle, { color: primaryColor }]}>
          Ranking — {ranking.departamento}
        </Text>
      </View>

      {ranking.my_position > 0 && (
        <View style={[s.myBadge, { backgroundColor: `${primaryColor}12` }]}>
          <Text style={[s.myBadgeText, { color: primaryColor }]}>
            Tu posicion: #{ranking.my_position} de {ranking.total_agents}
          </Text>
        </View>
      )}

      {ranking.ranking.map((agent, idx) => {
        const isMe = agent.id === myUserId;
        return (
          <View
            key={agent.id}
            style={[s.row, isMe && { backgroundColor: `${primaryColor}10` }]}
          >
            <View style={[
              s.rankBadge,
              idx < 3 ? { backgroundColor: primaryColor } : { backgroundColor: '#e2e8f0' },
            ]}>
              <Text style={[
                s.rankNum,
                idx < 3 ? { color: '#fff' } : { color: '#64748b' },
              ]}>
                {idx + 1}
              </Text>
            </View>
            <View style={s.nameCol}>
              <Text
                style={[s.agentName, isMe && { color: primaryColor, fontWeight: '700' }]}
                numberOfLines={1}
              >
                {isMe ? 'Tu' : agent.name.split(' ').slice(0, 2).join(' ')}
              </Text>
              {agent.today > 0 && (
                <Text style={s.todayBadge}>+{agent.today} hoy</Text>
              )}
            </View>
            <Text style={[s.agentCount, isMe && { color: primaryColor }]}>
              {agent.count}
            </Text>
          </View>
        );
      })}
    </View>
  );
});

// ─── Department Row ─────────────────────────────────────────────

const DeptRow = memo(function DeptRow({
  dept,
  idx,
  primaryColor,
  isMyDept,
}: {
  dept: DeptSummary;
  idx: number;
  primaryColor: string;
  isMyDept: boolean;
}) {
  return (
    <View style={[s.deptRow, isMyDept && { backgroundColor: `${primaryColor}10` }]}>
      <View style={[
        s.rankBadge,
        idx < 3 ? { backgroundColor: primaryColor } : { backgroundColor: '#e2e8f0' },
      ]}>
        <Text style={[
          s.rankNum,
          idx < 3 ? { color: '#fff' } : { color: '#64748b' },
        ]}>
          {idx + 1}
        </Text>
      </View>
      <View style={s.deptNameCol}>
        <Text
          style={[s.deptName, isMyDept && { color: primaryColor, fontWeight: '700' }]}
          numberOfLines={1}
        >
          {dept.departamento}
        </Text>
        <Text style={s.deptMeta}>
          {dept.agents} agente{dept.agents !== 1 ? 's' : ''}
          {dept.today > 0 ? `  ·  +${dept.today} hoy` : ''}
        </Text>
      </View>
      <Text style={[s.deptTotal, isMyDept && { color: primaryColor }]}>
        {dept.total}
      </Text>
    </View>
  );
});

// ─── Screen ─────────────────────────────────────────────────────

export default function RankingScreen() {
  const candidate = useCandidate();
  const agent = useAgent();
  const campaign = useActiveCampaign();
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
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const myDept = agentRanking?.departamento?.toUpperCase() ?? null;

  // FlatList header: agent ranking + departments title
  const renderHeader = useCallback(() => (
    <>
      {/* Page title */}
      <View style={[s.titleBar, { backgroundColor: primary }]}>
        <MaterialIcons name="leaderboard" size={22} color="#fff" />
        <Text style={s.titleText}>Ranking</Text>
      </View>

      {/* Agent ranking within department */}
      <AgentRankingSection
        ranking={agentRanking}
        myUserId={agent.id}
        primaryColor={primary}
      />

      {/* Departments section title */}
      {departments.length > 0 && (
        <View style={s.sectionHeader}>
          <MaterialIcons name="map" size={16} color={primary} />
          <Text style={[s.sectionTitle, { color: primary }]}>
            Departamentos
          </Text>
        </View>
      )}
    </>
  ), [agentRanking, agent.id, primary, departments.length]);

  const renderDept = useCallback(({ item, index }: { item: DeptSummary; index: number }) => (
    <DeptRow
      dept={item}
      idx={index}
      primaryColor={primary}
      isMyDept={item.departamento.toUpperCase() === myDept}
    />
  ), [primary, myDept]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.loader}>
          <Text style={[s.loaderText, { color: primary }]}>Cargando ranking...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <FlatList
        data={departments}
        keyExtractor={(item) => item.departamento}
        renderItem={renderDept}
        ListHeaderComponent={renderHeader}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
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
    paddingBottom: 40,
  },
  loader: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderText: {
    fontSize: 14,
    fontFamily: FONT,
  },

  // Title bar
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  titleText: {
    fontSize: 20,
    fontFamily: FONT,
    color: '#fff',
  },

  // Card
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
  },
  cardTitle: {
    fontSize: 13,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // My position badge
  myBadge: {
    marginHorizontal: 14,
    marginBottom: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  myBadgeText: {
    fontSize: 12,
    fontFamily: FONT,
    textAlign: 'center',
  },

  // Agent row
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#f1f5f9',
  },
  rankBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  rankNum: {
    fontSize: 12,
    fontFamily: FONT,
  },
  nameCol: {
    flex: 1,
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
  todayBadge: {
    fontSize: 10,
    fontFamily: FONT,
    color: '#4ade80',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  agentCount: {
    fontSize: 16,
    fontFamily: FONT,
    color: '#334155',
    minWidth: 36,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  // Section header
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Department row
  deptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginBottom: 6,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  deptNameCol: {
    flex: 1,
  },
  deptName: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#1e293b',
  },
  deptMeta: {
    fontSize: 11,
    fontFamily: FONT,
    color: '#94a3b8',
    marginTop: 2,
  },
  deptTotal: {
    fontSize: 18,
    fontFamily: FONT,
    color: '#334155',
    minWidth: 40,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  // Empty state
  emptyCard: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#64748b',
  },
  emptyHint: {
    fontSize: 12,
    fontFamily: FONT,
    color: '#94a3b8',
    textAlign: 'center',
  },
});
