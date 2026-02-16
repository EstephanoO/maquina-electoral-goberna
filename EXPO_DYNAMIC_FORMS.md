# 🎯 Formularios Dinámicos en Expo - Guía de Renderizado

## 📋 Resumen

El sistema de formularios dinámicos permite que el admin diseñe formularios personalizados desde el panel web, y la app Expo los renderice automáticamente según el schema JSON definido.

## 🔗 Endpoints para Expo

### 1. Obtener formularios activos de un candidato

```typescript
// GET /api/form-definitions/active?campaign_id=<UUID>
// Requiere: Bearer token de autenticación

const response = await fetch(
  'http://161.132.39.165/api/form-definitions/active?campaign_id=UUID_DEL_CANDIDATO',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }
);

const { form_definitions } = await response.json();
```

### 2. Obtener un formulario específico

```typescript
// GET /api/form-definitions/:id
// Requiere: Bearer token de autenticación

const response = await fetch(
  'http://161.132.39.165/api/form-definitions/UUID_DEL_FORMULARIO',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  }
);

const { form_definition } = await response.json();
```

## 📦 Estructura del Schema JSON

```typescript
interface FormSchema {
  version: string;       // "1.0"
  fields: FormField[];   // Lista de campos
}

interface FormField {
  id: string;                           // ID único del campo (ej: "nombre", "edad")
  type: FieldType;                      // Tipo de campo
  label: string;                        // Etiqueta visible (ej: "Nombre completo")
  placeholder?: string;                 // Texto de ejemplo
  helpText?: string;                    // Texto de ayuda
  required: boolean;                    // Si es obligatorio
  validation?: ValidationRules;         // Reglas de validación
  options?: FieldOption[];              // Opciones para select/radio/checkbox
  defaultValue?: unknown;               // Valor por defecto
}

type FieldType = 
  | "text" 
  | "number" 
  | "email" 
  | "phone" 
  | "textarea" 
  | "select" 
  | "radio" 
  | "checkbox" 
  | "date" 
  | "location" 
  | "photo";

interface ValidationRules {
  min?: number;      // Mínimo para números/texto
  max?: number;      // Máximo para números/texto
  pattern?: string;  // Regex pattern
}

interface FieldOption {
  value: string;     // Valor guardado (ej: "si")
  label: string;     // Texto visible (ej: "Sí, definitivamente")
}
```

## 🎨 Ejemplo de Schema

```json
{
  "version": "1.0",
  "fields": [
    {
      "id": "nombre",
      "type": "text",
      "label": "Nombre completo",
      "placeholder": "Ingresa tu nombre",
      "required": true,
      "validation": { "min": 3, "max": 100 }
    },
    {
      "id": "edad",
      "type": "number",
      "label": "Edad",
      "required": true,
      "validation": { "min": 18, "max": 120 }
    },
    {
      "id": "email",
      "type": "email",
      "label": "Correo electrónico",
      "placeholder": "tu@email.com",
      "required": true
    },
    {
      "id": "telefono",
      "type": "phone",
      "label": "Teléfono",
      "placeholder": "999888777",
      "required": false
    },
    {
      "id": "distrito",
      "type": "select",
      "label": "Distrito",
      "required": true,
      "options": [
        { "value": "arequipa", "label": "Arequipa" },
        { "value": "cayma", "label": "Cayma" },
        { "value": "cerro_colorado", "label": "Cerro Colorado" }
      ]
    },
    {
      "id": "apoyo",
      "type": "radio",
      "label": "¿Nos apoyaría?",
      "required": true,
      "options": [
        { "value": "si", "label": "Sí, definitivamente" },
        { "value": "tal_vez", "label": "Tal vez" },
        { "value": "no", "label": "No" }
      ]
    },
    {
      "id": "temas",
      "type": "checkbox",
      "label": "Temas de interés",
      "required": false,
      "options": [
        { "value": "seguridad", "label": "Seguridad" },
        { "value": "salud", "label": "Salud" },
        { "value": "educacion", "label": "Educación" },
        { "value": "empleo", "label": "Empleo" }
      ]
    },
    {
      "id": "observaciones",
      "type": "textarea",
      "label": "Observaciones adicionales",
      "placeholder": "Comentarios adicionales...",
      "required": false
    },
    {
      "id": "fecha_encuesta",
      "type": "date",
      "label": "Fecha de encuesta",
      "required": true
    },
    {
      "id": "ubicacion",
      "type": "location",
      "label": "Ubicación GPS",
      "required": true
    },
    {
      "id": "foto_vivienda",
      "type": "photo",
      "label": "Foto de la vivienda",
      "required": false
    }
  ]
}
```

