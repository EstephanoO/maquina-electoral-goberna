/**
 * RegionPicker - Modal fullscreen con buscador para seleccionar departamento
 * 
 * Uso:
 * <RegionPicker
 *   value="LIMA"
 *   onSelect={(code) => setRegion(code)}
 * />
 */

import { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  searchDepartamentos,
  getDepartamentoName,
  type Departamento,
} from '@/lib/constants/departamentos';

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

type Props = {
  value: string | null;
  onSelect: (code: string) => void;
  placeholder?: string;
};

export default function RegionPicker({ value, onSelect, placeholder = 'Selecciona tu región' }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Filtered list based on search
  const filteredDepartamentos = useMemo(
    () => searchDepartamentos(search),
    [search]
  );

  // Display text for the trigger button
  const displayText = value ? getDepartamentoName(value) : placeholder;

  const openModal = useCallback(() => {
    setSearch('');
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const handleSelect = useCallback((code: string) => {
    onSelect(code);
    setIsOpen(false);
  }, [onSelect]);

  const renderOption = useCallback(
    (item: Departamento) => {
      const isSelected = value === item.code;
      return (
        <Pressable
          key={item.code}
          style={({ pressed }) => [
            styles.option,
            isSelected && styles.optionSelected,
            pressed && styles.optionPressed,
          ]}
          onPress={() => handleSelect(item.code)}
        >
          <View style={[styles.radio, isSelected && styles.radioSelected]}>
            {isSelected && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
            {item.name}
          </Text>
          {isSelected && (
            <Ionicons name="checkmark-circle" size={22} color={SUCCESS} />
          )}
        </Pressable>
      );
    },
    [value, handleSelect]
  );

  return (
    <>
      {/* Trigger Button */}
      <Pressable 
        style={({ pressed }) => [
          styles.trigger, 
          value && styles.triggerSelected,
          pressed && styles.triggerPressed,
        ]} 
        onPress={openModal}
      >
        <Ionicons 
          name="location-outline" 
          size={20} 
          color={value ? BRAND_BLUE : TEXT_MUTED} 
          style={styles.triggerIcon}
        />
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          {displayText}
        </Text>
        <Ionicons 
          name="chevron-down" 
          size={20} 
          color={TEXT_MUTED} 
        />
      </Pressable>

      {/* Modal - siempre encima de todo */}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            {/* Header */}
            <View style={styles.modalHeader}>
              <Pressable onPress={closeModal} style={styles.closeBtn} hitSlop={12}>
                <Ionicons name="close" size={28} color={TEXT_DARK} />
              </Pressable>
              <Text style={styles.modalTitle}>Selecciona tu región</Text>
              <View style={styles.headerSpacer} />
            </View>

            {/* Search Input */}
            <View style={styles.searchWrapper}>
              <View style={[styles.searchContainer, searchFocused && styles.searchContainerFocused]}>
                <Ionicons 
                  name="search-outline" 
                  size={20} 
                  color={searchFocused ? BORDER_FOCUS : TEXT_MUTED} 
                  style={styles.searchIcon}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar departamento..."
                  placeholderTextColor={TEXT_MUTED}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                />
                {search.length > 0 && (
                  <Pressable onPress={() => setSearch('')} hitSlop={8}>
                    <Ionicons name="close-circle" size={20} color={TEXT_MUTED} />
                  </Pressable>
                )}
              </View>
            </View>

            {/* List */}
            <ScrollView 
              style={styles.list}
              contentContainerStyle={styles.listContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {filteredDepartamentos.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search" size={48} color={TEXT_MUTED} />
                  <Text style={styles.emptyText}>No se encontraron resultados</Text>
                </View>
              ) : (
                filteredDepartamentos.map(renderOption)
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  
  // Trigger button
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    backgroundColor: BG_INPUT,
  },
  triggerSelected: {
    borderColor: BORDER_FOCUS,
    backgroundColor: '#FFFFFF',
  },
  triggerPressed: {
    opacity: 0.8,
  },
  triggerIcon: {
    marginRight: 10,
  },
  triggerText: {
    flex: 1,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  triggerPlaceholder: {
    color: TEXT_MUTED,
  },

  // Modal
  modalContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  closeBtn: {
    padding: 4,
  },
  modalTitle: {
    flex: 1,
    fontSize: 18,
    color: TEXT_DARK,
    fontFamily: FONT,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 36,
  },

  // Search
  searchWrapper: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: BG_INPUT,
  },
  searchContainerFocused: {
    borderColor: BORDER_FOCUS,
    backgroundColor: '#FFFFFF',
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },

  // List
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Option item
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
  },
  optionSelected: {
    backgroundColor: SUCCESS_BG,
  },
  optionPressed: {
    backgroundColor: BG_INPUT,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  radioSelected: {
    borderColor: SUCCESS,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: SUCCESS,
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  optionTextSelected: {
    color: '#15803d',
    fontFamily: FONT,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
  },
});
