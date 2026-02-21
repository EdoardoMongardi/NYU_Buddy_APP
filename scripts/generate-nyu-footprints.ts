#!/usr/bin/env tsx
/**
 * generate-nyu-footprints.ts
 *
 * Fetches real building footprint polygons from OpenStreetMap (Overpass API)
 * for every NYU building in the canonical list, scores candidates, and writes
 * a GeoJSON FeatureCollection to src/data/nyuBuildingFootprints.geojson.
 *
 * Usage:
 *   npx tsx scripts/generate-nyu-footprints.ts          # uses cache
 *   npx tsx scripts/generate-nyu-footprints.ts --force   # busts cache
 *
 * Outputs:
 *   src/data/nyuBuildingFootprints.geojson   — import in MapboxMap
 *   scripts/output/footprints-report.json    — per-building match report
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import simplify from '@turf/simplify';
import area from '@turf/area';
import centroid from '@turf/centroid';
import { polygon, multiPolygon, featureCollection } from '@turf/helpers';
import type { Feature, Polygon, MultiPolygon, Position } from 'geojson';

// ─── Paths ───────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const CACHE_DIR = resolve(__dirname, 'cache');
const OUTPUT_DIR = resolve(__dirname, 'output');
const GEOJSON_OUT = resolve(ROOT, 'src/data/nyuBuildingFootprints.json');
const REPORT_OUT = resolve(OUTPUT_DIR, 'footprints-report.json');

// ─── Import building list (dynamic import for ESM compat) ────────────────────

interface NyuBuilding {
  id: string;
  name: string;
  address: string;
  campus: 'manhattan' | 'brooklyn';
  tier: 1 | 2;
  lat: number;
  lng: number;
  osmHints?: string[];
  addressHints?: string[];
}

// Loaded in main() to avoid top-level await
let nyuBuildings: NyuBuilding[] = [];

// ─── Config ──────────────────────────────────────────────────────────────────

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const FORCE = process.argv.includes('--force');
const THROTTLE_MS = 1200; // 1.2s between requests (respectful)

// ─── Street Name Normalization ───────────────────────────────────────────────

const DIRECTIONALS: Record<string, string> = {
  north: 'n', south: 's', east: 'e', west: 'w',
  n: 'n', s: 's', e: 'e', w: 'w',
  'n.': 'n', 's.': 's', 'e.': 'e', 'w.': 'w',
};
const SUFFIXES: Record<string, string> = {
  street: 'st', st: 'st', 'st.': 'st',
  avenue: 'ave', ave: 'ave', 'ave.': 'ave',
  place: 'pl', pl: 'pl', 'pl.': 'pl',
  square: 'sq', sq: 'sq', 'sq.': 'sq',
  boulevard: 'blvd', blvd: 'blvd', 'blvd.': 'blvd',
  drive: 'dr', dr: 'dr', 'dr.': 'dr',
  road: 'rd', rd: 'rd', 'rd.': 'rd',
  lane: 'ln', ln: 'ln', 'ln.': 'ln',
  court: 'ct', ct: 'ct', 'ct.': 'ct',
  center: 'ctr', ctr: 'ctr',
};

function normalizeStreet(street: string): string {
  let s = street.toLowerCase().trim();
  // Remove ordinal suffixes: 4th → 4, 1st → 1, 2nd → 2, 3rd → 3
  s = s.replace(/(\d+)(st|nd|rd|th)\b/g, '$1');
  const tokens = s.split(/\s+/);
  const out: string[] = [];
  for (const t of tokens) {
    if (DIRECTIONALS[t]) { out.push(DIRECTIONALS[t]); continue; }
    if (SUFFIXES[t]) { out.push(SUFFIXES[t]); continue; }
    out.push(t);
  }
  return out.join(' ');
}

function extractStreetKeyword(address: string): string {
  // Remove housenumber prefix, then normalize
  const noNum = address.replace(/^\d+[-–]?\d*\s*/, '');
  return normalizeStreet(noNum);
}

function parseHouseNumber(address: string): string {
  const m = address.match(/^(\d+)/);
  return m ? m[1] : '';
}

