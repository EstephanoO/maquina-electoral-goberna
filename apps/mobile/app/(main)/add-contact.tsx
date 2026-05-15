/**
 * Add Contact Screen — high de contacto con schema fijo.
 *
 * Campos: nombre (required), telefono (optional, soft PE validation),
 * distrito (DistritoPicker), estado (EstadoSelector, default 'duda'),
 * nota (multiline), foto (placeholder — Task 13), recordatorio (placeholder — Task 12).
 * GPS capturado on mount en best-effort (never blocks save).
 */

import { useState, useEffect, useCallback } from 'react';
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
import * as Location from 'expo-location';

import { useApp } from '@/lib/app-context';
import { createContact, updateContact } from '@/lib/offline-queue/contacts';
import { Brand, FontFamily, Neutral, Status, Spacing, Radius } from '@/constants/theme';
import DistritoPicker from '@/components/DistritoPicker';
import EstadoSelector from '@/components/contacts/EstadoSelector';
import { PhotoField } from '@/components/contacts/PhotoField';
import { reminderBuckets, scheduleReminder } from '@/lib/reminders';
import type { ContactEstado } from '@/lib/offline-queue/contacts';
import type { SelectedDistrito } from '@/lib/types';

const FONT = FontFamily.bold;
const FONT_REGULAR = FontFamily.regular;
const PERU_PHONE_REGEX = /^9\d{8}$/;

