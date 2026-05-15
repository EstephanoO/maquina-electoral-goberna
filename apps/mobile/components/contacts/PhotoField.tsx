import { useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { MaterialIcons } from '@expo/vector-icons';
import { Brand, Radius, Spacing } from '@/constants/theme';

interface Props {
  value: string | null;
  onChange: (uri: string | null) => void;
  disabled?: boolean;
}

export function PhotoField({ value, onChange, disabled }: Props) {
  const [loading, setLoading] = useState(false);

  async function pick(source: 'camera' | 'library') {
    setLoading(true);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== 'granted') {
          Alert.alert('Permiso requerido', 'Activa el acceso a la cámara en Configuración.');
          return;
        }
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: 'images',
          quality: 0.7,
          allowsEditing: true,
          aspect: [3, 4],
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: 'images',
          quality: 0.7,
          allowsEditing: true,
          aspect: [3, 4],
        });
      }
      if (!result.canceled && result.assets[0]) {
        onChange(result.assets[0].uri);
      }
    } finally {
      setLoading(false);
    }
  }

  function handlePress() {
    if (disabled) return;
    const options: { text: string; style?: 'cancel' | 'destructive' | 'default'; onPress?: () => void }[] = [
      { text: 'Cámara', onPress: () => pick('camera') },
      { text: 'Galería', onPress: () => pick('library') },
    ];
    if (value) {
      options.push({ text: 'Eliminar foto', style: 'destructive', onPress: () => onChange(null) });
    }
    options.push({ text: 'Cancelar', style: 'cancel' });
    Alert.alert('Foto del contacto', 'Seleccionar origen', options);
  }

  return (
    <Pressable
      onPress={handlePress}
      style={[styles.container, disabled && styles.disabled]}
      accessibilityRole="button"
      accessibilityLabel={value ? 'Cambiar foto del contacto' : 'Agregar foto del contacto'}
    >
      {value ? (
        <Image source={{ uri: value }} style={styles.photo} />
      ) : (
        <View style={styles.placeholder}>
          <MaterialIcons name="add-a-photo" size={28} color={loading ? Brand.yellow : '#94a3b8'} />
          <Text style={styles.label}>{loading ? 'Cargando…' : 'Agregar foto'}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    width: 100,
    height: 133,
    borderRadius: Radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
  },
  disabled: { opacity: 0.5 },
  photo: { width: '100%', height: '100%', resizeMode: 'cover' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: '#f8fafc',
  },
  label: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
});
