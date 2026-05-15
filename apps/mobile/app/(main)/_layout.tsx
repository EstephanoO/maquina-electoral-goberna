/**
 * Main Layout — Tabs with dynamic colors from AppConfig.
 * 
 * Tab visibility:
 * - Dashboard: Always visible
 * - Ranking: Always visible (department + departments ranking)
 * - Solicitudes: Only for candidato and above
 * - new-form: Hidden (accessed via FAB)
 */

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';

export default function MainLayout() {
  const { auth } = useApp();

  // During logout the router hasn't navigated away yet — render nothing
  if (auth.status !== 'active') return null;

  const { candidate, agent } = auth.config;

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  // Solicitudes tab visible for candidato and above
  const showSolicitudes = ['admin', 'consultor', 'candidato'].includes(agent.role);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Usar el color secundario de la campaña para el ícono activo.
        // Fallback a amber si secondary es undefined o el mismo que primary
        // (para evitar íconos invisibles sobre el fondo del tab bar).
        tabBarActiveTintColor: secondary !== primary ? secondary : '#fbbf24',
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.6)',
        tabBarStyle: {
          backgroundColor: primary,
          borderTopWidth: 0,
          height: 70,
          paddingBottom: 10,
          paddingTop: 10,
        },
      }}
    >
      <Tabs.Screen
        name="contacts"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="people" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="ranking"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="leaderboard" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="solicitudes"
        options={{
          // Hide tab for non-admin/non-candidate
          href: showSolicitudes ? undefined : null,
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="assignment-ind" size={28} color={color} />
          ),
        }}
      />
      {/* qr-code is a hidden screen, accessed via FAB from dashboard */}
      <Tabs.Screen
        name="qr-code"
        options={{ href: null }}
      />
      {/* new-form is a hidden screen, accessed via FAB (+) from dashboard */}
      <Tabs.Screen
        name="new-form"
        options={{ href: null }}
      />
    </Tabs>
  );
}
