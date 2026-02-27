/**
 * tile-filter — Decodifica un tile MVT, filtra features por campaign_id,
 * y re-encoda el resultado.
 *
 * Layers base (departamentos, provincias, distritos) pasan sin filtrar (data publica de Peru).
 * Layers con campaign scope (priority_*, campaign_sectors) filtran por campaign_id.
 *
 * Implementation: Uses raw protobuf manipulation via Pbf for both decode and encode.
 * MVT spec: https://github.com/mapbox/vector-tile-spec/blob/master/2.1/vector_tile.proto
 *
 * MVT Protobuf field tags:
 *   Tile:  field 3 = layers (repeated)
 *   Layer: field 1 = name, field 2 = features, field 3 = keys, field 4 = values,
 *          field 5 = extent, field 15 = version
 *   Feature: field 1 = id, field 2 = tags, field 3 = type, field 4 = geometry
 *   Value: field 1 = string, field 2 = float, field 3 = double,
 *          field 4 = int64, field 5 = uint64, field 6 = sint64, field 7 = bool
 */
import Pbf from "pbf";

const CAMPAIGN_SCOPED_LAYERS = new Set([
  "priority_departamentos",
  "priority_provincias",
  "priority_distritos",
  "campaign_sectors",
  "brigadista_domicilio_campo",
  "brigadista_trabajo_campo",
  "brigadista_domicilio_digital",
  "brigadista_trabajo_digital",
]);

/**
 * Filters an MVT tile buffer so that campaign-scoped layers only contain
 * features matching the given campaignId. Base layers pass through unmodified.
 *
 * Returns the filtered tile as a Buffer. If input is empty or has no layers,
 * returns the input unchanged.
 */
export function filterMvtByCampaign(
  tileBuffer: Buffer | Uint8Array,
  campaignId: string,
): Buffer {
  if (!tileBuffer || tileBuffer.length === 0) {
    return Buffer.from(tileBuffer);
  }

  const pbfIn = new Pbf(tileBuffer);
  const layers = readTileLayers(pbfIn);

  const pbfOut = new Pbf();

  for (const layer of layers) {
    if (!CAMPAIGN_SCOPED_LAYERS.has(layer.name)) {
      // Base layer — copy raw bytes without parsing features
      writeRawLayer(pbfOut, layer.rawBytes);
    } else {
      // Campaign-scoped layer — decode, filter, re-encode
      const filtered = filterLayerFeatures(layer, campaignId);
      if (filtered) {
        writeRawLayer(pbfOut, filtered);
      }
    }
  }

  return Buffer.from(pbfOut.finish());
}

// ── Internal types ──────────────────────────────────────────────────

type RawLayer = {
  name: string;
  rawBytes: Uint8Array;
};

// ── MVT Decoding (layer-level) ──────────────────────────────────────

/**
 * Reads a tile and extracts each layer as raw bytes + name.
 * Does NOT fully parse features of base layers (zero overhead for pass-through).
 */
function readTileLayers(pbf: Pbf): RawLayer[] {
  const layers: RawLayer[] = [];

  // Read the tile message — field 3 = layers
  pbf.readFields((tag: number, _tile: null, tilePbf: Pbf) => {
    if (tag === 3) {
      // Capture the raw bytes of this layer sub-message
      const start = tilePbf.pos;
      // We need the layer name to decide if we should filter
      // Read just the name field (field 1) from the layer
      const layerBytes = tilePbf.readBytes();
      const layerPbf = new Pbf(layerBytes);

      let name = "";
      layerPbf.readFields((ltag: number, _: null, lp: Pbf) => {
        if (ltag === 1) name = lp.readString();
        // Skip other fields — we just need the name
      }, null);

      layers.push({ name, rawBytes: layerBytes });
    }
  }, null);

  return layers;
}

// ── MVT Feature Filtering ───────────────────────────────────────────

/**
 * Fully parses a campaign-scoped layer, filters features by campaign_id,
 * and re-encodes the layer with only matching features.
 *
 * Returns the re-encoded layer bytes, or null if no features match.
 */
