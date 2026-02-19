/**
 * Register Screen — Registro Multi-Step
 *
 * Flujo simplificado en 2 pasos:
 * - Paso 1: Teléfono + Contraseña + Nombre
 * - Paso 2: Región + Candidato (solo aparece si hay match exacto por primer nombre)
 *
 * IMPORTANTE: No se muestra lista de candidatos por privacidad.
 * El usuario debe conocer el primer nombre de su candidato.
 */

import { useState, useEffect, useMemo } from 'react';
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
import { Ionicons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import { getCandidates } from '@/lib/api';
import type { CandidateInfo } from '@/lib/types';
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
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

// Phone validation - Peru format (9 digits starting with 9)
const PHONE_REGEX = /^9\d{8}$/;

// Photo URL base
const PHOTO_BASE_URL = 'https://maquina-electoral-goberna-web.vercel.app';

// Normalize text for search (remove accents, lowercase)
const normalize = (t: string) =>
  t.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export default function RegisterScreen() {
  const router = useRouter();
  const { register, login } = useApp();

  // ─── Step State ─────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const totalSteps = 2;

  // ─── Form State ─────────────────────────────────────────────
  // Step 1
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');

  // Step 2
  const [region, setRegion] = useState<string | null>(null);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [matchedCandidate, setMatchedCandidate] = useState<CandidateInfo | null>(null);

  // ─── UI State ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(true);

  // Focus states
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // ─── Load Candidates ────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const result = await getCandidates();
      if (result.ok && result.data?.candidates) {
        setCandidates(result.data.candidates);
      }
      setLoadingCandidates(false);
    })();
  }, []);

  // ─── Match Candidate by First Name ──────────────────────────
  // Solo muestra si el primer nombre coincide exactamente (case/accent insensitive)
  useEffect(() => {
    const searchTerm = normalize(candidateSearch);
    
    // Necesita al menos 3 caracteres para buscar
    if (searchTerm.length < 3) {
      setMatchedCandidate(null);
      return;
    }

    // Buscar match exacto por primer nombre
    const match = candidates.find((c) => {
      const firstName = normalize(c.name.split(' ')[0]);
      return firstName === searchTerm;
    });

    setMatchedCandidate(match ?? null);
  }, [candidateSearch, candidates]);

  // ─── Validation ─────────────────────────────────────────────
  const step1Valid = useMemo(() => {
    return (
      PHONE_REGEX.test(phone.trim()) &&
      password.trim().length >= 8 &&
      fullName.trim().length >= 3
    );
  }, [phone, password, fullName]);

  const step2Valid = useMemo(() => {
    return region !== null && matchedCandidate !== null;
  }, [region, matchedCandidate]);

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
      setStep(step - 1);
    } else {
      router.back();
    }
  };

  const handleRegister = async () => {
    if (!step2Valid || !matchedCandidate) return;

    setLoading(true);
    const email = `${phone.trim()}@goberna.pe`;

    try {
      // 1. Register user
      const registerResult = await register({
        full_name: fullName.trim(),
        email: email,
        password: password.trim(),
        phone: phone.trim(),
        region: region!,
        campaign_id: matchedCandidate.id,
      });

      if (!registerResult.ok) {
        Alert.alert('Error', registerResult.error ?? 'No se pudo crear la cuenta.');
        setLoading(false);
        return;
      }

      // 2. Auto login
      const loginResult = await login({
        identifier: email,
        password: password.trim(),
      });

      if (!loginResult.ok) {
        Alert.alert('Error', loginResult.error ?? 'Cuenta creada pero no se pudo iniciar sesión.');
        setLoading(false);
        return;
      }

      // 3. Success - navigate to pending
      router.replace('/(auth)/pending');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  // ─── Photo URL Helper ───────────────────────────────────────
  const getPhotoUrl = (candidate: CandidateInfo) => {
    if (!candidate.foto_url) return null;
    return candidate.foto_url.startsWith('http')
      ? candidate.foto_url
      : `${PHOTO_BASE_URL}${candidate.foto_url}`;
  };

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
          {/* Step 1: Credentials */}
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
                  <Text style={styles.hintError}>
                    {8 - password.length} caracteres más
                  </Text>
                )}
                {password.length >= 8 && (
                  <Text style={styles.hintSuccess}>Contraseña válida</Text>
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
            </View>
          )}

          {/* Step 2: Region & Candidate */}
          {step === 2 && (
            <View style={styles.stepContainer}>
              <Text style={styles.stepTitle}>¿A qué campaña te unes?</Text>
              <Text style={styles.stepDescription}>
                Selecciona tu región y escribe el primer nombre de tu candidato
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

              {/* Candidate Search - Solo primer nombre */}
              <View style={styles.field}>
                <Text style={styles.label}>Primer nombre del candidato</Text>
                <View style={[styles.inputWrapper, searchFocused && styles.inputWrapperFocused]}>
                  <Ionicons 
                    name="person-outline" 
                    size={20} 
                    color={searchFocused ? BORDER_FOCUS : TEXT_MUTED} 
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Ej: César, Rosa, Juan..."
                    placeholderTextColor={TEXT_MUTED}
                    value={candidateSearch}
                    onChangeText={setCandidateSearch}
                    autoCapitalize="words"
                    autoCorrect={false}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                  />
                  {matchedCandidate && (
                    <Ionicons name="checkmark-circle" size={20} color={SUCCESS} />
                  )}
                </View>
                
                {/* Hint when typing */}
                {!matchedCandidate && candidateSearch.length > 0 && candidateSearch.length < 3 && (
                  <Text style={styles.hint}>Escribe al menos 3 letras</Text>
                )}
                
                {/* No match found */}
                {!matchedCandidate && candidateSearch.length >= 3 && !loadingCandidates && (
                  <Text style={styles.hintError}>
                    No encontramos un candidato con ese nombre
                  </Text>
                )}
              </View>

              {/* Matched Candidate Card - Solo aparece con match exacto */}
              {matchedCandidate && (
                <View style={styles.matchedCard}>
                  {getPhotoUrl(matchedCandidate) ? (
                    <Image
                      source={{ uri: getPhotoUrl(matchedCandidate)! }}
                      style={styles.candidatePhoto}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={[styles.candidatePhoto, styles.candidatePhotoPlaceholder]}>
                      <Text style={styles.candidatePhotoText}>
                        {matchedCandidate.name.charAt(0)}
                      </Text>
                    </View>
                  )}
                  <View style={styles.candidateInfo}>
                    <Text style={styles.candidateName}>{matchedCandidate.name}</Text>
                    <Text style={styles.candidateCargo}>{matchedCandidate.cargo}</Text>
                    <Text style={styles.candidatePartido}>
                      {matchedCandidate.partido} · #{matchedCandidate.numero}
                    </Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={28} color={SUCCESS} />
                </View>
              )}

              {/* Register Button */}
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  styles.buttonPrimary,
                  (!step2Valid || loading) && styles.buttonDisabled,
                  pressed && step2Valid && !loading && styles.buttonPressed,
                ]}
                onPress={handleRegister}
                disabled={!step2Valid || loading}
              >
                {loading ? (
                  <ActivityIndicator color={BRAND_BLUE} />
                ) : (
                  <>
                    <Text style={styles.buttonTextPrimary}>Crear Cuenta</Text>
                    <Ionicons name="checkmark-circle" size={20} color={BRAND_BLUE} />
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
    backgroundColor: '#FFFFFF' 
  },
  flex: { 
    flex: 1 
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
  
  // Matched Candidate Card
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
  candidatePhoto: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#e2e8f0',
  },
  candidatePhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
  },
  candidatePhotoText: {
    fontSize: 22,
    color: BRAND_YELLOW,
    fontFamily: FONT,
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
  candidatePartido: {
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: TEXT_MUTED,
    marginTop: 2,
  },
});
