/**
 * QR Code Screen — Goberna
 *
 * Cada brigadista tiene su propio QR personalizado.
 * Al escanearlo, el ciudadano abre WhatsApp con un mensaje pre-cargado
 * dirigido al número del Dr. César Vásquez (o del candidato activo).
 *
 * Funcionalidad:
 * - Genera QR con deep link wa.me personalizado (nombre + campaña del brigadista)
 * - Botón "Registrar contacto" → POST /api/qr-leads/scan (cuenta el alcance del brigadista)
 * - Stats: total / hoy / esta semana
 * - Botón compartir (copia el link al clipboard o share sheet nativo)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Clipboard,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';

import { useAgent, useCandidate, useActiveCampaign } from '@/lib/app-context';
import { recordQrScan, getMyQrStats } from '@/lib/api';

const FONT = 'Montserrat-Bold';

// ── WhatsApp number for the candidate (fallback hardcoded, overridden by campaign config) ──
// In production, this should come from campaign.whatsapp_number or similar config field.
// For now, read from candidato or fall back to a known number.
const FALLBACK_WA_NUMBER = '51999999999'; // Replace with Dr. César Vásquez's actual number

// ── Build the WA deep link ────────────────────────────────────────────
function buildWaLink(waNumber: string, brigadistaName: string, candidateName: string): string {
  const firstName = brigadistaName.split(' ')[0] ?? brigadistaName;
  const msg = encodeURIComponent(
    `Hola, me enteré de la campaña de ${candidateName} a través de ${firstName}. Me gustaría saber más.`
  );
  return `https://wa.me/${waNumber}?text=${msg}`;
}

// ── Stat Card ─────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: number | null;
  color: string;
}) {
  return (
    <View style={statStyles.card}>
      <Text style={[statStyles.value, { color }]}>
        {value === null ? '—' : String(value)}
      </Text>
      <Text style={statStyles.label}>{label}</Text>
    </View>
  );
}

const statStyles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  value: {
    fontSize: 26,
    fontFamily: FONT,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: FONT,
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.4,
  },
});

// ── Main Screen ───────────────────────────────────────────────────────
export default function QrCodeScreen() {
  const agent      = useAgent();
  const candidate  = useCandidate();
  const campaign   = useActiveCampaign();
  const primary    = candidate.color_primario;
  const secondary  = candidate.color_secundario;

  // Use campaign whatsapp_number if available, else fallback
  // Cast to any to avoid TS error if the field doesn't exist yet in types
  const waNumber: string =
    (campaign as Record<string, unknown>).whatsapp_number as string | undefined
    ?? FALLBACK_WA_NUMBER;

  const waLink = buildWaLink(waNumber, agent.full_name, candidate.name);

  const [stats, setStats] = useState<{ total: number; today: number; this_week: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const qrRef = useRef<{ toDataURL?: (cb: (data: string) => void) => void }>(null);

  // Load stats on mount
  const loadStats = useCallback(async () => {
    const res = await getMyQrStats();
    if (res.ok && res.data?.stats) {
      setStats(res.data.stats);
    }
  }, []);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  // Record a manual scan event
  const handleRecordContact = useCallback(async () => {
    if (recording) return;
    setRecording(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const res = await recordQrScan({ scan_source: 'manual' });
    setRecording(false);

    if (res.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setLastRecorded(new Date().toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }));
      await loadStats();
    } else {
      Alert.alert('Error', 'No se pudo registrar el contacto. Verificá tu conexión.');
    }
  }, [recording, loadStats]);

  // Share the WA link
  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await Share.share({
        message: Platform.OS === 'ios' ? waLink : `Contactar campaña: ${waLink}`,
        url: Platform.OS === 'ios' ? waLink : undefined,
        title: `Campaña ${candidate.name}`,
      });
    } catch {
      // User dismissed
    }
  }, [waLink, candidate.name]);

  // Copy link to clipboard
  const handleCopy = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Clipboard.setString(waLink);
    Alert.alert('Copiado', 'El enlace fue copiado al portapapeles.');
  }, [waLink]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: primary }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Mi código QR</Text>
          <Text style={styles.subtitle}>
            Mostralo — cuando alguien lo escanea, WhatsApp se abre automáticamente
          </Text>
        </View>

        {/* QR Card */}
        <Animated.View
          entering={ZoomIn.springify().damping(14).stiffness(120)}
          style={styles.qrCard}
        >
          {/* Candidate name above QR */}
          <View style={[styles.qrBadge, { backgroundColor: primary }]}>
            <Text style={[styles.qrBadgeText, { color: secondary }]}>
              {candidate.name} · #{candidate.numero}
            </Text>
          </View>

          {/* QR Code */}
          <View style={styles.qrWrapper}>
            <QRCode
              value={waLink}
              size={220}
              color="#1e293b"
              backgroundColor="#ffffff"
              // @ts-ignore — ref typing from library
              getRef={qrRef}
              logo={undefined}
              logoSize={0}
            />
          </View>

          {/* Agent name below QR */}
          <Text style={styles.qrAgentName}>
            {agent.full_name}
          </Text>
          <Text style={styles.qrHint}>
            Abre WhatsApp directo al número de la campaña
          </Text>
        </Animated.View>

        {/* Stats */}
        <Animated.View entering={FadeIn.delay(200).duration(400)} style={styles.statsRow}>
          <StatCard
            label="Total"
            value={stats?.total ?? null}
            color="#ffffff"
          />
          <View style={styles.statGap} />
          <StatCard
            label="Hoy"
            value={stats?.today ?? null}
            color={secondary}
          />
          <View style={styles.statGap} />
          <StatCard
            label="Esta semana"
            value={stats?.this_week ?? null}
            color="#4ade80"
          />
        </Animated.View>

        {/* Action Buttons */}
        <Animated.View entering={FadeIn.delay(350).duration(400)} style={styles.actions}>

          {/* Primary: Record contact */}
          <Pressable
            style={({ pressed }) => [
              styles.btnPrimary,
              { backgroundColor: secondary, opacity: pressed ? 0.85 : 1 },
            ]}
            onPress={handleRecordContact}
            disabled={recording}
            android_ripple={{ color: 'rgba(0,0,0,0.1)' }}
            accessibilityLabel="Registrar contacto"
          >
            {recording ? (
              <ActivityIndicator color={primary} size="small" />
            ) : (
              <>
                <MaterialIcons name="person-add" size={20} color={primary} />
                <Text style={[styles.btnPrimaryText, { color: primary }]}>
                  Registrar contacto
                </Text>
              </>
            )}
          </Pressable>

          {lastRecorded && (
            <Text style={styles.lastRecordedText}>
              ✓ Registrado a las {lastRecorded}
            </Text>
          )}

          {/* Secondary row: Share + Copy */}
          <View style={styles.secondaryRow}>
            <Pressable
              style={({ pressed }) => [
                styles.btnSecondary,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleShare}
              android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
              accessibilityLabel="Compartir enlace"
            >
              <MaterialIcons name="share" size={18} color="rgba(255,255,255,0.9)" />
              <Text style={styles.btnSecondaryText}>Compartir</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.btnSecondary,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={handleCopy}
              android_ripple={{ color: 'rgba(255,255,255,0.1)' }}
              accessibilityLabel="Copiar enlace"
            >
              <MaterialIcons name="content-copy" size={18} color="rgba(255,255,255,0.9)" />
              <Text style={styles.btnSecondaryText}>Copiar link</Text>
            </Pressable>
          </View>
        </Animated.View>

        {/* How it works */}
        <Animated.View entering={FadeIn.delay(500).duration(400)} style={styles.infoCard}>
          <Text style={styles.infoTitle}>¿Cómo funciona?</Text>
          {[
            { icon: 'qr-code-scanner', text: 'El ciudadano escanea tu QR con la cámara' },
            { icon: 'chat', text: 'WhatsApp se abre con un mensaje listo para enviar al número de la campaña' },
            { icon: 'person-add', text: 'Tocá "Registrar contacto" para contar cada persona que mostraste el QR' },
            { icon: 'leaderboard', text: 'Tu alcance aparece en el ranking de la campaña' },
          ].map(({ icon, text }, i) => (
            <View key={i} style={styles.infoRow}>
              <View style={[styles.infoIconBg, { backgroundColor: `${secondary}25` }]}>
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
  safe: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 40,
  },

  // Header
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 24,
    fontFamily: FONT,
    color: '#ffffff',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.65)',
    fontFamily: FONT,
    lineHeight: 20,
  },

  // QR Card
  qrCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    alignItems: 'center',
    paddingBottom: 20,
    paddingTop: 0,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 20,
    elevation: 8,
    overflow: 'hidden',
  },
  qrBadge: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  qrBadgeText: {
    fontSize: 13,
    fontFamily: FONT,
    letterSpacing: 0.3,
  },
  qrWrapper: {
    padding: 12,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
  },
  qrAgentName: {
    fontSize: 16,
    fontFamily: FONT,
    color: '#1e293b',
    marginBottom: 4,
  },
  qrHint: {
    fontSize: 11,
    color: '#94a3b8',
    fontFamily: FONT,
    textAlign: 'center',
    paddingHorizontal: 20,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  statGap: {
    width: 10,
  },

  // Actions
  actions: {
    marginBottom: 20,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
    marginBottom: 8,
    minHeight: 56,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 8,
    elevation: 4,
  },
  btnPrimaryText: {
    fontSize: 16,
    fontFamily: FONT,
  },
  lastRecordedText: {
    fontSize: 11,
    color: '#4ade80',
    fontFamily: FONT,
    textAlign: 'center',
    marginBottom: 12,
  },
  secondaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  btnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    minHeight: 48,
  },
  btnSecondaryText: {
    fontSize: 14,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.9)',
  },

  // Info card
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  infoTitle: {
    fontSize: 13,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  infoIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: FONT,
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 18,
  },
});