// ─── Levenshtein Distance (simple) ──────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const la = a.length, lb = b.length;
  const dp: number[][] = Array.from({ length: la + 1 }, () => Array(lb + 1).fill(0));
  for (let i = 0; i <= la; i++) dp[i][0] = i;
  for (let j = 0; j <= lb; j++) dp[0][j] = j;
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[la][lb];
}

function nameSimilarity(a: string, b: string): number {
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - dist / maxLen);
}

// ─── Haversine Distance ─────────────────────────────────────────────────────

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Overpass Helpers ────────────────────────────────────────────────────────

async function overpassQuery(query: string): Promise<any> {
  const body = `data=${encodeURIComponent(query)}`;
  const resp = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Overpass ${resp.status}: ${text.slice(0, 300)}`);
  }
  return resp.json();
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// ─── OSM → GeoJSON Conversion ───────────────────────────────────────────────

interface OsmNode { type: 'node'; id: number; lat: number; lon: number; }
interface OsmWay { type: 'way'; id: number; nodes: number[]; tags?: Record<string, string>; }
interface OsmRelation {
  type: 'relation'; id: number; tags?: Record<string, string>;
  members: { type: string; ref: number; role: string; }[];
}
type OsmElement = OsmNode | OsmWay | OsmRelation;

function buildNodeMap(elements: OsmElement[]): Map<number, [number, number]> {
  const map = new Map<number, [number, number]>();
  for (const el of elements) {
    if (el.type === 'node') map.set(el.id, [el.lon, el.lat]);
  }
  return map;
}

function wayToRing(way: OsmWay, nodes: Map<number, [number, number]>): Position[] | null {
  const ring: Position[] = [];
  for (const nid of way.nodes) {
    const coord = nodes.get(nid);
    if (!coord) return null;
    ring.push(coord);
  }
  if (ring.length < 4) return null;
  return ring;
}

interface Candidate {
  id: string;
  polygon: Feature<Polygon | MultiPolygon>;
  centroidLat: number;
  centroidLng: number;
  areaM2: number;
  name: string | null;
  addrMatch: boolean;
  tags: Record<string, string>;
}

function extractCandidates(
  data: { elements: OsmElement[] },
  nodeMap?: Map<number, [number, number]>,
): Candidate[] {
  const elements = data.elements;
  const nodes = nodeMap ?? buildNodeMap(elements);
  const wayMap = new Map<number, OsmWay>();
  for (const el of elements) {
    if (el.type === 'way') wayMap.set(el.id, el);
  }

  const candidates: Candidate[] = [];

  // Process ways
  for (const el of elements) {
    if (el.type !== 'way' || !el.tags?.building) continue;
    const ring = wayToRing(el, nodes);
    if (!ring) continue;
    try {
      const poly = polygon([ring]);
      const c = centroid(poly);
      const a = area(poly);
      candidates.push({
        id: `way/${el.id}`,
        polygon: poly,
        centroidLat: c.geometry.coordinates[1],
        centroidLng: c.geometry.coordinates[0],
        areaM2: a,
        name: el.tags.name || null,
        addrMatch: false,
        tags: el.tags,
      });
    } catch {
      // invalid polygon
    }
  }

  // Process relations (multipolygon)
  for (const el of elements) {
    if (el.type !== 'relation') continue;
    if (!el.tags?.building && el.tags?.type !== 'multipolygon') continue;
    if (!el.tags?.building) continue;

    const outerRings: Position[][] = [];
    const innerRings: Position[][] = [];

    for (const member of el.members) {
      if (member.type !== 'way') continue;
      const way = wayMap.get(member.ref);
      if (!way) continue;
      const ring = wayToRing(way, nodes);
      if (!ring) continue;
      if (member.role === 'outer' || member.role === '') {
        outerRings.push(ring);
      } else if (member.role === 'inner') {
        innerRings.push(ring);
      }
    }

    if (outerRings.length === 0) continue;

    try {
      let feat: Feature<Polygon | MultiPolygon>;
      if (outerRings.length === 1) {
        feat = polygon([outerRings[0], ...innerRings]);
      } else {
        feat = multiPolygon(outerRings.map(outer => [outer, ...innerRings]));
      }
      const c = centroid(feat);
      const a = area(feat);
      candidates.push({
        id: `relation/${el.id}`,
        polygon: feat,
        centroidLat: c.geometry.coordinates[1],
        centroidLng: c.geometry.coordinates[0],
        areaM2: a,
        name: el.tags.name || null,
        addrMatch: false,
        tags: el.tags,
      });
    } catch {
      // invalid multipolygon
    }
  }

  return candidates;
}

// ─── Scoring ─────────────────────────────────────────────────────────────────

function scoreCandidate(
  c: Candidate,
  building: NyuBuilding,
): number {
  let score = 0;

  // Distance (0–40 pts, closer = better)
  const dist = haversineMeters(c.centroidLat, c.centroidLng, building.lat, building.lng);
  score += Math.max(0, 40 - dist * 0.35);

  // Name similarity (0–40 pts)
  let bestNameSim = 0;
  const allNames = [building.name, ...(building.osmHints || [])];
  const candidateNames = [c.name, c.tags?.['alt_name'], c.tags?.['short_name']].filter(Boolean) as string[];
  if (candidateNames.length === 0) candidateNames.push('');
  for (const bn of allNames) {
    for (const cn of candidateNames) {
      bestNameSim = Math.max(bestNameSim, nameSimilarity(bn, cn));
    }
  }
  score += bestNameSim * 40;

  // Address match bonus (+10)
  if (c.addrMatch) score += 10;

  // Area sanity penalty (soft)
  if (c.areaM2 < 30) score -= 15;
  else if (c.areaM2 > 80000) score -= 15;
  else if (c.areaM2 < 100) score -= 5;

  return score;
}

function confidenceFromScore(score: number, source: string): number {
  if (source === 'address') return Math.min(0.95, 0.6 + score / 200);
  if (source === 'name') return Math.min(0.90, 0.5 + score / 200);
  if (source === 'nearest') return Math.min(0.55, 0.3 + score / 200);
  return 0;
}

// ─── Main Pipeline ──────────────────────────────────────────────────────────

interface MatchResult {
  buildingId: string;
  buildingName: string;
  campus: string;
  source: 'address' | 'name' | 'nearest' | 'fallback';
  confidence: number;
  osmId: string | null;
  score: number;
  areaM2: number;
  warnings: string[];
}

function getCachePath(buildingId: string, pass: string): string {
  return resolve(CACHE_DIR, `${buildingId}_${pass}.json`);
}

function readCache(path: string): any | null {
  if (FORCE) return null;
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch { return null; }
}

function writeCache(path: string, data: any): void {
  writeFileSync(path, JSON.stringify(data), 'utf-8');
}

async function fetchWithCache(buildingId: string, pass: string, query: string): Promise<any> {
  const cachePath = getCachePath(buildingId, pass);
  const cached = readCache(cachePath);
  if (cached) return cached;

  await sleep(THROTTLE_MS);
  const data = await overpassQuery(query);
  writeCache(cachePath, data);
  return data;
}

function buildFallbackRect(lat: number, lng: number): Feature<Polygon> {
  const dLat = 0.000135; // ~15m
  const dLng = 0.000150; // ~12.5m
  return polygon([[
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ]]);
}

async function processBuilding(
  building: NyuBuilding,
): Promise<{ feature: Feature<Polygon | MultiPolygon>; report: MatchResult }> {
  const { id, name, address, lat, lng } = building;
  const houseNum = parseHouseNumber(address);
  const streetKeyword = extractStreetKeyword(address);
  const warnings: string[] = [];

  console.log(`  [${id}] Processing: "${name}" @ ${address}`);

  // ── PASS A: Address match (radius 100m) ──
  {
    const streetRegex = streetKeyword.replace(/\s+/g, '.*');
    const query = `[out:json][timeout:25];
(
  way["building"]["addr:housenumber"~"^${houseNum}"](around:100,${lat},${lng});
  relation["building"]["addr:housenumber"~"^${houseNum}"](around:100,${lat},${lng});
);
out body; >; out skel qt;`;

    try {
      const data = await fetchWithCache(id, 'passA', query);
      const candidates = extractCandidates(data);

      // Filter by street name similarity
      const streetMatches = candidates.filter(c => {
        const osmStreet = c.tags?.['addr:street'] || '';
        const normOsm = normalizeStreet(osmStreet);
        const normExpected = streetKeyword;
        // Check if the core words overlap
        const osmWords = new Set(normOsm.split(/\s+/));
        const expWords = normExpected.split(/\s+/);
        const overlap = expWords.filter(w => osmWords.has(w)).length;
        return overlap >= Math.max(1, expWords.length - 1);
      });

      const pool = streetMatches.length > 0 ? streetMatches : candidates;
      for (const c of pool) c.addrMatch = true;

      if (pool.length > 0) {
        const scored = pool.map(c => ({ c, score: scoreCandidate(c, building) }));
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best.score > 20) {
          console.log(`    ✓ PASS A hit: ${best.c.id} (score=${best.score.toFixed(1)}, area=${best.c.areaM2.toFixed(0)}m²)`);
          const conf = confidenceFromScore(best.score, 'address');
          const feat = simplify(best.c.polygon, { tolerance: 0.00003, highQuality: true });
          feat.properties = { name, campus: building.campus, tier: building.tier, source: 'osm', confidence: conf };
          return {
            feature: feat as Feature<Polygon | MultiPolygon>,
            report: { buildingId: id, buildingName: name, campus: building.campus, source: 'address', confidence: conf, osmId: best.c.id, score: best.score, areaM2: best.c.areaM2, warnings },
          };
        }
      }
      warnings.push('PASS A: no strong address match');
    } catch (err: any) {
      warnings.push(`PASS A error: ${err.message}`);
    }
  }

  // ── PASS B: Name / operator match (radius 150m) ──
  {
    const nameVariants = [name, ...(building.osmHints || [])];
    const nameRegex = nameVariants.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const query = `[out:json][timeout:25];
(
  way["building"]["name"~"(${nameRegex})",i](around:150,${lat},${lng});
  relation["building"]["name"~"(${nameRegex})",i](around:150,${lat},${lng});
  way["building"]["operator"~"NYU|New York University",i](around:150,${lat},${lng});
  relation["building"]["operator"~"NYU|New York University",i](around:150,${lat},${lng});
);
out body; >; out skel qt;`;

    try {
      const data = await fetchWithCache(id, 'passB', query);
      const candidates = extractCandidates(data);

      if (candidates.length > 0) {
        const scored = candidates.map(c => ({ c, score: scoreCandidate(c, building) }));
        scored.sort((a, b) => b.score - a.score);
        const best = scored[0];
        if (best.score > 20) {
          console.log(`    ✓ PASS B hit: ${best.c.id} (score=${best.score.toFixed(1)}, name="${best.c.name}")`);
          const conf = confidenceFromScore(best.score, 'name');
          const feat = simplify(best.c.polygon, { tolerance: 0.00003, highQuality: true });
          feat.properties = { name, campus: building.campus, tier: building.tier, source: 'osm', confidence: conf };
          return {
            feature: feat as Feature<Polygon | MultiPolygon>,
            report: { buildingId: id, buildingName: name, campus: building.campus, source: 'name', confidence: conf, osmId: best.c.id, score: best.score, areaM2: best.c.areaM2, warnings },
          };
        }
      }
      warnings.push('PASS B: no strong name/operator match');
    } catch (err: any) {
      warnings.push(`PASS B error: ${err.message}`);
    }
  }

  // ── PASS C: Nearest building (radius 60m) ──
  {
    const query = `[out:json][timeout:25];
(
  way["building"](around:60,${lat},${lng});
  relation["building"](around:60,${lat},${lng});
);
out body; >; out skel qt;`;

    try {
      const data = await fetchWithCache(id, 'passC', query);
      const candidates = extractCandidates(data);

      if (candidates.length > 0) {
        // Pick closest centroid
        const scored = candidates.map(c => ({
          c,
          dist: haversineMeters(c.centroidLat, c.centroidLng, lat, lng),
          score: scoreCandidate(c, building),
        }));
        scored.sort((a, b) => a.dist - b.dist);
        const best = scored[0];
        console.log(`    ~ PASS C nearest: ${best.c.id} (dist=${best.dist.toFixed(0)}m, area=${best.c.areaM2.toFixed(0)}m²)`);
        const conf = confidenceFromScore(best.score, 'nearest');
        const feat = simplify(best.c.polygon, { tolerance: 0.00003, highQuality: true });
        feat.properties = { name, campus: building.campus, tier: building.tier, source: 'osm', confidence: conf };
        return {
          feature: feat as Feature<Polygon | MultiPolygon>,
          report: { buildingId: id, buildingName: name, campus: building.campus, source: 'nearest', confidence: conf, osmId: best.c.id, score: best.score, areaM2: best.c.areaM2, warnings },
        };
      }
      warnings.push('PASS C: no buildings within 60m');
    } catch (err: any) {
      warnings.push(`PASS C error: ${err.message}`);
    }
  }

  // ── FALLBACK: Rectangle ──
  console.log(`    ✗ FALLBACK: generating rectangle for "${name}"`);
  warnings.push('Used fallback rectangle');
  const rect = buildFallbackRect(lat, lng);
  rect.properties = { name, campus: building.campus, tier: building.tier, source: 'fallback', confidence: 0 };
  return {
    feature: rect,
    report: { buildingId: id, buildingName: name, campus: building.campus, source: 'fallback', confidence: 0, osmId: null, score: 0, areaM2: area(rect), warnings },
  };
}

// ─── Entry Point ─────────────────────────────────────────────────────────────

async function main() {
  // Dynamic import to avoid top-level await
  const mod = await import('../src/data/nyuBuildingsList.js') as { nyuBuildings: NyuBuilding[] };
  nyuBuildings = mod.nyuBuildings;

  console.log(`\n🏗  NYU Building Footprint Generator`);
  console.log(`   Buildings: ${nyuBuildings.length}`);
  console.log(`   Cache: ${FORCE ? 'DISABLED (--force)' : 'enabled'}`);
  console.log(`   Output: ${GEOJSON_OUT}\n`);

  mkdirSync(CACHE_DIR, { recursive: true });
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const features: Feature<Polygon | MultiPolygon>[] = [];
  const reports: MatchResult[] = [];

  for (const building of nyuBuildings) {
    try {
      const { feature, report } = await processBuilding(building);
      features.push(feature);
      reports.push(report);
    } catch (err: any) {
      console.error(`  ✗ FATAL for ${building.id}: ${err.message}`);
      const rect = buildFallbackRect(building.lat, building.lng);
      rect.properties = { name: building.name, campus: building.campus, tier: building.tier, source: 'fallback', confidence: 0 };
      features.push(rect);
      reports.push({
        buildingId: building.id,
        buildingName: building.name,
        campus: building.campus,
        source: 'fallback',
        confidence: 0,
        osmId: null,
        score: 0,
        areaM2: 0,
        warnings: [`Fatal error: ${err.message}`],
      });
    }
  }

  // Write GeoJSON
  const fc = featureCollection(features);
  writeFileSync(GEOJSON_OUT, JSON.stringify(fc, null, 2), 'utf-8');
  console.log(`\n✅ GeoJSON written: ${GEOJSON_OUT}`);
  console.log(`   Features: ${features.length}`);

  // Write report
  writeFileSync(REPORT_OUT, JSON.stringify(reports, null, 2), 'utf-8');
  console.log(`📊 Report written: ${REPORT_OUT}`);

  // Summary
  const bySource = { address: 0, name: 0, nearest: 0, fallback: 0 };
  for (const r of reports) bySource[r.source]++;
  console.log(`\n📋 Summary:`);
  console.log(`   Address match: ${bySource.address}`);
  console.log(`   Name match:    ${bySource.name}`);
  console.log(`   Nearest:       ${bySource.nearest}`);
  console.log(`   Fallback:      ${bySource.fallback}`);

  const lowConf = reports.filter(r => r.confidence < 0.5);
  if (lowConf.length > 0) {
    console.log(`\n⚠️  Low confidence (< 0.5):`);
    for (const r of lowConf) {
      console.log(`   - ${r.buildingName} (${r.source}, conf=${r.confidence.toFixed(2)})`);
    }
  }

  console.log('\nDone.\n');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
