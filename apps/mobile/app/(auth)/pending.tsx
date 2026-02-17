import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
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
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const initialCheckDone = useRef(false);

  const isSuspended = auth.status === 'suspended';

  // Core check function - stable reference
  const doCheck = useCallback(async () => {
    await checkApproval();
    setLastChecked(new Date());
  }, [checkApproval]);

  // Manual check with loading state - for button press
  const handleManualCheck = useCallback(async () => {
    if (checking) return;
    setChecking(true);
    try {
      await doCheck();
    } finally {
      setChecking(false);
    }
  }, [doCheck, checking]);

  // Initial check on mount - runs only once
  useEffect(() => {
    if (isSuspended || initialCheckDone.current) return;
    initialCheckDone.current = true;
    setChecking(true);
    doCheck().finally(() => setChecking(false));
  }, [isSuspended, doCheck]);

  // Poll for approval every 30s
  useEffect(() => {
    if (isSuspended) return;

    intervalRef.current = setInterval(() => {
      void doCheck();
    }, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isSuspended, doCheck]);

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
          <>
            {/* Manual refresh button */}
            <Pressable
              style={[styles.refreshBtn, checking && styles.refreshBtnDisabled]}
              onPress={handleManualCheck}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator color={BRAND_BLUE} size="small" />
              ) : (
                <Text style={styles.refreshText}>Verificar ahora</Text>
              )}
            </Pressable>

            <View style={styles.pollingNote}>
              <Text style={styles.pollingText}>
                {lastChecked
                  ? `Última verificación: ${lastChecked.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`
                  : 'Verificando...'}
              </Text>
              <Text style={styles.pollingSubtext}>
                Se verifica automáticamente cada 30 segundos
              </Text>
            </View>
          </>
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
  refreshBtn: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 40,
    marginTop: 16,
    minWidth: 180,
    alignItems: 'center',
    justifyContent: 'center',
  },
  refreshBtnDisabled: {
    opacity: 0.7,
  },
  refreshText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  pollingNote: {
    backgroundColor: 'rgba(22, 57, 96, 0.06)',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    gap: 4,
  },
  pollingText: {
    fontSize: 12,
    color: TEXT_DARK,
    fontFamily: FONT,
    textAlign: 'center',
  },
  pollingSubtext: {
    fontSize: 11,
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
