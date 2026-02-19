/**
 * Register Screen — Registro con region
 *
 * Campos:
 * 1. Nombre completo del usuario
 * 2. Telefono
 * 3. Contrasena
 * 4. Region (departamento - bottom sheet con buscador)
 * 5. Candidato (busqueda por nombre)
 *
 * Flujo:
 * 1. Usuario llena el formulario con todos los campos
 * 2. Se busca candidato por nombre (match parcial)
 * 3. Se crea cuenta + login automatico + solicitud de acceso
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
import { getCandidates } from '@/lib/api';
import type { CandidateInfo } from '@/lib/types';
import RegionPicker from '@/components/RegionPicker';

const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';
const BORDER = '#E1E6F0';
const FONT = 'Montserrat-Bold';
const PHOTO_BASE_URL = 'https://maquina-electoral-goberna-web.vercel.app';

// Phone validation regex - Peru format (9 digits starting with 9)
const PHONE_REGEX = /^9\d{8}$/;

export default function RegisterScreen() {
  const router = useRouter();
  const { register, login } = useApp();

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [region, setRegion] = useState<string | null>(null);
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

  // Generate email from phone number
  const generateEmail = (phoneNumber: string) => `${phoneNumber}@goberna.pe`;

  const handleRegister = async () => {
    // Validations
    if (!fullName.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu nombre completo.');
      return;
    }
    if (!phone.trim()) {
      Alert.alert('Campo requerido', 'Ingresa tu numero de telefono.');
      return;
    }
    if (!PHONE_REGEX.test(phone.trim())) {
      Alert.alert('Telefono invalido', 'Ingresa un numero valido de 9 digitos (ej: 987654321).');
      return;
    }
    if (!password.trim() || password.trim().length < 8) {
      Alert.alert('Campo requerido', 'La contrasena debe tener al menos 8 caracteres.');
      return;
    }
    if (!region) {
      Alert.alert('Campo requerido', 'Selecciona tu region.');
      return;
    }
    if (!matchedCandidate) {
      Alert.alert('Candidato no encontrado', 'Ingresa el primer nombre de tu candidato.');
      return;
    }

    setLoading(true);

    const email = generateEmail(phone.trim());

    try {
      // 1. Register user (backend auto-creates access_request with region)
      const registerResult = await register({
        full_name: fullName.trim(),
        email: email,
        password: password.trim(),
        phone: phone.trim(),
        region: region,
        campaign_id: matchedCandidate.id,
      });

      if (!registerResult.ok) {
        Alert.alert('Error', registerResult.error ?? 'No se pudo crear la cuenta.');
        setLoading(false);
        return;
      }

      // 2. Login immediately
      const loginResult = await login({
        email: email,
        password: password.trim(),
      });

      if (!loginResult.ok) {
        Alert.alert('Error', loginResult.error ?? 'Cuenta creada pero no se pudo iniciar sesion.');
        setLoading(false);
        return;
      }

      // 3. Navigate to pending screen (access_request already created by backend)
      Alert.alert(
        'Solicitud enviada!',
        `Solicitaste acceso a la campana de ${matchedCandidate.name}. Un supervisor revisara tu solicitud pronto.`,
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
              <Text style={styles.label}>Nombres y apellidos</Text>
              <TextInput
                style={styles.input}
                placeholder="Juan Perez Garcia"
                placeholderTextColor={TEXT_MUTED}
                value={fullName}
                onChangeText={setFullName}
                autoCapitalize="words"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Telefono</Text>
              <TextInput
                style={styles.input}
                placeholder="987654321"
                placeholderTextColor={TEXT_MUTED}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={9}
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

            <View style={styles.field}>
              <Text style={styles.label}>Region</Text>
              <RegionPicker
                value={region}
                onSelect={setRegion}
                placeholder="Selecciona tu departamento"
              />
            </View>

            {/* Candidate name input */}
            <View style={styles.field}>
              <Text style={styles.label}>Candidato</Text>
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