export default function AddContactScreen() {
  const router = useRouter();
  const { auth } = useApp();

  // ── Form state ───────────────────────────────────────────────
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [distrito, setDistrito] = useState<SelectedDistrito | null>(null);
  const [estado, setEstado] = useState<ContactEstado>('duda');
  const [note, setNote] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [reminderDays, setReminderDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // ── GPS on mount (best-effort, never blocks) ─────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        const granted =
          status === 'granted'
            ? true
            : (await Location.requestForegroundPermissionsAsync()).status === 'granted';
        if (!granted || !active) return;
        const pos = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (active) { setLat(pos.coords.latitude); setLng(pos.coords.longitude); }
      } catch { /* best-effort — GPS is optional */ }
    })();
    return () => { active = false; };
  }, []);

  // ── Computed ─────────────────────────────────────────────────
  const nameValid = name.trim().length > 0;
  const phoneWarning =
    phone.trim().length > 0 && !PERU_PHONE_REGEX.test(phone.trim())
      ? 'El teléfono debe ser 9 dígitos empezando con 9'
      : null;

  const agentId =
    auth.status === 'active' ? auth.user.id : null;

  // ── Stable callbacks for DistritoPicker ─────────────────────
  const handleDistritoSelect = useCallback((d: SelectedDistrito) => setDistrito(d), []);
  const handleDistritoClear = useCallback(() => setDistrito(null), []);

  // ── Save ─────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!nameValid || saving) return;
    setSaving(true);
    try {
      const contact = await createContact({
        name: name.trim(),
        phone: phone.trim() || null,
        ubigeo: distrito?.ubigeo ?? null,
        distrito_nombre: distrito?.distrito ?? null,
        lat,
        lng,
        estado,
        note: note.trim() || null,
        photo_uri: photoUri,
        agent_id: agentId,
      });

      // Schedule push notification reminder if selected
      if (reminderDays !== null) {
        try {
          const { notifId, triggerAt } = await scheduleReminder(contact.id, contact.name, reminderDays);
          await updateContact(contact.id, {
            reminder_at: triggerAt,
            reminder_notif_id: notifId,
          });
        } catch {
          // Reminder scheduling is best-effort — don't block navigation
        }
      }

      router.back();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Alert.alert('Error', `No se pudo guardar: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [nameValid, saving, name, phone, distrito, lat, lng, estado, note, photoUri, reminderDays, agentId, router]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Text style={styles.backText}>← Volver</Text>
            </Pressable>
            <Text style={styles.title} accessibilityRole="header">
              Nuevo contacto
            </Text>
          </View>

          <View style={styles.form}>
            {/* ── Nombre (required) ─────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Nombre <Text style={styles.required}>*</Text>
              </Text>
              <TextInput
                style={styles.input}
                placeholder="Nombre completo"
                placeholderTextColor={Neutral.textMuted}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                returnKeyType="next"
              />
            </View>

            {/* ── Teléfono (optional, soft PE validation) ───────── */}
            <View style={styles.field}>
              <Text style={styles.label}>Teléfono</Text>
              <TextInput
                style={styles.input}
                placeholder="987654321"
                placeholderTextColor={Neutral.textMuted}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={9}
              />
              {phoneWarning && (
                <Text style={styles.phoneWarning}>{phoneWarning}</Text>
              )}
            </View>

            {/* ── Distrito ──────────────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.label}>Distrito</Text>
              <DistritoPicker
                value={distrito}
                onSelect={handleDistritoSelect}
                onClear={handleDistritoClear}
                primaryColor={Brand.blue}
                placeholder="Seleccionar distrito"
              />
            </View>

            {/* ── Estado ────────────────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.label}>Estado</Text>
              <EstadoSelector value={estado} onChange={setEstado} />
            </View>

            {/* ── Nota (optional, multiline) ────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.label}>Nota</Text>
              <TextInput
                style={[styles.input, styles.inputMultiline]}
                placeholder="Observaciones opcionales..."
                placeholderTextColor={Neutral.textMuted}
                value={note}
                onChangeText={setNote}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>

            {/* ── Foto (Task 13) ────────────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.label}>Foto</Text>
              <PhotoField value={photoUri} onChange={setPhotoUri} disabled={saving} />
            </View>

            {/* ── Recordatorio (Task 12) ────────────────────────── */}
            <View style={styles.field}>
              <Text style={styles.label}>Recordatorio</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.pillRow}
              >
                {reminderBuckets.map((bucket) => (
                  <Pressable
                    key={bucket.days}
                    style={[
                      styles.pill,
                      reminderDays === bucket.days && styles.pillSelected,
                    ]}
                    onPress={() =>
                      setReminderDays(reminderDays === bucket.days ? null : bucket.days)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Recordatorio: ${bucket.label}`}
                    accessibilityState={{ selected: reminderDays === bucket.days }}
                  >
                    <Text
                      style={[
                        styles.pillText,
                        reminderDays === bucket.days && styles.pillTextSelected,
                      ]}
                    >
                      {bucket.label}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          </View>

          {/* ── Guardar ───────────────────────────────────────────── */}
          <Pressable
            style={[
              styles.saveBtn,
              (!nameValid || saving) && styles.saveBtnDisabled,
            ]}
            onPress={handleSave}
            disabled={!nameValid || saving}
            accessibilityRole="button"
            accessibilityLabel={saving ? 'Guardando' : 'Guardar contacto'}
          >
            <Text style={styles.saveBtnText}>
              {saving ? 'Guardando...' : 'Guardar'}
            </Text>
          </Pressable>

          <View style={styles.keyboardSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Neutral.white },
  flex: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },

  header: { marginBottom: Spacing.xxl },
  backBtn: { marginBottom: Spacing.md, paddingVertical: Spacing.sm },
  backText: {
    fontSize: 15,
    fontFamily: FONT,
    color: Neutral.textMuted,
  },
  title: {
    fontSize: 24,
    fontFamily: FONT,
    color: Brand.blue,
  },

  form: { gap: Spacing.xl },
  field: { gap: Spacing.sm },
  label: {
    fontSize: 13,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Brand.blue,
  },
  required: {
    color: Status.danger,
    fontSize: 15,
  },

  input: {
    borderWidth: 1.5,
    borderColor: Neutral.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: Brand.blue,
    backgroundColor: Neutral.bg,
    minHeight: 52,
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: Spacing.md,
  },

  phoneWarning: {
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: Status.warning,
    marginTop: 2,
  },

  pillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  pill: {
    borderWidth: 1.5,
    borderColor: Neutral.border,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    backgroundColor: Neutral.bg,
  },
  pillSelected: {
    backgroundColor: Brand.yellow,
    borderColor: Brand.yellow,
  },
  pillText: {
    fontSize: 13,
    fontFamily: FONT_REGULAR,
    color: Neutral.textSecondary,
  },
  pillTextSelected: {
    color: Brand.blue,
    fontFamily: FONT,
  },

  saveBtn: {
    marginTop: Spacing.xxxl,
    backgroundColor: Brand.blue,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.lg,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.45 },
  saveBtnText: {
    fontSize: 17,
    fontFamily: FONT,
    color: Neutral.white,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },

  keyboardSpacer: { height: 100 },
});
