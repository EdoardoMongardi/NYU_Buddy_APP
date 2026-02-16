#!/usr/bin/env tsx
/**
 * mapbox-upload-tileset.ts
 *
 * Uploads nyu_buildings.geojson as a Mapbox tileset via the Mapbox Tiling
 * Service (MTS) API.
 *
 * Required env vars:
 *   MAPBOX_ACCESS_TOKEN  – secret token (sk.*) with tilesets:write scope
 *   MAPBOX_USERNAME      – your Mapbox username (e.g. "edoardo2005")
 *
 * Usage:
 *   npx tsx scripts/mapbox-upload-tileset.ts
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { FeatureCollection } from 'geojson';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const GEOJSON_PATH = resolve(__dirname, 'output', 'nyu_buildings.geojson');

const TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const USERNAME = process.env.MAPBOX_USERNAME;
const TILESET_SOURCE_ID = 'nyu-buildings-src';
const TILESET_ID_SUFFIX = 'nyu-buildings';

if (!TOKEN) {
  console.error('❌ Missing MAPBOX_ACCESS_TOKEN env var (needs sk.* secret token with tilesets:write)');
  process.exit(1);
}
if (!USERNAME) {
  console.error('❌ Missing MAPBOX_USERNAME env var');
  process.exit(1);
}

const BASE = 'https://api.mapbox.com';
const TILESET_ID = `${USERNAME}.${TILESET_ID_SUFFIX}`;

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}access_token=${TOKEN}`;
  const resp = await fetch(url, init);
  return resp;
}

// ─── Step 1: Upload tileset source (line-delimited GeoJSON) ──────────────────

async function uploadTilesetSource(): Promise<void> {
  console.log('\n📤 Step 1: Uploading tileset source...');

  if (!existsSync(GEOJSON_PATH)) {
    console.error(`❌ GeoJSON not found: ${GEOJSON_PATH}`);
    console.error('   Run scripts/fetch-nyu-footprints-soda.ts first.');
    process.exit(1);
  }

  const fc: FeatureCollection = JSON.parse(readFileSync(GEOJSON_PATH, 'utf-8'));
  // MTS requires line-delimited GeoJSON (one feature per line, no wrapper)
  const ldGeoJSON = fc.features.map(f => JSON.stringify(f)).join('\n');

  // Use multipart/form-data with a "file" field
  const formData = new FormData();
  formData.append('file', new Blob([ldGeoJSON], { type: 'application/x-ndjson' }), 'nyu_buildings.ldgeojson');

  const resp = await apiFetch(
    `/tilesets/v1/sources/${USERNAME}/${TILESET_SOURCE_ID}`,
    { method: 'PUT', body: formData },
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`❌ Upload failed (${resp.status}): ${text}`);
    process.exit(1);
  }

  const result = await resp.json();
  console.log(`   ✅ Source uploaded: ${result.id || TILESET_SOURCE_ID}`);
  console.log(`   Files: ${result.files ?? '?'}, Size: ${result.file_size ?? '?'} bytes`);
}

// ─── Step 2: Create or update tileset ────────────────────────────────────────

async function createOrUpdateTileset(): Promise<void> {
  console.log('\n🔧 Step 2: Creating/updating tileset...');

  const recipe = {
    version: 1,
    layers: {
      nyu_buildings: {
        source: `mapbox://tileset-source/${USERNAME}/${TILESET_SOURCE_ID}`,
        minzoom: 12,
        maxzoom: 16,
      },
    },
  };

  // Check if tileset exists
  const checkResp = await apiFetch(`/tilesets/v1/${TILESET_ID}`);

  if (checkResp.ok) {
    // Tileset exists → update recipe
    console.log('   Tileset exists, updating recipe...');
    const patchResp = await apiFetch(
      `/tilesets/v1/${TILESET_ID}/recipe`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(recipe),
      },
    );
    if (!patchResp.ok) {
      const text = await patchResp.text();
      console.error(`❌ Recipe update failed (${patchResp.status}): ${text}`);
      process.exit(1);
    }
    console.log('   ✅ Recipe updated');
  } else {
    // Create new tileset
    console.log('   Creating new tileset...');
    const createResp = await apiFetch(
      `/tilesets/v1/${TILESET_ID}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipe,
          name: 'NYU Buildings',
          description: 'Building footprints for NYU Manhattan + Brooklyn campuses',
          private: false,
        }),
      },
    );
    if (!createResp.ok) {
      const text = await createResp.text();
      console.error(`❌ Create failed (${createResp.status}): ${text}`);
      process.exit(1);
    }
    console.log('   ✅ Tileset created');
  }
}

// ─── Step 3: Publish tileset ─────────────────────────────────────────────────

async function publishTileset(): Promise<void> {
  console.log('\n🚀 Step 3: Publishing tileset...');

  const resp = await apiFetch(
    `/tilesets/v1/${TILESET_ID}/publish`,
    { method: 'POST' },
  );

  if (!resp.ok) {
    const text = await resp.text();
    console.error(`❌ Publish failed (${resp.status}): ${text}`);
    process.exit(1);
  }

  const result = await resp.json();
  console.log(`   ✅ Publishing started (job: ${result.jobId || 'unknown'})`);

  // Poll for completion
  console.log('   Waiting for tileset to be ready...');
  for (let i = 0; i < 30; i++) {
    await sleep(5000);
    const statusResp = await apiFetch(`/tilesets/v1/${TILESET_ID}/jobs`);
    if (statusResp.ok) {
      const jobs = await statusResp.json();
      const latest = Array.isArray(jobs) && jobs.length > 0 ? jobs[0] : null;
      if (latest) {
        console.log(`   Job status: ${latest.stage} (${latest.tilesetId})`);
        if (latest.stage === 'success') {
          console.log('   ✅ Tileset ready!');
          break;
        }
        if (latest.stage === 'failed') {
          console.error(`   ❌ Job failed: ${JSON.stringify(latest.errors || latest)}`);
          process.exit(1);
        }
      }
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n🗺️  Mapbox Tileset Uploader`);
  console.log(`   Username:  ${USERNAME}`);
  console.log(`   Tileset:   ${TILESET_ID}`);
  console.log(`   Source:    ${GEOJSON_PATH}`);

  await uploadTilesetSource();
  await createOrUpdateTileset();
  await publishTileset();

  console.log(`\n✅ Done! Tileset ID: ${TILESET_ID}`);
  console.log(`   Studio: https://studio.mapbox.com/tilesets/${TILESET_ID}/`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
