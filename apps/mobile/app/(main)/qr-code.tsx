/**
 * QR Code Screen — Goberna
 *
 * Cada brigadista tiene su propio QR estatico que redirige al canal de
 * WhatsApp de la campaña. El QR nunca expira y cada escaneo se
 * contabiliza automaticamente en el backend.
 */

import { useCallback, useEffect, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import Animated, { FadeIn } from 'react-native-reanimated';

import { useAgent, useCandidate, useActiveCampaign } from '@/lib/app-context';
import { API_BASE, getCampaign, getMyStaticQr } from '@/lib/api';

const FONT = 'Montserrat-Bold';
const FONT_MEDIUM = 'Montserrat-SemiBold';

export default function QrCodeScreen() {
  const router = useRouter();
  const agent = useAgent();
  const candidate = useCandidate();
  const campaign = useActiveCampaign();
  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [qrUrl, setQrUrl] = useState('');
  const [scanCount, setScanCount] = useState(0);

  const load = useCallback(async () => {
    setState('loading');
    if (!campaign) { setState('error'); return; }
    try {
      const campRes = await getCampaign(campaign.id);
      const channelUrl = campRes.ok
        ? (campRes.data?.campaign?.config as Record<string, unknown> | null)?.whatsapp_channel_url as string | undefined
        : undefined;

      if (!channelUrl) { setState('error'); return; }

      const res = await getMyStaticQr(channelUrl);
      if (!res.ok || !res.data) { setState('error'); return; }

      // Build full redirect URL (API_BASE = https://api.goberna.us/api)
      const baseOrigin = API_BASE.replace(/\/api$/, '');
      setQrUrl(`${baseOrigin}${res.data.redirect_url}`);
      setScanCount(res.data.scan_count);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [campaign]);

  useEffect(() => { void load(); }, [load]);

  const handleShare = useCallback(async () => {
    if (!qrUrl) return;
    await Share.share({
      message: `Unite al canal de WhatsApp de ${candidate.name}: ${qrUrl}`,
    });
  }, [qrUrl, candidate.name]);

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

      {/* QR Card */}
      <Animated.View entering={FadeIn.delay(150).duration(500)} style={styles.qrCard}>
        {state === 'loading' && (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={primary} />
            <Text style={styles.loadingText}>Cargando QR...</Text>
          </View>
        )}

        {state === 'ready' && qrUrl !== '' && (
          <>
            <View style={styles.qrWrapper}>
              <QRCode value={qrUrl} size={200} color="#1e293b" backgroundColor="#ffffff" />
            </View>
            <Text style={styles.agentName}>{agent.full_name}</Text>
            <Text style={styles.hint}>Escanea para unirte al canal</Text>

            {/* Share button */}
            <Pressable
              style={({ pressed }) => [styles.shareBtn, { opacity: pressed ? 0.8 : 1 }]}
              onPress={handleShare}
            >
              <MaterialIcons name="share" size={16} color="#64748b" />
              <Text style={styles.shareBtnText}>Compartir enlace</Text>
            </Pressable>
          </>
        )}

        {state === 'error' && (
          <View style={styles.centerBox}>
            <MaterialIcons name="link-off" size={40} color="#cbd5e1" />
            <Text style={styles.errorTitle}>Canal no configurado</Text>
            <Pressable
              style={({ pressed }) => [styles.retryBtn, { backgroundColor: primary, opacity: pressed ? 0.85 : 1 }]}
              onPress={load}
            >
              <Text style={styles.retryBtnText}>Reintentar</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>

      {/* Scan counter */}
      <Animated.View entering={FadeIn.delay(350).duration(500)} style={styles.statsRow}>
        <View style={styles.statCard}>
          <Text style={[styles.statValue, { color: secondary }]}>{scanCount}</Text>
          <Text style={styles.statLabel}>Escaneos</Text>
        </View>
      </Animated.View>

      {/* Manual capture CTA — para registrar el dato sin esperar que escaneen */}
      <Animated.View entering={FadeIn.delay(500).duration(500)} style={styles.manualWrapper}>
        <Pressable
          style={({ pressed }) => [
            styles.manualBtn,
            { backgroundColor: secondary, opacity: pressed ? 0.85 : 1 },
          ]}
          onPress={() => router.push('/(main)/new-form')}
          accessibilityLabel="Registrar dato manualmente"
        >
          <MaterialIcons name="edit-note" size={22} color={primary} />
          <Text style={[styles.manualBtnText, { color: primary }]}>
            Registrar manualmente
          </Text>
        </Pressable>
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
    marginBottom: 16,
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

  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
  },
  shareBtnText: {
    fontSize: 12,
    fontFamily: FONT_MEDIUM,
    color: '#64748b',
  },

  errorTitle: {
    fontSize: 14,
    fontFamily: FONT,
    color: '#94a3b8',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    marginTop: 8,
  },
  retryBtnText: {
    fontSize: 13,
    fontFamily: FONT,
    color: '#ffffff',
  },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    marginHorizontal: 24,
    paddingVertical: 16,
    paddingHorizontal: 32,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 28,
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

  manualWrapper: {
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  manualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  manualBtnText: {
    fontSize: 14,
    fontFamily: FONT,
    letterSpacing: 0.5,
  },
});
