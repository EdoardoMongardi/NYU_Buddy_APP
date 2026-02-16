#!/usr/bin/env tsx
/**
 * fetch-nyu-footprints-soda.ts
 *
 * Fetches real building footprint polygons from NYC Open Data (SODA API)
 * for every NYU building in the canonical list.
 *
 * Strategy:
 *   1. For each building, query within_circle(the_geom, lat, lng, radius)
 *   2. Do point-in-polygon: pick the footprint that CONTAINS the building point
 *   3. If multiple contain, pick closest centroid
 *   4. If none contain, pick closest centroid with lower confidence
 *   5. Deduplicate: if two buildings map to the same polygon, keep both names
 *
 * Usage:
 *   npx tsx scripts/fetch-nyu-footprints-soda.ts
 *   npx tsx scripts/fetch-nyu-footprints-soda.ts --force   # bust cache
 *
 * Outputs:
 *   scripts/output/nyu_buildings.geojson
 *   scripts/output/match-report.json
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import centroid from '@turf/centroid';
import area from '@turf/area';
import simplify from '@turf/simplify';
import { point, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from 'geojson';

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(__dirname, 'cache');
const OUTPUT_DIR = resolve(__dirname, 'output');
const GEOJSON_OUT = resolve(OUTPUT_DIR, 'nyu_buildings.geojson');
const REPORT_OUT = resolve(OUTPUT_DIR, 'match-report.json');

// ─── Config ──────────────────────────────────────────────────────────────────

// NYC Open Data Building Footprints — verified working dataset IDs
const SODA_DATASET_IDS = ['5zhs-2jue', 'nqwf-w8eh'];
const SODA_BASE = 'https://data.cityofnewyork.us/resource';
const SEARCH_RADIUS_M = 120;
const EXPANDED_RADIUS_M = 200;
const THROTTLE_MS = 500;
const FORCE = process.argv.includes('--force');

// ─── Types ───────────────────────────────────────────────────────────────────

interface NyuBuilding {
  id: string;
  name: string;
  address: string;
  campus: 'manhattan' | 'brooklyn';
  tier: 1 | 2;
  lat: number;
  lng: number;
}

interface MatchReport {
  buildingId: string;
  buildingName: string;
  campus: string;
  candidateCount: number;
  strategy: 'point-in-polygon' | 'jitter-pip' | 'nearest-centroid' | 'expanded-search' | 'failed';
  confidence: number;
  polygonArea: number;
  warnings: string[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── SODA API ────────────────────────────────────────────────────────────────

let workingDatasetId: string | null = null;

async function sodaQuery(lat: number, lng: number, radiusM: number): Promise<Feature<Polygon | MultiPolygon>[]> {
  const idsToTry = workingDatasetId ? [workingDatasetId] : SODA_DATASET_IDS;

  for (const dsId of idsToTry) {
    const url = `${SODA_BASE}/${dsId}.geojson?$where=within_circle(the_geom,${lat},${lng},${radiusM})&$limit=100`;
    try {
      const resp = await fetch(url);
      if (!resp.ok) {
        if (resp.status === 404) continue; // try next dataset ID
        const text = await resp.text();
        console.warn(`    SODA ${resp.status} for dataset ${dsId}: ${text.slice(0, 200)}`);
        continue;
      }
      const data = await resp.json() as FeatureCollection;
      if (data.features && data.features.length >= 0) {
        if (!workingDatasetId) {
          workingDatasetId = dsId;
          console.log(`  Using SODA dataset: ${dsId}`);
        }
        return data.features as Feature<Polygon | MultiPolygon>[];
      }
    } catch (err: any) {
      console.warn(`    SODA error for ${dsId}: ${err.message}`);
    }
  }

  return [];
}

// ─── Cache ───────────────────────────────────────────────────────────────────

function getCachePath(buildingId: string, radius: number): string {
  return resolve(CACHE_DIR, `soda_${buildingId}_${radius}m.json`);
}

function readCache(path: string): Feature<Polygon | MultiPolygon>[] | null {
  if (FORCE) return null;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return null; }
}

function writeCache(path: string, data: Feature<Polygon | MultiPolygon>[]): void {
  writeFileSync(path, JSON.stringify(data), 'utf-8');
}

async function fetchWithCache(buildingId: string, lat: number, lng: number, radiusM: number): Promise<Feature<Polygon | MultiPolygon>[]> {
  const cachePath = getCachePath(buildingId, radiusM);
  const cached = readCache(cachePath);
  if (cached) return cached;

  await sleep(THROTTLE_MS);
  const features = await sodaQuery(lat, lng, radiusM);
  writeCache(cachePath, features);
  return features;
}

// ─── Matching ────────────────────────────────────────────────────────────────

interface MatchResult {
  feature: Feature<Polygon | MultiPolygon>;
  strategy: 'point-in-polygon' | 'jitter-pip' | 'nearest-centroid' | 'expanded-search';
  confidence: number;
  distance: number;
  area: number;
}

// At ~40.73° latitude: 1° lat ≈ 111 km, 1° lng ≈ 84 km
const JITTER_OFFSETS_M = [10, 18]; // conservative radii to avoid adjacent buildings
const JITTER_DIRS = [
  [0, 1], [1, 1], [1, 0], [1, -1],
  [0, -1], [-1, -1], [-1, 0], [-1, 1],
];

/** Try point-in-polygon at the original point + jittered points around it. */
function findContaining(
  candidates: Feature<Polygon | MultiPolygon>[],
  lat: number,
  lng: number,
): { feature: Feature<Polygon | MultiPolygon>; jittered: boolean } | null {
  // Try original point first
  const pt0 = point([lng, lat]);
  const direct = candidates.filter(f => {
    try { return booleanPointInPolygon(pt0, f as Feature<Polygon>); } catch { return false; }
  });
  if (direct.length > 0) {
    // Multiple containing polygons: pick the one whose centroid is closest
    // to the original point AND has reasonable area
    const picked = pickBestForPoint(direct, lat, lng);
    return { feature: picked, jittered: false };
  }

  // Jitter: try offset points in 8 directions at increasing radii
  // Collect ALL unique polygons hit by any jittered point, then pick
  // the one whose centroid is CLOSEST to the original point.
  const hitSet = new Map<string, Feature<Polygon | MultiPolygon>>();
  for (const offsetM of JITTER_OFFSETS_M) {
    for (const [dx, dy] of JITTER_DIRS) {
      const dLat = (dy * offsetM) / 111_000;
      const dLng = (dx * offsetM) / 84_000;
      const jPt = point([lng + dLng, lat + dLat]);
      for (const f of candidates) {
        try {
          if (booleanPointInPolygon(jPt, f as Feature<Polygon>)) {
            const key = JSON.stringify(f.geometry.coordinates).slice(0, 100);
            if (!hitSet.has(key)) hitSet.set(key, f);
          }
        } catch { /* skip */ }
      }
    }
  }

  if (hitSet.size > 0) {
    const hits = Array.from(hitSet.values());
    const picked = pickBestForPoint(hits, lat, lng);
    return { feature: picked, jittered: true };
  }

  return null;
}

