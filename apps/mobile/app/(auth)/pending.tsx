import { useEffect, useRef } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApp } from '@/lib/app-context';

const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';
const FONT = 'Montserrat-Bold';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function PendingScreen() {
  const { auth, checkApproval, logout } = useApp();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isSuspended = auth.status === 'suspended';

  // Poll for approval every 30s
  useEffect(() => {
    if (isSuspended) return;

    void checkApproval();

    intervalRef.current = setInterval(() => {
      void checkApproval();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [checkApproval, isSuspended]);

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesion',
      'Estas seguro que quieres salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: logout },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>{isSuspended ? '✕' : '⏳'}</Text>
        </View>

        <Text style={styles.title}>
          {isSuspended ? 'Cuenta suspendida' : 'Esperando aprobacion'}
        </Text>

        <Text style={styles.description}>
          {isSuspended
            ? 'Tu cuenta ha sido suspendida. Contacta al administrador para mas informacion.'
            : 'Tu solicitud de acceso fue enviada. Un administrador debe aprobarla para que puedas ingresar. Esto puede tomar unos minutos.'}
        </Text>

        {!isSuspended && auth.status === 'pending' && 'campaigns' in auth && auth.campaigns.length > 0 && (
          <View style={styles.pendingNote}>
            <Text style={styles.pendingText}>
              Tienes {auth.campaigns.length} campana(s) esperando aprobacion.
            </Text>
          </View>
        )}

        {!isSuspended && (
          <View style={styles.pollingNote}>
            <Text style={styles.pollingText}>
              Verificando automaticamente cada 30 segundos...
            </Text>
          </View>
        )}

        <Pressable style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>Cerrar sesion</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  iconText: { fontSize: 36 },
  title: {
    fontSize: 22,
    color: TEXT_DARK,
    fontFamily: FONT,
    textAlign: 'center',
  },
  description: {
    fontSize: 15,
    color: TEXT_MUTED,
    fontFamily: FONT,
    textAlign: 'center',
    lineHeight: 22,
  },
  pollingNote: {
    backgroundColor: 'rgba(22, 57, 96, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  pollingText: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT,
    textAlign: 'center',
  },
  pendingNote: {
    backgroundColor: 'rgba(22, 57, 96, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  pendingText: {
    fontSize: 13,
    color: TEXT_DARK,
    fontFamily: FONT,
    textAlign: 'center',
  },
  logoutBtn: {
    backgroundColor: BRAND_YELLOW,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 32,
    marginTop: 16,
  },
  logoutText: {
    fontSize: 14,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
