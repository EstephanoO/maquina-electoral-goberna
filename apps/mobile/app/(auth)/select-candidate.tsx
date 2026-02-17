/**
 * Select Candidate Screen
 * 
 * Allows new users to select which candidate/campaign they want to join.
 * Shows candidate photo, name, cargo, partido.
 * After selection, creates an access request.
 */

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { getCandidates, createAccessRequest } from '@/lib/api';
import { useApp } from '@/lib/app-context';
import type { CandidateInfo } from '@/lib/types';

const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';
const BORDER = '#E1E6F0';
const FONT = 'Montserrat-Bold';

// Base URL for candidate photos (served from Vercel web app)
const PHOTO_BASE_URL = 'https://maquina-electoral-goberna-web.vercel.app';

function CandidateCard({
  candidate,
  selected,
  onSelect,
}: {
  candidate: CandidateInfo;
  selected: boolean;
  onSelect: () => void;
}) {
  const photoUrl = candidate.foto_url
    ? candidate.foto_url.startsWith('http')
      ? candidate.foto_url
      : `${PHOTO_BASE_URL}${candidate.foto_url}`
    : null;

  return (
    <Pressable
      style={[
        styles.candidateCard,
        selected && styles.candidateCardSelected,
      ]}
      onPress={onSelect}
    >
      {/* Photo */}
      {photoUrl ? (
        <Image
          source={{ uri: photoUrl }}
          style={styles.candidatePhoto}
          contentFit="cover"
        />
      ) : (
        <View style={[styles.candidatePhoto, styles.candidatePhotoPlaceholder]}>
          <Text style={styles.placeholderText}>
            {candidate.name.charAt(0)}
          </Text>
        </View>
      )}

      {/* Info */}
      <View style={styles.candidateInfo}>
        <Text style={styles.candidateName}>{candidate.name}</Text>
        <Text style={styles.candidateCargo}>{candidate.cargo}</Text>
        <View style={styles.candidateMeta}>
          <Text style={styles.candidatePartido}>{candidate.partido}</Text>
          <View style={styles.numeroBadge}>
            <Text style={styles.numeroText}>#{candidate.numero}</Text>
          </View>
        </View>
      </View>

      {/* Selection indicator */}
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
    </Pressable>
  );
}

export default function SelectCandidateScreen() {
  const router = useRouter();
  const { login } = useApp();
  const params = useLocalSearchParams<{
    email: string;
    password: string;
    full_name: string;
  }>();

  const [candidates, setCandidates] = useState<CandidateInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch candidates on mount
  useEffect(() => {
    (async () => {
      const result = await getCandidates();
      if (result.ok && result.data?.candidates) {
        setCandidates(result.data.candidates);
      } else {
        Alert.alert('Error', 'No se pudieron cargar los candidatos.');
      }
      setLoading(false);
    })();
  }, []);

  const handleContinue = async () => {
    if (!selectedId) {
      Alert.alert('Selecciona un candidato', 'Debes elegir un candidato para continuar.');
      return;
    }

    if (!params.email || !params.password) {
      Alert.alert('Error', 'Datos de registro incompletos. Vuelve a intentarlo.');
      router.replace('/(auth)/register');
      return;
    }

    setSubmitting(true);

    try {
      // 1. Login with the credentials (user was just created)
      const loginResult = await login({
        email: params.email,
        password: params.password,
      });

      if (!loginResult.ok) {
        Alert.alert('Error', loginResult.error ?? 'No se pudo iniciar sesion.');
        setSubmitting(false);
        return;
      }

      // 2. Create access request for selected campaign
      const accessResult = await createAccessRequest({
        campaign_id: selectedId,
        perm_tierra: true,
      });

      if (!accessResult.ok) {
        // If already requested, that's fine
        if (accessResult.code !== 'ACCESS_REQUEST_EXISTS') {
          Alert.alert('Error', accessResult.error ?? 'No se pudo solicitar acceso.');
          setSubmitting(false);
          return;
        }
      }

      // 3. Navigate to pending screen
      Alert.alert(
        'Solicitud enviada',
        'Tu solicitud de acceso fue enviada. Un administrador la revisara pronto.',
        [{ text: 'OK', onPress: () => router.replace('/(auth)/pending') }],
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Alert.alert('Error', message);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedId);

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </Pressable>
        <Text style={styles.title}>Elige tu candidato</Text>
        <Text style={styles.subtitle}>
          Selecciona la campana a la que quieres unirte
        </Text>
      </View>

      {/* Candidates list */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_BLUE} />
          <Text style={styles.loadingText}>Cargando candidatos...</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {candidates.map((candidate) => (
            <CandidateCard
              key={candidate.id}
              candidate={candidate}
              selected={selectedId === candidate.id}
              onSelect={() => setSelectedId(candidate.id)}
            />
          ))}
        </ScrollView>
      )}

      {/* Footer with continue button */}
      <View style={styles.footer}>
        {selectedCandidate && (
          <Text style={styles.selectedText}>
            Seleccionaste: {selectedCandidate.name}
          </Text>
        )}
        <Pressable
          style={[
            styles.continueButton,
            (!selectedId || submitting) && styles.continueButtonDisabled,
          ]}
          onPress={handleContinue}
          disabled={!selectedId || submitting}
        >
          <Text style={styles.continueButtonText}>
            {submitting ? 'Enviando solicitud...' : 'Solicitar acceso'}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    padding: 24,
    paddingBottom: 16,
  },
  backBtn: {
    marginBottom: 16,
  },
  backText: {
    fontSize: 14,
    color: TEXT_MUTED,
    fontFamily: FONT,
  },
  title: {
    fontSize: 24,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    fontFamily: FONT,
    marginTop: 4,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 14,
    color: TEXT_MUTED,
    fontFamily: FONT,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 24,
    paddingTop: 8,
    gap: 12,
  },
  candidateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: BORDER,
    backgroundColor: '#FAFBFC',
    gap: 12,
  },
  candidateCardSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#F0F4FF',
  },
  candidatePhoto: {
    width: 64,
    height: 64,
    borderRadius: 12,
    backgroundColor: '#E2E8F0',
  },
  candidatePhotoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_BLUE,
  },
  placeholderText: {
    fontSize: 24,
    color: BRAND_YELLOW,
    fontFamily: FONT,
  },
  candidateInfo: {
    flex: 1,
    gap: 2,
  },
  candidateName: {
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  candidateCargo: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT,
  },
  candidateMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  candidatePartido: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontFamily: FONT,
  },
  numeroBadge: {
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  numeroText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontFamily: FONT,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: BRAND_BLUE,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: BRAND_BLUE,
  },
  footer: {
    padding: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    gap: 12,
  },
  selectedText: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontFamily: FONT,
    textAlign: 'center',
  },
  continueButton: {
    backgroundColor: BRAND_YELLOW,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
  },
  continueButtonDisabled: {
    opacity: 0.5,
  },
  continueButtonText: {
    fontSize: 16,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
});
