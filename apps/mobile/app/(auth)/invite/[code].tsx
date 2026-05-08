/**
 * InviteScreen — Registro via universal link OTP-only.
 *
 * Flow:
 *   1. Mount: GET /api/invitations/validate/:code → muestra hero de campaña
 *   2. Form: nombre completo + teléfono (region = 'Nacional')
 *   3. Send OTP → SMS dispatched
 *   4. Verify SMS → idToken → POST /api/auth/register-firebase + invitation_code
 *   5. RouterGuard navega a (main)/dashboard o (auth)/pending
 *
 * Diferencias con /register:
 *   - Sin selector de región (default Nacional)
 *   - Sin selector de campaña (viene del invitation_code)
 *   - El campaign_id va por el invitation_code, no se manda explícito
 */

import { useState, useEffect, useMemo, useRef } from 'react';
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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import { validateInvitation } from '@/lib/api';
import {
  sendOtp,
  confirmOtp,
  toE164PhonePeru,
  type FirebaseConfirmation,
} from '@/lib/firebase';
import type { InvitationInfo } from '@/lib/types';

// ─── Design Tokens ──────────────────────────────────────────────
const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.5)';
const BORDER = '#E1E6F0';
const BORDER_FOCUS = '#4A8AC4';
const BG_INPUT = '#F8FAFC';
const SUCCESS = '#22c55e';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

const PHONE_REGEX = /^9\d{8}$/;
const SMS_REGEX = /^\d{6}$/;
const RESEND_COOLDOWN_S = 30;

type ScreenState =
  | { phase: 'validating' }
  | { phase: 'invalid'; reason: string }
  | { phase: 'form'; invitation: InvitationInfo }
  | { phase: 'sending'; invitation: InvitationInfo }
  | { phase: 'sms'; invitation: InvitationInfo }
  | { phase: 'registering'; invitation: InvitationInfo }
  | { phase: 'done' };

const ROLE_LABELS: Record<string, string> = {
  agente_campo: 'agente de campo',
  agente_digital: 'agente digital',
  brigadista_zonal: 'brigadista zonal',
  candidato: 'candidato',
  consultor: 'consultor',
  admin: 'administrador',
};

