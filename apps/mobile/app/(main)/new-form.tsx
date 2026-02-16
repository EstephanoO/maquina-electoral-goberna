/**
 * Dynamic Form Screen — renders fields from config.form.schema.fields.
 *
 * Maps dynamic form field values to the flat backend schema expected by POST /api/forms:
 * - nombre, telefono, fecha, x, y, zona
 * - encuestador (agent.full_name), encuestador_id (agent.id)
 * - candidato_preferido (candidate.name)
 * - client_id (device UUID)
 * - campaign_id, form_definition_id
 *
 * Special field type "location" → GPS capture with UTM conversion.
 * 
 * OFFLINE-FIRST: Forms are saved to SQLite queue immediately,
 * then synced to backend when online.
 */

import { useState, useCallback } from 'react';
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

import { useCandidate, useFormConfig, useAgent, useActiveCampaign } from '@/lib/app-context';
import { queueForm, forceSyncNow } from '@/lib/offline-queue';
import { latLonToUtm } from '@/lib/utm';
import type { FormField, UtmData } from '@/lib/types';

// Simple UUID generator (crypto.randomUUID may not be available in RN)
function generateClientId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 15);
  const random2 = Math.random().toString(36).substring(2, 15);
  return `${timestamp}-${random}-${random2}`;
}

const FONT = 'Montserrat-Bold';
const BORDER = '#E1E6F0';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';

// ─── Field ID mapping to backend flat schema ──────────────────

const FIELD_MAPPING: Record<string, string> = {
  'nombre-y-apellidos': 'nombre',
  'nombre': 'nombre',
  'nombrecompleto': 'nombre',
  'telefono': 'telefono',
  'telefono-contacto': 'telefono',
  'telefono-fijo': 'telefono',
  'celular': 'telefono',
  'ubicacion': 'zona',
  'zona': 'zona',
  'sector': 'zona',
  'distrito': 'zona',
  'direccion': 'zona',
  'comentarios': 'comentarios',
  'observaciones': 'comentarios',
  'notas': 'comentarios',
  'preferido': 'candidato_preferido',
  'candidato-preferido': 'candidato_preferido',
  'voto': 'candidato_preferido',
};

function resolveBackendField(fieldId: string): string {
  const normalized = fieldId.toLowerCase().replace(/[^a-z0-9]/g, '');
  return FIELD_MAPPING[normalized] || fieldId;
}

// ─── Dynamic Field Renderer ─────────────────────────────────

