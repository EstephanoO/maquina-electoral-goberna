import { useState } from 'react';
import {
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
import { API_BASE } from '@/lib/api';

// ─── Design Tokens ─────────────────────────────────────────────
const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.5)';
const BORDER = '#E1E6F0';
const BORDER_FOCUS = '#4A8AC4';
const BG_INPUT = '#F8FAFC';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

// Phone validation - Peru format (9 digits starting with 9)
const PHONE_REGEX = /^9\d{8}$/;

// Check if input looks like an email (hidden feature for admins)
const isEmail = (input: string) => input.includes('@');

// Generate email from phone number (for backend compatibility)
const generateEmail = (phone: string) => `${phone}@goberna.pe`;

// Password validation
const PASSWORD_MIN = 8;

export default function LoginScreen() {
  const router = useRouter();
  const { login } = useApp();

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  // Password reset flow state
  const [resetMode, setResetMode] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [confirmPasswordFocused, setConfirmPasswordFocused] = useState(false);

  // Hidden email detection (for admins who know to type email)
  const isEmailMode = isEmail(phone);

  // Get identifier (email format for backend)
  const getIdentifier = () => {
    const trimmed = phone.trim();
    if (isEmailMode) return trimmed.toLowerCase();
    return generateEmail(trimmed);
  };

  const handleLogin = async () => {
    const trimmed = phone.trim();
    
    if (!trimmed || !password.trim()) {
      Alert.alert('Campos requeridos', 'Ingresa tu número y contraseña.');
      return;
    }

    // Determine identifier
    let identifier: string;
    
    if (isEmailMode) {
      // Hidden path: user typed an email directly
      identifier = trimmed.toLowerCase();
    } else {
      // Normal path: phone number
      if (!PHONE_REGEX.test(trimmed)) {
        Alert.alert(
          'Número inválido', 
          'Ingresa tu número de 9 dígitos (ej: 987654321).'
        );
        return;
      }
      identifier = generateEmail(trimmed);
    }

    setLoading(true);
    const result = await login({ identifier, password: password.trim() });
    setLoading(false);

    if (!result.ok) {
      // Check if password reset is required
      if (result.passwordResetRequired) {
        setResetMode(true);
        return;
      }
      Alert.alert('Error de acceso', result.error || 'Credenciales incorrectas.');
    }
    // If ok, router guard in _layout.tsx handles navigation
  };

  // Handle password reset submission
  const handleResetPassword = async () => {
    if (newPassword.length < PASSWORD_MIN) {
      Alert.alert('Contraseña muy corta', `La nueva contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`);
      return;
    }
    
    if (newPassword !== confirmPassword) {
      Alert.alert('No coinciden', 'Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    
    try {
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: getIdentifier(),
          current_password: password.trim(),
          new_password: newPassword.trim(),
        }),
      });

      const data = await response.json();

      if (response.ok && data.ok) {
        Alert.alert(
          'Contraseña actualizada', 
          'Tu contraseña ha sido cambiada. Ahora puedes iniciar sesión.',
          [{ 
            text: 'OK', 
            onPress: () => {
              // Reset form and login with new password
              setResetMode(false);
              setPassword(newPassword);
              setNewPassword('');
              setConfirmPassword('');
            }
          }]
        );
      } else {
        Alert.alert('Error', data.message || 'No se pudo cambiar la contraseña.');
      }
    } catch {
      Alert.alert('Error', 'Error de conexión. Intenta de nuevo.');
    }
    
    setLoading(false);
  };

  // Cancel reset and go back to login
  const cancelReset = () => {
    setResetMode(false);
    setNewPassword('');
    setConfirmPassword('');
  };

  // Password Reset Mode UI
  if (resetMode) {
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
              <View style={[styles.logoCircle, { backgroundColor: BRAND_YELLOW }]}>
                <Ionicons name="key" size={36} color={BRAND_BLUE} />
              </View>
              <Text style={styles.title}>Nueva Contraseña</Text>
              <Text style={styles.subtitle}>Crea tu nueva contraseña para continuar</Text>
            </View>

            {/* Reset Form */}
            <View style={styles.form}>
              {/* New Password */}
              <View style={styles.field}>
                <Text style={styles.label}>Nueva contraseña</Text>
                <View style={[
                  styles.inputWrapper,
                  newPasswordFocused && styles.inputWrapperFocused
                ]}>
                  <Ionicons 
                    name="lock-closed-outline" 
                    size={20} 
                    color={newPasswordFocused ? BORDER_FOCUS : TEXT_MUTED} 
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={[styles.input, styles.inputPassword]}
                    placeholder="Mínimo 8 caracteres"
                    placeholderTextColor={TEXT_MUTED}
                    value={newPassword}
                    onChangeText={setNewPassword}
                    secureTextEntry={!showNewPassword}
                    autoComplete="new-password"
                    onFocus={() => setNewPasswordFocused(true)}
                    onBlur={() => setNewPasswordFocused(false)}
                  />
                  <Pressable 
                    onPress={() => setShowNewPassword(!showNewPassword)}
                    style={styles.eyeButton}
                    hitSlop={12}
                  >
                    <Ionicons 
                      name={showNewPassword ? 'eye-outline' : 'eye-off-outline'} 
                      size={22} 
                      color={TEXT_MUTED} 
                    />
                  </Pressable>
                </View>
                {newPassword.length > 0 && newPassword.length < PASSWORD_MIN && (
                  <Text style={styles.hint}>
                    {PASSWORD_MIN - newPassword.length} caracteres más
                  </Text>
                )}
              </View>

              {/* Confirm Password */}
              <View style={styles.field}>
                <Text style={styles.label}>Confirmar contraseña</Text>
                <View style={[
                  styles.inputWrapper,
                  confirmPasswordFocused && styles.inputWrapperFocused,
                  confirmPassword.length > 0 && confirmPassword !== newPassword && styles.inputWrapperError,
                ]}>
                  <Ionicons 
                    name="checkmark-circle-outline" 
                    size={20} 
                    color={
                      confirmPassword.length > 0 && confirmPassword === newPassword 
                        ? '#10B981' 
                        : confirmPasswordFocused ? BORDER_FOCUS : TEXT_MUTED
                    } 
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Repite la contraseña"
                    placeholderTextColor={TEXT_MUTED}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    secureTextEntry={!showNewPassword}
                    autoComplete="new-password"
                    onFocus={() => setConfirmPasswordFocused(true)}
                    onBlur={() => setConfirmPasswordFocused(false)}
                  />
                </View>
                {confirmPassword.length > 0 && confirmPassword !== newPassword && (
                  <Text style={[styles.hint, { color: '#EF4444' }]}>
                    Las contraseñas no coinciden
                  </Text>
                )}
              </View>

              {/* Submit Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  loading && styles.buttonDisabled,
                  pressed && !loading && styles.buttonPressed,
                ]}
                onPress={handleResetPassword}
                disabled={loading}
              >
                {loading ? (
                  <View style={styles.buttonContent}>
                    <Text style={styles.buttonText}>Guardando...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Ionicons name="checkmark-done-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.buttonText}>Guardar Contraseña</Text>
                  </View>
                )}
              </Pressable>

              {/* Cancel Button */}
              <Pressable
                style={styles.cancelButton}
                onPress={cancelReset}
                disabled={loading}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // Normal Login UI
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

          {/* Form */}
          <View style={styles.form}>
            {/* Phone Input (email detection is hidden) */}
            <View style={styles.field}>
              <Text style={styles.label}>Número de teléfono</Text>
              <View style={[
                styles.inputWrapper,
                phoneFocused && styles.inputWrapperFocused
              ]}>
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
                  keyboardType={isEmailMode ? 'email-address' : 'phone-pad'}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="tel"
                  maxLength={isEmailMode ? 100 : 9}
                  onFocus={() => setPhoneFocused(true)}
                  onBlur={() => setPhoneFocused(false)}
                />
              </View>
              {/* Digit counter for phone mode */}
              {!isEmailMode && phone.length > 0 && phone.length < 9 && (
                <Text style={styles.hint}>
                  {9 - phone.length} dígitos restantes
                </Text>
              )}
            </View>

            {/* Password Input */}
            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={[
                styles.inputWrapper,
                passwordFocused && styles.inputWrapperFocused
              ]}>
                <Ionicons 
                  name="lock-closed-outline" 
                  size={20} 
                  color={passwordFocused ? BORDER_FOCUS : TEXT_MUTED} 
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[styles.input, styles.inputPassword]}
                  placeholder="Tu contraseña"
                  placeholderTextColor={TEXT_MUTED}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  autoComplete="password"
                  onFocus={() => setPasswordFocused(true)}
                  onBlur={() => setPasswordFocused(false)}
                />
                <Pressable 
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.eyeButton}
                  hitSlop={12}
                >
                  <Ionicons 
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'} 
                    size={22} 
                    color={TEXT_MUTED} 
                  />
                </Pressable>
              </View>
            </View>

            {/* Login Button */}
            <Pressable
              style={({ pressed }) => [
                styles.button,
                loading && styles.buttonDisabled,
                pressed && !loading && styles.buttonPressed,
              ]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <View style={styles.buttonContent}>
                  <Text style={styles.buttonText}>Ingresando...</Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <Ionicons name="log-in-outline" size={20} color="#FFFFFF" />
                  <Text style={styles.buttonText}>Iniciar Sesión</Text>
                </View>
              )}
            </Pressable>
          </View>

          {/* Register Link */}
          <View style={styles.footer}>
            <Text style={styles.footerText}>¿No tienes cuenta?</Text>
            <Pressable 
              onPress={() => router.push('/(auth)/register')}
              hitSlop={8}
            >
              <Text style={styles.footerLink}>Regístrate</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { 
    flex: 1, 
    backgroundColor: '#FFFFFF' 
  },
  flex: { 
    flex: 1 
  },
  scroll: { 
    padding: 24, 
    paddingTop: 48, 
    paddingBottom: 40 
  },
  
  // Header
  header: { 
    alignItems: 'center', 
    marginBottom: 48, 
    gap: 6 
  },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  logoText: { 
    color: BRAND_YELLOW, 
    fontSize: 36, 
    fontFamily: FONT 
  },
  title: { 
    fontSize: 28, 
    color: TEXT_DARK, 
    fontFamily: FONT,
    letterSpacing: 1,
  },
  subtitle: { 
    fontSize: 14, 
    color: TEXT_MUTED, 
    fontFamily: FONT_REGULAR,
    letterSpacing: 0.5,
  },
  
  // Form
  form: { 
    gap: 20 
  },
  field: { 
    gap: 8 
  },
  label: {
    fontSize: 13,
    color: TEXT_DARK,
    fontFamily: FONT,
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
    paddingRight: 40,
  },
  eyeButton: {
    padding: 4,
  },
  hint: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    marginLeft: 4,
  },
  
  // Button
  button: {
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: BRAND_BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4,
  },
  buttonPressed: {
    transform: [{ scale: 0.98 }],
    opacity: 0.9,
  },
  buttonDisabled: { 
    opacity: 0.6 
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  buttonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  
  // Footer
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 40,
  },
  footerText: { 
    fontSize: 14, 
    color: TEXT_MUTED, 
    fontFamily: FONT_REGULAR 
  },
  footerLink: { 
    fontSize: 14, 
    color: BRAND_BLUE, 
    fontFamily: FONT, 
    textDecorationLine: 'underline' 
  },
  
  // Reset mode styles
  inputWrapperError: {
    borderColor: '#EF4444',
    backgroundColor: '#FEF2F2',
  },
  cancelButton: {
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  cancelButtonText: {
    fontSize: 14,
    color: TEXT_MUTED,
    fontFamily: FONT,
    textDecorationLine: 'underline',
  },
});
