"use client";

import { memo, useMemo } from "react";
import { Map as MapLibre, Source, Layer } from "@vis.gl/react-maplibre";
import type { FillLayerSpecification, LineLayerSpecification } from "maplibre-gl";

interface SlideMapProps {
  geojson: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  bbox: [number, number, number, number]; // [w, s, e, n]
  accentColor?: string;
  height?: string;
}

const DARK_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

function SlideMapInner({
  geojson,
  bbox,
  accentColor = "#fbbf24",
  height = "100%",
}: SlideMapProps) {
  const [w, s, e, n] = bbox;
  const cx = (w + e) / 2;
  const cy = (s + n) / 2;
  const span = Math.max(n - s, e - w);
  const zoom = Math.max(6, Math.min(12, Math.log2(360 / Math.max(span, 0.0001)) - 1));

  const fillPaint = useMemo<FillLayerSpecification["paint"]>(
    () => ({ "fill-color": accentColor, "fill-opacity": 0.18 }),
    [accentColor]
  );

  const linePaint = useMemo<LineLayerSpecification["paint"]>(
    () => ({ "line-color": accentColor, "line-width": 2.5, "line-opacity": 0.9 }),
    [accentColor]
  );

  const geojsonData = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [{ type: "Feature", properties: {}, geometry: geojson }],
    }),
    [geojson]
  );

  return (
    <div
      style={{
        height,
        width: "100%",
        borderRadius: "12px",
        overflow: "hidden",
      }}
    >
      <MapLibre
        mapStyle={DARK_STYLE}
        initialViewState={{ longitude: cx, latitude: cy, zoom }}
        interactive={false}
        attributionControl={false}
      >
        <Source id="district-src" type="geojson" data={geojsonData}>
          <Layer id="district-fill" type="fill" paint={fillPaint} />
          <Layer id="district-line" type="line" paint={linePaint} />
        </Source>
      </MapLibre>
    </div>
  );
}

export const SlideMap = memo(SlideMapInner);
