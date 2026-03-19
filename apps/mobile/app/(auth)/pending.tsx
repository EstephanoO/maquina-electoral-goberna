/**
 * Pending Screen — Esperando aprobación
 *
 * Muestra estado de espera después del registro.
 * Hace polling cada 30 segundos para verificar si ya fue aprobado.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';

// ─── Design Tokens ─────────────────────────────────────────────
const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.5)';
const BG_LIGHT = 'rgba(22, 57, 96, 0.04)';
const ERROR_RED = '#dc2626';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

const POLL_INTERVAL_MS = 30_000; // 30 seconds

export default function PendingScreen() {
  const { auth, checkApproval, logout } = useApp();
  // isMounted ref para no llamar setState sobre componente desmontado
  const isMountedRef = useRef(true);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mutex: evita que el poll automático y el manual corran concurrentemente
  const isCheckingRef = useRef(false);

  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const initialCheckDone = useRef(false);

  // Pulse animation for waiting icon
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const isSuspended = auth.status === 'suspended';

  // Cleanup al desmontar
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  // Start pulse animation
  useEffect(() => {
    if (isSuspended) return;

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, [isSuspended, pulseAnim]);

  // Core check — mutex via ref para evitar concurrencia manual+automático
  const doCheck = useCallback(async () => {
    if (isCheckingRef.current) return; // ya hay un check en vuelo
    isCheckingRef.current = true;
    try {
      await checkApproval();
      if (isMountedRef.current) setLastChecked(new Date());
    } finally {
      isCheckingRef.current = false;
    }
  }, [checkApproval]);

  // Manual check: además actualiza el indicador visual
  const handleManualCheck = useCallback(async () => {
    if (isCheckingRef.current) return;
    if (isMountedRef.current) setChecking(true);
    try {
      await doCheck();
    } finally {
      if (isMountedRef.current) setChecking(false);
    }
  }, [doCheck]);

  // Polling recursivo con setTimeout para respetar el intervalo entre llamadas completas
  // (no cada 30s fijos con setInterval que puede solaparse)
  const scheduleNextPoll = useCallback(() => {
    if (!isMountedRef.current || isSuspended) return;
    timeoutRef.current = setTimeout(async () => {
      await doCheck();
      scheduleNextPoll();
    }, POLL_INTERVAL_MS);
  }, [doCheck, isSuspended]);

  // Initial check on mount + arrancar polling
  useEffect(() => {
    if (isSuspended || initialCheckDone.current) return;
    initialCheckDone.current = true;

    if (isMountedRef.current) setChecking(true);
    doCheck().finally(() => {
      if (isMountedRef.current) setChecking(false);
      scheduleNextPoll();
    });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isSuspended, doCheck, scheduleNextPoll]);

  const handleLogout = () => {
    Alert.alert(
      'Cerrar sesión',
      '¿Estás seguro que quieres salir?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Salir', style: 'destructive', onPress: () => { void logout(); } },
      ],
    );
  };

  // Format time for display
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('es-PE', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Icon */}
        <Animated.View 
          style={[
            styles.iconCircle,
            isSuspended && styles.iconCircleSuspended,
            !isSuspended && { transform: [{ scale: pulseAnim }] }
          ]}
        >
          <Ionicons 
            name={isSuspended ? 'close' : 'hourglass-outline'} 
            size={40} 
            color={isSuspended ? '#FFFFFF' : BRAND_YELLOW} 
          />
        </Animated.View>

        {/* Title */}
        <Text style={[styles.title, isSuspended && styles.titleSuspended]}>
          {isSuspended ? 'Cuenta Suspendida' : 'Esperando Aprobación'}
        </Text>

        {/* Description */}
        <Text style={styles.description}>
          {isSuspended
            ? 'Tu cuenta ha sido suspendida. Contacta al administrador de tu campaña para más información.'
            : 'Tu solicitud fue enviada. Un supervisor debe aprobarla para que puedas ingresar.'}
        </Text>

        {/* Pending campaigns info */}
        {!isSuspended && auth.status === 'pending' && 'campaigns' in auth && auth.campaigns.length > 0 && (
          <View style={styles.infoCard}>
            <Ionicons name="people-outline" size={20} color={BRAND_BLUE} />
            <Text style={styles.infoText}>
              {auth.campaigns.length === 1 
                ? 'Solicitud enviada a 1 campaña'
                : `Solicitudes enviadas a ${auth.campaigns.length} campañas`
              }
            </Text>
          </View>
        )}

        {/* Actions for pending state */}
        {!isSuspended && (
          <>
            {/* Manual refresh button */}
            <Pressable
              style={({ pressed }) => [
                styles.refreshBtn,
                checking && styles.refreshBtnDisabled,
                pressed && !checking && styles.refreshBtnPressed,
              ]}
              onPress={handleManualCheck}
              disabled={checking}
            >
              {checking ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.refreshText}>Verificar Estado</Text>
                </>
              )}
            </Pressable>

            {/* Polling status */}
            <View style={styles.statusCard}>
              <View style={styles.statusRow}>
                <Ionicons name="time-outline" size={16} color={TEXT_MUTED} />
                <Text style={styles.statusText}>
                  {lastChecked
                    ? `Última verificación: ${formatTime(lastChecked)}`
                    : 'Verificando estado...'}
                </Text>
              </View>
              <Text style={styles.statusHint}>
                Se verifica automáticamente cada 30 segundos
              </Text>
            </View>
          </>
        )}

        {/* Logout button */}
        <Pressable 
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && styles.logoutBtnPressed,
          ]}
          onPress={handleLogout}
        >
          <Ionicons name="log-out-outline" size={18} color={BRAND_BLUE} />
          <Text style={styles.logoutText}>Cerrar Sesión</Text>
        </Pressable>

        {/* Help text */}
        <Text style={styles.helpText}>
          ¿Problemas? Contacta al responsable de tu campaña.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#FFFFFF' 
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  
  // Icon
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  iconCircleSuspended: {
    backgroundColor: ERROR_RED,
    shadowColor: ERROR_RED,
  },
  
  // Title
  title: {
    fontSize: 24,
    color: TEXT_DARK,
    fontFamily: FONT,
    textAlign: 'center',
  },
  titleSuspended: {
    color: ERROR_RED,
  },
  
  // Description
  description: {
    fontSize: 15,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    textAlign: 'center',
    lineHeight: 22,
    maxWidth: 300,
  },
  
  // Info Card
  infoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: BG_LIGHT,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  infoText: {
    fontSize: 14,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  
  // Refresh Button
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 32,
    marginTop: 16,
    minWidth: 200,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  refreshBtnDisabled: {
    opacity: 0.7,
  },
  refreshBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  refreshText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  // Status Card
  statusCard: {
    backgroundColor: BG_LIGHT,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    gap: 6,
    width: '100%',
    maxWidth: 280,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  statusText: {
    fontSize: 13,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  statusHint: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    textAlign: 'center',
  },
  
  // Logout Button
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_YELLOW,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    marginTop: 24,
  },
  logoutBtnPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  logoutText: {
    fontSize: 14,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  // Help Text
  helpText: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    textAlign: 'center',
    marginTop: 16,
  },
});