## 📱 Implementación en Expo

### Componente Principal de Formulario

```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';

// Tipos del schema
interface FormField {
  id: string;
  type: string;
  label: string;
  placeholder?: string;
  helpText?: string;
  required: boolean;
  validation?: { min?: number; max?: number };
  options?: { value: string; label: string }[];
}

interface FormSchema {
  version: string;
  fields: FormField[];
}

interface DynamicFormProps {
  formDefinitionId: string;
  campaignId: string;
  accessToken: string;
  onSubmit: (data: Record<string, unknown>) => Promise<void>;
}

// Componente principal
export function DynamicForm({
  formDefinitionId,
  campaignId,
  accessToken,
  onSubmit
}: DynamicFormProps) {
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadFormDefinition();
  }, [formDefinitionId]);

  async function loadFormDefinition() {
    try {
      const response = await fetch(
        `http://161.132.39.165/api/form-definitions/${formDefinitionId}`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      const data = await response.json();
      if (data.form_definition) {
        setFields(data.form_definition.schema.fields);
      }
    } catch (error) {
      console.error('Error loading form:', error);
      Alert.alert('Error', 'No se pudo cargar el formulario');
    } finally {
      setLoading(false);
    }
  }

  function updateValue(fieldId: string, value: unknown) {
    setValues(prev => ({ ...prev, [fieldId]: value }));
    // Clear error when user starts typing
    if (errors[fieldId]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldId];
        return newErrors;
      });
    }
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {};
    
    fields.forEach(field => {
      const value = values[field.id];
      
      // Required validation
      if (field.required) {
        if (field.type === 'checkbox') {
          if (!value || (Array.isArray(value) && value.length === 0)) {
            newErrors[field.id] = `${field.label} es requerido`;
          }
        } else if (!value || (typeof value === 'string' && !value.trim())) {
          newErrors[field.id] = `${field.label} es requerido`;
        }
      }
      
      // Min/Max validation for text
      if (field.type === 'text' && value && field.validation?.min) {
        if (String(value).length < field.validation.min) {
          newErrors[field.id] = `Mínimo ${field.validation.min} caracteres`;
        }
      }
      if (field.type === 'text' && value && field.validation?.max) {
        if (String(value).length > field.validation.max) {
          newErrors[field.id] = `Máximo ${field.validation.max} caracteres`;
        }
      }
      
      // Min/Max validation for number
      if (field.type === 'number' && value !== undefined && value !== '') {
        const numValue = Number(value);
        if (field.validation?.min !== undefined && numValue < field.validation.min) {
          newErrors[field.id] = `Mínimo ${field.validation.min}`;
        }
        if (field.validation?.max !== undefined && numValue > field.validation.max) {
          newErrors[field.id] = `Máximo ${field.validation.max}`;
        }
      }
    });
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) {
      Alert.alert('Error', 'Por favor completa todos los campos requeridos');
      return;
    }
    
    setSubmitting(true);
    try {
      await onSubmit(values);
    } catch (error) {
      console.error('Submit error:', error);
      Alert.alert('Error', 'No se pudo enviar el formulario');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <View style={styles.loading}><Text>Cargando formulario...</Text></View>;
  }

  return (
    <ScrollView style={styles.container}>
      {fields.map(field => (
        <FieldRenderer
          key={field.id}
          field={field}
          value={values[field.id]}
          error={errors[field.id]}
          onChange={(value) => updateValue(field.id, value)}
        />
      ))}
      
      <TouchableOpacity
        style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        <Text style={styles.submitButtonText}>
          {submitting ? 'Enviando...' : 'Enviar'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// Componente individual por tipo de campo
function FieldRenderer({
  field,
  value,
  error,
  onChange
}: {
  field: FormField;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}) {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);

  switch (field.type) {
    case 'text':
    case 'email':
    case 'phone':
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={value as string || ''}
            onChangeText={onChange}
            placeholder={field.placeholder}
            keyboardType={field.type === 'phone' ? 'phone-pad' : field.type === 'email' ? 'email-address' : 'default'}
            autoCapitalize={field.type === 'email' ? 'none' : 'words'}
          />
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'number':
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={value as string || ''}
            onChangeText={(text) => onChange(text === '' ? '' : Number(text))}
            placeholder={field.placeholder}
            keyboardType="numeric"
          />
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'textarea':
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <TextInput
            style={[styles.input, styles.textArea, error && styles.inputError]}
            value={value as string || ''}
            onChangeText={onChange}
            placeholder={field.placeholder}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'select':
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <View style={styles.selectContainer}>
            {(field.options || []).map(option => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.selectOption,
                  value === option.value && styles.selectOptionSelected
                ]}
                onPress={() => onChange(option.value)}
              >
                <Text style={[
                  styles.selectOptionText,
                  value === option.value && styles.selectOptionTextSelected
                ]}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'radio':
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <View style={styles.radioContainer}>
            {(field.options || []).map(option => (
              <TouchableOpacity
                key={option.value}
                style={styles.radioOption}
                onPress={() => onChange(option.value)}
              >
                <View style={[
                  styles.radioCircle,
                  value === option.value && styles.radioCircleSelected
                ]}>
                  {value === option.value && <View style={styles.radioInner} />}
                </View>
                <Text style={styles.radioLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'checkbox':
      const checkedValues = Array.isArray(value) ? value : [];
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <View style={styles.checkboxContainer}>
            {(field.options || []).map(option => (
              <TouchableOpacity
                key={option.value}
                style={styles.checkboxOption}
                onPress={() => {
                  if (checkedValues.includes(option.value)) {
                    onChange(checkedValues.filter((v: string) => v !== option.value));
                  } else {
                    onChange([...checkedValues, option.value]);
                  }
                }}
              >
                <View style={[
                  styles.checkboxSquare,
                  checkedValues.includes(option.value) && styles.checkboxSquareChecked
                ]}>
                  {checkedValues.includes(option.value) && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </View>
                <Text style={styles.checkboxLabel}>{option.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'date':
      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <TextInput
            style={[styles.input, error && styles.inputError]}
            value={value as string || ''}
            onChangeText={onChange}
            placeholder="YYYY-MM-DD"
          />
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'location':
      async function getLocation() {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso denegado', 'Se necesita acceso a la ubicación');
          return;
        }
        const loc = await Location.getCurrentPositionAsync({});
        const coords = {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude
        };
        setLocation(coords);
        onChange(coords);
      }

      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <TouchableOpacity style={styles.locationButton} onPress={getLocation}>
            <Text style={styles.locationButtonText}>
              {location ? `📍 ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : '📍 Obtener ubicación'}
            </Text>
          </TouchableOpacity>
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    case 'photo':
      async function takePhoto() {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permiso denegado', 'Se necesita acceso a la cámara');
          return;
        }
        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 0.7,
        });
        if (!result.canceled) {
          onChange(result.assets[0].uri);
        }
      }

      return (
        <View style={styles.fieldContainer}>
          <Text style={styles.label}>
            {field.label}
            {field.required && <Text style={styles.required}> *</Text>}
          </Text>
          <TouchableOpacity style={styles.photoButton} onPress={takePhoto}>
            <Text style={styles.photoButtonText}>
              {value ? '📷 Foto tomada' : '📷 Tomar foto'}
            </Text>
          </TouchableOpacity>
          {field.helpText && <Text style={styles.helpText}>{field.helpText}</Text>}
          {error && <Text style={styles.errorText}>{error}</Text>}
        </View>
      );

    default:
      return null;
  }
}

// Estilos
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8fafc',
  },
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fieldContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  required: {
    color: '#dc2626',
  },
  input: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  inputError: {
    borderColor: '#dc2626',
  },
  textArea: {
    minHeight: 100,
    paddingTop: 12,
  },
  helpText: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: '#dc2626',
    marginTop: 4,
  },
  selectContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  selectOption: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
  },
  selectOptionSelected: {
    backgroundColor: '#163960',
    borderColor: '#163960',
  },
  selectOptionText: {
    fontSize: 14,
    color: '#374151',
  },
  selectOptionTextSelected: {
    color: '#ffffff',
  },
  radioContainer: {
    gap: 12,
  },
  radioOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radioCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: '#163960',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#163960',
  },
  radioLabel: {
    fontSize: 14,
    color: '#374151',
  },
  checkboxContainer: {
    gap: 12,
  },
  checkboxOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  checkboxSquare: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#d1d5db',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSquareChecked: {
    backgroundColor: '#163960',
    borderColor: '#163960',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: '#374151',
  },
  locationButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  locationButtonText: {
    fontSize: 14,
    color: '#163960',
    fontWeight: '600',
  },
  photoButton: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  photoButtonText: {
    fontSize: 14,
    color: '#163960',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#163960',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 40,
  },
  submitButtonDisabled: {
    backgroundColor: '#94a3b8',
  },
  submitButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
```

## 📤 Envío del Formulario

```typescript
async function submitForm(data: Record<string, unknown>) {
  const accessToken = await AsyncStorage.getItem('access_token');
  const campaignId = await AsyncStorage.getItem('current_campaign_id');
  
  // Obtener ubicación actual
  const location = await Location.getCurrentPositionAsync({});
  
  // Preparar datos
  const formData = {
    // Datos fijos requeridos por el backend
    nombre: data.nombre || '',
    telefono: data.telefono || '',
    fecha: new Date().toISOString(),
    x: location.coords.longitude,
    y: location.coords.latitude,
    zona: data.distrito || '',
    candidate: '',
    encuestador: 'app-user',
    evolucion: 'primera',
    candidato_preferido: data.apoyo || '',
    client_id: UUID.randomUUID(),
    // Datos dinámicos del formulario
    campaign_id: campaignId,
    form_definition_id: formDefinitionId,
    // Los campos dinámicos se envían como JSON
    dynamic_data: JSON.stringify(data),
  };

  const response = await fetch('http://161.132.39.165/api/forms', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(formData),
  });

  if (response.ok) {
    Alert.alert('Éxito', 'Formulario enviado correctamente');
    // Limpiar formulario o navegar
  } else {
    const error = await response.json();
    Alert.alert('Error', error.message || 'No se pudo enviar');
  }
}
```

## 🔄 Flujo Completo en Expo

```typescript
// Pantalla de selección de formulario
function FormsScreen() {
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [selectedForm, setSelectedForm] = useState<string | null>(null);

  useEffect(() => {
    loadActiveForms();
  }, []);

  async function loadActiveForms() {
    const token = await AsyncStorage.getItem('access_token');
    const campaignId = await AsyncStorage.getItem('current_campaign_id');
    
    const response = await fetch(
      `http://161.132.39.165/api/form-definitions/active?campaign_id=${campaignId}`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    
    const data = await response.json();
    setForms(data.form_definitions || []);
  }

  if (selectedForm) {
    return (
      <DynamicForm
        formDefinitionId={selectedForm}
        campaignId={campaignId}
        accessToken={token}
        onSubmit={submitForm}
      />
    );
  }

  return (
    <View>
      <Text style={styles.title}>Formularios Disponibles</Text>
      {forms.map(form => (
        <TouchableOpacity
          key={form.id}
          onPress={() => setSelectedForm(form.id)}
        >
          <Text>{form.name}</Text>
          <Text>{form.description}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}
```

## 🚨 Manejo de Errores

| Código | Causa | Solución |
|--------|-------|----------|
| 401 | Token expirado | Usar refresh token |
| 403 | No tienes acceso | Verificar rol y permisos |
| 404 | Formulario no encontrado | Verificar ID del formulario |
| 422 | Validación fallida | Revisar campos requeridos |

## 📋 Ejemplo de Datos de Respuesta

```json
{
  "ok": true,
  "form_definition": {
    "id": "uuid-del-formulario",
    "campaign_id": "uuid-del-candidato",
    "name": "Encuesta Puerta a Puerta",
    "slug": "encuesta-puerta",
    "description": "Encuesta para recolección de datos puerta a puerta",
    "schema": {
      "version": "1.0",
      "fields": [
        {
          "id": "nombre",
          "type": "text",
          "label": "Nombre completo",
          "placeholder": "Ingresa tu nombre",
          "required": true,
          "validation": { "min": 3, "max": 100 }
        }
      ]
    },
    "status": "active",
    "campaign_name": "Rocío Porras"
  }
}
```

## 🎯 Testing desde Terminal

```bash
# 1. Login para obtener token
TOKEN=$(curl -s -X POST http://161.132.39.165/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@goberna.pe","password":"Admin1234!"}' | \
  grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)

# 2. Listar formularios activos de un candidato
curl -X GET "http://161.132.39.165/api/form-definitions/active?campaign_id=UUID_CANDIDATO" \
  -H "Authorization: Bearer $TOKEN"

# 3. Ver detalle de un formulario
curl -X GET "http://161.132.39.165/api/form-definitions/UUID_FORMULARIO" \
  -H "Authorization: Bearer $TOKEN"
```

## 📚 Documentos Relacionados

- `EXPO_ADMIN_APPROVAL.md` - Aprobación de solicitudes de acceso
- `AUTH_CONTRACT.md` - Contrato de autenticación completo
