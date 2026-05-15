/**
 * Root Layout — Router guard basado en auth state.
 *
 * - loading → splash/null
 * - unauthenticated → (auth)/login
 * - suspended → (auth)/login (con alerta, no se redirige a otro screen)
 * - active → (main) group con AppConfig cargada
 */

import { useEffect } from 'react';
import { DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';

import 'react-native-reanimated';

import { AppProvider, useApp } from '@/lib/app-context';

// Keep the splash screen visible while fonts load
SplashScreen.preventAutoHideAsync();

function RouterGuard({ children }: { children: React.ReactNode }) {
  const { auth } = useApp();
  const router = useRouter();
  const segments = useSegments() as string[];

  useEffect(() => {
    if (auth.status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';
    const inMainGroup = segments[0] === '(main)';

    // Deep link invite flow: allow unauthenticated users to stay on /invite/[code]
    // without being redirected to login. The invite screen handles its own auth.
    const inInviteScreen = segments[0] === '(auth)' && segments[1] === 'invite';

    if (auth.status === 'unauthenticated' || auth.status === 'suspended') {
      if (inInviteScreen) return;
      if (!inAuthGroup || segments[1] !== 'login') router.replace('/(auth)/login');
      return;
    }

    if (auth.status === 'active') {
      // TODO Task 7: → /(main)/contacts once that screen exists
      if (!inMainGroup) router.replace('/(main)/dashboard');
      return;
    }
  }, [auth.status, segments, router]);

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Montserrat-Bold': require('@/assets/fonts/Montserrat/Montserrat-Bold.ttf'),
    'Montserrat-Regular': require('@/assets/fonts/Montserrat/Montserrat-Regular.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

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
