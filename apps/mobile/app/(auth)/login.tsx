/**
 * Login Screen — dos métodos: email+password (legacy) o WhatsApp OTP.
 *
 * Tabs:
 *   1. "Contraseña" → identifier (email o teléfono) + password → /api/auth/login
 *   2. "WhatsApp"   → phone → /api/auth/whatsapp/send → code → /api/auth/whatsapp/verify
 *
 * 412 USER_NOT_FOUND en el flujo WhatsApp redirige a /register.
 */

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
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';

// ─── Design Tokens ─────────────────────────────────────────────
const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const WHATSAPP_GREEN = '#25D366';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.5)';
const BORDER = '#E1E6F0';
const BORDER_FOCUS = '#4A8AC4';
const BG_INPUT = '#F8FAFC';
const SUCCESS = '#22c55e';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

const PHONE_REGEX = /^9\d{8}$/;
const CODE_REGEX = /^\d{6}$/;
const RESEND_COOLDOWN_S = 60;

type Method = 'password' | 'whatsapp';
type WaPhase = 'phone' | 'code';

export default function LoginScreen() {
  const router = useRouter();
  const { login, whatsappSend, loginWithWhatsapp } = useApp();

  const [method, setMethod] = useState<Method>('whatsapp');

  // ── Password method state
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [pwFocused, setPwFocused] = useState<'id' | 'pw' | null>(null);
  const [showPw, setShowPw] = useState(false);

  // ── WhatsApp method state
  const [waPhase, setWaPhase] = useState<WaPhase>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [codeFocused, setCodeFocused] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeInputRef = useRef<TextInput | null>(null);

  // ── Common
  const [loading, setLoading] = useState(false);

  // Resend cooldown
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  useEffect(() => {
    if (method === 'whatsapp' && waPhase === 'code') {
      const t = setTimeout(() => codeInputRef.current?.focus(), 200);
      return () => clearTimeout(t);
    }
  }, [method, waPhase]);

  // ── Password login ─────────────────────────────────────────────
  const handlePasswordLogin = async () => {
    const id = identifier.trim();
    if (!id) return Alert.alert('Faltan datos', 'Ingresá tu email o teléfono.');
    if (password.length < 1) return Alert.alert('Faltan datos', 'Ingresá tu contraseña.');

    setLoading(true);
    const result = await login({ identifier: id, password });
    setLoading(false);

    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No pudimos iniciar sesión.');
    }
    // Success: RouterGuard redirects
  };

  // ── WhatsApp send ──────────────────────────────────────────────
  const handleWaSend = async () => {
    const trimmed = phone.trim();
    if (!PHONE_REGEX.test(trimmed)) {
      return Alert.alert('Número inválido', 'Ingresá tu número de 9 dígitos (ej: 987654321).');
    }
    setLoading(true);
    const result = await whatsappSend(trimmed);
    setLoading(false);

    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No pudimos enviar el código.');
      return;
    }
    setCode('');
    setWaPhase('code');
    setResendIn(RESEND_COOLDOWN_S);
  };

  const handleWaResend = async () => {
    if (resendIn > 0 || loading) return;
    const result = await whatsappSend(phone.trim());
    if (!result.ok) {
      Alert.alert('Error', result.error ?? 'No pudimos reenviar.');
      return;
    }
    setResendIn(RESEND_COOLDOWN_S);
  };

  // ── WhatsApp verify ────────────────────────────────────────────
  const handleWaVerify = async () => {
    const trimmed = code.trim();
    if (!CODE_REGEX.test(trimmed)) {
      return Alert.alert('Código inválido', 'Ingresá los 6 dígitos del WhatsApp.');
    }

    setLoading(true);
    const result = await loginWithWhatsapp(phone.trim(), trimmed);
    setLoading(false);

    if (!result.ok) {
      const noUser =
        result.status === 412 ||
        result.code === 'USER_NOT_FOUND' ||
        result.code === 'AUTH_USER_NOT_FOUND';
      if (noUser) {
        Alert.alert(
          'Número no registrado',
          'Este número aún no tiene cuenta. Registrate con el código que te dio tu coordinador.',
          [
            { text: 'Registrarme', onPress: () => router.replace('/(auth)/register') },
            { text: 'Cancelar', style: 'cancel' },
          ],
        );
        return;
      }
      Alert.alert('Error', result.error ?? 'No pudimos iniciar sesión.');
    }
  };

  const handleChangePhone = () => {
    setCode('');
    setResendIn(0);
    setWaPhase('phone');
  };

  const formatPhoneMask = (p: string) => {
    if (p.length !== 9) return p;
    return `+51 ${p.slice(0, 3)} ${p.slice(3, 6)} ${p.slice(6)}`;
  };

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

          {/* Method tabs */}
          <View style={styles.tabs}>
            <Pressable
              style={[styles.tab, method === 'whatsapp' && styles.tabActive]}
              onPress={() => setMethod('whatsapp')}
              disabled={loading}
            >
              <Ionicons
                name="logo-whatsapp"
                size={16}
                color={method === 'whatsapp' ? '#FFFFFF' : TEXT_MUTED}
              />
              <Text style={[styles.tabText, method === 'whatsapp' && styles.tabTextActive]}>
                WhatsApp
              </Text>
            </Pressable>
            <Pressable
              style={[styles.tab, method === 'password' && styles.tabActive]}
              onPress={() => setMethod('password')}
              disabled={loading}
            >
              <Ionicons
                name="lock-closed"
                size={16}
                color={method === 'password' ? '#FFFFFF' : TEXT_MUTED}
              />
              <Text style={[styles.tabText, method === 'password' && styles.tabTextActive]}>
                Contraseña
              </Text>
            </Pressable>
          </View>

          {/* ─── PASSWORD METHOD ─────────────────────────────── */}
          {method === 'password' && (
            <View style={styles.form}>
              <View style={styles.field}>
                <Text style={styles.label}>Email o teléfono</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    pwFocused === 'id' && styles.inputWrapperFocused,
                  ]}
                >
                  <Ionicons name="person-outline" size={18} color={TEXT_MUTED} />
                  <TextInput
                    style={styles.input}
                    placeholder="tu@email.com  o  987654321"
                    placeholderTextColor={TEXT_MUTED}
                    value={identifier}
                    onChangeText={setIdentifier}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    editable={!loading}
                    onFocus={() => setPwFocused('id')}
                    onBlur={() => setPwFocused(null)}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Contraseña</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    pwFocused === 'pw' && styles.inputWrapperFocused,
                  ]}
                >
                  <Ionicons name="lock-closed-outline" size={18} color={TEXT_MUTED} />
                  <TextInput
                    style={styles.input}
                    placeholder="••••••••"
                    placeholderTextColor={TEXT_MUTED}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPw}
                    autoCapitalize="none"
                    autoCorrect={false}
                    editable={!loading}
                    onFocus={() => setPwFocused('pw')}
                    onBlur={() => setPwFocused(null)}
                  />
                  <Pressable onPress={() => setShowPw((v) => !v)} hitSlop={8}>
                    <Ionicons
                      name={showPw ? 'eye-off-outline' : 'eye-outline'}
                      size={18}
                      color={TEXT_MUTED}
                    />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (!identifier.trim() || !password || loading) && styles.buttonDisabled,
                  pressed && identifier.trim() && password && !loading && styles.buttonPressed,
                ]}
                onPress={handlePasswordLogin}
                disabled={!identifier.trim() || !password || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Entrar</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}

          {/* ─── WHATSAPP METHOD ─────────────────────────────── */}
          {method === 'whatsapp' && waPhase === 'phone' && (
            <View style={styles.form}>
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
                {phone.length > 0 && phone.length < 9 && (
                  <Text style={styles.hint}>{9 - phone.length} dígitos restantes</Text>
                )}
                <Text style={styles.helper}>
                  Te mandamos un código por WhatsApp al número que ingreses
                </Text>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.buttonWa,
                  (!PHONE_REGEX.test(phone) || loading) && styles.buttonDisabled,
                  pressed && PHONE_REGEX.test(phone) && !loading && styles.buttonPressed,
                ]}
                onPress={handleWaSend}
                disabled={!PHONE_REGEX.test(phone) || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="logo-whatsapp" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Enviar código por WhatsApp</Text>
                  </>
                )}
              </Pressable>

              <View style={styles.registerCard}>
                <View style={styles.registerCardLeft}>
                  <View style={styles.registerIconCircle}>
                    <Ionicons name="person-add" size={20} color={BRAND_BLUE} />
                  </View>
                  <View>
                    <Text style={styles.registerCardTitle}>¿Sin cuenta aún?</Text>
                    <Text style={styles.registerCardSub}>
                      Tu coordinador te da el código
                    </Text>
                  </View>
                </View>
                <Pressable
                  style={({ pressed }) => [
                    styles.registerCardBtn,
                    pressed && styles.registerCardBtnPressed,
                  ]}
                  onPress={() => router.push('/(auth)/register')}
                >
                  <Text style={styles.registerCardBtnText}>Registrarme</Text>
                  <Ionicons name="arrow-forward" size={16} color={BRAND_YELLOW} />
                </Pressable>
              </View>
            </View>
          )}

          {method === 'whatsapp' && waPhase === 'code' && (
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
                    codeFocused && styles.inputWrapperFocused,
                    styles.codeInputWrapper,
                  ]}
                >
                  <TextInput
                    ref={codeInputRef}
                    style={styles.codeInput}
                    placeholder="000000"
                    placeholderTextColor={TEXT_MUTED}
                    value={code}
                    onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
                    keyboardType="number-pad"
                    autoComplete="sms-otp"
                    textContentType="oneTimeCode"
                    maxLength={6}
                    editable={!loading}
                    onFocus={() => setCodeFocused(true)}
                    onBlur={() => setCodeFocused(false)}
                  />
                </View>
              </View>

              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  (!CODE_REGEX.test(code) || loading) && styles.buttonDisabled,
                  pressed && CODE_REGEX.test(code) && !loading && styles.buttonPressed,
                ]}
                onPress={handleWaVerify}
                disabled={!CODE_REGEX.test(code) || loading}
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
                  onPress={handleWaResend}
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

  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: BG_INPUT,
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
    gap: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: BRAND_BLUE,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 3, elevation: 2,
  },
  tabText: {
    fontSize: 13, fontFamily: FONT, color: TEXT_MUTED,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tabTextActive: { color: '#FFFFFF' },

  form: { gap: 20 },
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
  input: { flex: 1, paddingVertical: 14, fontSize: 16, color: TEXT_DARK, fontFamily: FONT_REGULAR },
  hint: { fontSize: 12, color: TEXT_MUTED, fontFamily: FONT_REGULAR, marginLeft: 4 },
  helper: { fontSize: 12, color: TEXT_MUTED, fontFamily: FONT_REGULAR, marginLeft: 4, marginTop: 2 },

  codeHeader: { alignItems: 'center', gap: 8, marginBottom: 8 },
  codeTitle: { fontSize: 22, fontFamily: FONT, color: TEXT_DARK, marginTop: 4 },
  codeSubtitle: { fontSize: 14, fontFamily: FONT_REGULAR, color: TEXT_MUTED, textAlign: 'center', lineHeight: 20 },
  codePhoneStrong: { fontFamily: FONT, color: TEXT_DARK },
  codeInputWrapper: { paddingHorizontal: 16 },
  codeInput: {
    flex: 1, paddingVertical: 18, fontSize: 28, color: TEXT_DARK,
    fontFamily: FONT, letterSpacing: 8, textAlign: 'center',
  },
  codeFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 8, paddingHorizontal: 4,
  },
  codeFooterLink: { fontSize: 13, color: BRAND_BLUE, fontFamily: FONT },
  codeFooterLinkDisabled: { color: TEXT_MUTED },

  button: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND_BLUE, borderRadius: 14, padding: 16, marginTop: 8,
    shadowColor: BRAND_BLUE, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  buttonWa: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: WHATSAPP_GREEN, borderRadius: 14, padding: 16, marginTop: 8,
    shadowColor: WHATSAPP_GREEN, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 4,
  },
  buttonPressed: { transform: [{ scale: 0.98 }], opacity: 0.9 },
  buttonDisabled: { opacity: 0.5, elevation: 0, shadowOpacity: 0 },
  buttonText: {
    fontSize: 16, color: '#FFFFFF', fontFamily: FONT,
    textTransform: 'uppercase', letterSpacing: 1,
  },

  registerCard: {
    marginTop: 24, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', backgroundColor: BRAND_YELLOW,
    borderRadius: 18, padding: 16, shadowColor: BRAND_YELLOW,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.45,
    shadowRadius: 12, elevation: 8,
  },
  registerCardLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  registerIconCircle: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(22,57,96,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  registerCardTitle: { fontSize: 14, fontFamily: FONT, color: BRAND_BLUE },
  registerCardSub: { fontSize: 11, fontFamily: FONT_REGULAR, color: 'rgba(22,57,96,0.65)', marginTop: 1 },
  registerCardBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: BRAND_BLUE, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
  },
  registerCardBtnPressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  registerCardBtnText: { fontSize: 13, fontFamily: FONT, color: BRAND_YELLOW, letterSpacing: 0.5 },
});
