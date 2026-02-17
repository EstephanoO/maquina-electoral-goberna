/**
 * Main Layout — Tabs with dynamic colors from AppConfig.
 * 
 * Tab visibility:
 * - Dashboard: Always visible
 * - Reuniones (Metas): Always visible  
 * - Solicitudes: Only for admin/supervisor roles
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

  // Solicitudes tab visible for admin and supervisor roles
  const showSolicitudes = agent.role === 'admin' || agent.role === 'supervisor';

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: secondary,
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
        name="dashboard"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="table-chart" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reuniones"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="map" size={28} color={color} />
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
      {/* new-form is a hidden screen, accessed via FAB (+) from dashboard */}
      <Tabs.Screen
        name="new-form"
        options={{ href: null }}
      />
    </Tabs>
  );
}
