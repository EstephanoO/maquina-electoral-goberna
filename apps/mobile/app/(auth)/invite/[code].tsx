/**
 * InviteScreen — Registro simplificado via magic link.
 *
 * Flujo:
 * 1. Al montar: valida el código de invitación contra el backend
 * 2. Muestra el candidato/campaña de forma prominente (contexto ya resuelto)
 * 3. El usuario solo completa: nombre completo + teléfono + contraseña
 * 4. POST /api/auth/register con invitation_code incluido
 * 5. Auto-login y navegación al dashboard
 *
 * Diferencias con register.tsx normal:
 * - Sin búsqueda de candidato (viene del link)
 * - Sin selección de región (se usa "Nacional" por defecto, editable)
 * - Sin paso 2 separado — todo en una pantalla
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
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import { validateInvitation, registerWithInvitation } from '@/lib/api';
import type { InvitationInfo } from '@/lib/types';

// ─── Design Tokens (idénticos al resto de la app) ───────────────
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

// Peru phone: 9 dígitos comenzando con 9
const PHONE_REGEX = /^9\d{8}$/;

const PHOTO_BASE_URL = 'https://maquina-electoral-goberna-web.vercel.app';

type ScreenState =
  | { phase: 'validating' }
  | { phase: 'invalid'; reason: string }
  | { phase: 'ready'; invitation: InvitationInfo }
  | { phase: 'registering' }
  | { phase: 'done' };

export default function InviteScreen() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const router = useRouter();
  const { login } = useApp();

  // ─── Screen phase ────────────────────────────────────────────
  const [state, setState] = useState<ScreenState>({ phase: 'validating' });
  // Keep invitation data in a ref so it's accessible across all phases after validation
  const invitationRef = useRef<InvitationInfo | null>(null);

  // ─── Form fields ─────────────────────────────────────────────
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Focus
  const [nameFocused, setNameFocused] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // ─── Validate invitation on mount ────────────────────────────
  useEffect(() => {
    if (!code) {
      setState({ phase: 'invalid', reason: 'Link inválido.' });
      return;
    }

    (async () => {
      const result = await validateInvitation(code);

      if (!result.ok) {
        // Distinguish expired from not found
        const reason =
          result.code === 'INVITATION_EXPIRED'
            ? 'Este link ha expirado o ya fue usado el máximo de veces.'
            : 'El link de invitación no es válido.';
        setState({ phase: 'invalid', reason });
        return;
      }

      invitationRef.current = result.data.invitation;
      setState({ phase: 'ready', invitation: result.data.invitation });
    })();
  }, [code]);

  // ─── Form validation ─────────────────────────────────────────
  const formValid = useMemo(() => {
    return (
      fullName.trim().length >= 3 &&
      PHONE_REGEX.test(phone.trim()) &&
      password.trim().length >= 8
    );
  }, [fullName, phone, password]);

  // ─── Submit ──────────────────────────────────────────────────
  const handleRegister = async () => {
    if (!formValid || state.phase !== 'ready') return;

    const { invitation } = state;
    setState({ phase: 'registering' });

    const phoneTrimmed = phone.trim();
    const email = `${phoneTrimmed}@goberna.pe`;

    const registerResult = await registerWithInvitation({
      full_name: fullName.trim(),
      email,
      password: password.trim(),
      phone: phoneTrimmed,
      region: 'Nacional',
      campaign_id: invitation.campaign_id,
      invitation_code: code!,
    });

    if (!registerResult.ok) {
      // Back to ready so user can fix and retry
      setState({ phase: 'ready', invitation });

      const friendlyMessage =
        registerResult.code === 'AUTH_PHONE_EXISTS'
          ? 'Ese número ya tiene una cuenta. Iniciá sesión en su lugar.'
          : registerResult.error ?? 'No se pudo crear la cuenta. Intentá de nuevo.';

      Alert.alert('Error', friendlyMessage, [
        {
          text: 'Iniciar sesión',
          onPress: () => router.replace('/(auth)/login'),
          style: 'default',
        },
        { text: 'Intentar de nuevo', style: 'cancel' },
      ]);
      return;
    }

    // Auto-login
    const loginResult = await login({ identifier: email, password: password.trim() });

    if (!loginResult.ok) {
      setState({ phase: 'ready', invitation });
      Alert.alert(
        'Cuenta creada',
        'Tu cuenta fue creada. Por favor iniciá sesión.',
        [{ text: 'Ir al login', onPress: () => router.replace('/(auth)/login') }],
      );
      return;
    }

    setState({ phase: 'done' });
    // RouterGuard in _layout.tsx handles navigation to (main)/dashboard
  };

  // ─── Helpers ─────────────────────────────────────────────────
  const getPhotoUrl = (fotoUrl: string | null | undefined): string | null => {
    if (!fotoUrl) return null;
    return fotoUrl.startsWith('http') ? fotoUrl : `${PHOTO_BASE_URL}${fotoUrl}`;
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

  // ─── Render: invalid / expired ───────────────────────────────
  if (state.phase === 'invalid') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <View style={[styles.logoCircle, { backgroundColor: '#fee2e2' }]}>
            <Ionicons name="close-circle" size={40} color="#dc2626" />
          </View>
          <Text style={styles.errorTitle}>Link inválido</Text>
          <Text style={styles.errorBody}>{state.reason}</Text>
          <Pressable
            style={styles.button}
            onPress={() => router.replace('/(auth)/login')}
          >
            <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
            <Text style={styles.buttonText}>Ir al login</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Render: done (briefly shown before RouterGuard redirects) ──
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

  // ─── Render: ready / registering ─────────────────────────────
  // Use ref so invitation data is accessible in both 'ready' and 'registering' phases
  const invitation = invitationRef.current ?? (state.phase === 'ready' ? state.invitation : null);
  const isRegistering = state.phase === 'registering';

  // Guard: invitation must be available to render this section
  if (!invitation) return null;

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
          {/* ── Campaign hero ── */}
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
              Te invitan a unirte como agente de campo
            </Text>
          </View>

          {/* ── Divider ── */}
          <View style={styles.divider} />

          {/* ── Form ── */}
          <View style={styles.form}>
            <Text style={styles.formTitle}>Crear tu cuenta</Text>
            <Text style={styles.formSubtitle}>
              Solo necesitás tu nombre, teléfono y una contraseña
            </Text>

            {/* Nombre */}
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
                  autoCorrect={false}
                  editable={!isRegistering}
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
                  editable={!isRegistering}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                />
                {PHONE_REGEX.test(phone.trim()) && (
                  <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                )}
              </View>
              {phone.length > 0 && phone.length < 9 && (
                <Text style={styles.hint}>{9 - phone.length} dígitos restantes</Text>
              )}
            </View>

            {/* Contraseña */}
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
                  editable={!isRegistering}
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <Pressable
                  onPress={() => setShowPassword((v) => !v)}
                  hitSlop={12}
                  disabled={isRegistering}
                >
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={22}
                    color={TEXT_MUTED}
                  />
                </Pressable>
              </View>
              {password.length > 0 && password.length < 8 && (
                <Text style={styles.hint}>{8 - password.length} caracteres más</Text>
              )}
            </View>

            {/* Submit */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                styles.buttonPrimary,
                (!formValid || isRegistering) && styles.buttonDisabled,
                pressed && formValid && !isRegistering && styles.buttonPressed,
              ]}
              onPress={handleRegister}
              disabled={!formValid || isRegistering}
            >
              {isRegistering ? (
                <ActivityIndicator color={BRAND_BLUE} />
              ) : (
                <>
                  <Ionicons name="checkmark-circle-outline" size={20} color={BRAND_BLUE} />
                  <Text style={styles.buttonTextPrimary}>Unirme a la campaña</Text>
                </>
              )}
            </Pressable>

            {/* Already have account */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>¿Ya tenés cuenta?</Text>
              <Pressable
                onPress={() => router.replace('/(auth)/login')}
                hitSlop={8}
                disabled={isRegistering}
              >
                <Text style={styles.footerLink}>Iniciar sesión</Text>
              </Pressable>
            </View>
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

  // Form
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

  // Error/loading states
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
