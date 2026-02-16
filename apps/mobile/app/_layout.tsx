/**
 * Root Layout — Router guard basado en auth state.
 *
 * - loading → splash/null
 * - unauthenticated → (auth) group
 * - pending → (auth)/pending
 * - suspended → (auth)/pending (con mensaje diferente)
 * - active → (main) group con AppConfig cargada
 */

import { useEffect } from 'react';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import 'react-native-reanimated';

import { AppProvider, useApp } from '@/lib/app-context';

function RouterGuard({ children }: { children: React.ReactNode }) {
  const { auth } = useApp();
  const router = useRouter();
  const segments = useSegments() as string[];

  useEffect(() => {
    if (auth.status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';

    if (auth.status === 'unauthenticated') {
      if (!inAuthGroup) router.replace('/(auth)/login');
      return;
    }

    if (auth.status === 'pending' || auth.status === 'suspended') {
      if (segments[1] !== 'pending') router.replace('/(auth)/pending');
      return;
    }

    if (auth.status === 'active') {
      if (!inMainGroup) router.replace('/(main)/dashboard');
      return;
    }
  }, [auth.status, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Montserrat-Bold': require('@/assets/fonts/Montserrat/Montserrat-Bold.ttf'),
  });

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider value={DefaultTheme}>
      <AppProvider>
        <RouterGuard>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(main)" />
          </Stack>
        </RouterGuard>
      </AppProvider>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
