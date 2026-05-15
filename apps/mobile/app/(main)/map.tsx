/**
 * MapScreen — Mapa de contactos del cuaderno de campo.
 *
 * Muestra los contactos como pins sobre un mapa de Perú.
 * Usa MapLibre React Native v11 (API: Map, Camera, GeoJSONSource, Layer).
 *
 * Basemap: CartoDB Voyager (raster, siempre visible).
 * Borders admin: Tegola vector tiles del backend (distritos/departamentos).
 * Pins: GeoJSONSource dinámico con CircleLayer coloreado por estado.
 */

import { useFocusEffect } from '@react-navigation/native';
import MapLibreGL, {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
} from '@maplibre/maplibre-react-native';

// Required for non-Mapbox tile sources — must be called before any Map renders
MapLibreGL.setAccessToken(null);
import type { StyleSpecification } from '@maplibre/maplibre-gl-style-spec';
import type { NativeSyntheticEvent } from 'react-native';
import type { PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { ESTADO_META } from '@/lib/contact-estados';
import { contactsToGeoJSON, PERU_BBOX } from '@/lib/map-config';
import type { ContactGeoJSON } from '@/lib/map-config';
import { listContacts, type Contact } from '@/lib/offline-queue/contacts';

// Tegola vector tile endpoint — separate from TILE_URL (style JSON) in map-config.
const TEGOLA_TILE_URL = 'https://tiles.gobernakarte.com/maps/pe/{z}/{x}/{y}.vector.pbf';

// ─── Map style: raster basemap + vector admin borders ────────────────────────
// The contacts GeoJSONSource is added as a React child, not here.
const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution:
        '© <a href="https://carto.com">CARTO</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    },
    'tegola-admin': {
      type: 'vector',
      tiles: [TEGOLA_TILE_URL],
    },
  },
  layers: [
    {
      id: 'basemap-raster',
      type: 'raster',
      source: 'carto-voyager',
    },
    {
      id: 'distritos-borders',
      type: 'line',
      source: 'tegola-admin',
      'source-layer': 'distritos',
      paint: {
        'line-color': '#94A3B8',
        'line-width': 0.5,
        'line-opacity': 0.6,
      },
    },
    {
      id: 'departamentos-borders',
      type: 'line',
      source: 'tegola-admin',
      'source-layer': 'departamentos',
      paint: {
        'line-color': '#64748B',
        'line-width': 1,
        'line-opacity': 0.8,
      },
    },
  ],
};

// ─── Color match expression for estado ───────────────────────────────────────
// MapLibre match expression: ["match", ["get", "estado"], val1, color1, ..., defaultColor]
const ESTADO_CIRCLE_COLOR = [
  'match',
  ['get', 'estado'],
  'apoya',   ESTADO_META.apoya.color,
  'duda',    ESTADO_META.duda.color,
  'no',      ESTADO_META.no.color,
  'no_esta', ESTADO_META.no_esta.color,
  '#94A3B8', // fallback
] as const;

const CONTACTS_SOURCE_ID = 'contacts-source';

export default function MapScreen() {
  const router = useRouter();
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Refresh contacts whenever the screen is focused
  useFocusEffect(
    useCallback(() => {
      let active = true;
      listContacts().then((rows) => {
        if (active) setContacts(rows);
      });
      return () => {
        active = false;
      };
    }, []),
  );

  const geoJSON: ContactGeoJSON = contactsToGeoJSON(contacts);

  // Compute bounds from contacts with coords; fall back to PERU_BBOX
  const contactsWithCoords = contacts.filter(
    (c) => c.lat != null && c.lng != null,
  );
  const initialBounds =
    contactsWithCoords.length > 0
      ? ([
          Math.min(...contactsWithCoords.map((c) => c.lng as number)),
          Math.min(...contactsWithCoords.map((c) => c.lat as number)),
          Math.max(...contactsWithCoords.map((c) => c.lng as number)),
          Math.max(...contactsWithCoords.map((c) => c.lat as number)),
        ] as [number, number, number, number])
      : PERU_BBOX;

  const handleContactPress = useCallback(
    (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const feature = event.nativeEvent.features?.[0];
      if (!feature) return;
      const id = feature.properties?.id as string | undefined;
      if (!id) return;
      router.push(`/(main)/contact/${id}`);
    },
    [router],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Map mapStyle={MAP_STYLE} style={styles.map} logo={false}>
        <Camera
          initialViewState={{
            bounds: initialBounds,
            padding: { top: 40, right: 40, bottom: 40, left: 40 },
          }}
        />

        {/* Contact pins */}
        <GeoJSONSource
          id={CONTACTS_SOURCE_ID}
          data={geoJSON}
          onPress={handleContactPress}
        >
          <Layer
            id="contacts-circles"
            type="circle"
            paint={{
              'circle-color': ESTADO_CIRCLE_COLOR as unknown as string,
              'circle-radius': 7,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': '#FFFFFF',
            }}
          />
        </GeoJSONSource>
      </Map>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  map: {
    flex: 1,
  },
});
