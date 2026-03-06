/**
 * Register Screen — Registro Multi-Step
 *
 * Flujo en 2 pasos:
 * - Paso 1: Teléfono + Contraseña + Nombre
 * - Paso 2: Región + Campaña (via código de acceso 4 chars O primer nombre del candidato)
 *
 * El código de acceso (4 chars) es la vía rápida recomendada.
 * El candidato también puede usar links de invitación (pantalla separada /invite/[code]).
 */

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
import { getCandidates, validateAccessCode, registerWithAccessCode } from '@/lib/api';
import type { ApiResult, CandidateInfo, ValidateAccessCodeResponse } from '@/lib/types';
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
const AMBER_BG = '#fffbeb';
const AMBER_BORDER = '#fbbf24';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

// Phone validation - Peru format (9 digits starting with 9)
const PHONE_REGEX = /^9\d{8}$/;

// Access code: exactly 4 alphanumeric chars
const CODE_REGEX = /^[A-Z0-9]{4}$/;

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

  // ─── Mode: access code or candidate name search ──────────────
  // 'code' = codigo de acceso de 4 chars (via rápida)
  // 'search' = busqueda por primer nombre del candidato (via alternativa)
  const [campaignMode, setCampaignMode] = useState<'code' | 'search'>('code');

  // ─── Form State (Step 1) ─────────────────────────────────────
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState('');

  // ─── Form State (Step 2) ─────────────────────────────────────
  const [region, setRegion] = useState<string | null>(null);

  // Mode 'code': codigo de acceso
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [accessCodeCampaign, setAccessCodeCampaign] = useState<ValidateAccessCodeResponse['campaign'] | null>(null);
  const [validatingCode, setValidatingCode] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const codeInputRefs = useRef<(TextInput | null)[]>([]);

  // Mode 'search': busqueda por nombre
  const [candidateSearch, setCandidateSearch] = useState('');
  const [matchedCandidate, setMatchedCandidate] = useState<CandidateInfo | null>(null);
  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [loadingCandidates, setLoadingCandidates] = useState(false);

  // ─── UI State ───────────────────────────────────────────────
  const [loading, setLoading] = useState(false);

  // Focus states
  const [phoneFocused, setPhoneFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [nameFocused, setNameFocused] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  // ─── Load Candidates (only when in search mode) ─────────────
  const [candidatesError, setCandidatesError] = useState(false);

  const fetchCandidates = useCallback(() => {
    setLoadingCandidates(true);
    setCandidatesError(false);
    getCandidates().then((result) => {
      if (result.ok && result.data?.candidates && result.data.candidates.length > 0) {
        setCandidates(result.data.candidates);
      } else {
        setCandidatesError(true);
      }
      setLoadingCandidates(false);
    }).catch(() => {
      setCandidatesError(true);
      setLoadingCandidates(false);
    });
  }, []);

  useEffect(() => {
    if (campaignMode !== 'search') return;
    if (candidates.length > 0) return; // ya cargados
    fetchCandidates();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignMode, candidates.length, fetchCandidates]);

  // ─── Match Candidate by Name (search mode) ───────────────────
  // Busca por substring en nombre completo, partido o cargo.
  // Mínimo 3 caracteres. Muestra el mejor match (mayor coincidencia primero).
  useEffect(() => {
    if (campaignMode !== 'search') return;
    const searchTerm = normalize(candidateSearch);
    if (searchTerm.length < 3) {
      setMatchedCandidate(null);
      return;
    }
    // Score: nombre completo tiene más peso que partido/cargo
    const scored = candidates
      .map((c) => {
        const fullName = normalize(c.name);
        const partido  = normalize(c.partido ?? '');
        const cargo    = normalize(c.cargo ?? '');
        if (fullName.includes(searchTerm))  return { c, score: 2 };
        if (partido.includes(searchTerm) || cargo.includes(searchTerm)) return { c, score: 1 };
        return null;
      })
      .filter(Boolean) as { c: CandidateInfo; score: number }[];

    scored.sort((a, b) => b.score - a.score);
    setMatchedCandidate(scored[0]?.c ?? null);
  }, [candidateSearch, candidates, campaignMode]);

  // ─── Validate access code when 4 chars entered ───────────────
  useEffect(() => {
    const code = accessCodeInput.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 4);
    if (code.length < 4) {
      setAccessCodeCampaign(null);
      setCodeError(null);
      return;
    }
    if (!CODE_REGEX.test(code)) return;

    let cancelled = false;
    setValidatingCode(true);
    setCodeError(null);
    setAccessCodeCampaign(null);

    validateAccessCode(code).then((result) => {
      if (cancelled) return;
      setValidatingCode(false);
      if (result.ok && result.data) {
        setAccessCodeCampaign(result.data.campaign);
      } else {
        setCodeError('Código inválido. Verificá con tu coordinador.');
      }
    });

    return () => { cancelled = true; };
  }, [accessCodeInput]);

  // ─── Validation ─────────────────────────────────────────────
  const step1Valid = useMemo(() => (
    PHONE_REGEX.test(phone.trim()) &&
    password.trim().length >= 8 &&
    fullName.trim().length >= 3
  ), [phone, password, fullName]);

  const step2Valid = useMemo(() => {
    if (!region) return false;
    if (campaignMode === 'code') return accessCodeCampaign !== null;
    return matchedCandidate !== null;
  }, [region, campaignMode, accessCodeCampaign, matchedCandidate]);

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
    if (!step2Valid) return;

    setLoading(true);
    const email = `${phone.trim()}@goberna.pe`;

    try {
      // Both register() and registerWithAccessCode() share .ok/.code/.error fields;
      // we never read .data here, so ApiResult<unknown> covers both return types.
      let registerResult: ApiResult<unknown>;

      if (campaignMode === 'code' && accessCodeCampaign) {
        // Register with access code — campaign_id resolved server-side from the code
        registerResult = await registerWithAccessCode({
          full_name: fullName.trim(),
          email,
          password: password.trim(),
          phone: phone.trim(),
          region: region!,
          // campaign_id is optional when using access_code — backend resolves it
          campaign_id: accessCodeCampaign.id,
          access_code: accessCodeInput.toUpperCase().slice(0, 4),
        });
      } else if (campaignMode === 'search' && matchedCandidate) {
        // Register with candidate match
        registerResult = await register({
          full_name: fullName.trim(),
          email,
          password: password.trim(),
          phone: phone.trim(),
          region: region!,
          campaign_id: matchedCandidate.id,
        });
      } else {
        return;
      }

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

      // Auto login
      const loginResult = await login({ identifier: email, password: password.trim() });
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

  // ─── Photo URL Helper ────────────────────────────────────────
  const getPhotoUrl = (candidate: CandidateInfo) => {
    if (!candidate.foto_url) return null;
    return candidate.foto_url.startsWith('http')
      ? candidate.foto_url
      : `${PHOTO_BASE_URL}${candidate.foto_url}`;
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

              {/* Mode toggle */}
              <View style={styles.modeToggle}>
                <Pressable
                  style={[styles.modeBtn, campaignMode === 'code' && styles.modeBtnActive]}
                  onPress={() => setCampaignMode('code')}
                >
                  <Ionicons
                    name="keypad-outline"
                    size={16}
                    color={campaignMode === 'code' ? BRAND_BLUE : TEXT_MUTED}
                  />
                  <Text style={[styles.modeBtnText, campaignMode === 'code' && styles.modeBtnTextActive]}>
                    Código de acceso
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, campaignMode === 'search' && styles.modeBtnActive]}
                  onPress={() => setCampaignMode('search')}
                >
                  <Ionicons
                    name="search-outline"
                    size={16}
                    color={campaignMode === 'search' ? BRAND_BLUE : TEXT_MUTED}
                  />
                  <Text style={[styles.modeBtnText, campaignMode === 'search' && styles.modeBtnTextActive]}>
                    Buscar candidato
                  </Text>
                </Pressable>
              </View>

              {/* ── Mode: access code ── */}
              {campaignMode === 'code' && (
                <View style={styles.field}>
                  <Text style={styles.label}>Código de acceso (4 caracteres)</Text>

                  {/* Char boxes — 4 fixed positions, rendered statically */}
                  <View style={styles.codeBoxRow}>
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

                    {/* Hidden input overlay */}
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
                    />
                  </View>

                  {/* Validation state */}
                  {validatingCode && (
                    <View style={styles.codeStatusRow}>
                      <ActivityIndicator size="small" color={AMBER} />
                      <Text style={styles.hintAmber}>Verificando código...</Text>
                    </View>
                  )}
                  {codeError && !validatingCode && (
                    <Text style={styles.hintError}>{codeError}</Text>
                  )}
                  {!codeError && accessCodeCampaign && !validatingCode && (
                    <Text style={styles.hintSuccess}>Código válido ✓</Text>
                  )}

                  <Text style={styles.codeHint}>
                    Pedile el código de 4 letras/números a tu coordinador de campaña
                  </Text>
                </View>
              )}

              {/* ── Mode: candidate name search ── */}
              {campaignMode === 'search' && (
                <View style={styles.field}>
                  <Text style={styles.label}>Nombre del candidato o partido</Text>
                  {candidatesError ? (
                    <View style={styles.errorRetryRow}>
                      <Text style={styles.hintError}>No se pudo cargar la lista. ¿Tienes conexión?</Text>
                      <Pressable onPress={fetchCandidates} style={styles.retryBtn}>
                        <Text style={styles.retryBtnText}>Reintentar</Text>
                      </Pressable>
                    </View>
                  ) : (
                    <>
                      <View style={[styles.inputWrapper, searchFocused && styles.inputWrapperFocused]}>
                        <Ionicons
                          name="person-outline"
                          size={20}
                          color={searchFocused ? BORDER_FOCUS : TEXT_MUTED}
                          style={styles.inputIcon}
                        />
                        <TextInput
                          style={styles.input}
                          placeholder="Ej: César Vásquez, Peru Primero..."
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
                        {loadingCandidates && (
                          <ActivityIndicator size="small" color={TEXT_MUTED} />
                        )}
                      </View>
                      {!matchedCandidate && candidateSearch.length > 0 && candidateSearch.length < 3 && (
                        <Text style={styles.hint}>Escribe al menos 3 letras</Text>
                      )}
                      {!matchedCandidate && candidateSearch.length >= 3 && !loadingCandidates && (
                        <Text style={styles.hintError}>No encontramos ese candidato</Text>
                      )}
                    </>
                  )}
                </View>
              )}

              {/* ── Resolved campaign card (code mode) ── */}
              {campaignMode === 'code' && accessCodeCampaign && (
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

              {/* ── Matched candidate card (search mode) ── */}
              {campaignMode === 'search' && matchedCandidate && (
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

  errorRetryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  retryBtn: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dc2626',
  },
  retryBtnText: {
    fontSize: 13,
    color: '#dc2626',
    fontFamily: FONT_REGULAR,
  },

  // Mode toggle
  modeToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    overflow: 'hidden',
    backgroundColor: BG_INPUT,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  modeBtnActive: {
    backgroundColor: '#dbeafe',
    borderBottomWidth: 2,
    borderBottomColor: BRAND_BLUE,
  },
  modeBtnText: {
    fontSize: 12,
    fontFamily: FONT,
    color: TEXT_MUTED,
    textAlign: 'center',
  },
  modeBtnTextActive: {
    color: BRAND_BLUE,
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
