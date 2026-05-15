import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';

import { useApp } from '@/lib/app-context';
import { Brand, Radius } from '@/constants/theme';

export default function ProfileScreen() {
  const { auth, logout, joinCampaign, deleteAccount } = useApp();
  const [accessCode, setAccessCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  if (auth.status !== 'active') return null;

  const { user, config, campaigns } = auth;
  const noCampaign = campaigns.length === 0;

  async function handleJoin() {
    if (accessCode.trim().length < 4) return;
    setJoining(true);
    setJoinError(null);
    const result = await joinCampaign(accessCode.trim().toUpperCase());
    setJoining(false);
    if (!result.ok) {
      setJoinError(result.error ?? 'Código inválido');
    }
  }

  function handleLogout() {
    Alert.alert('Cerrar sesión', '¿Confirmas cerrar sesión?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Cerrar sesión', style: 'destructive', onPress: () => logout() },
    ]);
  }

  function handleDelete() {
    Alert.alert(
      'Eliminar cuenta',
      'Esta acción es permanente. Se borrarán todos tus datos locales. ¿Continuar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar mi cuenta',
          style: 'destructive',
          onPress: () => deleteAccount(),
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={styles.pageTitle}>Perfil</Text>

          {/* User info */}
          <Section title="Tu cuenta">
            <InfoRow icon="person" label={user.full_name || 'Sin nombre'} />
            <InfoRow icon="email" label={user.email || 'Sin email'} />
          </Section>

          {/* Campaign */}
          {!noCampaign && (
            <Section title="Campaña activa">
              <InfoRow icon="campaign" label={config.candidate.name} />
              <InfoRow icon="work" label={config.candidate.cargo} />
            </Section>
          )}

          {/* Join campaign — only shown when user has no campaign yet */}
          {noCampaign && (
            <Section title="Unirse a una campaña">
              <Text style={styles.hint}>
                Ingresá el código de acceso de 4 caracteres que te dio el consultor.
              </Text>
              <TextInput
                style={styles.codeInput}
                value={accessCode}
                onChangeText={(t) => {
                  setAccessCode(t.toUpperCase());
                  setJoinError(null);
                }}
                placeholder="XXXX"
                placeholderTextColor="rgba(255,255,255,0.3)"
                maxLength={4}
                autoCapitalize="characters"
                autoCorrect={false}
              />
              {joinError !== null && <Text style={styles.error}>{joinError}</Text>}
              <Pressable
                style={[styles.btn, styles.btnPrimary, joining && styles.btnDisabled]}
                onPress={handleJoin}
                disabled={joining}
              >
                <Text style={styles.btnText}>{joining ? 'Uniéndome…' : 'Unirme'}</Text>
              </Pressable>
            </Section>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable
              style={[styles.btn, styles.btnSecondary]}
              onPress={() => Linking.openURL('https://goberna.club/privacy')}
            >
              <MaterialIcons name="privacy-tip" size={18} color="#fff" />
              <Text style={styles.btnText}>Política de privacidad</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnSecondary]} onPress={handleLogout}>
              <MaterialIcons name="logout" size={18} color="#fff" />
              <Text style={styles.btnText}>Cerrar sesión</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnDanger]} onPress={handleDelete}>
              <MaterialIcons name="delete-forever" size={18} color="#fff" />
              <Text style={styles.btnText}>Eliminar cuenta</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Sub-components ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={secStyles.container}>
      <Text style={secStyles.title}>{title}</Text>
      {children}
    </View>
  );
}

function InfoRow({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={infoStyles.row}>
      <MaterialIcons name={icon as React.ComponentProps<typeof MaterialIcons>['name']} size={18} color="rgba(255,255,255,0.5)" />
      <Text style={infoStyles.label}>{label}</Text>
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Brand.blue },
  content: { padding: 20, gap: 24 },
  pageTitle: { color: '#fff', fontSize: 22, fontWeight: '700' },
  hint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 20,
  },
  codeInput: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.md,
    color: '#fff',
    fontSize: 24,
    fontWeight: '700',
    letterSpacing: 8,
    paddingVertical: 14,
    paddingHorizontal: 20,
    textAlign: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  error: { color: '#f87171', fontSize: 13, textAlign: 'center' },
  actions: { gap: 12, marginTop: 8 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: Radius.md,
    paddingVertical: 14,
  },
  btnPrimary: { backgroundColor: Brand.yellow },
  btnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnDanger: { backgroundColor: '#ef4444' },
  btnDisabled: { opacity: 0.5 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

const secStyles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: Radius.lg,
    padding: 16,
    gap: 12,
  },
  title: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
});

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { color: '#fff', fontSize: 15 },
});
