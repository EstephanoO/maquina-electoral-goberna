/**
 * Main Layout — Tabs with dynamic colors from AppConfig.
 *
 * Visible tabs:
 * - contacts: Contact list and canvassing actions
 * - map: Geographic view of canvassing activity
 * - reminders: Follow-up reminders and notifications
 * - profile: User profile and settings
 *
 * Hidden screens (href: null):
 * - add-contact: Accessed via FAB (+) from contacts
 * - contact/[id]: Accessed via row tap from contacts list
 */

import { Tabs } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';

export default function MainLayout() {
  const { auth } = useApp();

  // During logout the router hasn't navigated away yet — render nothing
  if (auth.status !== 'active') return null;

  const { candidate } = auth.config;

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // Use the campaign secondary color for the active icon.
        // Fallback to amber if secondary is undefined or same as primary
        // (to avoid invisible icons on the tab bar background).
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
        name="map"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="map" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="reminders"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="notifications" size={28} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="person" size={28} color={color} />
          ),
        }}
      />
      {/* add-contact is a hidden screen, accessed via FAB (+) from contacts */}
      <Tabs.Screen
        name="add-contact"
        options={{ href: null }}
      />
      {/* contact/[id] is a hidden screen, accessed via row tap from contacts list */}
      <Tabs.Screen
        name="contact/[id]"
        options={{ href: null }}
      />
    </Tabs>
  );
}
