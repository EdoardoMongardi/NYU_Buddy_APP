#!/usr/bin/env tsx
/**
 * mapbox-create-style.ts
 *
 * Creates or updates a custom Mapbox style based on `light-v11` that includes
 * the NYU buildings tileset as violet fill + outline layers.
 *
 * Required env vars:
 *   MAPBOX_ACCESS_TOKEN  – secret token (sk.*) with styles:write scope
 *   MAPBOX_USERNAME      – your Mapbox username
 *
 * Optional env var:
 *   MAPBOX_STYLE_ID      – if set, updates this style instead of creating new
 *
 * Usage:
 *   npx tsx scripts/mapbox-create-style.ts
 */

const TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const USERNAME = process.env.MAPBOX_USERNAME;
const EXISTING_STYLE_ID = process.env.MAPBOX_STYLE_ID || '';
const TILESET_ID_SUFFIX = 'nyu-buildings';
const TILESET_ID = `${USERNAME}.${TILESET_ID_SUFFIX}`;
const STYLE_NAME = 'NYU Buddy Campus';

if (!TOKEN) {
  console.error('❌ Missing MAPBOX_ACCESS_TOKEN env var (needs sk.* secret token with styles:write)');
  process.exit(1);
}
if (!USERNAME) {
  console.error('❌ Missing MAPBOX_USERNAME env var');
  process.exit(1);
}

const BASE = 'https://api.mapbox.com';

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}access_token=${TOKEN}`;
  return fetch(url, init);
}

// ─── Fetch base style ────────────────────────────────────────────────────────

async function fetchBaseStyle(): Promise<Record<string, unknown>> {
  console.log('📥 Fetching base style (mapbox/light-v11)...');
  const resp = await apiFetch('/styles/v1/mapbox/light-v11');
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`❌ Failed to fetch base style (${resp.status}): ${text}`);
    process.exit(1);
  }
  return resp.json() as Promise<Record<string, unknown>>;
}

// ─── Find insertion anchor ───────────────────────────────────────────────────

interface StyleLayer {
  id: string;
  type: string;
  'source-layer'?: string;
}

function findFirstSymbolLayerId(layers: StyleLayer[]): string | undefined {
  for (const l of layers) {
    if (l.type === 'symbol') return l.id;
  }
  return undefined;
}

// ─── Inject NYU layers ──────────────────────────────────────────────────────

function injectNyuLayers(style: Record<string, unknown>): Record<string, unknown> {
  const sources = (style.sources || {}) as Record<string, unknown>;
  const layers = (style.layers || []) as StyleLayer[];

  // Add tileset as vector source
  sources[`${TILESET_ID_SUFFIX}`] = {
    type: 'vector',
    url: `mapbox://${TILESET_ID}`,
  };

  // Find where to insert (before first symbol/label layer)
  const beforeId = findFirstSymbolLayerId(layers);
  const insertIdx = beforeId
    ? layers.findIndex(l => l.id === beforeId)
    : layers.length;

  // NYU building fill layer
  const fillLayer = {
    id: 'nyu-building-fill',
    type: 'fill',
    source: TILESET_ID_SUFFIX,
    'source-layer': 'nyu_buildings',
    minzoom: 12,
    paint: {
      'fill-color': '#7c3aed',
      'fill-opacity': [
        'interpolate', ['linear'], ['zoom'],
        12, 0.08,
        14, 0.16,
        16, 0.22,
      ],
    },
  };

  // NYU building outline layer
  const outlineLayer = {
    id: 'nyu-building-outline',
    type: 'line',
    source: TILESET_ID_SUFFIX,
    'source-layer': 'nyu_buildings',
    minzoom: 13,
    paint: {
      'line-color': '#6d28d9',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        13, 0.5,
        15, 1.5,
        16, 2,
      ],
      'line-opacity': 0.5,
    },
  };

  // Insert before labels
  layers.splice(insertIdx, 0, fillLayer as unknown as StyleLayer, outlineLayer as unknown as StyleLayer);

  return {
    ...style,
    sources,
    layers,
    name: STYLE_NAME,
  };
}

// ─── Create or update style ─────────────────────────────────────────────────

async function createOrUpdateStyle(style: Record<string, unknown>): Promise<string> {
  // Remove read-only fields before posting
  const cleaned = { ...style };
  delete cleaned.created;
  delete cleaned.modified;
  delete cleaned.id;
  delete cleaned.owner;
  delete cleaned.visibility;

  if (EXISTING_STYLE_ID) {
    console.log(`\n🔄 Updating existing style: ${EXISTING_STYLE_ID}...`);
    const resp = await apiFetch(
      `/styles/v1/${USERNAME}/${EXISTING_STYLE_ID}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleaned),
      },
    );
    if (!resp.ok) {
      const text = await resp.text();
      console.error(`❌ Update failed (${resp.status}): ${text}`);
      process.exit(1);
    }
    const result = await resp.json() as Record<string, unknown>;
    return result.id as string;
  }

  // Check if a style with the same name already exists
  console.log('\n🔍 Checking for existing styles...');
  const listResp = await apiFetch(`/styles/v1/${USERNAME}`);
  if (listResp.ok) {
    const styles = await listResp.json() as Array<{ id: string; name: string }>;
    const existing = styles.find(s => s.name === STYLE_NAME);
    if (existing) {
      console.log(`   Found existing style "${STYLE_NAME}" (${existing.id}), updating...`);
      const resp = await apiFetch(
        `/styles/v1/${USERNAME}/${existing.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cleaned),
        },
      );
      if (!resp.ok) {
        const text = await resp.text();
        console.error(`❌ Update failed (${resp.status}): ${text}`);
        process.exit(1);
      }
      const result = await resp.json() as Record<string, unknown>;
      return result.id as string;
    }
  }

  console.log('\n🆕 Creating new style...');
  const resp = await apiFetch(
    `/styles/v1/${USERNAME}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cleaned),
    },
  );
  if (!resp.ok) {
    const text = await resp.text();
    console.error(`❌ Create failed (${resp.status}): ${text}`);
    process.exit(1);
  }
  const result = await resp.json() as Record<string, unknown>;
  return result.id as string;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🎨 Mapbox Style Creator`);
  console.log(`   Username: ${USERNAME}`);
  console.log(`   Tileset:  ${TILESET_ID}`);
  console.log(`   Base:     mapbox/light-v11`);

  const baseStyle = await fetchBaseStyle();
  const customStyle = injectNyuLayers(baseStyle);
  const styleId = await createOrUpdateStyle(customStyle);

  const styleUrl = `mapbox://styles/${USERNAME}/${styleId}`;
  console.log(`\n✅ Style ready!`);
  console.log(`   ID:    ${styleId}`);
  console.log(`   URL:   ${styleUrl}`);
  console.log(`   Studio: https://studio.mapbox.com/styles/${USERNAME}/${styleId}/edit/`);
  console.log(`\n   👉 Set this in your .env.local:`);
  console.log(`   NEXT_PUBLIC_MAPBOX_STYLE=${styleUrl}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
