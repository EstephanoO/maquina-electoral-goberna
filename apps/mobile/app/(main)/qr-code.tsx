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
  ScrollView,
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
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useAgent, useCandidate, useActiveCampaign } from '@/lib/app-context';
import {
  API_BASE,
  getCampaign,
  getMyQrStats,
  createQrCode,
  checkQrCodeStatus,
} from '@/lib/api';

const FONT = 'Montserrat-Bold';

// ── Stat Card ─────────────────────────────────────────────────────────
function StatCard({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <View style={statStyles.card}>
      <Text style={[statStyles.value, { color }]}>{value === null ? '—' : String(value)}</Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 14, paddingHorizontal: 8 },
  value: { fontSize: 26, fontFamily: FONT, fontVariant: ['tabular-nums'] },
  label: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontFamily: FONT, textTransform: 'uppercase', marginTop: 4, letterSpacing: 0.4 },
});

// ── Main Screen ───────────────────────────────────────────────────────
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
      // Get WhatsApp channel URL from campaign config
      const campRes = await getCampaign(campaign.id);
      const channelUrl = campRes.ok
        ? (campRes.data?.campaign?.config as Record<string, unknown> | null)?.whatsapp_channel_url as string | undefined
        : undefined;

      if (!channelUrl) { setQrState('error'); return; }

      // Create scan code on backend
      const codeRes = await createQrCode(channelUrl);
      if (!codeRes.ok || !codeRes.data?.code) { setQrState('error'); return; }

      const code = codeRes.data.code;
      setQrUrl(`${API_BASE}/qr-leads/redirect/${code}`);
      setQrState('ready');

      // Poll for scan detection
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
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
              <MaterialIcons name="arrow-back" size={22} color="rgba(255,255,255,0.9)" />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Mi codigo QR</Text>
              <Text style={styles.subtitle}>Mostralo — al escanearlo se une al canal de WhatsApp</Text>
            </View>
          </View>
        </View>

        {/* QR Card */}
        <Animated.View entering={ZoomIn.springify().damping(14).stiffness(120)} style={styles.qrCard}>
          <View style={[styles.qrBadge, { backgroundColor: primary }]}>
            <Text style={[styles.qrBadgeText, { color: secondary }]}>
              {candidate.name} · #{candidate.numero}
            </Text>
          </View>

          {qrState === 'loading' && (
            <View style={styles.centerBox}>
              <ActivityIndicator size="large" color={primary} />
              <Text style={styles.grayText}>Generando QR...</Text>
            </View>
          )}

          {qrState === 'ready' && qrUrl !== '' && (
            <>
              <View style={styles.qrWrapper}>
                <QRCode value={qrUrl} size={220} color="#1e293b" backgroundColor="#ffffff" />
              </View>
              <Text style={styles.agentName}>{agent.full_name}</Text>
              <Text style={styles.hint}>Abre el canal de WhatsApp de la campaña</Text>
              <View style={styles.waitingRow}>
                <View style={styles.waitingDot} />
                <Text style={styles.waitingText}>Esperando escaneo...</Text>
              </View>
            </>
          )}

          {qrState === 'scanned' && (
            <View style={styles.centerBox}>
              <View style={styles.checkCircle}>
                <MaterialIcons name="check" size={32} color="#ffffff" />
              </View>
              <Text style={styles.darkTitle}>QR Escaneado</Text>
              <Text style={styles.grayText}>Contacto registrado automaticamente</Text>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: secondary, opacity: pressed ? 0.85 : 1 }]}
                onPress={generateQR}
              >
                <MaterialIcons name="refresh" size={18} color={primary} />
                <Text style={[styles.actionBtnText, { color: primary }]}>Generar nuevo QR</Text>
              </Pressable>
            </View>
          )}

          {qrState === 'error' && (
            <View style={styles.centerBox}>
              <MaterialIcons name="error-outline" size={48} color="#ef4444" />
              <Text style={styles.darkTitle}>Sin canal configurado</Text>
              <Text style={styles.grayText}>La campaña no tiene un canal de WhatsApp configurado</Text>
              <Pressable
                style={({ pressed }) => [styles.actionBtn, { backgroundColor: secondary, opacity: pressed ? 0.85 : 1 }]}
                onPress={generateQR}
              >
                <Text style={[styles.actionBtnText, { color: primary }]}>Reintentar</Text>
              </Pressable>
            </View>
          )}
        </Animated.View>

        {/* Stats */}
        <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.statsRow}>
          <StatCard label="Total" value={stats?.total ?? null} color="#ffffff" />
          <View style={{ width: 10 }} />
          <StatCard label="Hoy" value={stats?.today ?? null} color={secondary} />
          <View style={{ width: 10 }} />
          <StatCard label="Esta semana" value={stats?.this_week ?? null} color="#4ade80" />
        </Animated.View>

        {/* Info */}
        <Animated.View entering={FadeIn.delay(400).duration(400)} style={styles.infoCard}>
          <Text style={styles.infoTitle}>¿Como funciona?</Text>
          {[
            { icon: 'qr-code-scanner', text: 'El ciudadano escanea tu QR con la camara' },
            { icon: 'chat', text: 'Se abre el canal de WhatsApp de la campaña' },
            { icon: 'check-circle', text: 'El escaneo se cuenta automaticamente' },
            { icon: 'leaderboard', text: 'Tu alcance aparece en el ranking' },
          ].map(({ icon, text }, i) => (
            <View key={i} style={styles.infoRow}>
              <View style={[styles.infoIcon, { backgroundColor: `${secondary}25` }]}>
                <MaterialIcons name={icon as keyof typeof MaterialIcons.glyphMap} size={16} color={secondary} />
              </View>
              <Text style={styles.infoText}>{text}</Text>
            </View>
          ))}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  title: { fontSize: 24, fontFamily: FONT, color: '#ffffff', marginBottom: 6 },
  subtitle: { fontSize: 13, color: 'rgba(255,255,255,0.65)', fontFamily: FONT, lineHeight: 20 },
  qrCard: { backgroundColor: '#ffffff', borderRadius: 20, alignItems: 'center', paddingBottom: 20, paddingTop: 0, marginBottom: 20, shadowColor: '#000', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 8 }, shadowRadius: 20, elevation: 8, overflow: 'hidden' },
  qrBadge: { width: '100%', paddingVertical: 10, paddingHorizontal: 20, marginBottom: 20, alignItems: 'center' },
  qrBadgeText: { fontSize: 13, fontFamily: FONT, letterSpacing: 0.3 },
  qrWrapper: { padding: 12, backgroundColor: '#ffffff', borderRadius: 12, marginBottom: 16 },
  agentName: { fontSize: 16, fontFamily: FONT, color: '#1e293b', marginBottom: 4 },
  hint: { fontSize: 11, color: '#94a3b8', fontFamily: FONT, textAlign: 'center', paddingHorizontal: 20, marginBottom: 8 },
  centerBox: { paddingVertical: 40, alignItems: 'center', gap: 8, paddingHorizontal: 20 },
  grayText: { fontSize: 12, fontFamily: FONT, color: '#94a3b8', textAlign: 'center' },
  darkTitle: { fontSize: 18, fontFamily: FONT, color: '#1e293b' },
  checkCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#25D366', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, marginTop: 12 },
  actionBtnText: { fontSize: 14, fontFamily: FONT },
  waitingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  waitingDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#25D366' },
  waitingText: { fontSize: 11, fontFamily: FONT, color: '#94a3b8' },
  statsRow: { flexDirection: 'row', marginBottom: 20 },
  infoCard: { backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  infoTitle: { fontSize: 13, fontFamily: FONT, color: 'rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  infoIcon: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  infoText: { flex: 1, fontSize: 13, fontFamily: FONT, color: 'rgba(255,255,255,0.7)', lineHeight: 18 },
});
