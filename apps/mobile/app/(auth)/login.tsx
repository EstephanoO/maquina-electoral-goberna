/**
 * Login Screen — flujo OTP-only canvassing-style.
 *
 * Estados:
 *   1. 'phone'  → ingresa teléfono, dispara OTP
 *   2. 'code'   → ingresa OTP de 6 dígitos
 *   3. 'link'   → user autenticado pero sin campaña asignada → pide access_code
 *
 * El backend auto-crea el user si no existe (en /whatsapp/verify), por lo que
 * NO hay fase de registro. Después de verificar el código el user ya está
 * adentro; si no tiene campaña, el RouterGuard lo mantiene en esta pantalla
 * con la fase 'link' que es el card "Enlazate a una campaña".
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Brand, FontFamily, Neutral, Status } from '@/constants/theme';
import { validateAccessCode } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { ValidateAccessCodeResponse } from '@/lib/types';

const BRAND_BLUE = Brand.blue;
const BRAND_YELLOW = Brand.yellow;
const WHATSAPP_GREEN = Brand.whatsapp;
const TEXT_DARK = Neutral.textPrimary;
const TEXT_MUTED = Neutral.textMuted;
const BORDER = Neutral.border;
const BORDER_FOCUS = Neutral.borderFocus;
const BG_INPUT = Neutral.bg;
const SUCCESS = Status.success;
const FONT = FontFamily.bold;
const FONT_REGULAR = FontFamily.regular;

const PHONE_REGEX = /^9\d{8}$/;
const OTP_REGEX = /^\d{6}$/;
const ACCESS_CODE_REGEX = /^[A-Z0-9]{4}$/;
const RESEND_COOLDOWN_S = 60;

type Phase = 'phone' | 'code' | 'link';

export default function LoginScreen() {
  const {
    auth,
    whatsappSend,
    loginWithWhatsapp,
    joinCampaign,
  } = useApp();

  // Si el AppContext arranca con un user en needs_campaign (ej. relogin después
  // de haber cerrado app sin asignar campaña), saltamos directo a 'link'.
  const initialPhase: Phase = auth.status === 'needs_campaign' ? 'link' : 'phone';
  const [phase, setPhase] = useState<Phase>(initialPhase);

  // Phone state
  const [phone, setPhone] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);

  // OTP state
  const [otp, setOtp] = useState('');
  const [otpFocused, setOtpFocused] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const otpInputRef = useRef<TextInput | null>(null);

  // Link campaign state — access_code con live validation
  const [accessCode, setAccessCode] = useState('');
  const accessCodeInputRef = useRef<TextInput | null>(null);
  const [accessCodeCampaign, setAccessCodeCampaign] = useState<
    ValidateAccessCodeResponse['campaign'] | null
  >(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // ── Resend cooldown ─────────────────────────────────────────
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // ── Auto-focus OTP when entering 'code' phase ───────────────
  useEffect(() => {
    if (phase === 'code') {
      const t = setTimeout(() => otpInputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [phase]);

  // ── Sync to context when boot lands on needs_campaign ───────
  useEffect(() => {
    if (auth.status === 'needs_campaign' && phase === 'phone') {
      setPhase('link');
    }
  }, [auth.status, phase]);

  // ── Live access_code validation (fase link) ────────────────
  useEffect(() => {
    if (phase !== 'link') return;

    const clean = accessCode.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 4);
    if (clean.length < 4) {
      setAccessCodeCampaign(null);
      setCodeError(null);
      setValidatingCode(false);
      return;
    }

    let cancelled = false;
    setValidatingCode(true);
    setCodeError(null);
    setAccessCodeCampaign(null);

    const timer = setTimeout(async () => {
      const result = await validateAccessCode(clean);
      if (cancelled) return;
      setValidatingCode(false);
      if (result.ok && result.data) {
        setAccessCodeCampaign(result.data.campaign);
      } else {
        setCodeError('Código inválido. Verificá con tu coordinador.');
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessCode, phase]);

  // ── Handlers ────────────────────────────────────────────────
  const handleSendOtp = async () => {
    const trimmed = phone.trim();
    if (!PHONE_REGEX.test(trimmed)) {
      Alert.alert('Número inválido', 'Ingresá un número de 9 dígitos que empiece con 9.');
      return;
    }
    setLoading(true);
    const result = await whatsappSend(trimmed);
    setLoading(false);

    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No pudimos enviar el código.');
      return;
    }
    setOtp('');
    setResendIn(RESEND_COOLDOWN_S);
    setPhase('code');
  };

  const handleResendOtp = async () => {
    if (resendIn > 0 || loading) return;
    const result = await whatsappSend(phone.trim());
    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No pudimos reenviar.');
      return;
    }
    setResendIn(RESEND_COOLDOWN_S);
  };

  const handleVerifyOtp = async () => {
    if (!OTP_REGEX.test(otp.trim())) {
      Alert.alert('Código inválido', 'Ingresá los 6 dígitos del WhatsApp.');
      return;
    }
    setLoading(true);
    const result = await loginWithWhatsapp(phone.trim(), otp.trim());
    setLoading(false);

    if (result.ok) {
      // Success — AppContext decide:
      //  • user con campañas → 'active' → RouterGuard manda a /(main)/dashboard
      //  • user sin campañas → 'needs_campaign' → useEffect abajo cambia phase a 'link'
      // El backend auto-crea el user si no existía (canvassing: nada bloquea).
      return;
    }
    Alert.alert('Error', result.error ?? 'No pudimos verificar el código.');
  };

  const handleJoinCampaign = async () => {
    const cleanCode = accessCode.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 4);
    if (!ACCESS_CODE_REGEX.test(cleanCode)) {
      Alert.alert('Código inválido', 'Ingresá el código de 4 caracteres que te dio tu coordinador.');
      return;
    }
    setLoading(true);
    const result = await joinCampaign(cleanCode);
    setLoading(false);

    if (!result.ok) {
      if (result.code === 'ACCESS_CODE_NOT_FOUND') {
        Alert.alert('Código inválido', 'El código de acceso no existe. Verificá con tu coordinador.');
        return;
      }
      Alert.alert('Error', result.error ?? 'No pudimos asignarte a la campaña.');
    }
    // Success: AppContext pasa a 'active' y RouterGuard redirige.
  };

  const handleChangePhone = () => {
    setOtp('');
    setResendIn(0);
    setAccessCode('');
    setAccessCodeCampaign(null);
    setCodeError(null);
    setValidatingCode(false);
    setPhase('phone');
  };

  const formatPhoneMask = (p: string) => {
    if (p.length !== 9) return p;
    return `+51 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  };

  // ── access_code 4 boxes (UI helper) ─────────────────────────
  const codeStr = accessCode
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, '');

  const renderAccessCodeBlock = () => (
    <>
      <Pressable
        onPress={() => accessCodeInputRef.current?.focus()}
        style={styles.codeBoxRow}
      >
        {([0, 1, 2, 3] as const).map((pos) => (
          <View
            key={pos}
            style={[
              styles.codeBox,
              accessCode.length === pos && styles.codeBoxActive,
              accessCodeCampaign && styles.codeBoxSuccess,
              codeError && styles.codeBoxError,
            ]}
          >
            <Text
              style={[
                styles.codeBoxChar,
                accessCodeCampaign && styles.codeBoxCharSuccess,
                codeError && styles.codeBoxCharError,
              ]}
            >
              {codeStr[pos] ?? ''}
            </Text>
          </View>
        ))}
        <TextInput
          ref={(ref) => {
            accessCodeInputRef.current = ref;
          }}
          style={styles.codeHiddenInput}
          value={accessCode}
          onChangeText={(t) => {
            const clean = t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
            setAccessCode(clean);
          }}
          maxLength={4}
          autoCapitalize="characters"
          autoCorrect={false}
          keyboardType="default"
          returnKeyType="done"
          caretHidden
        />
      </Pressable>

      {validatingCode && (
        <View style={styles.codeStatusRow}>
          <ActivityIndicator size="small" color={Status.warning} />
          <Text style={styles.codeStatusText}>Verificando código...</Text>
        </View>
      )}
      {codeError && !validatingCode && (
        <Text style={styles.codeErrorText}>{codeError}</Text>
      )}
      {!codeError && !validatingCode && accessCodeCampaign && (
        <Text style={styles.codeSuccessText}>Código válido ✓</Text>
      )}

      <Text style={styles.codeHint}>
        Pedile el código de 4 letras/números a tu coordinador
      </Text>

      {accessCodeCampaign && (
        <View style={styles.matchedCard}>
          <View style={styles.matchedIconCircle}>
            <Ionicons name="megaphone" size={22} color={BRAND_YELLOW} />
          </View>
          <View style={styles.matchedInfo}>
            <Text style={styles.matchedName} numberOfLines={1}>
              {accessCodeCampaign.name}
            </Text>
            <Text style={styles.matchedSub}>Campaña verificada</Text>
          </View>
          <Ionicons name="checkmark-circle" size={26} color={SUCCESS} />
        </View>
      )}
    </>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>G</Text>
            </View>
            <Text style={styles.title}>Goberna</Text>
            <Text style={styles.subtitle}>Operación Territorial</Text>
          </View>

          {/* ── PHONE ─────────────────────────────────────────── */}
          {phase === 'phone' && (
            <View style={styles.form}>
              <Text style={styles.stepTitle}>Ingresá tu número</Text>
              <Text style={styles.stepDescription}>
                Te mandamos un código por WhatsApp para verificar tu cuenta.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Número de teléfono</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    phoneFocused && styles.inputWrapperFocused,
                  ]}
                >
                  <Text style={styles.prefix}>+51</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="987654321"
                    placeholderTextColor={TEXT_MUTED}
                    value={phone}
                    onChangeText={(t) => setPhone(t.replace(/\D/g, '').slice(0, 9))}
                    keyboardType="phone-pad"
                    autoComplete="tel"
                    maxLength={9}
                    editable={!loading}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                  {PHONE_REGEX.test(phone) && (
                    <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                  )}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.buttonWa,
                  (!PHONE_REGEX.test(phone) || loading) && styles.buttonDisabled,
                  pressed && PHONE_REGEX.test(phone) && !loading && styles.buttonPressed,
                ]}
                onPress={handleSendOtp}
                disabled={!PHONE_REGEX.test(phone) || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Recibir código</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* ── CODE ──────────────────────────────────────────── */}
          {phase === 'code' && (
            <View style={styles.form}>
              <View style={styles.codeHeader}>
                <Ionicons name="logo-whatsapp" size={32} color={WHATSAPP_GREEN} />
                <Text style={styles.codeTitle}>Revisá tu WhatsApp</Text>
                <Text style={styles.codeSubtitle}>
                  Mandamos un código de 6 dígitos a{'\n'}
                  <Text style={styles.codePhoneStrong}>{formatPhoneMask(phone)}</Text>
                </Text>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Código de verificación</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    otpFocused && styles.inputWrapperFocused,
                    styles.otpInputWrapper,
                  ]}
                >
                  <TextInput
                    ref={otpInputRef}
                    style={styles.otpInput}
                    placeholder="000000"
                    placeholderTextColor={TEXT_MUTED}
                    value={otp}
                    onChangeText={(t) => setOtp(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    editable={!loading}
                    onFocus={() => setOtpFocused(true)}
                    onBlur={() => setOtpFocused(false)}
                  />
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (!OTP_REGEX.test(otp) || loading) && styles.buttonDisabled,
                  pressed && OTP_REGEX.test(otp) && !loading && styles.buttonPressed,
                ]}
                onPress={handleVerifyOtp}
                disabled={!OTP_REGEX.test(otp) || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Verificar y entrar</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.codeFooter}>
                <Pressable onPress={handleChangePhone} disabled={loading} hitSlop={8}>
                  <Text style={styles.codeFooterLink}>← Cambiar número</Text>
                </Pressable>
                <Pressable
                  onPress={handleResendOtp}
                  disabled={resendIn > 0 || loading}
                  hitSlop={8}
                >
                  <Text
                    style={[
                      styles.codeFooterLink,
                      resendIn > 0 && styles.codeFooterLinkDisabled,
                    ]}
                  >
                    {resendIn > 0 ? `Reenviar en ${resendIn}s` : 'Reenviar código'}
                  </Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* ── LINK CAMPAIGN (user autenticado sin campaña) ───── */}
          {phase === 'link' && (
            <View style={styles.form}>
              <Text style={styles.stepTitle}>Enlazate a una campaña</Text>
              <Text style={styles.stepDescription}>
                Ya estás dentro. Para empezar a registrar gente ingresá el
                código de 4 caracteres que te pasó tu coordinador.
              </Text>

              <View style={styles.field}>
                <Text style={styles.label}>Código de acceso</Text>
                {renderAccessCodeBlock()}
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (!accessCodeCampaign || loading) && styles.buttonDisabled,
                  pressed && accessCodeCampaign && !loading && styles.buttonPressed,
                ]}
                onPress={handleJoinCampaign}
                disabled={!accessCodeCampaign || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="rocket-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Unirme</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 48, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24, gap: 6 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: BRAND_BLUE,
    alignItems: 'center', justifyContent: 'center', marginBottom: 12,
    shadowColor: BRAND_BLUE, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  logoText: { color: BRAND_YELLOW, fontSize: 36, fontFamily: FONT },
  title: { fontSize: 28, color: TEXT_DARK, fontFamily: FONT, letterSpacing: 1 },
  subtitle: { fontSize: 14, color: TEXT_MUTED, fontFamily: FONT_REGULAR, letterSpacing: 0.5 },

  form: { gap: 20 },
  stepTitle: { fontSize: 22, fontFamily: FONT, color: TEXT_DARK },
  stepDescription: {
    fontSize: 14, fontFamily: FONT_REGULAR, color: TEXT_MUTED,
    marginTop: -12, marginBottom: 4, lineHeight: 20,
  },
  field: { gap: 8 },
  label: {
    fontSize: 13, color: TEXT_DARK, fontFamily: FONT,
    textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 14,
    backgroundColor: BG_INPUT, paddingHorizontal: 14,
  },
  inputWrapperFocused: { borderColor: BORDER_FOCUS, backgroundColor: '#FFFFFF' },
  prefix: { fontSize: 16, color: TEXT_DARK, fontFamily: FONT, marginRight: 0 },
  input: {
    flex: 1, paddingVertical: 14, fontSize: 16,
    color: TEXT_DARK, fontFamily: FONT_REGULAR,
  },

  codeHeader: { alignItems: 'center', gap: 8, marginBottom: 8 },
  codeTitle: { fontSize: 22, fontFamily: FONT, color: TEXT_DARK, marginTop: 4 },
  codeSubtitle: {
    fontSize: 14, fontFamily: FONT_REGULAR, color: TEXT_MUTED,
    textAlign: 'center', lineHeight: 20,
  },
  codePhoneStrong: { fontFamily: FONT, color: TEXT_DARK },
  otpInputWrapper: { paddingHorizontal: 16 },
  otpInput: {
    flex: 1, paddingVertical: 18, fontSize: 28, color: TEXT_DARK,
    fontFamily: FONT, letterSpacing: 8, textAlign: 'center',
  },
  codeFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingHorizontal: 4,
  },
  codeFooterLink: { fontSize: 13, color: BRAND_BLUE, fontFamily: FONT },
  codeFooterLinkDisabled: { color: TEXT_MUTED },

  // Access code 4 boxes
  codeBoxRow: {
    flexDirection: 'row', gap: 12, position: 'relative',
    alignItems: 'center', justifyContent: 'center', paddingVertical: 4,
  },
  codeBox: {
    width: 58, height: 66, borderRadius: 14, borderWidth: 2,
    borderColor: BORDER, backgroundColor: BG_INPUT,
    alignItems: 'center', justifyContent: 'center',
  },
  codeBoxActive: { borderColor: BORDER_FOCUS, backgroundColor: '#FFFFFF' },
  codeBoxSuccess: { borderColor: SUCCESS, backgroundColor: Status.successBg },
  codeBoxError: { borderColor: '#fca5a5', backgroundColor: '#fff5f5' },
  codeBoxChar: { fontSize: 28, fontFamily: FONT, color: TEXT_DARK },
  codeBoxCharSuccess: { color: '#166534' },
  codeBoxCharError: { color: '#dc2626' },
  codeHiddenInput: {
    position: 'absolute', width: '100%', height: '100%',
    opacity: 0, color: 'transparent',
  },
  codeStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginLeft: 4, marginTop: 4,
  },
  codeStatusText: {
    fontSize: 12, color: '#b45309', fontFamily: FONT_REGULAR,
  },
  codeErrorText: {
    fontSize: 12, color: '#dc2626', fontFamily: FONT_REGULAR,
    marginLeft: 4, marginTop: 4,
  },
  codeSuccessText: {
    fontSize: 12, color: SUCCESS, fontFamily: FONT_REGULAR,
    marginLeft: 4, marginTop: 4,
  },
  codeHint: {
    fontSize: 12, color: TEXT_MUTED, fontFamily: FONT_REGULAR,
    marginLeft: 4, marginTop: 4, lineHeight: 18,
  },

  matchedCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, borderRadius: 14,
    backgroundColor: Status.successBg,
    borderWidth: 1.5, borderColor: SUCCESS,
    marginTop: 12,
  },
  matchedIconCircle: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: BRAND_BLUE,
    alignItems: 'center', justifyContent: 'center',
  },
  matchedInfo: { flex: 1 },
  matchedName: { fontSize: 15, fontFamily: FONT, color: TEXT_DARK },
  matchedSub: { fontSize: 12, fontFamily: FONT_REGULAR, color: TEXT_MUTED, marginTop: 2 },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: BRAND_BLUE, borderRadius: 14, padding: 16, marginTop: 8,
    shadowColor: BRAND_BLUE, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  buttonWa: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: WHATSAPP_GREEN, borderRadius: 14, padding: 16, marginTop: 8,
    shadowColor: WHATSAPP_GREEN, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  buttonDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  buttonText: {
    fontSize: 16, color: '#FFFFFF', fontFamily: FONT,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  altLink: { alignItems: 'center', paddingVertical: 8 },
  altLinkText: { fontSize: 13, color: BRAND_BLUE, fontFamily: FONT_REGULAR },
});
