/**
 * DistritoPicker — Offline-first distrito selector for Peruvian districts.
 *
 * Two modes:
 * 1. **Global search** (default, when SQLite cache is ready):
 *    Single search box → searches all ~1900 distritos offline in SQLite.
 *    Shows "recientes" (recently used) and "last used" pill for quick re-selection.
 *
 * 2. **Cascading drill-down** (fallback, when no cache):
 *    Three-step modal: Departamento → Provincia → Distrito.
 *    Fetches from backend API (online required).
 *
 * Usage:
 * <DistritoPicker
 *   value={selectedDistrito}   // SelectedDistrito | null
 *   onSelect={(d) => setDistrito(d)}
 * />
 */

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { getGeoDepartamentos, getGeoProvincias, getGeoDistritos } from '@/lib/api';
import {
  searchDistritosOffline,
  getRecientes,
  getLastUsed,
  saveReciente,
} from '@/lib/offline-queue/geo';
import type { SearchResultItem } from '@/lib/offline-queue/geo';
import type { DepartamentoInfo, ProvinciaInfo, DistritoInfo, SelectedDistrito } from '@/lib/types';

// ─── Design Tokens ─────────────────────────────────────────────
const TEXT_DARK = '#163960';
const TEXT_MUTED = 'rgba(22, 57, 96, 0.5)';
const BORDER = '#E1E6F0';
const BORDER_FOCUS = '#4A8AC4';
const BG_INPUT = '#F8FAFC';
const SUCCESS = '#22c55e';
const SUCCESS_BG = '#f0fdf4';
const BRAND_YELLOW = '#FFC800';
const BRAND_YELLOW_BG = '#FFFBEB';
const FONT = 'Montserrat-Bold';
const FONT_REGULAR = 'Montserrat-Regular';

// ─── Types ──────────────────────────────────────────────────────

type DrillStep = 'departamento' | 'provincia' | 'distrito';

type Props = {
  value: SelectedDistrito | null;
  onSelect: (distrito: SelectedDistrito) => void;
  onClear?: () => void;
  primaryColor?: string;
  placeholder?: string;
};

// ─── In-memory cache for drill-down fallback ────────────────────
const _cache = {
  departamentos: null as DepartamentoInfo[] | null,
  provincias: new Map<string, ProvinciaInfo[]>(),
  distritos: new Map<string, DistritoInfo[]>(),
};

