/**
 * Main Layout — Tabs with dynamic colors from AppConfig.
 * Solicitudes tab is hidden for non-admin roles.
 */

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { useCandidate, useAgent } from '@/lib/app-context';

export default function MainLayout() {
  const candidate = useCandidate();
  const agent = useAgent();

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  // Solicitudes tab only visible for admin role
  const showSolicitudes = agent.role === 'admin';

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
