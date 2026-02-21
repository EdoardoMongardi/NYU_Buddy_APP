/**
 * Geocode all NYU buildings using the Mapbox Geocoding API.
 * Outputs precise [lng, lat] for each address.
 *
 * Usage: npx tsx scripts/geocode-nyu-buildings.ts
 */

import * as path from 'path';
import * as fs from 'fs';

// Read token from .env.local without dotenv
const envPath = path.resolve(__dirname, '../.env.local');
const envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
function envVar(key: string): string {
  const m = envContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}
const TOKEN = envVar('NEXT_PUBLIC_MAPBOX_TOKEN') || envVar('MAPBOX_ACCESS_TOKEN') || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
if (!TOKEN) {
  console.error('❌ No Mapbox token found');
  process.exit(1);
}

interface Building {
  name: string;
  address: string;
  tier: 1 | 2;
  campus: 'manhattan' | 'brooklyn';
}

const buildings: Building[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // MANHATTAN — TIER 1
  // ═══════════════════════════════════════════════════════════════════════
  { name: 'Bobst Library', address: '70 Washington Square South, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Kimmel Center', address: '60 Washington Square South, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Silver Center', address: '100 Washington Square East, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Vanderbilt Hall', address: '40 Washington Square South, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Courant Institute', address: '251 Mercer Street, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Tisch Hall (Stern)', address: '40 West 4th Street, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Tisch School of the Arts', address: '721 Broadway, New York, NY', tier: 1, campus: 'manhattan' },
  { name: '181 Mercer (Coles)', address: '181 Mercer Street, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Palladium Hall', address: '140 East 14th Street, New York, NY', tier: 1, campus: 'manhattan' },
  { name: 'Hayden Residence Hall', address: '33 Washington Square West, New York, NY', tier: 1, campus: 'manhattan' },

  // ═══════════════════════════════════════════════════════════════════════
  // MANHATTAN — TIER 2
  // ═══════════════════════════════════════════════════════════════════════
  { name: 'Alumni Hall', address: '33 Third Avenue, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Barney Building', address: '34 Stuyvesant Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'NYU Bookstore', address: '18 Washington Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Brittany Residence Hall', address: '55 East 10th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Bronfman Center', address: '7 East 10th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Broome Street Residence', address: '400 Broome Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Brown Building', address: '29 Washington Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Butterick Building', address: '161 Sixth Avenue, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Cantor Film Center', address: '36 East 8th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Carlyle Court', address: '25 Union Square West, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Casa Italiana', address: '24 West 12th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Coles Sports Center', address: '181 Mercer Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Copy Central', address: '283 Mercer Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Coral Towers', address: '129 Third Avenue, New York, NY', tier: 2, campus: 'manhattan' },
  { name: "D'Agostino Hall", address: '110 West 3rd Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Deutsches Haus', address: '42 Washington Mews, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'East Building', address: '239 Greene Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Education Building', address: '35 West 4th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Founders Hall', address: '120 East 12th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Furman Hall', address: '245 Sullivan Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Glucksman Ireland House', address: '1 Washington Mews, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Goddard Hall', address: '79 Washington Square East, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Gould Welcome Center', address: '50 West 4th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Graduate School of Arts & Sci', address: '6 Washington Square North, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Greenwich Hotel', address: '636 Greenwich Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Housing Office', address: '383 Lafayette Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Inst. of French Studies', address: '15 Washington Mews, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Kaufman Management Center', address: '44 West 4th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Kevorkian Center', address: '50 Washington Square South, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Kimball Hall', address: '246 Greene Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'King Juan Carlos I Center', address: '53 Washington Square South, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'La Maison Française', address: '16 Washington Mews, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Lafayette St Residence', address: '80 Lafayette Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: '726 Broadway', address: '726 Broadway, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Lillian Vernon Center', address: '58 West 10th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Mail Services', address: '547 LaGuardia Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Mercer Street Residence', address: '240 Mercer Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Meyer Hall', address: '4 Washington Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Moses Center', address: '715 Broadway, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Pless Annex', address: '26 Washington Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Pless Hall', address: '82 Washington Square East, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Provincetown Playhouse', address: '133 MacDougal Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Psychology Building', address: '6 Washington Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Public Safety', address: '14 Washington Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Puck Building', address: '295 Lafayette Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Rubin Residence Hall', address: '35 Fifth Avenue, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Rufus D. Smith Hall', address: '25 Waverly Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Second St Residence', address: '1 East 2nd Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Seventh St Residence', address: '40 East 7th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Skirball Center', address: '566 LaGuardia Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Silver Towers', address: '110 Bleecker Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Student Services Center', address: '25 West 4th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Third Avenue North', address: '75 Third Avenue, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Thirteenth St Residence', address: '47 West 13th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Torch Club', address: '18 Waverly Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'University Hall', address: '110 East 14th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'University Plaza', address: '100 Bleecker Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Washington Square Village', address: '2 Washington Square Village, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Wasserman Center', address: '133 East 13th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Water Street Residence', address: '200 Water Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Waverly Building', address: '24 Waverly Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Weinstein Residence Hall', address: '11 University Place, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Woolworth Building', address: '15 Barclay Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'Twenty-sixth St Residence', address: '334 East 26th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: 'University Court', address: '334 East 25th Street, New York, NY', tier: 2, campus: 'manhattan' },
  { name: '60 Fifth Avenue', address: '60 Fifth Avenue, New York, NY', tier: 2, campus: 'manhattan' },

  // ═══════════════════════════════════════════════════════════════════════
  // BROOKLYN
  // ═══════════════════════════════════════════════════════════════════════
  { name: 'Dibner Building', address: '5 MetroTech Center, Brooklyn, NY', tier: 1, campus: 'brooklyn' },
  { name: 'Rogers Hall / Jacobs Academic', address: '6 MetroTech Center, Brooklyn, NY', tier: 1, campus: 'brooklyn' },
  { name: '370 Jay Street', address: '370 Jay Street, Brooklyn, NY', tier: 1, campus: 'brooklyn' },
  { name: 'Jacobs Admin Building', address: '6 MetroTech Center, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: 'Othmer Residence Hall', address: '101 Johnson Street, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: 'Wunsch Hall', address: '311 Bridge Street, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: '325 Gold Street', address: '325 Gold Street, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: '1 MetroTech Center', address: '1 MetroTech Center, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: '2 MetroTech Center', address: '2 MetroTech Center, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: 'St. George Clark Residence', address: '55 Clark Street, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
  { name: '1 Pierrepont Plaza', address: '1 Pierrepont Plaza, Brooklyn, NY', tier: 2, campus: 'brooklyn' },
];

const NYC_BBOX = '-74.05,40.68,-73.90,40.82';

async function geocode(address: string): Promise<[number, number] | null> {
  const encoded = encodeURIComponent(address);
  const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${TOKEN}&bbox=${NYC_BBOX}&limit=1&types=address`;

  const resp = await fetch(url);
  if (!resp.ok) {
    console.error(`   ❌ HTTP ${resp.status} for "${address}"`);
    return null;
  }

  const data = await resp.json();
  if (!data.features?.length) {
    console.warn(`   ⚠️  No results for "${address}"`);
    return null;
  }

  const [lng, lat] = data.features[0].center;
  return [lng, lat];
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log(`🔍 Geocoding ${buildings.length} NYU buildings...\n`);

  const results: string[] = [];
  const failed: string[] = [];

  for (const b of buildings) {
    process.stdout.write(`  ${b.name} (${b.address})...`);
    const coords = await geocode(b.address);

    if (coords) {
      const [lng, lat] = coords;
      const campusArg = b.campus === 'brooklyn' ? `, 'brooklyn'` : '';
      results.push(
        `    pt(${lng.toFixed(5)}, ${lat.toFixed(5)}, '${b.name.replace(/'/g, "\\'")}', ${b.tier}${campusArg}),`
      );
      console.log(` ✅ [${lng.toFixed(5)}, ${lat.toFixed(5)}]`);
    } else {
      failed.push(b.name);
      results.push(`    // ❌ FAILED: ${b.name} — ${b.address}`);
      console.log(' ❌ FAILED');
    }

    await sleep(120); // respect rate limits
  }

  console.log(`\n════════════════════════════════════════`);
  console.log(`✅ Geocoded: ${buildings.length - failed.length}/${buildings.length}`);
  if (failed.length) {
    console.log(`❌ Failed: ${failed.join(', ')}`);
  }

  // Write output
  const outDir = path.resolve(__dirname, 'output');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.resolve(outDir, 'geocoded-buildings.txt');
  fs.writeFileSync(outPath, results.join('\n'), 'utf8');
  console.log(`\n📄 Output written to: ${outPath}`);
}

main().catch(console.error);
