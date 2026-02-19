/**
 * RegionPicker - Bottom Sheet con buscador para seleccionar departamento
 * 
 * Uso:
 * <RegionPicker
 *   value="LIMA"
 *   onSelect={(code) => setRegion(code)}
 * />
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Keyboard,
} from 'react-native';
import BottomSheet, { BottomSheetBackdrop, BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DEPARTAMENTOS,
  searchDepartamentos,
  getDepartamentoName,
  type Departamento,
} from '@/lib/constants/departamentos';

const BRAND_BLUE = '#163960';
const BRAND_YELLOW = '#FFC800';
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.7)';
const BORDER = '#E1E6F0';
const FONT = 'Montserrat-Bold';

type Props = {
  value: string | null;
  onSelect: (code: string) => void;
  placeholder?: string;
};

export default function RegionPicker({ value, onSelect, placeholder = 'Selecciona tu region' }: Props) {
  const bottomSheetRef = useRef<BottomSheet>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [tempSelected, setTempSelected] = useState<string | null>(value);

  // Filtered list based on search
  const filteredDepartamentos = useMemo(
    () => searchDepartamentos(search),
    [search]
  );

  // Display text for the trigger button
  const displayText = value ? getDepartamentoName(value) : placeholder;

  const openSheet = useCallback(() => {
    setTempSelected(value);
    setSearch('');
    setIsOpen(true);
    bottomSheetRef.current?.expand();
  }, [value]);

  const closeSheet = useCallback(() => {
    setIsOpen(false);
    Keyboard.dismiss();
    bottomSheetRef.current?.close();
  }, []);

  const handleConfirm = useCallback(() => {
    if (tempSelected) {
      onSelect(tempSelected);
    }
    closeSheet();
  }, [tempSelected, onSelect, closeSheet]);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
      setIsOpen(false);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  const renderOption = useCallback(
    (item: Departamento) => {
      const isSelected = tempSelected === item.code;
      return (
        <Pressable
          key={item.code}
          style={[styles.option, isSelected && styles.optionSelected]}
          onPress={() => setTempSelected(item.code)}
        >
          <View style={[styles.radio, isSelected && styles.radioSelected]}>
            {isSelected && <View style={styles.radioInner} />}
          </View>
          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
            {item.name}
          </Text>
          {isSelected && <Text style={styles.checkmark}>✓</Text>}
        </Pressable>
      );
    },
    [tempSelected]
  );

  return (
    <>
      {/* Trigger Button */}
      <Pressable style={[styles.trigger, value && styles.triggerSelected]} onPress={openSheet}>
        <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]}>
          {displayText}
        </Text>
        <Text style={styles.triggerIcon}>▼</Text>
      </Pressable>

      {/* Bottom Sheet - only render when open for performance */}
      {isOpen && (
        <GestureHandlerRootView style={styles.sheetContainer}>
          <BottomSheet
            ref={bottomSheetRef}
            index={0}
            snapPoints={['70%']}
            enablePanDownToClose
            onChange={handleSheetChange}
            backdropComponent={renderBackdrop}
            handleIndicatorStyle={styles.handle}
            backgroundStyle={styles.sheetBackground}
          >
            <BottomSheetScrollView 
              style={styles.sheetContent}
              contentContainerStyle={styles.sheetContentContainer}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Header */}
              <Text style={styles.sheetTitle}>Selecciona tu región</Text>

              {/* Search Input */}
              <View style={styles.searchContainer}>
                <Text style={styles.searchIcon}>🔍</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar departamento..."
                  placeholderTextColor={TEXT_MUTED}
                  value={search}
                  onChangeText={setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* List - usando map en vez de FlatList para evitar nested virtualized lists */}
              <View style={styles.listContent}>
                {filteredDepartamentos.map(renderOption)}
              </View>

              {/* Confirm Button */}
              <Pressable
                style={[styles.confirmButton, !tempSelected && styles.confirmButtonDisabled]}
                onPress={handleConfirm}
                disabled={!tempSelected}
              >
                <Text style={styles.confirmButtonText}>Confirmar</Text>
              </Pressable>
            </BottomSheetScrollView>
          </BottomSheet>
        </GestureHandlerRootView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  // Trigger button
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#F8FAFC',
  },
  triggerSelected: {
    borderColor: BRAND_BLUE,
    backgroundColor: '#F0F4F8',
  },
  triggerText: {
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT,
    flex: 1,
  },
  triggerPlaceholder: {
    color: TEXT_MUTED,
  },
  triggerIcon: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginLeft: 8,
  },

  // Sheet container
  sheetContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  sheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    backgroundColor: '#D1D5DB',
    width: 40,
  },
  sheetContent: {
    flex: 1,
  },
  sheetContentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },

  // Header
  sheetTitle: {
    fontSize: 18,
    color: TEXT_DARK,
    fontFamily: FONT,
    textAlign: 'center',
    marginBottom: 16,
  },

  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    marginBottom: 12,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT,
  },

  // List
  listContent: {
    paddingBottom: 8,
  },

  // Option item
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
  },
  optionSelected: {
    backgroundColor: '#F0FDF4',
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
    borderColor: '#22c55e',
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  optionTextSelected: {
    color: '#15803d',
  },
  checkmark: {
    fontSize: 18,
    color: '#22c55e',
  },

  // Confirm button
  confirmButton: {
    backgroundColor: BRAND_YELLOW,
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  confirmButtonDisabled: {
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 14,
    color: BRAND_BLUE,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
