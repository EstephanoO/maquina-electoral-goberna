/**
 * Contact Detail Screen — read and edit a single contact.
 *
 * Read mode: shows all contact fields with an "Editar" toggle.
 * Edit mode: inline form (same fields as add-contact.tsx) with
 *   "Guardar cambios" (only calls updateContact when something changed)
 *   and "Cancelar".
 * WhatsApp button if phone is present.
 * Delete with confirmation → softDeleteContact → router.back().
 *
 * Tasks 12/13 will add reminder + photo editing;
 * those fields are read-only in edit mode for now.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
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
import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  getContact,
  updateContact,
  softDeleteContact,
  type Contact,
  type ContactEstado,
} from '@/lib/offline-queue/contacts';
import { ESTADO_META } from '@/lib/contact-estados';
import { Brand, FontFamily, Neutral, Radius, Spacing, Status } from '@/constants/theme';
import DistritoPicker from '@/components/DistritoPicker';
import EstadoSelector from '@/components/contacts/EstadoSelector';
import { PhotoField } from '@/components/contacts/PhotoField';
import { reminderBuckets, scheduleReminder, cancelReminder } from '@/lib/reminders';
import type { SelectedDistrito } from '@/lib/types';

const FONT = FontFamily.bold;
const FONT_REGULAR = FontFamily.regular;

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function digitsOnly(phone: string): string {
  return phone.replace(/\D/g, '');
}

const PERU_PHONE_REGEX = /^9\d{8}$/;

// ─────────────────────────────────────────────────────────────────────────────
// Screen
// ─────────────────────────────────────────────────────────────────────────────

export default function ContactDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const contactId = Array.isArray(id) ? id[0] : id;
  const router = useRouter();

  // ── Load state ──────────────────────────────────────────────────
  const [contact, setContact] = useState<Contact | null | 'loading'>('loading');

  const loadContact = useCallback(async () => {
    if (!contactId) { setContact(null); return; }
    setContact('loading');
    const c = await getContact(contactId);
    setContact(c);
  }, [contactId]);

  useEffect(() => { loadContact(); }, [loadContact]);

  // ── Edit mode state ─────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editDistrito, setEditDistrito] = useState<SelectedDistrito | null>(null);
  const [editEstado, setEditEstado] = useState<ContactEstado>('duda');
  const [editNote, setEditNote] = useState('');
  const [editPhotoUri, setEditPhotoUri] = useState<string | null>(null);
  const [editReminderDays, setEditReminderDays] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // Seed edit fields from a contact snapshot (shared by enterEditMode + cancelEdit)
  const seedEditFields = useCallback((c: Contact) => {
    setEditName(c.name);
    setEditPhone(c.phone ?? '');
    setEditEstado(c.estado);
    setEditNote(c.note ?? '');
    setEditPhotoUri(c.photo_uri);
    // Don't pre-select a reminder bucket on edit — user must explicitly choose to change it
    setEditReminderDays(null);
    // Rebuild SelectedDistrito from stored fields (best-effort)
    if (c.ubigeo && c.distrito_nombre) {
      setEditDistrito({
        ubigeo: c.ubigeo,
        distrito: c.distrito_nombre,
        provincia: '',
        departamento: '',
        codprov_full: '',
        coddep: '',
      });
    } else {
      setEditDistrito(null);
    }
  }, []);

  // Enter edit mode — pre-populate fields from current contact
  const enterEditMode = useCallback(() => {
    if (!contact || contact === 'loading') return;
    seedEditFields(contact);
    setEditing(true);
  }, [contact, seedEditFields]);

  const cancelEdit = useCallback(() => {
    if (contact && contact !== 'loading') seedEditFields(contact);
    setEditing(false);
  }, [contact, seedEditFields]);

  // ── Stable picker callbacks ─────────────────────────────────────
  const handleDistritoSelect = useCallback((d: SelectedDistrito) => setEditDistrito(d), []);
  const handleDistritoClear = useCallback(() => setEditDistrito(null), []);

  // ── Save changes ────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!contact || contact === 'loading' || saving) return;

    // Build patch — only include fields that actually changed
    const patch: Parameters<typeof updateContact>[1] = {};
    const trimName = editName.trim();
    const trimPhone = editPhone.trim() || null;
    const trimNote = editNote.trim() || null;

    if (trimName !== contact.name) patch.name = trimName;
    if (trimPhone !== contact.phone) patch.phone = trimPhone;
    if (editEstado !== contact.estado) patch.estado = editEstado;
    if (trimNote !== contact.note) patch.note = trimNote;

    // Distrito comparison
    const newUbigeo = editDistrito?.ubigeo ?? null;
    const newDistritoNombre = editDistrito?.distrito ?? null;

    if (newUbigeo !== contact.ubigeo) patch.ubigeo = newUbigeo;
    if (newDistritoNombre !== contact.distrito_nombre) patch.distrito_nombre = newDistritoNombre;

    // Photo
    if (editPhotoUri !== contact.photo_uri) patch.photo_uri = editPhotoUri;

    // If nothing changed in base fields, just exit edit mode without a DB call
    if (Object.keys(patch).length === 0 && editReminderDays === null) {
      setEditing(false);
      return;
    }

    // Guard: name must not be blank
    if ('name' in patch && !patch.name?.trim()) {
      Alert.alert('Error', 'El nombre es obligatorio');
      return;
    }

    setSaving(true);
    try {
      // Save base patch first (if any field changed)
      let updated = contact;
      if (Object.keys(patch).length > 0) {
        updated = await updateContact(contactId, patch);
      }

      // Handle reminder change: cancel old, schedule new
      if (editReminderDays !== null) {
        try {
          if (contact.reminder_notif_id) {
            await cancelReminder(contact.reminder_notif_id);
          }
          const notifId = await scheduleReminder(contactId, editName.trim() || contact.name, editReminderDays);
          updated = await updateContact(contactId, {
            reminder_at: Date.now() + editReminderDays * 86400000,
            reminder_notif_id: notifId,
          });
        } catch {
          // Reminder scheduling is best-effort
        }
      }

      setContact(updated);
      setEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Alert.alert('Error', `No se pudo guardar: ${message}`);
    } finally {
      setSaving(false);
    }
  }, [contact, contactId, editName, editPhone, editEstado, editNote, editDistrito, editPhotoUri, editReminderDays, saving]);

  // ── Delete ──────────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    Alert.alert(
      'Eliminar contacto',
      '¿Seguro? Esta acción no se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await softDeleteContact(contactId);
              router.back();
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Error desconocido';
              Alert.alert('Error', `No se pudo eliminar: ${message}`);
            }
          },
        },
      ],
    );
  }, [contactId, router]);

  // ── WhatsApp ────────────────────────────────────────────────────
  const handleWhatsApp = useCallback((phone: string) => {
    const digits = digitsOnly(phone);
    Linking.openURL(`https://wa.me/51${digits}`);
  }, []);

  // ─────────────────────────────────────────────────────────────────
  // Loading / not found states
  // ─────────────────────────────────────────────────────────────────

  if (contact === 'loading') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Brand.blue} />
        </View>
      </SafeAreaView>
    );
  }

  if (contact === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.notFoundText}>Contacto no encontrado</Text>
          <Pressable onPress={() => router.back()} style={styles.backBtnAlt} accessibilityRole="button">
            <Text style={styles.backBtnAltText}>← Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // Estado badge
  // ─────────────────────────────────────────────────────────────────

  const estadoMeta = ESTADO_META[contact.estado];

  const editPhoneWarning =
    editPhone.trim().length > 0 && !PERU_PHONE_REGEX.test(editPhone.trim())
      ? 'El teléfono debe ser 9 dígitos empezando con 9'
      : null;

  // ─────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────

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
          {/* ── Header ─────────────────────────────────────────── */}
          <View style={styles.header}>
            <Pressable
              onPress={() => router.back()}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Volver"
            >
              <Text style={styles.backText}>← Volver</Text>
            </Pressable>

            <View style={styles.headerRow}>
              <Text style={styles.title} accessibilityRole="header">
                {contact.name}
              </Text>
              {!editing && (
                <Pressable
                  onPress={enterEditMode}
                  style={styles.editBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Editar contacto"
                >
                  <Text style={styles.editBtnText}>Editar</Text>
                </Pressable>
              )}
            </View>
          </View>

          {/* ── Read mode ──────────────────────────────────────── */}
          {!editing && (
            <View style={styles.readSection}>
              {/* Estado badge */}
              <View style={[styles.estadoBadge, { backgroundColor: estadoMeta.color }]}>
                <Text style={styles.estadoEmoji}>{estadoMeta.emoji}</Text>
                <Text style={styles.estadoLabel}>{estadoMeta.label}</Text>
              </View>

              {/* Photo */}
              {contact.photo_uri && (
                <Image
                  source={{ uri: contact.photo_uri }}
                  style={styles.photo}
                  accessibilityLabel={`Foto de ${contact.name}`}
                />
              )}

              {/* Fields */}
              <View style={styles.fieldList}>
                <ReadField label="Teléfono" value={contact.phone ?? 'Sin teléfono'} />
                <ReadField label="Distrito" value={contact.distrito_nombre ?? 'Sin distrito'} />
                <ReadField label="Nota" value={contact.note ?? 'Sin nota'} />
                {contact.reminder_at !== null && (
                  <ReadField label="Recordatorio" value={formatDate(contact.reminder_at)} />
                )}
              </View>

              {/* WhatsApp */}
              {contact.phone && (
                <Pressable
                  style={styles.whatsappBtn}
                  onPress={() => handleWhatsApp(contact.phone!)}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir WhatsApp"
                >
                  <Text style={styles.whatsappBtnText}>WhatsApp</Text>
                </Pressable>
              )}
            </View>
          )}

          {/* ── Edit mode ──────────────────────────────────────── */}
          {editing && (
            <View style={styles.form}>
              {/* Nombre */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Nombre <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nombre completo"
                  placeholderTextColor={Neutral.textMuted}
                  value={editName}
                  onChangeText={setEditName}
                  autoCapitalize="words"
                  returnKeyType="next"
                />
              </View>

              {/* Teléfono */}
              <View style={styles.field}>
                <Text style={styles.label}>Teléfono</Text>
                <TextInput
                  style={styles.input}
                  placeholder="987654321"
                  placeholderTextColor={Neutral.textMuted}
                  value={editPhone}
                  onChangeText={setEditPhone}
                  keyboardType="phone-pad"
                  maxLength={9}
                />
                {editPhoneWarning && (
                  <Text style={styles.phoneWarning}>{editPhoneWarning}</Text>
                )}
              </View>

              {/* Distrito */}
              <View style={styles.field}>
                <Text style={styles.label}>Distrito</Text>
                <DistritoPicker
                  value={editDistrito}
                  onSelect={handleDistritoSelect}
                  onClear={handleDistritoClear}
                  primaryColor={Brand.blue}
                  placeholder="Seleccionar distrito"
                />
              </View>

              {/* Estado */}
              <View style={styles.field}>
                <Text style={styles.label}>Estado</Text>
                <EstadoSelector value={editEstado} onChange={setEditEstado} />
              </View>

              {/* Nota */}
              <View style={styles.field}>
                <Text style={styles.label}>Nota</Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  placeholder="Observaciones opcionales..."
                  placeholderTextColor={Neutral.textMuted}
                  value={editNote}
                  onChangeText={setEditNote}
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                />
              </View>

              {/* Photo (Task 13) */}
              <View style={styles.field}>
                <Text style={styles.label}>Foto</Text>
                <PhotoField value={editPhotoUri} onChange={setEditPhotoUri} disabled={saving} />
              </View>

              {/* Reminder (Task 12) */}
              <View style={styles.field}>
                <Text style={styles.label}>
                  Recordatorio
                  {contact.reminder_at !== null && (
                    <Text style={styles.reminderCurrent}>
                      {' '}(actual: {formatDate(contact.reminder_at)})
                    </Text>
                  )}
                </Text>
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
                        editReminderDays === bucket.days && styles.pillSelected,
                      ]}
                      onPress={() =>
                        setEditReminderDays(editReminderDays === bucket.days ? null : bucket.days)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Recordatorio: ${bucket.label}`}
                      accessibilityState={{ selected: editReminderDays === bucket.days }}
                    >
                      <Text
                        style={[
                          styles.pillText,
                          editReminderDays === bucket.days && styles.pillTextSelected,
                        ]}
                      >
                        {bucket.label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>

              {/* Edit actions */}
              <Pressable
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={saving ? 'Guardando' : 'Guardar cambios'}
              >
                <Text style={styles.saveBtnText}>
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </Text>
              </Pressable>

              <Pressable
                style={styles.cancelBtn}
                onPress={cancelEdit}
                accessibilityRole="button"
                accessibilityLabel="Cancelar edición"
              >
                <Text style={styles.cancelBtnText}>Cancelar</Text>
              </Pressable>
            </View>
          )}

          {/* ── Delete ─────────────────────────────────────────── */}
          {!editing && (
            <Pressable
              style={styles.deleteBtn}
              onPress={handleDelete}
              accessibilityRole="button"
              accessibilityLabel="Eliminar contacto"
            >
              <Text style={styles.deleteBtnText}>Eliminar contacto</Text>
            </Pressable>
          )}

          <View style={styles.keyboardSpacer} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-component: read-mode field row
// ─────────────────────────────────────────────────────────────────────────────

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readFieldRow}>
      <Text style={styles.readFieldLabel}>{label}</Text>
      <Text style={styles.readFieldValue}>{value}</Text>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Neutral.white },
  flex: { flex: 1 },
  scroll: { padding: Spacing.lg, paddingBottom: Spacing.xxl },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xxl },

  // ── Header ────────────────────────────────────────────────────
  header: { marginBottom: Spacing.xxl },
  backBtn: { marginBottom: Spacing.md, paddingVertical: Spacing.sm },
  backText: {
    fontSize: 15,
    fontFamily: FONT,
    color: Neutral.textMuted,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 24,
    fontFamily: FONT,
    color: Brand.blue,
    flex: 1,
    flexWrap: 'wrap',
  },
  editBtn: {
    backgroundColor: Brand.blue,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    marginLeft: Spacing.md,
  },
  editBtnText: {
    fontSize: 14,
    fontFamily: FONT,
    color: Neutral.white,
  },

  // ── Read mode ─────────────────────────────────────────────────
  readSection: { gap: Spacing.xl },
  estadoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.sm,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  estadoEmoji: { fontSize: 18 },
  estadoLabel: {
    fontSize: 15,
    fontFamily: FONT,
    color: Neutral.white,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: Radius.lg,
    backgroundColor: Neutral.bgMuted,
  },
  fieldList: { gap: Spacing.md },
  readFieldRow: { gap: 2 },
  readFieldLabel: {
    fontSize: 12,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Neutral.textMuted,
  },
  readFieldValue: {
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: Brand.blue,
  },
  whatsappBtn: {
    backgroundColor: '#25D366',
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  whatsappBtnText: {
    fontSize: 16,
    fontFamily: FONT,
    color: Neutral.white,
  },

  // ── Edit mode (mirrors add-contact.tsx) ───────────────────────
  form: { gap: Spacing.xl },
  field: { gap: Spacing.sm },
  label: {
    fontSize: 13,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: Brand.blue,
  },
  required: { color: Status.danger, fontSize: 15 },
  phoneWarning: {
    fontSize: 12,
    fontFamily: FONT_REGULAR,
    color: Status.warning,
    marginTop: 2,
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
  readValueBox: {
    borderWidth: 1.5,
    borderColor: Neutral.border,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    minHeight: 52,
    justifyContent: 'center',
    backgroundColor: Neutral.bgMuted,
  },
  readValue: {
    fontSize: 16,
    fontFamily: FONT_REGULAR,
    color: Neutral.textMuted,
  },
  saveBtn: {
    marginTop: Spacing.lg,
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
  cancelBtn: {
    borderWidth: 1.5,
    borderColor: Neutral.border,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontFamily: FONT,
    color: Neutral.textSecondary,
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
  reminderCurrent: {
    fontSize: 11,
    fontFamily: FONT_REGULAR,
    color: Neutral.textMuted,
    textTransform: 'none',
    letterSpacing: 0,
  },

  // ── Delete ────────────────────────────────────────────────────
  deleteBtn: {
    marginTop: Spacing.xxxl,
    borderWidth: 1.5,
    borderColor: Status.danger,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    minHeight: 48,
    justifyContent: 'center',
  },
  deleteBtnText: {
    fontSize: 15,
    fontFamily: FONT,
    color: Status.danger,
  },

  // ── Not found state ───────────────────────────────────────────
  notFoundText: {
    fontSize: 18,
    fontFamily: FONT,
    color: Neutral.textMuted,
    marginBottom: Spacing.xl,
    textAlign: 'center',
  },
  backBtnAlt: {
    backgroundColor: Brand.blue,
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.xxl,
    paddingVertical: Spacing.md,
  },
  backBtnAltText: {
    fontSize: 15,
    fontFamily: FONT,
    color: Neutral.white,
  },

  keyboardSpacer: { height: 100 },
});
