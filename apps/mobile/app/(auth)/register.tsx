/**
 * Register Screen — Registro Multi-Step
 *
 * Flujo en 2 pasos:
 * - Paso 1: Teléfono + Contraseña + Nombre
 * - Paso 2: Región + Código de acceso de 4 chars (dado por el coordinador)
 *
 * El código de acceso (4 chars) es la única vía de registro.
 * Links de invitación se manejan en pantalla separada /invite/[code].
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
import { validateAccessCode, registerWithAccessCode } from '@/lib/api';
import type { ApiResult, ValidateAccessCodeResponse } from '@/lib/types';
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

// Phone validation - Peru format (9 digits starting with 9)
const PHONE_REGEX = /^9\d{8}$/;

// Access code: exactly 4 alphanumeric chars
const CODE_REGEX = /^[A-Z0-9]{4}$/;

export default function RegisterScreen() {
  const router = useRouter();
  const { login } = useApp();

  // ─── Step State ─────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  // ─── Form State (Step 1) ─────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');

  // ─── Form State (Step 2) ─────────────────────────────────────
  const [region, setRegion] = useState<string | null>(null);
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [accessCodeCampaign, setAccessCodeCampaign] = useState<ValidateAccessCodeResponse['campaign'] | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [validatingAttempt, setValidatingAttempt] = useState(0); // 0=primer intento, 1+=reintento
  const [codeError, setCodeError] = useState<string | null>(null);
  // retryCount: incrementar este valor fuerza el useEffect a re-ejecutar la validación
  // sin el hack de agregar/quitar un espacio al input
  const [retryCount, setRetryCount] = useState(0);
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  // ─── UI State ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // Focus states
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);

  // ─── Validate access code cuando se completan 4 chars ────────
  // Estrategia para conectividad intermitente:
  //   1. Debounce 300ms — no dispara mientras el usuario tipea
  //   2. Retry 3 intentos con backoff exponencial (0s → 1s → 3s)
  //   3. Distingue "código inválido" (404) de "sin red" (error de red)
  useEffect(() => {
    // retryCount se lee aquí para que React lo incluya como dependencia válida.
    // Al incrementarse desde el botón "reintentar", fuerza re-ejecución del efecto.
    void retryCount;

    const code = accessCodeInput.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
    if (code.length < 4) {
      setAccessCodeCampaign(null);
      setCodeError(null);
      return;
    }
    if (!CODE_REGEX.test(code)) return;

    let cancelled = false;

    // Delays entre reintentos: inmediato, 1s, 3s
    const RETRY_DELAYS = [0, 1000, 3000];

    async function tryValidate() {
      setValidatingCode(true);
      setValidatingAttempt(0);
      setCodeError(null);
      setAccessCodeCampaign(null);

      for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
        if (cancelled) return;

        setValidatingAttempt(attempt);

        // Espera antes del reintento (0 en el primero)
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

        // Código 404 / inválido explícito → no tiene sentido reintentar
        const isNetworkError = !result.ok && (
          result.error?.toLowerCase().includes('red') ||
          result.error?.toLowerCase().includes('network') ||
          result.error?.toLowerCase().includes('timeout') ||
          result.error?.toLowerCase().includes('espera') ||
          result.status == null  // sin status = error de red/timeout
        );

        if (!isNetworkError) {
          // El servidor respondió que el código no existe — no reintentamos
          setValidatingCode(false);
          setCodeError('Código inválido. Verificá con tu coordinador.');
          return;
        }

        // Error de red: si hay más intentos, seguimos. Si no, informamos.
        const isLastAttempt = attempt === RETRY_DELAYS.length - 1;
        if (isLastAttempt) {
          setValidatingCode(false);
          setCodeError('Sin conexión. Verificá tu red e intentá de nuevo.');
        }
        // Si no es el último intento, el loop continúa con el siguiente delay
      }
    }

    // Debounce: espera 300ms desde el último cambio antes de disparar
    const debounceTimer = setTimeout(() => {
      tryValidate();
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(debounceTimer);
    };
  // retryCount incluido como dependencia: al incrementarlo se fuerza re-run
  // sin tocar accessCodeInput (evita el hack del espacio)
  }, [accessCodeInput, retryCount]);

  // ─── Validation ─────────────────────────────────────────────
  const step1Valid = useMemo(() => (
    PHONE_REGEX.test(phone.trim()) &&
    password.trim().length >= 8 &&
    fullName.trim().length >= 3
  ), [phone, password, fullName]);

  const step2Valid = useMemo(() => (
    region !== null && accessCodeCampaign !== null
  ), [region, accessCodeCampaign]);

  // ─── Handlers ───────────────────────────────────────────────
  const handleNext = () => {
    if (step === 1) {
      if (!phone.trim()) {
        Alert.alert('Campo requerido', 'Ingresa tu número de teléfono.');
        return;
      }
      if (!PHONE_REGEX.test(phone.trim())) {
        Alert.alert('Número inválido', 'Ingresa un número de 9 dígitos que empiece con 9.');
        return;
      }
      if (password.trim().length < 8) {
        Alert.alert('Contraseña muy corta', 'La contraseña debe tener al menos 8 caracteres.');
        return;
      }
      if (fullName.trim().length < 3) {
        Alert.alert('Nombre requerido', 'Ingresa tu nombre completo.');
        return;
      }
      setStep(2);
    }
  };

  const handleBack = () => {
    if (step > 1) {
      // Limpiar estado del Step 2 al volver: si el usuario cambia teléfono
      // o contraseña en Step 1, el código validado ya no corresponde.
      setRegion(null);
      setAccessCodeInput('');
      setAccessCodeCampaign(null);
      setCodeError(null);
      setValidatingCode(false);
      setRetryCount(0);
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleRegister = async () => {
    if (!step2Valid || !accessCodeCampaign) return;

    setLoading(true);
    const email = `${phone.trim()}@goberna.pe`;

    try {
      const registerResult: ApiResult<unknown> = await registerWithAccessCode({
        full_name: fullName.trim(),
        email,
        password: password.trim(),
        phone: phone.trim(),
        region: region!,
        campaign_id: accessCodeCampaign.id,
        // Sanitizar antes de enviar: eliminar cualquier carácter no alfanumérico
        access_code: accessCodeInput.replace(/[^A-Z0-9]/g, '').toUpperCase().slice(0, 4),
      });

      if (!registerResult.ok) {
        if (registerResult.code === 'AUTH_PHONE_EXISTS') {
          Alert.alert(
            'Número ya registrado',
            '¿Ya tenés cuenta? Podés iniciar sesión directamente.',
            [
              { text: 'Ir al login', onPress: () => router.replace('/(auth)/login') },
              { text: 'Cancelar', style: 'cancel' },
            ],
          );
        } else {
          Alert.alert('Error', registerResult.error ?? 'No se pudo crear la cuenta.');
        }
        setLoading(false);
        return;
      }

      // Auto login: usar teléfono como identificador (el backend lo soporta directamente)
      const loginResult = await login({ identifier: phone.trim(), password: password.trim() });
      if (!loginResult.ok) {
        Alert.alert('Error', loginResult.error ?? 'Cuenta creada pero no se pudo iniciar sesión.');
        setLoading(false);
        return;
      }

      router.replace('/(auth)/pending');
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  // ─── Access Code: individual char boxes ─────────────────────
  // Use a hidden TextInput + rendered char boxes for UX.
  // codeStr is used directly in the JSX map below.
  const codeStr = accessCodeInput.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, '');

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
            <Text style={styles.headerSubtitle}>Paso {step} de {totalSteps}</Text>
          </View>
          <View style={styles.headerRight} />
        </View>

        {/* Progress Bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${(step / totalSteps) * 100}%` }]} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Step 1: Credentials ────────────────────────────── */}
          {step === 1 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>Tus datos de acceso</Text>
              <Text style={styles.stepDescription}>
                Usarás tu número de teléfono para iniciar sesión
              </Text>

              {/* Phone */}
              <View style={styles.field}>
                <Text style={styles.label}>Número de teléfono</Text>
                <View style={[styles.inputWrapper, phoneFocused && styles.inputWrapperFocused]}>
                  <Ionicons
                    name="call-outline"
                    size={20}
                    color={phoneFocused ? BORDER_FOCUS : TEXT_MUTED}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="987654321"
                    placeholderTextColor={TEXT_MUTED}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                    maxLength={9}
                    onFocus={() => setPhoneFocused(true)}
                    onBlur={() => setPhoneFocused(false)}
                  />
                  {phone.length === 9 && PHONE_REGEX.test(phone) && (
                    <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                  )}
                </View>
                {phone.length > 0 && phone.length < 9 && (
                  <Text style={styles.hint}>{9 - phone.length} dígitos restantes</Text>
                )}
              </View>

              {/* Password */}
              <View style={styles.field}>
                <Text style={styles.label}>Contraseña</Text>
                <View style={[styles.inputWrapper, passwordFocused && styles.inputWrapperFocused]}>
                  <Ionicons
                    name="lock-closed-outline"
                    size={20}
                    color={passwordFocused ? BORDER_FOCUS : TEXT_MUTED}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.inputPassword]}
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor={TEXT_MUTED}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                    onFocus={() => setPasswordFocused(true)}
                    onBlur={() => setPasswordFocused(false)}
                  />
                  <Pressable onPress={() => setShowPassword(!showPassword)} hitSlop={12}>
                    <Ionicons
                      name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                      size={22}
                      color={TEXT_MUTED}
                    />
                  </Pressable>
                </View>
                {password.length > 0 && password.length < 8 && (
                  <Text style={styles.hintError}>{8 - password.length} caracteres más</Text>
                )}
                {password.length >= 8 && (
                  <Text style={styles.hintSuccess}>Contraseña válida ✓</Text>
                )}
              </View>

              {/* Full Name */}
              <View style={styles.field}>
                <Text style={styles.label}>Nombre completo</Text>
                <View style={[styles.inputWrapper, nameFocused && styles.inputWrapperFocused]}>
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
                </View>
              </View>

              {/* Next Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  !step1Valid && styles.buttonDisabled,
                  pressed && step1Valid && styles.buttonPressed,
                ]}
                onPress={handleNext}
                disabled={!step1Valid}
              >
                <Text style={styles.buttonText}>Continuar</Text>
                <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
              </Pressable>

              {/* Login link */}
              <Pressable onPress={() => router.replace('/(auth)/login')} style={styles.loginLink}>
                <Text style={styles.loginLinkText}>¿Ya tenés cuenta? Iniciar sesión</Text>
              </Pressable>
            </View>
          )}

          {/* ── Step 2: Region & Campaign ──────────────────────── */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>¿A qué campaña te unes?</Text>
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

              {/* ── Código de acceso ── */}
              <View style={styles.field}>
                <Text style={styles.label}>Código de acceso (4 caracteres)</Text>

                {/* Char boxes — tap anywhere en la fila para enfocar el input oculto */}
                <Pressable
                  onPress={() => codeInputRefs.current[0]?.focus()}
                  style={styles.codeBoxRow}
                >
                  {([0, 1, 2, 3] as const).map((pos) => {
                    const positions = ['code-0', 'code-1', 'code-2', 'code-3'] as const;
                    return (
                      <View
                        key={positions[pos]}
                        style={[
                          styles.codeBox,
                          accessCodeInput.length === pos && styles.codeBoxActive,
                          accessCodeCampaign && styles.codeBoxSuccess,
                          codeError && styles.codeBoxError,
                        ]}
                      >
                        <Text style={[
                          styles.codeBoxChar,
                          accessCodeCampaign && styles.codeBoxCharSuccess,
                          codeError && styles.codeBoxCharError,
                        ]}>
                          {codeStr[pos] ?? ''}
                        </Text>
                      </View>
                    );
                  })}

                  {/* Hidden input — position absolute para no romper el layout,
                      pointerEvents none para que el Pressable padre maneje el tap */}
                  <TextInput
                    ref={(ref) => { codeInputRefs.current[0] = ref; }}
                    style={styles.codeHiddenInput}
                    value={accessCodeInput}
                    onChangeText={(t) => {
                      const clean = t.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 4);
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

                {/* Validation state */}
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
                    {/* Botón reintentar — solo si el error es de red, no de código inválido */}
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
                  Pedile el código de 4 letras/números a tu coordinador de campaña
                </Text>
              </View>

              {/* ── Campaign card resuelta ── */}
              {accessCodeCampaign && (
                <View style={styles.matchedCard}>
                  <View style={styles.campaignIconCircle}>
                    <Ionicons name="megaphone" size={24} color={BRAND_YELLOW} />
                  </View>
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName}>{accessCodeCampaign.name}</Text>
                    <Text style={styles.candidateCargo}>Campaña verificada</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={28} color={SUCCESS} />
                </View>
              )}

              {/* Register Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonRegister,
                  (!step2Valid || loading) && styles.buttonDisabled,
                  pressed && step2Valid && !loading && styles.buttonPressed,
                ]}
                onPress={handleRegister}
                disabled={!step2Valid || loading}
              >
                {loading ? (
                  <ActivityIndicator color={BRAND_BLUE} size="small" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={24} color={BRAND_BLUE} />
                    <Text style={styles.buttonTextRegister}>Registrarme</Text>
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
  input: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  inputPassword: {
    paddingRight: 8,
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

  // Access code boxes
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
    letterSpacing: 0,
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
  buttonPrimary: {
    backgroundColor: BRAND_YELLOW,
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
  buttonTextPrimary: {
    fontSize: 16,
    fontFamily: FONT,
    color: BRAND_BLUE,
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

  // Login link
  loginLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  loginLinkText: {
    fontSize: 13,
    color: BRAND_BLUE,
    fontFamily: FONT_REGULAR,
  },

  // Matched campaign/candidate card
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
});
