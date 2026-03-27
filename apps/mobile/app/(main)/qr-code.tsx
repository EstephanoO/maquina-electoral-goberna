/**
 * QR Code Screen — Goberna
 *
 * Cada brigadista tiene su propio QR que redirige al canal de WhatsApp
 * de la campaña. Al escanearlo:
 * 1. El backend registra el escaneo automaticamente (qr_leads table)
 * 2. Redirige 302 al canal de WhatsApp
 * 3. Esta pantalla detecta el escaneo via polling y muestra confirmacion
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useAgent, useCandidate, useActiveCampaign } from '@/lib/app-context';
import {
  API_BASE,
  getCampaign,
  getMyQrStats,
  createQrCode,
  checkQrCodeStatus,
} from '@/lib/api';

const FONT = 'Montserrat-Bold';
const FONT_MEDIUM = 'Montserrat-SemiBold';

export default function QrCodeScreen() {
  const router = useRouter();
  const agent = useAgent();
  const candidate = useCandidate();
  const campaign = useActiveCampaign();
  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const [stats, setStats] = useState<{ total: number; today: number; this_week: number } | null>(null);
  const [qrState, setQrState] = useState<'loading' | 'ready' | 'scanned' | 'error'>('loading');
  const [qrUrl, setQrUrl] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStats = useCallback(async () => {
    const res = await getMyQrStats();
    if (res.ok && res.data?.stats) setStats(res.data.stats);
  }, []);

  const generateQR = useCallback(async () => {
    setQrState('loading');
    setQrUrl('');
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }

    try {
      const campRes = await getCampaign(campaign.id);
      const channelUrl = campRes.ok
        ? (campRes.data?.campaign?.config as Record<string, unknown> | null)?.whatsapp_channel_url as string | undefined
        : undefined;

      if (!channelUrl) { setQrState('error'); return; }

      const codeRes = await createQrCode(channelUrl);
      if (!codeRes.ok || !codeRes.data?.code) { setQrState('error'); return; }

      const code = codeRes.data.code;
      setQrUrl(`${API_BASE}/qr-leads/redirect/${code}`);
      setQrState('ready');

      pollRef.current = setInterval(async () => {
        try {
          const check = await checkQrCodeStatus(code);
          if (check.ok && check.data?.scanned) {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setQrState('scanned');
            void loadStats();
          }
        } catch { /* ignore */ }
      }, 2000);
    } catch {
      setQrState('error');
    }
  }, [campaign.id, loadStats]);

  useEffect(() => {
    void generateQR();
    void loadStats();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [generateQR, loadStats]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: primary }]}>
      {/* Back button */}
      <View style={styles.topBar}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
          <MaterialIcons name="arrow-back" size={20} color="rgba(255,255,255,0.9)" />
        </Pressable>
      </View>

      {/* Candidate profile */}
      <Animated.View entering={FadeIn.duration(400)} style={styles.profile}>
        <Text style={styles.candidateName}>{candidate.name}</Text>
        <Text style={styles.candidateInfo}>#{candidate.numero} · {candidate.partido}</Text>
      </Animated.View>

      {/* QR Card — centered */}
      <Animated.View entering={FadeIn.delay(150).duration(500)} style={styles.qrCard}>
        {qrState === 'loading' && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={primary} />
            <Text style={styles.loadingText}>Generando QR...</Text>
          </View>
        )}

        {qrState === 'ready' && qrUrl !== '' && (
          <>
            <View style={styles.qrWrapper}>
              <QRCode value={qrUrl} size={200} color="#1e293b" backgroundColor="#ffffff" />
            </View>
            <Text style={styles.agentName}>{agent.full_name}</Text>
            <Text style={styles.hint}>Escanear para unirse al canal</Text>
            <View style={styles.waitingRow}>
              <View style={styles.waitingDot} />
              <Text style={styles.waitingLabel}>Esperando escaneo...</Text>
            </View>
          </>
        )}

        {qrState === 'scanned' && (
          <View style={styles.centerBox}>
            <View style={styles.checkCircle}>
              <MaterialIcons name="check" size={28} color="#ffffff" />
            </View>
            <Text style={styles.scannedTitle}>Escaneado</Text>
            <Text style={styles.scannedSub}>Contacto registrado</Text>
            <Pressable
              style={({ pressed }) => [styles.newQrBtn, { backgroundColor: primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={generateQR}
            >
              <MaterialIcons name="refresh" size={16} color="#fff" />
              <Text style={styles.newQrBtnText}>Nuevo QR</Text>
            </Pressable>
          </View>
        )}

        {qrState === 'error' && (
          <View style={styles.centerBox}>
            <MaterialIcons name="link-off" size={40} color="#cbd5e1" />
            <Text style={styles.errorTitle}>Canal no configurado</Text>
            <Pressable
              style={({ pressed }) => [styles.newQrBtn, { backgroundColor: primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={generateQR}
            >
              <Text style={styles.newQrBtnText}>Reintentar</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>

      {/* Stats row */}
      <Animated.View entering={FadeIn.delay(350).duration(500)} style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#ffffff' }]}>{stats?.total ?? '—'}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: secondary }]}>{stats?.today ?? '—'}</Text>
          <Text style={styles.statLabel}>Hoy</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: '#4ade80' }]}>{stats?.this_week ?? '—'}</Text>
          <Text style={styles.statLabel}>Semana</Text>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    alignItems: 'center',
  },
  topBar: {
    width: '100%',
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 8,
    flexDirection: 'row',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Candidate profile
  profile: {
    alignItems: 'center',
    marginBottom: 20,
  },
  candidateName: {
    fontSize: 20,
    fontFamily: FONT,
    color: '#ffffff',
    letterSpacing: 0.2,
  },
  candidateInfo: {
    fontSize: 12,
    fontFamily: FONT_MEDIUM,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 4,
    letterSpacing: 0.3,
  },

  // QR Card
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 24,
    marginHorizontal: 24,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 6 },
    shadowRadius: 16,
    elevation: 8,
    minHeight: 320,
    justifyContent: 'center',
  },
  qrWrapper: {
    padding: 16,
    marginBottom: 16,
  },
  agentName: {
    fontSize: 15,
    fontFamily: FONT,
    color: '#1e293b',
    marginBottom: 2,
  },
  hint: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: FONT_MEDIUM,
    marginBottom: 12,
  },
  centerBox: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 20,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: FONT_MEDIUM,
    color: '#94a3b8',
    marginTop: 4,
  },

  // Waiting
  waitingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  waitingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#25D366',
  },
  waitingLabel: {
    fontSize: 11,
    fontFamily: FONT_MEDIUM,
    color: '#64748b',
  },

  // Scanned
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#25D366',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scannedTitle: {
    fontSize: 18,
    fontFamily: FONT,
    color: '#1e293b',
  },
  scannedSub: {
    fontSize: 12,
    fontFamily: FONT_MEDIUM,
    color: '#94a3b8',
  },
  newQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginTop: 8,
  },
  newQrBtnText: {
    fontSize: 13,
    fontFamily: FONT,
    color: '#ffffff',
  },

  // Error
  errorTitle: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#94a3b8',
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    marginHorizontal: 24,
    paddingVertical: 16,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontFamily: FONT,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontSize: 9,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 28,
  },
});