function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export default function DistritoPicker({
  value,
  onSelect,
  onClear,
  primaryColor = TEXT_DARK,
  placeholder = 'Seleccionar distrito',
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);

  // Mode: 'search' (default, always) or 'drill' (manual switch only)
  const [mode, setMode] = useState<'search' | 'drill'>('search');

  // Search mode state (bundled data = always ready, no cache check needed)
  const [searchResults, setSearchResults] = useState<SearchResultItem[]>([]);
  const [recientes, setRecientes] = useState<SelectedDistrito[]>([]);
  const [lastUsed, setLastUsedState] = useState<SelectedDistrito | null>(null);

  // Drill-down mode state (accessible via "Buscar paso a paso" link)
  const [drillStep, setDrillStep] = useState<DrillStep>('departamento');
  const [selectedDep, setSelectedDep] = useState<DepartamentoInfo | null>(null);
  const [selectedProv, setSelectedProv] = useState<ProvinciaInfo | null>(null);
  const [departamentos, setDepartamentos] = useState<DepartamentoInfo[]>([]);
  const [provincias, setProvincias] = useState<ProvinciaInfo[]>([]);
  const [distritos, setDistritos] = useState<DistritoInfo[]>([]);

  const searchRef = useRef<TextInput>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Display text ──────────────────────────────────────────────
  const displayText = value
    ? `${value.distrito}, ${value.provincia}`
    : placeholder;

  const displaySubtext = value
    ? value.departamento
    : null;

  // ── Load recientes + lastUsed when opening in search mode ─────
  const loadSearchState = useCallback(async () => {
    const [rec, last] = await Promise.all([getRecientes(5), getLastUsed()]);
    setRecientes(rec);
    setLastUsedState(last);
  }, []);

  // ── Search handler (debounced): offline first, backend fallback ─
  const handleSearchChange = useCallback((text: string) => {
    setSearch(text);

    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      setSearchResults([]);
      return;
    }

    // Start searching from 1 character (permissive)
    const delay = trimmed.length === 1 ? 400 : 200; // longer debounce for 1 char

    searchDebounceRef.current = setTimeout(async () => {
      // Search bundled data in-memory (instant, no network needed)
      const results = await searchDistritosOffline(text, 25);
      setSearchResults(results);
    }, delay);
  }, []);

  // ── Drill-down data loading (fallback) ────────────────────────
  const loadDepartamentos = useCallback(async () => {
    if (_cache.departamentos) {
      setDepartamentos(_cache.departamentos);
      return;
    }
    setLoading(true);
    try {
      const result = await getGeoDepartamentos();
      if (result.ok) {
        _cache.departamentos = result.data.departamentos;
        setDepartamentos(result.data.departamentos);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProvincias = useCallback(async (coddep: string) => {
    const cached = _cache.provincias.get(coddep);
    if (cached) {
      setProvincias(cached);
      return;
    }
    setLoading(true);
    try {
      const result = await getGeoProvincias(coddep);
      if (result.ok) {
        _cache.provincias.set(coddep, result.data.provincias);
        setProvincias(result.data.provincias);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDistritos = useCallback(async (codprov_full: string) => {
    const cached = _cache.distritos.get(codprov_full);
    if (cached) {
      setDistritos(cached);
      return;
    }
    setLoading(true);
    try {
      const result = await getGeoDistritos(codprov_full);
      if (result.ok) {
        _cache.distritos.set(codprov_full, result.data.distritos);
        setDistritos(result.data.distritos);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Open / Close ───────────────────────────────────────────────
  const openModal = useCallback(async () => {
    setSearch('');
    setSearchResults([]);
    setMode('search'); // Always start in search mode
    setIsOpen(true);
    loadSearchState();
  }, [loadSearchState]);

  const closeModal = useCallback(() => {
    setIsOpen(false);
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
  }, []);

  // ── Selection handlers ────────────────────────────────────────
  const handleSelectDistrito = useCallback(async (distrito: SelectedDistrito) => {
    onSelect(distrito);
    await saveReciente(distrito);
    setIsOpen(false);
  }, [onSelect]);

  const handleSelectLastUsed = useCallback(() => {
    if (lastUsed) {
      handleSelectDistrito(lastUsed);
    }
  }, [lastUsed, handleSelectDistrito]);

  // Drill-down handlers
  const handleSelectDep = useCallback((dep: DepartamentoInfo) => {
    setSelectedDep(dep);
    setDrillStep('provincia');
    setSearch('');
    loadProvincias(dep.coddep);
  }, [loadProvincias]);

  const handleSelectProv = useCallback((prov: ProvinciaInfo) => {
    setSelectedProv(prov);
    setDrillStep('distrito');
    setSearch('');
    loadDistritos(prov.codprov_full);
  }, [loadDistritos]);

  const handleSelectDist = useCallback((dist: DistritoInfo) => {
    if (!selectedDep || !selectedProv) return;
    handleSelectDistrito({
      ubigeo: dist.ubigeo,
      distrito: dist.distrito,
      provincia: selectedProv.provincia,
      departamento: selectedDep.departamento,
      codprov_full: dist.codprov_full,
      coddep: dist.coddep,
    });
  }, [selectedDep, selectedProv, handleSelectDistrito]);

  const handleDrillBack = useCallback(() => {
    setSearch('');
    if (drillStep === 'distrito') {
      setDrillStep('provincia');
    } else if (drillStep === 'provincia') {
      setDrillStep('departamento');
    }
  }, [drillStep]);

  // ── Filtered lists for drill-down ─────────────────────────────
  const filteredDeps = useMemo(() => {
    if (!search.trim()) return departamentos;
    const q = normalize(search);
    return departamentos.filter((d) => normalize(d.departamento).includes(q));
  }, [departamentos, search]);

  const filteredProvs = useMemo(() => {
    if (!search.trim()) return provincias;
    const q = normalize(search);
    return provincias.filter((p) => normalize(p.provincia).includes(q));
  }, [provincias, search]);

  const filteredDists = useMemo(() => {
    if (!search.trim()) return distritos;
    const q = normalize(search);
    return distritos.filter((d) => normalize(d.distrito).includes(q));
  }, [distritos, search]);

  // ── Auto-focus search on mode/step change ──────────────────────
  // biome-ignore lint/correctness/useExhaustiveDependencies: mode and drillStep intentionally trigger refocus
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 300);
    }
  }, [isOpen, mode, drillStep]);

  // ── Search mode: determine what to show ───────────────────────
  const showRecientes = mode === 'search' && search.trim().length === 0 && recientes.length > 0;
  const showSearchResults = mode === 'search' && search.trim().length >= 1;
  const showLastUsedPill = mode === 'search' && lastUsed && (!value || value.ubigeo !== lastUsed.ubigeo);

  // Count total selectable distritos across all search results (groups + individual)
  const totalResultCount = useMemo(() => {
    let count = 0;
    for (const item of searchResults) {
      if (item.type === 'provincia_group') {
        count += item.distritos.length;
      } else {
        count += 1;
      }
    }
    return count;
  }, [searchResults]);

  // ── Drill step config ─────────────────────────────────────────
  const drillConfig = {
    departamento: {
      title: 'Departamento',
      searchPlaceholder: 'Buscar departamento...',
      showBack: false,
      breadcrumb: null as string | null,
    },
    provincia: {
      title: 'Provincia',
      searchPlaceholder: 'Buscar provincia...',
      showBack: true,
      breadcrumb: selectedDep?.departamento ?? null,
    },
    distrito: {
      title: 'Distrito',
      searchPlaceholder: 'Buscar distrito...',
      showBack: true,
      breadcrumb: selectedProv
        ? `${selectedDep?.departamento} › ${selectedProv.provincia}`
        : null,
    },
  };

  // ── Render: distrito result row ───────────────────────────────
  const renderDistritoRow = useCallback(
    (d: SelectedDistrito, isSelected: boolean, showChevron = false) => (
      <Pressable
        key={d.ubigeo}
        style={({ pressed }) => [
          styles.option,
          isSelected && styles.optionSelected,
          pressed && styles.optionPressed,
        ]}
        onPress={() => handleSelectDistrito(d)}
        accessibilityRole="button"
        accessibilityLabel={`${d.distrito}, ${d.provincia}, ${d.departamento}`}
      >
        <View style={styles.optionContent}>
          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
            {d.distrito}
          </Text>
          <Text style={styles.optionSubtext}>
            {d.provincia}, {d.departamento}
          </Text>
        </View>
        {isSelected ? (
          <Ionicons name="checkmark-circle" size={22} color={SUCCESS} />
        ) : showChevron ? (
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        ) : null}
      </Pressable>
    ),
    [handleSelectDistrito],
  );

  // ── Render: drill-down item ───────────────────────────────────
  const renderDrillItem = useCallback(
    (label: string, sublabel: string | null, isSelected: boolean, onPress: () => void, key: string) => (
      <Pressable
        key={key}
        style={({ pressed }) => [
          styles.option,
          isSelected && styles.optionSelected,
          pressed && styles.optionPressed,
        ]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <View style={styles.optionContent}>
          <Text style={[styles.optionText, isSelected && styles.optionTextSelected]}>
            {label}
          </Text>
          {sublabel && (
            <Text style={styles.optionSubtext}>{sublabel}</Text>
          )}
        </View>
        {drillStep !== 'distrito' ? (
          <Ionicons name="chevron-forward" size={18} color={TEXT_MUTED} />
        ) : isSelected ? (
          <Ionicons name="checkmark-circle" size={22} color={SUCCESS} />
        ) : null}
      </Pressable>
    ),
    [drillStep],
  );

  // ── Render: main content area ─────────────────────────────────
  const renderContent = () => {
    // Loading state (drill-down API calls only — search mode is instant)
    if (loading && mode === 'drill') {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      );
    }

    // ── Search mode ─────────────────────────────────────
    if (mode === 'search') {
      return (
        <>
          {/* Last used pill */}
          {showLastUsedPill && lastUsed && (
            <Pressable
              style={({ pressed }) => [
                styles.lastUsedPill,
                pressed && styles.lastUsedPillPressed,
              ]}
              onPress={handleSelectLastUsed}
              accessibilityRole="button"
              accessibilityLabel={`Usar ultimo: ${lastUsed.distrito}, ${lastUsed.provincia}`}
            >
              <Ionicons name="time-outline" size={16} color="#B45309" />
              <Text style={styles.lastUsedText} numberOfLines={1}>
                Usar ultimo: <Text style={styles.lastUsedBold}>{lastUsed.distrito}</Text>, {lastUsed.provincia}
              </Text>
              <Ionicons name="arrow-forward-circle" size={20} color="#B45309" />
            </Pressable>
          )}

          {/* Recientes section */}
          {showRecientes && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Ionicons name="time" size={16} color={TEXT_MUTED} />
                <Text style={styles.sectionTitle}>Recientes</Text>
              </View>
              {recientes.map((d) => renderDistritoRow(d, value?.ubigeo === d.ubigeo))}
            </View>
          )}

          {/* Search results (grouped by provincia + individual distritos) */}
          {showSearchResults && (
            <>
              {searchResults.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons name="search-outline" size={48} color={TEXT_MUTED} />
                  <Text style={styles.emptyText}>No se encontraron resultados</Text>
                  <Text style={styles.emptySubtext}>
                    Intenta con otro nombre de distrito, provincia o departamento.
                  </Text>
                </View>
              ) : (
                <>
                  {/* Total count */}
                  <View style={styles.sectionHeader}>
                    <Ionicons name="location" size={16} color={TEXT_MUTED} />
                    <Text style={styles.sectionTitle}>
                      {totalResultCount} resultado{totalResultCount !== 1 ? 's' : ''}
                    </Text>
                  </View>

                  {searchResults.map((item) => {
                    if (item.type === 'provincia_group') {
                      return (
                        <View key={`prov-${item.codprov_full}`} style={styles.provinciaGroup}>
                          {/* Provincia group header */}
                          <View style={styles.provinciaHeader}>
                            <Ionicons name="business-outline" size={18} color={primaryColor} />
                            <View style={styles.provinciaHeaderText}>
                              <Text style={styles.provinciaName}>{item.provincia}</Text>
                              <Text style={styles.provinciaSubtext}>
                                {item.departamento} — {item.distritos.length} distrito{item.distritos.length !== 1 ? 's' : ''}
                              </Text>
                            </View>
                          </View>
                          {/* All distritos in this provincia */}
                          {item.distritos.map((d) => renderDistritoRow(d, value?.ubigeo === d.ubigeo))}
                        </View>
                      );
                    }
                    // Individual distrito result
                    return renderDistritoRow(item.distrito, value?.ubigeo === item.distrito.ubigeo);
                  })}
                </>
              )}
            </>
          )}

          {/* Empty state: no search, no recientes */}
          {!showRecientes && !showSearchResults && !showLastUsedPill && (
            <View style={styles.emptyState}>
              <Ionicons name="search-outline" size={48} color={TEXT_MUTED} />
              <Text style={styles.emptyText}>Busca un distrito</Text>
              <Text style={styles.emptySubtext}>Escribe el nombre del distrito, provincia o departamento</Text>
            </View>
          )}

          {/* Fallback: switch to step-by-step drill-down */}
          <Pressable
            style={styles.switchModePill}
            onPress={() => {
              setMode('drill');
              setDrillStep('departamento');
              setSelectedDep(null);
              setSelectedProv(null);
              setSearch('');
              loadDepartamentos();
            }}
          >
            <Ionicons name="list-outline" size={16} color={BORDER_FOCUS} />
            <Text style={styles.switchModeText}>Buscar paso a paso (Depto → Prov → Dist)</Text>
          </Pressable>
        </>
      );
    }

    // ── Drill-down mode (fallback) ──────────────────────
    if (loading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={primaryColor} />
          <Text style={styles.loadingText}>Cargando...</Text>
        </View>
      );
    }

    const items =
      drillStep === 'departamento' ? filteredDeps :
      drillStep === 'provincia' ? filteredProvs :
      filteredDists;

    if (items.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Ionicons name="search" size={48} color={TEXT_MUTED} />
          <Text style={styles.emptyText}>No se encontraron resultados</Text>
        </View>
      );
    }

    if (drillStep === 'departamento') {
      return filteredDeps.map((dep) =>
        renderDrillItem(dep.departamento, null, value?.coddep === dep.coddep, () => handleSelectDep(dep), dep.coddep),
      );
    }
    if (drillStep === 'provincia') {
      return filteredProvs.map((prov) =>
        renderDrillItem(prov.provincia, null, value?.codprov_full === prov.codprov_full, () => handleSelectProv(prov), prov.codprov_full),
      );
    }
    return filteredDists.map((dist) =>
      renderDrillItem(dist.distrito, null, value?.ubigeo === dist.ubigeo, () => handleSelectDist(dist), dist.ubigeo),
    );
  };

  // ── Modal header ──────────────────────────────────────────────
  const renderHeader = () => {
    if (mode === 'search') {
      return (
        <View style={styles.modalHeader}>
          <Pressable onPress={closeModal} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="close" size={28} color={TEXT_DARK} />
          </Pressable>
          <View style={styles.headerCenter}>
            <Text style={styles.modalTitle}>Seleccionar Distrito</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>
      );
    }

    // Drill-down mode header
    const config = drillConfig[drillStep];
    return (
      <View style={styles.modalHeader}>
        {config.showBack ? (
          <Pressable onPress={handleDrillBack} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color={TEXT_DARK} />
          </Pressable>
        ) : (
          <Pressable onPress={closeModal} style={styles.headerBtn} hitSlop={12}>
            <Ionicons name="close" size={28} color={TEXT_DARK} />
          </Pressable>
        )}
        <View style={styles.headerCenter}>
          <Text style={styles.modalTitle}>{config.title}</Text>
          {config.breadcrumb && (
            <Text style={styles.breadcrumb} numberOfLines={1}>
              {config.breadcrumb}
            </Text>
          )}
        </View>
        <View style={styles.headerSpacer} />
      </View>
    );
  };

  // ── Search placeholder ────────────────────────────────────────
  const searchPlaceholder = mode === 'search'
    ? 'Buscar distrito, provincia o departamento...'
    : drillConfig[drillStep].searchPlaceholder;

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
        accessibilityRole="button"
        accessibilityLabel={value ? `Distrito seleccionado: ${displayText}` : placeholder}
      >
        <Ionicons
          name="location-outline"
          size={20}
          color={value ? primaryColor : TEXT_MUTED}
          style={styles.triggerIcon}
        />
        <View style={styles.triggerContent}>
          <Text style={[styles.triggerText, !value && styles.triggerPlaceholder]} numberOfLines={1}>
            {displayText}
          </Text>
          {displaySubtext && (
            <Text style={styles.triggerSubtext} numberOfLines={1}>
              {displaySubtext}
            </Text>
          )}
        </View>
        {value && onClear ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onClear(); }}
            hitSlop={12}
            style={styles.clearBtn}
            accessibilityLabel="Borrar seleccion"
          >
            <Ionicons name="close-circle" size={20} color={TEXT_MUTED} />
          </Pressable>
        ) : (
          <Ionicons name="chevron-down" size={20} color={TEXT_MUTED} />
        )}
      </Pressable>

      {/* Modal */}
      <Modal
        visible={isOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={closeModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={styles.flex}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          >
            {renderHeader()}

            {/* Step indicator pills (drill-down mode only) */}
            {mode === 'drill' && (
              <View style={styles.stepBar}>
                {(['departamento', 'provincia', 'distrito'] as DrillStep[]).map((s, i) => {
                  const isActive = s === drillStep;
                  const isPast =
                    (s === 'departamento' && (drillStep === 'provincia' || drillStep === 'distrito')) ||
                    (s === 'provincia' && drillStep === 'distrito');
                  return (
                    <View
                      key={s}
                      style={[
                        styles.stepPill,
                        isActive && { backgroundColor: primaryColor },
                        isPast && styles.stepPillDone,
                      ]}
                    >
                      <Text style={[
                        styles.stepPillText,
                        (isActive || isPast) && styles.stepPillTextActive,
                      ]}>
                        {i + 1}. {s === 'departamento' ? 'Depto.' : s === 'provincia' ? 'Prov.' : 'Dist.'}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            {/* Mode switch banner (when in drill mode, offer to switch back to search) */}
            {mode === 'drill' && (
              <Pressable
                style={styles.modeSwitchBanner}
                onPress={() => { setMode('search'); loadSearchState(); setSearch(''); }}
              >
                <Ionicons name="search" size={16} color="#B45309" />
                <Text style={styles.modeSwitchText}>Volver a busqueda directa</Text>
              </Pressable>
            )}

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
                  ref={searchRef}
                  style={styles.searchInput}
                  placeholder={searchPlaceholder}
                  placeholderTextColor={TEXT_MUTED}
                  value={search}
                  onChangeText={mode === 'search' ? handleSearchChange : setSearch}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  returnKeyType="search"
                />
                {search.length > 0 && (
                  <Pressable
                    onPress={() => {
                      setSearch('');
                      if (mode === 'search') setSearchResults([]);
                    }}
                    hitSlop={8}
                  >
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
              {renderContent()}
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  // Trigger button
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    padding: 14,
    minHeight: 52,
    backgroundColor: BG_INPUT,
  },
  triggerSelected: {
    borderColor: SUCCESS,
    backgroundColor: SUCCESS_BG,
  },
  triggerPressed: { opacity: 0.8 },
  triggerIcon: { marginRight: 10 },
  triggerContent: { flex: 1 },
  triggerText: {
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  triggerPlaceholder: { color: TEXT_MUTED },
  triggerSubtext: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    marginTop: 2,
  },
  clearBtn: { padding: 4 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  headerBtn: { padding: 4 },
  headerCenter: { flex: 1, alignItems: 'center' },
  modalTitle: {
    fontSize: 18,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  breadcrumb: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    marginTop: 2,
  },
  headerSpacer: { width: 36 },

  // Step indicator (drill mode)
  stepBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  stepPill: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 20,
    backgroundColor: BG_INPUT,
    alignItems: 'center',
  },
  stepPillDone: { backgroundColor: SUCCESS_BG },
  stepPillText: {
    fontSize: 11,
    color: TEXT_MUTED,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  stepPillTextActive: { color: '#FFFFFF' },

  // Mode switch banner
  modeSwitchBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: BRAND_YELLOW_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  modeSwitchText: {
    flex: 1,
    fontSize: 13,
    color: '#B45309',
    fontFamily: FONT_REGULAR,
  },

  // Search
  searchWrapper: { paddingHorizontal: 16, paddingVertical: 12 },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 14,
    paddingHorizontal: 14,
    backgroundColor: BG_INPUT,
    minHeight: 48,
  },
  searchContainerFocused: {
    borderColor: BORDER_FOCUS,
    backgroundColor: '#FFFFFF',
  },
  searchIcon: { marginRight: 10 },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },

  // Last used pill
  lastUsedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW_BG,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  lastUsedPillPressed: { opacity: 0.7 },
  lastUsedText: {
    flex: 1,
    fontSize: 14,
    color: '#92400E',
    fontFamily: FONT_REGULAR,
  },
  lastUsedBold: {
    fontFamily: FONT,
    color: '#78350F',
  },

  // Sections
  section: { marginBottom: 16 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // List
  list: { flex: 1 },
  listContent: { paddingBottom: 24 },

  // Option item
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    marginHorizontal: 8,
    marginBottom: 4,
    backgroundColor: '#FFFFFF',
    minHeight: 52,
  },
  optionSelected: { backgroundColor: SUCCESS_BG },
  optionPressed: { backgroundColor: BG_INPUT },
  optionContent: { flex: 1 },
  optionText: {
    fontSize: 16,
    color: TEXT_DARK,
    fontFamily: FONT_REGULAR,
  },
  optionTextSelected: {
    color: '#15803d',
    fontFamily: FONT,
  },
  optionSubtext: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    marginTop: 2,
  },

  // States
  loadingState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 12,
  },
  loadingText: {
    fontSize: 15,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
  },
  loadingSubtext: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  emptySubtext: {
    fontSize: 13,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  // Provincia group (search results)
  provinciaGroup: {
    marginBottom: 12,
  },
  provinciaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    marginHorizontal: 8,
    marginBottom: 4,
  },
  provinciaHeaderText: {
    flex: 1,
  },
  provinciaName: {
    fontSize: 15,
    color: TEXT_DARK,
    fontFamily: FONT,
  },
  provinciaSubtext: {
    fontSize: 12,
    color: TEXT_MUTED,
    fontFamily: FONT_REGULAR,
    marginTop: 1,
  },

  // Switch mode pill (bottom of search mode)
  switchModePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginHorizontal: 16,
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: BG_INPUT,
    borderWidth: 1,
    borderColor: BORDER,
  },
  switchModeText: {
    fontSize: 13,
    color: BORDER_FOCUS,
    fontFamily: FONT_REGULAR,
  },
});
