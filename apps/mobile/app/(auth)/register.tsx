/**
 * Register Screen — OTP-only registration via WhatsApp.
 *
 * Flow (3 steps):
 *   1. Identidad: teléfono (9 dígitos) + nombre completo
 *   2. Campaña: región + código de acceso (4 chars, validado contra backend)
 *   3. Verificación WhatsApp: 6-digit code → registerWithWhatsapp → JWT cookie
 *
 * El OTP por WhatsApp solo se dispara en la transición 2→3 (cuando el user
 * está committed) para no spamear el bot ni gastar el rate limit.
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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import { validateAccessCode } from '@/lib/api';
import type { ValidateAccessCodeResponse } from '@/lib/types';
import RegionPicker from '@/components/RegionPicker';

// ─── Design Tokens ─────────────────────────────────────────────
const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.5)';
const BORDER = '#E1E6F0';
const BORDER_FOCUS = '#4A8AC4';
const BG_INPUT = '#F8FAFC';
const SUCCESS = '#22c55e';
const SUCCESS_BG = '#f0fdf4';
const AMBER = '#f59e0b';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

const PHONE_REGEX = /^9\d{8}$/;
const CODE_REGEX = /^[A-Z0-9]{4}$/;
const SMS_REGEX = /^\d{6}$/;
const RESEND_COOLDOWN_S = 60;
const TOTAL_STEPS = 3;

export default function RegisterScreen() {
  const router = useRouter();
  const { whatsappSend, registerWithWhatsapp } = useApp();

  // ─── Step machine ───────────────────────────────────────────
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // ─── Step 1 fields ──────────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');

  // ─── Step 2 fields ──────────────────────────────────────────
  const [region, setRegion] = useState<string | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [accessCodeCampaign, setAccessCodeCampaign] = useState<
    ValidateAccessCodeResponse['campaign'] | null
  >(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [validatingAttempt, setValidatingAttempt] = useState(0);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const codeInputRef = useRef<TextInput | null>(null);

  // ─── Step 3 fields ──────────────────────────────────────────
  const [smsCode, setSmsCode] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const smsInputRef = useRef<TextInput | null>(null);

  // ─── UI state ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // Focus tracking
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [smsFocused, setSmsFocused] = useState(false);

  // ─── Resend cooldown ────────────────────────────────────────
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  // ─── Auto-focus SMS input when entering step 3 ──────────────
  useEffect(() => {
    if (step === 3) {
      const t = setTimeout(() => smsInputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [step]);

  // ─── Validate access code on entry (step 2) ─────────────────
  useEffect(() => {
    void retryCount;

    const code = accessCodeInput
      .replace(/[^A-Z0-9]/gi, '')
      .toUpperCase()
      .slice(0, 4);
    if (code.length < 4) {
      setAccessCodeCampaign(null);
      setCodeError(null);
      return;
    }
    if (!CODE_REGEX.test(code)) return;

    let cancelled = false;
    const RETRY_DELAYS = [0, 1000, 3000];

    async function tryValidate() {
      setValidatingCode(true);
      setValidatingAttempt(0);
      setCodeError(null);
      setAccessCodeCampaign(null);

      for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        if (cancelled) return;
        setValidatingAttempt(attempt);

        if (RETRY_DELAYS[attempt] > 0) {
          await new Promise<void>((resolve) => {
            const t = setTimeout(resolve, RETRY_DELAYS[attempt]);
            if (cancelled) clearTimeout(t);
          });
        }
        if (cancelled) return;

        const result = await validateAccessCode(code);
        if (cancelled) return;

        if (result.ok && result.data) {
          setValidatingCode(false);
          setAccessCodeCampaign(result.data.campaign);
          return;
        }

        const isNetworkError =
          !result.ok &&
          (result.error?.toLowerCase().includes('red') ||
            result.error?.toLowerCase().includes('network') ||
            result.error?.toLowerCase().includes('timeout') ||
            result.error?.toLowerCase().includes('espera') ||
            result.status == null);

        if (!isNetworkError) {
          setValidatingCode(false);
          setCodeError('Código inválido. Verificá con tu coordinador.');
          return;
        }

        const isLastAttempt = attempt === RETRY_DELAYS.length - 1;
        if (isLastAttempt) {
          setValidatingCode(false);
          setCodeError('Sin conexión. Verificá tu red e intentá de nuevo.');
        }
      }
    }

    const debounceTimer = setTimeout(() => {
      tryValidate();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
    };
  }, [accessCodeInput, retryCount]);

  // ─── Step validation ────────────────────────────────────────
  const step1Valid = useMemo(
    () => PHONE_REGEX.test(phone.trim()) && fullName.trim().length >= 3,
    [phone, fullName],
  );

  const step2Valid = useMemo(
    () => region !== null && accessCodeCampaign !== null,
    [region, accessCodeCampaign],
  );

  // ─── Navigation ─────────────────────────────────────────────
  const handleBack = () => {
    if (step === 1) {
      router.back();
      return;
    }
    if (step === 3) {
      // Back from code → step 2 (data preserved)
      setSmsCode('');
      setResendIn(0);
      setStep(2);
      return;
    }
    // Back from step 2 → step 1: clear step 2 fields
    setRegion(null);
    setAccessCodeInput('');
    setAccessCodeCampaign(null);
    setCodeError(null);
    setValidatingCode(false);
    setRetryCount(0);
    setStep(1);
  };

  const handleNextFromStep1 = () => {
    if (!step1Valid) {
      if (!PHONE_REGEX.test(phone.trim())) {
        Alert.alert(
          'Número inválido',
          'Ingresá un número de 9 dígitos que empiece con 9.',
        );
        return;
      }
      Alert.alert('Nombre requerido', 'Ingresá tu nombre completo.');
      return;
    }
    setStep(2);
  };

  const handleNextFromStep2 = async () => {
    if (!step2Valid) return;
    setLoading(true);
    const result = await whatsappSend(phone.trim());
    setLoading(false);

    if (!result.ok) {
      Alert.alert('Error enviando código', result.error ?? 'No pudimos enviar el código por WhatsApp.');
      return;
    }
    setSmsCode('');
    setResendIn(RESEND_COOLDOWN_S);
    setStep(3);
  };

  const handleResend = async () => {
    if (resendIn > 0 || loading) return;
    const result = await whatsappSend(phone.trim());
    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No pudimos reenviar.');
      return;
    }
    setResendIn(RESEND_COOLDOWN_S);
  };

  const handleRegister = async () => {
    if (!SMS_REGEX.test(smsCode.trim())) {
      Alert.alert('Código inválido', 'Ingresá los 6 dígitos del WhatsApp.');
      return;
    }
    if (!accessCodeCampaign || !region) return;

    setLoading(true);

    const phoneTrimmed = phone.trim();
    const cleanCode = accessCodeInput
      .replace(/[^A-Z0-9]/g, '')
      .toUpperCase()
      .slice(0, 4);

    const result = await registerWithWhatsapp({
      phone: phoneTrimmed,
      code: smsCode.trim(),
      full_name: fullName.trim(),
      region,
      email: `${phoneTrimmed}@goberna.pe`,
      access_code: cleanCode,
      campaign_id: accessCodeCampaign.id,
    });
    setLoading(false);

    if (!result.ok) {
      if (result.code === 'AUTH_PHONE_EXISTS' || result.code === 'USER_EXISTS') {
        Alert.alert(
          'Número ya registrado',
          'Ese número ya tiene una cuenta. Iniciá sesión en su lugar.',
          [
            { text: 'Ir al login', onPress: () => router.replace('/(auth)/login') },
            { text: 'Cancelar', style: 'cancel' },
          ],
        );
        return;
      }
      Alert.alert('Error', result.error ?? 'No se pudo crear la cuenta.');
      return;
    }
    // Success: RouterGuard handles redirect (active → dashboard, pending → /pending)
  };

  // ─── Helpers ────────────────────────────────────────────────
  const formatPhoneMask = (p: string) => {
    if (p.length !== 9) return p;
    return `+51 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  };

  const codeStr = accessCodeInput
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
    .padEnd(4, '');

  // ─── Render ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={TEXT_DARK} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>Crear Cuenta</Text>
            <Text style={styles.headerSubtitle}>
              Paso {step} de {TOTAL_STEPS}
            </Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Progress */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${(step / TOTAL_STEPS) * 100}%` },
              ]}
            />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Identidad ──────────────────────────── */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Tus datos</Text>
              <Text style={styles.stepDescription}>
                Tu número va a ser tu inicio de sesión
              </Text>

              {/* Phone */}
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
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                  {PHONE_REGEX.test(phone) && (
                    <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                  )}
                </View>
                {phone.length > 0 && phone.length < 9 && (
                  <Text style={styles.hint}>
                    {9 - phone.length} dígitos restantes
                  </Text>
                )}
              </View>

              {/* Name */}
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
                    onFocus={() => setNameFocused(true)}
                    onBlur={() => setNameFocused(false)}
                  />
                  {fullName.trim().length >= 3 && (
                    <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                  )}
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  !step1Valid && styles.buttonDisabled,
                  pressed && step1Valid && styles.buttonPressed,
                ]}
                onPress={handleNextFromStep1}
                disabled={!step1Valid}
              >
                <Text style={styles.buttonText}>Continuar</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </Pressable>

              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                style={styles.altLink}
              >
                <Text style={styles.altLinkText}>
                  ¿Ya tenés cuenta? Iniciar sesión
                </Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Campaña ────────────────────────────── */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>¿A qué campaña te unís?</Text>
              <Text style={styles.stepDescription}>
                Usá el código que te dio tu coordinador
              </Text>

              {/* Region */}
              <View style={styles.field}>
                <Text style={styles.label}>Tu región</Text>
                <RegionPicker
                  value={region}
                  onSelect={setRegion}
                  placeholder="Selecciona tu departamento"
                />
              </View>

              {/* Access code boxes */}
              <View style={styles.field}>
                <Text style={styles.label}>Código de acceso (4 caracteres)</Text>
                <Pressable
                  onPress={() => codeInputRef.current?.focus()}
                  style={styles.codeBoxRow}
                >
                  {([0, 1, 2, 3] as const).map((pos) => {
                    const ids = ['code-0', 'code-1', 'code-2', 'code-3'] as const;
                    return (
                      <View
                        key={ids[pos]}
                        style={[
                          styles.codeBox,
                          accessCodeInput.length === pos && styles.codeBoxActive,
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
                    );
                  })}
                  <TextInput
                    ref={(ref) => {
                      codeInputRef.current = ref;
                    }}
                    style={styles.codeHiddenInput}
                    value={accessCodeInput}
                    onChangeText={(t) => {
                      const clean = t
                        .replace(/[^A-Za-z0-9]/g, '')
                        .toUpperCase()
                        .slice(0, 4);
                      setAccessCodeInput(clean);
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
                    <ActivityIndicator size="small" color={AMBER} />
                    <Text style={styles.hintAmber}>
                      {validatingAttempt === 0
                        ? 'Verificando código...'
                        : `Reintentando (${validatingAttempt}/2)...`}
                    </Text>
                  </View>
                )}
                {codeError && !validatingCode && (
                  <View style={styles.codeErrorRow}>
                    <Text style={styles.hintError}>{codeError}</Text>
                    {codeError.includes('conexión') && (
                      <Pressable
                        onPress={() => setRetryCount((c) => c + 1)}
                        style={styles.retryCodeBtn}
                        hitSlop={8}
                      >
                        <Text style={styles.retryCodeBtnText}>↺ Reintentar</Text>
                      </Pressable>
                    )}
                  </View>
                )}
                {!codeError && accessCodeCampaign && !validatingCode && (
                  <Text style={styles.hintSuccess}>Código válido ✓</Text>
                )}
                <Text style={styles.codeHint}>
                  Pedile el código de 4 letras/números a tu coordinador
                </Text>
              </View>

              {/* Campaign card */}
              {accessCodeCampaign && (
                <View style={styles.matchedCard}>
                  <View style={styles.campaignIconCircle}>
                    <Ionicons name="megaphone" size={24} color={BRAND_YELLOW} />
                  </View>
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName}>
                      {accessCodeCampaign.name}
                    </Text>
                    <Text style={styles.candidateCargo}>Campaña verificada</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={28} color={SUCCESS} />
                </View>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (!step2Valid || loading) && styles.buttonDisabled,
                  pressed && step2Valid && !loading && styles.buttonPressed,
                ]}
                onPress={handleNextFromStep2}
                disabled={!step2Valid || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="logo-whatsapp"
                      size={20}
                      color="#FFFFFF"
                    />
                    <Text style={styles.buttonText}>Enviar código por WhatsApp</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* ── Step 3: WhatsApp Verification ───────────────────── */}
          {step === 3 && (
            <View style={styles.stepContainer}>
              <View style={styles.codeHeader}>
                <Ionicons name="logo-whatsapp" size={32} color="#25D366" />
                <Text style={styles.stepTitle}>Revisá tu WhatsApp</Text>
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
                    editable={!loading}
                    onFocus={() => setSmsFocused(true)}
                    onBlur={() => setSmsFocused(false)}
                  />
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonRegister,
                  (!SMS_REGEX.test(smsCode) || loading) && styles.buttonDisabled,
                  pressed && SMS_REGEX.test(smsCode) && !loading && styles.buttonPressed,
                ]}
                onPress={handleRegister}
                disabled={!SMS_REGEX.test(smsCode) || loading}
              >
                {loading ? (
                  <ActivityIndicator color={BRAND_BLUE} size="small" />
                ) : (
                  <>
                    <Ionicons
                      name="checkmark-circle"
                      size={24}
                      color={BRAND_BLUE}
                    />
                    <Text style={styles.buttonTextRegister}>Crear cuenta</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.smsFooter}>
                <Pressable
                  onPress={() => setStep(2)}
                  disabled={loading}
                  hitSlop={8}
                >
                  <Text style={styles.smsFooterLink}>← Cambiar datos</Text>
                </Pressable>
                <Pressable
                  onPress={handleResend}
                  disabled={resendIn > 0 || loading}
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
            </View>
          )}
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

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 8,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: FONT,
    color: TEXT_DARK,
  },
  headerSubtitle: {
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  headerRight: {
    width: 40,
  },

  // Progress
  progressContainer: {
    paddingHorizontal: 24,
    paddingBottom: 8,
  },
  progressTrack: {
    height: 4,
    backgroundColor: BORDER,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: BRAND_YELLOW,
    borderRadius: 2,
  },

  // Scroll
  scroll: {
    padding: 24,
    paddingBottom: 40,
  },

  // Step Container
  stepContainer: {
    gap: 20,
  },
  stepTitle: {
    fontSize: 24,
    fontFamily: FONT,
    color: TEXT_DARK,
  },
  stepDescription: {
    fontSize: 14,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    marginTop: -12,
    marginBottom: 8,
  },

  // Fields
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
  hintError: {
    fontSize: 12,
    color: '#dc2626',
    fontFamily: FONT_REGULAR,
    marginLeft: 4,
  },
  hintSuccess: {
    fontSize: 12,
    color: SUCCESS,
    fontFamily: FONT_REGULAR,
    marginLeft: 4,
  },
  hintAmber: {
    fontSize: 12,
    color: '#b45309',
    fontFamily: FONT_REGULAR,
    marginLeft: 6,
  },

  // Access code boxes (step 2)
  codeBoxRow: {
    flexDirection: 'row',
    gap: 12,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 4,
  },
  codeBox: {
    width: 58,
    height: 66,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: BORDER,
    backgroundColor: BG_INPUT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeBoxActive: {
    borderColor: BORDER_FOCUS,
    backgroundColor: '#FFFFFF',
  },
  codeBoxSuccess: {
    borderColor: SUCCESS,
    backgroundColor: SUCCESS_BG,
  },
  codeBoxError: {
    borderColor: '#fca5a5',
    backgroundColor: '#fff5f5',
  },
  codeBoxChar: {
    fontSize: 28,
    fontFamily: FONT,
    color: TEXT_DARK,
  },
  codeBoxCharSuccess: {
    color: '#166534',
  },
  codeBoxCharError: {
    color: '#dc2626',
  },
  codeHiddenInput: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0,
    color: 'transparent',
  },
  codeStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    marginTop: 2,
  },
  codeErrorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginLeft: 4,
    marginTop: 2,
  },
  retryCodeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  retryCodeBtnText: {
    fontSize: 12,
    color: '#dc2626',
    fontFamily: FONT_REGULAR,
  },
  codeHint: {
    fontSize: 12,
    color: '#b45309',
    fontFamily: FONT_REGULAR,
    marginLeft: 4,
    lineHeight: 18,
  },

  // SMS code (step 3)
  codeHeader: {
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

  // Matched campaign card
  matchedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    backgroundColor: SUCCESS_BG,
    borderWidth: 1.5,
    borderColor: SUCCESS,
    gap: 12,
  },
  campaignIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  candidateInfo: {
    flex: 1,
  },
  candidateName: {
    fontSize: 16,
    fontFamily: FONT,
    color: TEXT_DARK,
  },
  candidateCargo: {
    fontSize: 13,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    marginTop: 2,
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
    marginTop: 12,
  },
  buttonRegister: {
    backgroundColor: BRAND_YELLOW,
    paddingVertical: 20,
    borderRadius: 16,
    marginTop: 24,
    shadowColor: BRAND_YELLOW,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  buttonDisabled: {
    opacity: 0.5,
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
  buttonTextRegister: {
    fontSize: 18,
    fontFamily: FONT,
    color: BRAND_BLUE,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
  },

  // Alt link
  altLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  altLinkText: {
    fontSize: 13,
    color: BRAND_BLUE,
    fontFamily: FONT_REGULAR,
  },
});