/** Among multiple containing polygons, prefer the one whose centroid is
 *  closest to the original point, with an area bonus for institutional size.
 *  This prevents jitter from accidentally selecting a distant large building. */
function pickBestForPoint(
  features: Feature<Polygon | MultiPolygon>[],
  lat: number,
  lng: number,
): Feature<Polygon | MultiPolygon> {
  let best = features[0];
  let bestScore = -Infinity;
  for (const f of features) {
    const a = area(f);
    if (a < 30) continue; // skip sheds
    const c = centroid(f);
    const dist = haversineMeters(lat, lng, c.geometry.coordinates[1], c.geometry.coordinates[0]);
    // Score: strongly prefer closer centroid, mild preference for institutional area
    const proximityScore = 1 / (1 + dist / 20); // decays with distance
    const areaScore = areaDesirability(a);
    const score = proximityScore * 0.75 + areaScore * 0.25;
    if (score > bestScore) {
      bestScore = score;
      best = f;
    }
  }
  return best;
}

/** Score how "institutional building"-like an area is.
 *  Sweet spot: 200–8000 m². Penalise < 50 m² and > 20000 m². */
function areaDesirability(a: number): number {
  if (a < 30) return 0;
  if (a < 100) return 0.3;
  if (a < 200) return 0.6;
  if (a <= 8000) return 1.0;
  if (a <= 15000) return 0.7;
  return 0.4;
}