function filterLayerFeatures(
  layer: RawLayer,
  campaignId: string,
): Uint8Array | null {
  const pbf = new Pbf(layer.rawBytes);

  // Parse the full layer structure
  let version = 2;
  let name = "";
  let extent = 4096;
  const keys: string[] = [];
  const values: Uint8Array[] = []; // raw value message bytes
  const features: Uint8Array[] = []; // raw feature message bytes
  const featureTags: number[][] = []; // decoded tag arrays per feature

  pbf.readFields((tag: number, _: null, lp: Pbf) => {
    switch (tag) {
      case 15: version = lp.readVarint(); break;
      case 1: name = lp.readString(); break;
      case 5: extent = lp.readVarint(); break;
      case 3: keys.push(lp.readString()); break;
      case 4: values.push(lp.readBytes()); break;
      case 2: {
        const featureBytes = lp.readBytes();
        features.push(featureBytes);
        // Parse tags from the feature to look for campaign_id
        const fPbf = new Pbf(featureBytes);
        let tags: number[] = [];
        fPbf.readFields((ftag: number, __: null, fp: Pbf) => {
          if (ftag === 2) {
            tags = fp.readPackedVarint();
          }
        }, null);
        featureTags.push(tags);
        break;
      }
    }
  }, null);

  // Find the key index for "campaign_id"
  const campaignKeyIdx = keys.indexOf("campaign_id");
  if (campaignKeyIdx === -1) {
    // No campaign_id key in this layer — pass through everything
    // (shouldn't happen for campaign-scoped layers, but be safe)
    return layer.rawBytes;
  }

  // Find the value index(es) that match our campaignId
  const matchingValueIndices = new Set<number>();
  for (let i = 0; i < values.length; i++) {
    const val = readValueString(values[i]!);
    if (val === campaignId) {
      matchingValueIndices.add(i);
    }
  }

  // Filter features: keep only those where tags contain campaign_id=campaignId
  const matchingFeatures: Uint8Array[] = [];
  for (let i = 0; i < features.length; i++) {
    const tags = featureTags[i]!;
    if (featureMatchesCampaign(tags, campaignKeyIdx, matchingValueIndices)) {
      matchingFeatures.push(features[i]!);
    }
  }

  // If no features match, return null (empty layer can be skipped)
  if (matchingFeatures.length === 0) {
    return null;
  }

  // Re-encode the layer with filtered features
  const out = new Pbf();

  // version (field 15)
  out.writeVarintField(15, version);
  // name (field 1)
  out.writeStringField(1, name);
  // extent (field 5)
  out.writeVarintField(5, extent);
  // keys (field 3)
  for (const key of keys) {
    out.writeStringField(3, key);
  }
  // values (field 4)
  for (const val of values) {
    out.writeBytesField(4, val);
  }
  // features (field 2) — only the matching ones
  for (const feat of matchingFeatures) {
    out.writeBytesField(2, feat);
  }

  return out.finish();
}

/**
 * Check if a feature's tags contain campaign_id matching one of the target values.
 * Tags are encoded as pairs: [keyIdx, valueIdx, keyIdx, valueIdx, ...]
 */
function featureMatchesCampaign(
  tags: number[],
  campaignKeyIdx: number,
  matchingValueIndices: Set<number>,
): boolean {
  for (let i = 0; i < tags.length - 1; i += 2) {
    if (tags[i] === campaignKeyIdx && matchingValueIndices.has(tags[i + 1]!)) {
      return true;
    }
  }
  return false;
}

/**
 * Read a string value from a raw MVT Value message.
 * MVT Value field 1 = string_value.
 */
function readValueString(bytes: Uint8Array): string | null {
  const pbf = new Pbf(bytes);
  let str: string | null = null;
  pbf.readFields((tag: number, _: null, vp: Pbf) => {
    if (tag === 1) str = vp.readString();
  }, null);
  return str;
}

// ── MVT Encoding helpers ────────────────────────────────────────────

/** Write raw layer bytes as a tile layer message (field 3). */
function writeRawLayer(out: Pbf, layerBytes: Uint8Array): void {
  out.writeBytesField(3, layerBytes);
}