export default function InviteScreen() {
  const params = useLocalSearchParams<{ code: string }>();
  const rawCode = params.code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;

  const router = useRouter();
  const { registerWithFirebase } = useApp();

  const [state, setState] = useState<ScreenState>({ phase: 'validating' });
  const invitationRef = useRef<InvitationInfo | null>(null);
  const confirmationRef = useRef<FirebaseConfirmation | null>(null);
  const smsInputRef = useRef<TextInput | null>(null);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // Focus
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [smsFocused, setSmsFocused] = useState(false);

  // ─── Validate invitation on mount ────────────────────────────
  useEffect(() => {
    if (!code) {
      setState({ phase: 'invalid', reason: 'Link inválido.' });
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15_000);

    (async () => {
      const result = await validateInvitation(code);
      clearTimeout(timeoutId);
      if (cancelled) return;

      if (!result.ok) {
        const isTimeout =
          result.error?.toLowerCase().includes('timeout') ||
          result.error?.toLowerCase().includes('espera') ||
          result.error?.toLowerCase().includes('aborted');
        const reason = isTimeout
          ? 'Sin conexión. Verificá tu red e intentá de nuevo.'
          : result.code === 'INVITATION_EXPIRED'
            ? 'Este link ha expirado o ya fue usado el máximo de veces.'
            : 'El link de invitación no es válido.';
        setState({ phase: 'invalid', reason });
        return;
      }

      invitationRef.current = result.data.invitation;
      setState({ phase: 'form', invitation: result.data.invitation });
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [code]);

  // ─── Resend cooldown ─────────────────────────────────────────
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // ─── Auto-focus SMS input on phase=sms ───────────────────────
  useEffect(() => {
    if (state.phase === 'sms') {
      const t = setTimeout(() => smsInputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [state.phase]);

  // ─── Form validation ─────────────────────────────────────────
  const formValid = useMemo(
    () => fullName.trim().length >= 3 && PHONE_REGEX.test(phone.trim()),
    [fullName, phone],
  );

  // ─── Handlers ────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (state.phase !== 'form' || !formValid) return;
    const invitation = state.invitation;

    setState({ phase: 'sending', invitation });
    const result = await sendOtp(toE164PhonePeru(phone.trim()));

    if (!result.ok) {
      setState({ phase: 'form', invitation });
      Alert.alert('Error enviando SMS', result.error);
      return;
    }
    confirmationRef.current = result.confirmation;
    setSmsCode('');
    setResendIn(RESEND_COOLDOWN_S);
    setState({ phase: 'sms', invitation });
  };

  const handleResend = async () => {
    if (resendIn > 0) return;
    const result = await sendOtp(toE164PhonePeru(phone.trim()));
    if (!result.ok) {
      Alert.alert('Error', result.error);
      return;
    }
    confirmationRef.current = result.confirmation;
    setResendIn(RESEND_COOLDOWN_S);
  };

  const handleRegister = async () => {
    if (state.phase !== 'sms') return;
    if (!SMS_REGEX.test(smsCode.trim())) {
      Alert.alert('Código inválido', 'Ingresá los 6 dígitos del SMS.');
      return;
    }
    if (!confirmationRef.current) {
      Alert.alert('Sesión expirada', 'Pedí un código nuevo.');
      setState({ phase: 'form', invitation: state.invitation });
      return;
    }

    const invitation = state.invitation;
    setState({ phase: 'registering', invitation });

    const otpResult = await confirmOtp(confirmationRef.current, smsCode.trim());
    if (!otpResult.ok) {
      setState({ phase: 'sms', invitation });
      Alert.alert('Error', otpResult.error);
      return;
    }

    const phoneTrimmed = phone.trim();
    const result = await registerWithFirebase({
      id_token: otpResult.idToken,
      full_name: fullName.trim(),
      region: 'Nacional',
      email: `${phoneTrimmed}@goberna.pe`,
      invitation_code: code ?? '',
      campaign_id: invitation.campaign_id,
    });

    if (!result.ok) {
      setState({ phase: 'sms', invitation });
      const friendly =
        result.code === 'AUTH_PHONE_EXISTS'
          ? 'Ese número ya tiene una cuenta. Iniciá sesión en su lugar.'
          : result.error ?? 'No se pudo crear la cuenta. Intentá de nuevo.';
      Alert.alert('Error', friendly, [
        {
          text: 'Iniciar sesión',
          onPress: () => router.replace('/(auth)/login'),
          style: 'default',
        },
        { text: 'Intentar de nuevo', style: 'cancel' },
      ]);
      return;
    }

    setState({ phase: 'done' });
    // RouterGuard handles navigation
  };

  const formatPhoneMask = (p: string) => {
    if (p.length !== 9) return p;
    return `+51 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  };

  // ─── Render: validating ──────────────────────────────────────
  if (state.phase === 'validating') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={styles.logoCircle}>
            <Text style={styles.logoText}>G</Text>
          </View>
          <ActivityIndicator color={BRAND_BLUE} size="large" style={{ marginTop: 24 }} />
          <Text style={styles.loadingText}>Verificando invitación...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: invalid ─────────────────────────────────────────
  if (state.phase === 'invalid') {
    const isNetworkError =
      state.reason.includes('conexión') || state.reason.includes('red');
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={[styles.logoCircle, { backgroundColor: '#fee2e2' }]}>
            <Ionicons
              name={isNetworkError ? 'wifi-outline' : 'close-circle'}
              size={40}
              color="#dc2626"
            />
          </View>
          <Text style={styles.errorTitle}>
            {isNetworkError ? 'Sin conexión' : 'Link inválido'}
          </Text>
          <Text style={styles.errorBody}>{state.reason}</Text>
          {isNetworkError && (
            <Pressable
              style={[styles.button, { backgroundColor: BRAND_BLUE }]}
              onPress={() => setState({ phase: 'validating' })}
            >
              <Ionicons name="refresh-outline" size={20} color="#FFFFFF" />
              <Text style={styles.buttonText}>Reintentar</Text>
            </Pressable>
          )}
          <Pressable
            style={[
              styles.button,
              isNetworkError && {
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: BRAND_BLUE,
              },
            ]}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Ionicons
              name="log-in-outline"
              size={20}
              color={isNetworkError ? BRAND_BLUE : '#FFFFFF'}
            />
            <Text style={[styles.buttonText, isNetworkError && { color: BRAND_BLUE }]}>
              Ir al login
            </Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: done ────────────────────────────────────────────
  if (state.phase === 'done') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Ionicons name="checkmark-circle" size={64} color={SUCCESS} />
          <Text style={styles.errorTitle}>¡Listo!</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: form / sending / sms / registering ──────────────
  const invitation =
    state.phase === 'form' ||
    state.phase === 'sending' ||
    state.phase === 'sms' ||
    state.phase === 'registering'
      ? state.invitation
      : invitationRef.current;
  if (!invitation) return null;

  const isSending = state.phase === 'sending';
  const isRegistering = state.phase === 'registering';
  const showSmsStep = state.phase === 'sms' || state.phase === 'registering';
  const editable = !isSending && !isRegistering;

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
          {/* Hero */}
          <View style={styles.hero}>
            <View style={styles.logoCircle}>
              <Text style={styles.logoText}>G</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="link" size={14} color={BRAND_BLUE} />
              <Text style={styles.heroBadgeText}>Invitación oficial</Text>
            </View>
            <Text style={styles.heroTitle}>{invitation.campaign_name}</Text>
            <Text style={styles.heroSubtitle}>
              Te invitan a unirte como{' '}
              {ROLE_LABELS[invitation.role] ?? invitation.role}
            </Text>
          </View>

          <View style={styles.divider} />

          {/* ── Form / SMS ── */}
          <View style={styles.form}>
            {!showSmsStep ? (
              <>
                <Text style={styles.formTitle}>Crear tu cuenta</Text>
                <Text style={styles.formSubtitle}>
                  Te mandamos un código por SMS para verificar tu número
                </Text>

                {/* Nombre */}
                <View style={styles.field}>
                  <Text style={styles.label}>Nombre completo</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      nameFocused && styles.inputWrapperFocused,
                    ]}
                  >
                    <Ionicons
                      name="person-outline"
                      size={20}
                      color={nameFocused ? BORDER_FOCUS : TEXT_MUTED}
                      style={styles.inputIcon}
                    />
                    <TextInput
                      style={styles.input}
                      placeholder="Juan Pérez García"
                      placeholderTextColor={TEXT_MUTED}
                      value={fullName}
                      onChangeText={setFullName}
                      autoCapitalize="words"
                      autoCorrect={false}
                      editable={editable}
                      onFocus={() => setNameFocused(true)}
                      onBlur={() => setNameFocused(false)}
                    />
                    {fullName.trim().length >= 3 && (
                      <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                    )}
                  </View>
                </View>

                {/* Teléfono */}
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
                      onChangeText={(t) =>
                        setPhone(t.replace(/\D/g, '').slice(0, 9))
                      }
                      keyboardType="phone-pad"
                      autoComplete="tel"
                      maxLength={9}
                      editable={editable}
                      onFocus={() => setPhoneFocused(true)}
                      onBlur={() => setPhoneFocused(false)}
                    />
                    {PHONE_REGEX.test(phone.trim()) && (
                      <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                    )}
                  </View>
                  {phone.length > 0 && phone.length < 9 && (
                    <Text style={styles.hint}>
                      {9 - phone.length} dígitos restantes
                    </Text>
                  )}
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonPrimary,
                    (!formValid || isSending) && styles.buttonDisabled,
                    pressed && formValid && !isSending && styles.buttonPressed,
                  ]}
                  onPress={handleSendOtp}
                  disabled={!formValid || isSending}
                >
                  {isSending ? (
                    <ActivityIndicator color={BRAND_BLUE} />
                  ) : (
                    <>
                      <Ionicons
                        name="chatbox-ellipses-outline"
                        size={20}
                        color={BRAND_BLUE}
                      />
                      <Text style={styles.buttonTextPrimary}>
                        Enviar código por SMS
                      </Text>
                    </>
                  )}
                </Pressable>

                <View style={styles.footer}>
                  <Text style={styles.footerText}>¿Ya tenés cuenta?</Text>
                  <Pressable
                    onPress={() => router.replace('/(auth)/login')}
                    hitSlop={8}
                    disabled={!editable}
                  >
                    <Text style={styles.footerLink}>Iniciar sesión</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <View style={styles.smsHeader}>
                  <Ionicons
                    name="chatbubble-ellipses"
                    size={32}
                    color={BRAND_BLUE}
                  />
                  <Text style={styles.formTitle}>Revisá tu SMS</Text>
                  <Text style={styles.smsSubtitle}>
                    Mandamos un código de 6 dígitos a{'\n'}
                    <Text style={styles.smsPhoneStrong}>
                      {formatPhoneMask(phone)}
                    </Text>
                  </Text>
                </View>

                <View style={styles.field}>
                  <Text style={styles.label}>Código de verificación</Text>
                  <View
                    style={[
                      styles.inputWrapper,
                      smsFocused && styles.inputWrapperFocused,
                      styles.smsInputWrapper,
                    ]}
                  >
                    <TextInput
                      ref={smsInputRef}
                      style={styles.smsInput}
                      placeholder="000000"
                      placeholderTextColor={TEXT_MUTED}
                      value={smsCode}
                      onChangeText={(t) =>
                        setSmsCode(t.replace(/\D/g, '').slice(0, 6))
                      }
                      keyboardType="number-pad"
                      autoComplete="sms-otp"
                      textContentType="oneTimeCode"
                      maxLength={6}
                      editable={editable}
                      onFocus={() => setSmsFocused(true)}
                      onBlur={() => setSmsFocused(false)}
                    />
                  </View>
                </View>

                <Pressable
                  style={({ pressed }) => [
                    styles.button,
                    styles.buttonPrimary,
                    (!SMS_REGEX.test(smsCode) || isRegistering) &&
                      styles.buttonDisabled,
                    pressed &&
                      SMS_REGEX.test(smsCode) &&
                      !isRegistering &&
                      styles.buttonPressed,
                  ]}
                  onPress={handleRegister}
                  disabled={!SMS_REGEX.test(smsCode) || isRegistering}
                >
                  {isRegistering ? (
                    <ActivityIndicator color={BRAND_BLUE} />
                  ) : (
                    <>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={BRAND_BLUE}
                      />
                      <Text style={styles.buttonTextPrimary}>
                        Crear cuenta y unirme
                      </Text>
                    </>
                  )}
                </Pressable>

                <View style={styles.smsFooter}>
                  <Pressable
                    onPress={() => {
                      confirmationRef.current = null;
                      setSmsCode('');
                      setResendIn(0);
                      setState({ phase: 'form', invitation });
                    }}
                    disabled={isRegistering}
                    hitSlop={8}
                  >
                    <Text style={styles.smsFooterLink}>← Cambiar datos</Text>
                  </Pressable>
                  <Pressable
                    onPress={handleResend}
                    disabled={resendIn > 0 || isRegistering}
                    hitSlop={8}
                  >
                    <Text
                      style={[
                        styles.smsFooterLink,
                        resendIn > 0 && styles.smsFooterLinkDisabled,
                      ]}
                    >
                      {resendIn > 0
                        ? `Reenviar en ${resendIn}s`
                        : 'Reenviar código'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  flex: {
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },

  // Hero
  hero: {
    alignItems: 'center',
    paddingTop: 32,
    paddingBottom: 24,
    gap: 8,
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
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
  logoText: {
    color: BRAND_YELLOW,
    fontSize: 36,
    fontFamily: FONT,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  heroBadgeText: {
    fontSize: 12,
    fontFamily: FONT,
    color: BRAND_BLUE,
    letterSpacing: 0.3,
  },
  heroTitle: {
    fontSize: 22,
    fontFamily: FONT,
    color: TEXT_DARK,
    textAlign: 'center',
    marginTop: 4,
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    textAlign: 'center',
  },

  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginHorizontal: 24,
    marginBottom: 24,
  },

  scroll: {
    paddingBottom: 48,
  },
  form: {
    paddingHorizontal: 24,
    gap: 20,
  },
  formTitle: {
    fontSize: 20,
    fontFamily: FONT,
    color: TEXT_DARK,
  },
  formSubtitle: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    marginTop: -12,
  },
  field: {
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontFamily: FONT,
    color: TEXT_DARK,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginLeft: 4,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    backgroundColor: BG_INPUT,
    paddingHorizontal: 14,
  },
  inputWrapperFocused: {
    borderColor: BORDER_FOCUS,
    backgroundColor: '#FFFFFF',
  },
  inputIcon: {
    marginRight: 10,
  },
  prefix: {
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT,
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  hint: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    marginLeft: 4,
  },

  // SMS phase
  smsHeader: {
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  smsSubtitle: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
  smsPhoneStrong: {
    fontFamily: FONT,
    color: TEXT_DARK,
  },
  smsInputWrapper: {
    paddingHorizontal: 16,
  },
  smsInput: {
    flex: 1,
    paddingVertical: 18,
    fontSize: 28,
    color: TEXT_DARK,
    fontFamily: FONT,
    letterSpacing: 8,
    textAlign: 'center',
  },
  smsFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingHorizontal: 4,
  },
  smsFooterLink: {
    fontSize: 13,
    color: BRAND_BLUE,
    fontFamily: FONT,
  },
  smsFooterLinkDisabled: {
    color: TEXT_MUTED,
  },

  // Buttons
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    padding: 16,
    marginTop: 8,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonPrimary: {
    backgroundColor: BRAND_YELLOW,
    shadowColor: BRAND_YELLOW,
  },
  buttonDisabled: {
    opacity: 0.5,
    elevation: 0,
    shadowOpacity: 0,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  buttonText: {
    fontSize: 16,
    fontFamily: FONT,
    color: '#FFFFFF',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  buttonTextPrimary: {
    fontSize: 16,
    fontFamily: FONT,
    color: BRAND_BLUE,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  footerText: {
    fontSize: 14,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
  },
  footerLink: {
    fontSize: 14,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textDecorationLine: 'underline',
  },

  // Status
  loadingText: {
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    marginTop: 8,
  },
  errorTitle: {
    fontSize: 22,
    fontFamily: FONT,
    color: TEXT_DARK,
    textAlign: 'center',
    marginTop: 8,
  },
  errorBody: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
});