function matchBuilding(
  candidates: Feature<Polygon | MultiPolygon>[],
  lat: number,
  lng: number,
  strategy: 'point-in-polygon' | 'nearest-centroid' | 'expanded-search',
): MatchResult | null {
  if (candidates.length === 0) return null;

  // ── 1) Point-in-polygon with jitter ──
  const pip = findContaining(candidates, lat, lng);
  if (pip) {
    const c = centroid(pip.feature);
    const dist = haversineMeters(lat, lng, c.geometry.coordinates[1], c.geometry.coordinates[0]);
    const a = area(pip.feature);
    const baseStrategy = strategy === 'expanded-search' ? 'expanded-search' : (pip.jittered ? 'jitter-pip' : 'point-in-polygon');
    return {
      feature: pip.feature,
      strategy: baseStrategy as MatchResult['strategy'],
      confidence: pip.jittered ? 0.85 : (strategy === 'expanded-search' ? 0.75 : 0.95),
      distance: dist,
      area: a,
    };
  }

  // ── 2) Area-weighted nearest centroid (skip tiny buildings) ──
  const MIN_AREA = 40; // skip sheds / garages
  const MAX_DIST = 80; // only consider buildings within 80m
  let bestScore = -Infinity;
  let best: Feature<Polygon | MultiPolygon> | null = null;
  let bestDist = 0;
  let bestArea = 0;

  for (const f of candidates) {
    try {
      const a = area(f);
      if (a < MIN_AREA) continue;

      const c = centroid(f);
      const dist = haversineMeters(lat, lng, c.geometry.coordinates[1], c.geometry.coordinates[0]);
      if (dist > MAX_DIST) continue;

      // Score: closer + more institutional area = better
      const distPenalty = 1 - (dist / MAX_DIST);
      const areaBonus = areaDesirability(a);
      const score = distPenalty * 0.5 + areaBonus * 0.5;

      if (score > bestScore) {
        bestScore = score;
        best = f;
        bestDist = dist;
        bestArea = a;
      }
    } catch { /* skip bad geometry */ }
  }

  if (!best) return null;
  return {
    feature: best,
    strategy: strategy === 'expanded-search' ? 'expanded-search' : 'nearest-centroid',
    confidence: bestDist < 25 ? 0.75 : bestDist < 50 ? 0.55 : 0.35,
    distance: bestDist,
    area: bestArea,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const mod = await import('../src/data/nyuBuildingsList.js') as { nyuBuildings: NyuBuilding[] };
  const { nyuBuildings } = mod;

  console.log(`\n🏗  NYU Building Footprint Fetcher (NYC Open Data)`);
  console.log(`   Buildings: ${nyuBuildings.length}`);
  console.log(`   Cache: ${FORCE ? 'DISABLED (--force)' : 'enabled'}`);
  console.log(`   Output: ${GEOJSON_OUT}\n`);

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const features: Feature<Polygon | MultiPolygon>[] = [];
  const reports: MatchReport[] = [];
  const seenPolygons = new Map<string, string>(); // polygon hash → first building name

  for (const building of nyuBuildings) {
    console.log(`  [${building.id}] "${building.name}" @ ${building.address}`);

    // Pass 1: Normal radius
    let candidates = await fetchWithCache(building.id, building.lat, building.lng, SEARCH_RADIUS_M);
    let match = matchBuilding(candidates, building.lat, building.lng, 'point-in-polygon');

    // Pass 2: Expanded radius if needed
    if (!match || match.confidence < 0.5) {
      candidates = await fetchWithCache(building.id, building.lat, building.lng, EXPANDED_RADIUS_M);
      const expandedMatch = matchBuilding(candidates, building.lat, building.lng, 'expanded-search');
      if (expandedMatch && (!match || expandedMatch.confidence > match.confidence)) {
        match = expandedMatch;
      }
    }

    if (match && match.confidence >= 0.85) {
      // Simplify polygon
      const simplified = simplify(match.feature, { tolerance: 0.000005, highQuality: true });

      // Check for duplicate polygon
      const coords = JSON.stringify(simplified.geometry.coordinates);
      const polyHash = coords.slice(0, 200); // rough dedup key
      const existing = seenPolygons.get(polyHash);
      if (existing) {
        console.log(`    ⚡ Same polygon as "${existing}" — keeping both`);
      }
      seenPolygons.set(polyHash, building.name);

      // Set properties
      simplified.properties = {
        id: building.id,
        name: building.name,
        campus: building.campus,
        tier: building.tier,
        matchConfidence: Math.round(match.confidence * 100) / 100,
        source: 'nyc_open_data',
      };

      features.push(simplified as Feature<Polygon | MultiPolygon>);
      reports.push({
        buildingId: building.id,
        buildingName: building.name,
        campus: building.campus,
        candidateCount: candidates.length,
        strategy: match.strategy,
        confidence: match.confidence,
        polygonArea: Math.round(match.area),
        warnings: [],
      });

      console.log(`    ✓ ${match.strategy} (conf=${match.confidence.toFixed(2)}, area=${match.area.toFixed(0)}m², dist=${match.distance.toFixed(0)}m, candidates=${candidates.length})`);
    } else {
      console.log(`    ✗ FAILED (candidates=${candidates.length})`);
      reports.push({
        buildingId: building.id,
        buildingName: building.name,
        campus: building.campus,
        candidateCount: candidates.length,
        strategy: 'failed',
        confidence: 0,
        polygonArea: 0,
        warnings: ['No matching polygon found'],
      });
    }
  }

  // Write GeoJSON
  const fc = featureCollection(features);
  writeFileSync(GEOJSON_OUT, JSON.stringify(fc, null, 2), 'utf-8');
  console.log(`\n✅ GeoJSON written: ${GEOJSON_OUT}`);
  console.log(`   Features: ${features.length} / ${nyuBuildings.length}`);

  // Write report
  writeFileSync(REPORT_OUT, JSON.stringify(reports, null, 2), 'utf-8');
  console.log(`📊 Report: ${REPORT_OUT}`);

  // Summary
  const byStrategy: Record<string, number> = {};
  for (const r of reports) byStrategy[r.strategy] = (byStrategy[r.strategy] || 0) + 1;
  console.log(`\n📋 Summary:`);
  for (const [k, v] of Object.entries(byStrategy)) console.log(`   ${k}: ${v}`);

  const failed = reports.filter(r => r.strategy === 'failed');
  if (failed.length > 0) {
    console.log(`\n⚠️  Failed (${failed.length}):`);
    for (const r of failed) console.log(`   - ${r.buildingName}`);
  }

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