function DynamicField({
  field,
  value,
  onChange,
  primaryColor,
}: {
  field: FormField;
  value: string;
  onChange: (val: string) => void;
  primaryColor: string;
}) {
  const [capturandoGps, setCapturandoGps] = useState(false);

  if (field.type === 'location') {
    const hasLocation = value !== '';

    const captureLocation = async () => {
      setCapturandoGps(true);
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso denegado', 'Se necesita acceso a ubicacion para capturar GPS.');
          return;
        }
        const position = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        const utm = latLonToUtm(position.coords.latitude, position.coords.longitude);
        onChange(JSON.stringify(utm));
      } catch {
        Alert.alert('Error', 'No se pudo obtener la ubicacion.');
      } finally {
        setCapturandoGps(false);
      }
    };

    let displayText = 'Capturar ubicacion';
    if (capturandoGps) {
      displayText = 'Capturando...';
    } else if (hasLocation) {
      try {
        const utm: UtmData = JSON.parse(value);
        displayText = `UTM ${utm.zone}${utm.hemisphere} ${Math.round(utm.easting)}E ${Math.round(utm.northing)}N`;
      } catch {
        displayText = 'Ubicacion capturada';
      }
    }

    return (
      <View style={styles.field}>
        <Text style={styles.label}>
          {field.label} {field.required && '*'}
        </Text>
        <Pressable
          style={[
            styles.gpsBtn,
            { borderColor: primaryColor },
            hasLocation && styles.gpsBtnCaptured,
          ]}
          onPress={captureLocation}
          disabled={capturandoGps}
        >
          <Text style={[styles.gpsBtnText, { color: primaryColor }, hasLocation && styles.gpsBtnTextCaptured]}>
            {displayText}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (field.type === 'select' || field.type === 'radio') {
    return (
      <View style={styles.field}>
        <Text style={styles.label}>
          {field.label} {field.required && '*'}
        </Text>
        <View style={styles.optionsContainer}>
          {(field.options ?? []).map((opt) => (
            <Pressable
              key={opt.value}
              style={[
                styles.optionBtn,
                value === opt.value && { backgroundColor: primaryColor, borderColor: primaryColor },
              ]}
              onPress={() => onChange(opt.value)}
            >
              <Text
                style={[
                  styles.optionText,
                  value === opt.value && { color: '#FFFFFF' },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  if (field.type === 'checkbox') {
    const checked = value === 'true';
    return (
      <View style={styles.field}>
        <Pressable
          style={styles.checkboxRow}
          onPress={() => onChange(checked ? 'false' : 'true')}
        >
          <View style={[styles.checkbox, checked && { backgroundColor: primaryColor, borderColor: primaryColor }]}>
            {checked && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkboxLabel}>{field.label}</Text>
        </Pressable>
      </View>
    );
  }

  const keyboardType =
    field.type === 'phone'
      ? 'phone-pad' as const
      : field.type === 'number'
      ? 'numeric' as const
      : field.type === 'email'
      ? 'email-address' as const
      : 'default' as const;

  const multiline = field.type === 'textarea';

  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {field.label} {field.required && '*'}
      </Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        placeholder={field.placeholder ?? ''}
        placeholderTextColor={TEXT_MUTED}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? 'top' : 'auto'}
        maxLength={field.validation?.maxLength}
        autoCapitalize={field.type === 'email' ? 'none' : 'sentences'}
      />
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────

export default function NewFormScreen() {
  const router = useRouter();
  const candidate = useCandidate();
  const formConfig = useFormConfig();
  const agent = useAgent();
  const campaign = useActiveCampaign();

  const primary = candidate.color_primario;
  const secondary = candidate.color_secundario;

  const [formData, setFormData] = useState<Record<string, string>>({});
  const [ubicacionUtm, setUbicacionUtm] = useState<UtmData | null>(null);
  const [enviando, setEnviando] = useState(false);

  const updateField = useCallback((fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleLocationCaptured = useCallback((fieldId: string, value: string) => {
    setFormData((prev) => ({ ...prev, [fieldId]: value }));
    if (value) {
      try {
        setUbicacionUtm(JSON.parse(value));
      } catch {
        // ignore
      }
    }
  }, []);

  const handleSubmit = async () => {
    if (!formConfig) return;

    const fields = formConfig.schema.fields;
    
    // Validate required fields
    for (const field of fields) {
      if (field.required && !formData[field.id]?.trim()) {
        Alert.alert('Campo requerido', `"${field.label}" es obligatorio.`);
        return;
      }
      if (field.validation?.pattern && formData[field.id]) {
        const regex = new RegExp(field.validation.pattern);
        if (!regex.test(formData[field.id])) {
          Alert.alert('Formato invalido', `"${field.label}" no tiene el formato correcto.`);
          return;
        }
      }
      if (field.validation?.min && formData[field.id]) {
        if (formData[field.id].length < field.validation.min) {
          Alert.alert('Muy corto', `"${field.label}" debe tener al menos ${field.validation.min} caracteres.`);
          return;
        }
      }
    }

    if (!ubicacionUtm) {
      Alert.alert('Ubicacion requerida', 'Debes capturar la ubicacion GPS.');
      return;
    }

    setEnviando(true);

    try {
      // Build payload
      const backendPayload: Record<string, unknown> = {
        nombre: '',
        telefono: '',
        zona: '',
        candidato_preferido: candidate.name,
        comentarios: '',
      };

      for (const field of fields) {
        const value = formData[field.id] ?? '';
        const backendField = resolveBackendField(field.id);
        backendPayload[backendField] = value;
      }

      backendPayload.nombre = backendPayload.nombre || formData['nombre'] || formData['nombre-y-apellidos'] || 'Sin nombre';
      backendPayload.telefono = backendPayload.telefono || formData['telefono'] || formData['celular'] || '000000000';
      backendPayload.zona = backendPayload.zona || 'Sin zona';

      // Generate unique client_id
      const clientId = generateClientId();

      // Build the full payload data
      const payloadData = {
        nombre: String(backendPayload.nombre),
        telefono: String(backendPayload.telefono),
        fecha: new Date().toISOString(),
        x: ubicacionUtm.easting,
        y: ubicacionUtm.northing,
        zona: String(backendPayload.zona),
        candidato_preferido: candidate.name,
        encuestador: agent.full_name,
        encuestador_id: agent.id,
        comentarios: String(backendPayload.comentarios || ''),
        // Include GPS coordinates for mapping
        lat: ubicacionUtm.latitude,
        lng: ubicacionUtm.longitude,
      };

      // OFFLINE-FIRST: Queue the form locally first
      await queueForm({
        client_id: clientId,
        campaign_id: campaign.id,
        form_definition_id: formConfig.id,
        data: payloadData,
      });

      // Try to sync immediately in background (non-blocking)
      forceSyncNow().catch(() => {
        // Ignore sync errors - data is safe in SQLite
      });

      // Success - form is saved locally and will sync when online
      Alert.alert(
        'Guardado',
        'Registro guardado. Se sincronizara automaticamente cuando haya conexion.',
        [{ text: 'OK', onPress: () => router.back() }]
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      Alert.alert('Error', `No se pudo guardar el formulario: ${message}`);
    } finally {
      setEnviando(false);
    }
  };

  // No form defined
  if (!formConfig) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.noFormContainer}>
          <Text style={styles.noFormTitle}>Sin formulario</Text>
          <Text style={styles.noFormText}>
            No hay un formulario activo para esta campana.
          </Text>
          <Pressable
            style={[styles.backBtn, { backgroundColor: primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backBtnText}>Volver</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const fields = formConfig.schema.fields;

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Pressable onPress={() => router.back()} style={styles.backBtnSimple}>
              <Text style={[styles.backText, { color: TEXT_MUTED }]}>← Volver</Text>
            </Pressable>
            <Text style={[styles.title, { color: primary }]}>{formConfig.name}</Text>
            <Text style={[styles.subtitle, { color: TEXT_MUTED }]}>Agente: {agent.full_name}</Text>
          </View>

          <View style={styles.form}>
            {fields.map((field) => (
              <DynamicField
                key={field.id}
                field={field}
                value={formData[field.id] ?? ''}
                onChange={(val) => handleLocationCaptured(field.id, val)}
                primaryColor={primary}
              />
            ))}

            <View style={[styles.candidatoCard, { backgroundColor: primary }]}>
              <Text style={styles.candidatoLabel}>Candidato</Text>
              <Text style={styles.candidatoName}>{candidate.name}</Text>
              <Text style={[styles.candidatoDetail, { color: secondary }]}>
                {candidate.cargo} · {candidate.partido}
              </Text>
            </View>
          </View>

          <Pressable
            style={[styles.saveBtn, { backgroundColor: secondary }, enviando && styles.saveBtnDisabled]}
            onPress={handleSubmit}
            disabled={enviando}
          >
            <Text style={[styles.saveBtnText, { color: primary }]}>
              {enviando ? 'Enviando...' : 'Enviar registro'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  flex: { flex: 1 },
  scroll: { padding: 20, paddingBottom: 40 },
  header: { marginBottom: 24 },
  backBtnSimple: { marginBottom: 12 },
  backText: { fontSize: 14, fontFamily: FONT },
  title: { fontSize: 24, fontFamily: FONT },
  subtitle: { fontSize: 14, fontFamily: FONT, marginTop: 4 },
  form: { gap: 20 },
  field: { gap: 8 },
  label: {
    fontSize: 13,
    color: '#163960',
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
    color: '#163960',
    fontFamily: FONT,
    backgroundColor: '#F8FAFC',
  },
  inputMultiline: { minHeight: 80, paddingTop: 14 },
  gpsBtn: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  gpsBtnCaptured: { backgroundColor: '#DCFCE7', borderColor: '#22C55E' },
  gpsBtnText: { fontSize: 14, fontFamily: FONT },
  gpsBtnTextCaptured: { color: '#22C55E' },
  optionsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: {
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
  },
  optionText: { fontSize: 14, color: '#163960', fontFamily: FONT },
  checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: { color: '#FFFFFF', fontSize: 14, fontFamily: FONT },
  checkboxLabel: { fontSize: 15, color: '#163960', fontFamily: FONT },
  candidatoCard: { borderRadius: 16, padding: 16, gap: 4 },
  candidatoLabel: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  candidatoName: { fontSize: 18, color: '#FFFFFF', fontFamily: FONT },
  candidatoDetail: { fontSize: 13, fontFamily: FONT },
  saveBtn: { borderRadius: 14, padding: 16, alignItems: 'center', marginTop: 32 },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { fontSize: 16, fontFamily: FONT, textTransform: 'uppercase', letterSpacing: 1 },
  noFormContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32, gap: 16 },
  noFormTitle: { fontSize: 22, color: '#163960', fontFamily: FONT },
  noFormText: { fontSize: 15, color: TEXT_MUTED, fontFamily: FONT, textAlign: 'center' },
  backBtn: { borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  backBtnText: { fontSize: 14, color: '#FFFFFF', fontFamily: FONT, textTransform: 'uppercase' },
});
