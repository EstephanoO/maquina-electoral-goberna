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

import { useApp } from '@/lib/app-context';

const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';
const BORDER = '#E1E6F0';
const FONT = 'Montserrat-Bold';

export default function RegisterScreen() {
  const router = useRouter();
  const { register } = useApp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu nombre completo.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu email.');
      return;
    }
    if (!password.trim() || password.trim().length < 8) {
      Alert.alert('Campo requerido', 'La contrasena debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    const result = await register({
      full_name: fullName.trim(),
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);

    if (result.ok) {
      Alert.alert(
        'Cuenta creada',
        'Tu cuenta fue creada. Ya puedes iniciar sesion.',
        [{ text: 'Ir a login', onPress: () => router.replace('/(auth)/login') }],
      );
    } else {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <Text style={styles.backText}>← Volver</Text>
            </Pressable>
            <Text style={styles.title}>Crear cuenta</Text>
            <Text style={styles.subtitle}>Registrate para solicitar acceso</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Nombre completo</Text>
              <TextInput
                style={styles.input}
                placeholder="Juan Perez"
                placeholderTextColor={TEXT_MUTED}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                placeholder="agente@correo.com"
                placeholderTextColor={TEXT_MUTED}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Contrasena</Text>
              <TextInput
                style={styles.input}
                placeholder="Minimo 8 caracteres"
                placeholderTextColor={TEXT_MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            <Pressable
              style={[styles.button, loading && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading}
            >
              <Text style={styles.buttonText}>
                {loading ? 'Registrando...' : 'Crear cuenta'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scroll: { padding: 24, paddingTop: 20, paddingBottom: 40 },
  header: { marginBottom: 32 },
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 14, color: TEXT_MUTED, fontFamily: FONT },
  title: { fontSize: 24, color: TEXT_DARK, fontFamily: FONT },
  subtitle: { fontSize: 14, color: TEXT_MUTED, fontFamily: FONT, marginTop: 4 },
  form: { gap: 20 },
  field: { gap: 8 },
  label: {
    fontSize: 13,
    color: TEXT_DARK,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT,
    backgroundColor: '#F8FAFC',
  },
  button: {
    backgroundColor: BRAND_YELLOW,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: {
    fontSize: 16,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
