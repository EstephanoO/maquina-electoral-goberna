/**
 * Register Screen — Registro simplificado
 *
 * Campos:
 * - Nombre completo del usuario
 * - Email
 * - Contraseña
 * - Nombre del candidato (primer nombre para buscar)
 *
 * Flujo:
 * 1. Usuario llena el formulario con nombre del candidato
 * 2. Se busca candidato por nombre (match parcial)
 * 3. Se crea cuenta + login automático + solicitud de acceso
 * 4. Se redirige a pantalla de espera
 */

import { useState, useEffect } from 'react';
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
import { useRouter } from 'expo-router';

import { useApp } from '@/lib/app-context';
import { getCandidates, createAccessRequest } from '@/lib/api';
import type { CandidateInfo } from '@/lib/types';

const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';
const BORDER = '#E1E6F0';
const FONT = 'Montserrat-Bold';
const PHOTO_BASE_URL = 'https://maquina-electoral-goberna-web.vercel.app';

// Email validation regex - basic but effective
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterScreen() {
  const router = useRouter();
  const { register, login } = useApp();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [candidateName, setCandidateName] = useState('');
  const [loading, setLoading] = useState(false);

  // Candidates for matching
  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [matchedCandidate, setMatchedCandidate] = useState<CandidateInfo | null>(null);
  const [loadingCandidates, setLoadingCandidates] = useState(true);

  // Load candidates on mount
  useEffect(() => {
    (async () => {
      const result = await getCandidates();
      if (result.ok && result.data?.candidates) {
        setCandidates(result.data.candidates);
      }
      setLoadingCandidates(false);
    })();
  }, []);

  // Match candidate by first name (case + accent insensitive)
  // "cesar", "César", "CESAR", "cesár" all match "César Acuña"
  useEffect(() => {
    if (!candidateName.trim()) {
      setMatchedCandidate(null);
      return;
    }

    // Normalize: lowercase + strip accents ("César" → "cesar", "Rocío" → "rocio")
    const strip = (t: string) =>
      t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    const searchTerm = strip(candidateName);
    const match = candidates.find((c) => {
      const normalizedName = strip(c.name);
      const normalizedFirst = strip(c.name.split(' ')[0]);
      return normalizedFirst.startsWith(searchTerm) || normalizedName.includes(searchTerm);
    });

    setMatchedCandidate(match ?? null);
  }, [candidateName, candidates]);

  const handleRegister = async () => {
    // Validations
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu nombre completo.');
      return;
    }
    if (!email.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu email.');
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      Alert.alert('Email invalido', 'Ingresa un email valido (ej: usuario@correo.com).');
      return;
    }
    if (!password.trim() || password.trim().length < 8) {
      Alert.alert('Campo requerido', 'La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (!matchedCandidate) {
      Alert.alert('Candidato no encontrado', 'Ingresa el primer nombre de tu candidato.');
      return;
    }

    setLoading(true);

    try {
      // 1. Register user
      const registerResult = await register({
        full_name: fullName.trim(),
        email: email.trim(),
        password: password.trim(),
      });

      if (!registerResult.ok) {
        Alert.alert('Error', registerResult.error ?? 'No se pudo crear la cuenta.');
        setLoading(false);
        return;
      }

      // 2. Login immediately
      const loginResult = await login({
        email: email.trim(),
        password: password.trim(),
      });

      if (!loginResult.ok) {
        Alert.alert('Error', loginResult.error ?? 'Cuenta creada pero no se pudo iniciar sesión.');
        setLoading(false);
        return;
      }

      // 3. Create access request for matched candidate
      const accessResult = await createAccessRequest({
        campaign_id: matchedCandidate.id,
        perm_tierra: true,
      });

      if (!accessResult.ok && accessResult.code !== 'ACCESS_REQUEST_EXISTS') {
        Alert.alert('Aviso', 'Cuenta creada. Solicita acceso desde la app.');
        // Still go to pending since account was created
      }

      // 4. Navigate to pending screen
      Alert.alert(
        '¡Solicitud enviada!',
        `Solicitaste acceso a la campaña de ${matchedCandidate.name}. Un supervisor revisará tu solicitud pronto.`,
        [{ text: 'OK', onPress: () => router.replace('/(auth)/pending') }],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  // Build photo URL for matched candidate
  const matchedPhotoUrl = matchedCandidate?.foto_url
    ? matchedCandidate.foto_url.startsWith('http')
      ? matchedCandidate.foto_url
      : `${PHOTO_BASE_URL}${matchedCandidate.foto_url}`
    : null;

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
            <Text style={styles.subtitle}>Regístrate como agente de campo</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>Tu nombre completo</Text>
              <TextInput
                style={styles.input}
                placeholder="Juan Pérez"
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
                placeholder="tu@correo.com"
                placeholderTextColor={TEXT_MUTED}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <TextInput
                style={styles.input}
                placeholder="Mínimo 8 caracteres"
                placeholderTextColor={TEXT_MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
            </View>

            {/* Candidate name input */}
            <View style={styles.field}>
              <Text style={styles.label}>Nombre de tu candidato</Text>
              <TextInput
                style={[styles.input, matchedCandidate && styles.inputSuccess]}
                placeholder="Ingresa el nombre de tu candidato"
                placeholderTextColor={TEXT_MUTED}
                value={candidateName}
                onChangeText={setCandidateName}
                autoCapitalize="words"
              />
              {loadingCandidates && (
                <Text style={styles.helperText}>Cargando candidatos...</Text>
              )}
              {!loadingCandidates && candidateName.trim() && !matchedCandidate && (
                <Text style={styles.errorText}>
                  No encontramos ese candidato. Intenta con otro nombre.
                </Text>
              )}
            </View>

            {/* Matched candidate preview */}
            {matchedCandidate && (
              <View style={styles.matchedCard}>
                {matchedPhotoUrl ? (
                  <Image
                    source={{ uri: matchedPhotoUrl }}
                    style={styles.matchedPhoto}
                    contentFit="cover"
                  />
                ) : (
                  <View style={[styles.matchedPhoto, styles.matchedPhotoPlaceholder]}>
                    <Text style={styles.matchedPhotoText}>
                      {matchedCandidate.name.charAt(0)}
                    </Text>
                  </View>
                )}
                <View style={styles.matchedInfo}>
                  <Text style={styles.matchedName}>{matchedCandidate.name}</Text>
                  <Text style={styles.matchedCargo}>{matchedCandidate.cargo}</Text>
                  <Text style={styles.matchedPartido}>
                    {matchedCandidate.partido} · #{matchedCandidate.numero}
                  </Text>
                </View>
                <Text style={styles.checkmark}>✓</Text>
              </View>
            )}

            <Pressable
              style={[styles.button, (loading || !matchedCandidate) && styles.buttonDisabled]}
              onPress={handleRegister}
              disabled={loading || !matchedCandidate}
            >
              {loading ? (
                <ActivityIndicator color={BRAND_BLUE} />
              ) : (
                <Text style={styles.buttonText}>Crear cuenta y solicitar acceso</Text>
              )}
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
  header: { marginBottom: 28 },
  backBtn: { marginBottom: 16 },
  backText: { fontSize: 14, color: TEXT_MUTED, fontFamily: FONT },
  title: { fontSize: 24, color: TEXT_DARK, fontFamily: FONT },
  subtitle: { fontSize: 14, color: TEXT_MUTED, fontFamily: FONT, marginTop: 4 },
  form: { gap: 18 },
  field: { gap: 8 },
  label: {
    fontSize: 12,
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
  inputSuccess: {
    borderColor: '#22c55e',
    backgroundColor: '#f0fdf4',
  },
  helperText: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT,
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    fontFamily: FONT,
    marginTop: 4,
  },
  matchedCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#22c55e',
    gap: 12,
  },
  matchedPhoto: {
    width: 52,
    height: 52,
    borderRadius: 10,
    backgroundColor: '#e2e8f0',
  },
  matchedPhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
  },
  matchedPhotoText: {
    fontSize: 20,
    color: BRAND_YELLOW,
    fontFamily: FONT,
  },
  matchedInfo: {
    flex: 1,
  },
  matchedName: {
    fontSize: 15,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  matchedCargo: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT,
    marginTop: 2,
  },
  matchedPartido: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontFamily: FONT,
    marginTop: 2,
  },
  checkmark: {
    fontSize: 20,
    color: '#22c55e',
  },
  button: {
    backgroundColor: BRAND_YELLOW,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: {
    fontSize: 14,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
