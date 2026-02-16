/**
 * NYU Campus Data — GeoJSON for map overlays.
 *
 * Sources:
 *   - Manhattan: https://www.nyu.edu/content/dam/nyu/advertisePublications/documents/nyu-downloadable-campus-map.pdf
 *   - Brooklyn:  https://engineering.nyu.edu/sites/default/files/2023-03/nyu-Brooklyn-downloadable-campus-map.pdf
 *
 * Coordinates are approximate (sufficient for a campus overlay, not surveying).
 */

// ─── Campus Zone Polygons ────────────────────────────────────────────────────

export const nyuCampusZones: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
  type: 'FeatureCollection',
  features: [
    // ── WSP Core (Manhattan) ──
    // Tight polygon hugging Washington Square area:
    // North: Waverly Pl / W 8th St  South: W Houston St
    // West: MacDougal St / Sullivan  East: Broadway
    {
      type: 'Feature',
      properties: { name: 'WSP Core', campus: 'manhattan' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-73.9998, 40.7310], // NW — MacDougal & W 8th
          [-73.9945, 40.7315], // NE — Broadway & Waverly
          [-73.9930, 40.7300], // E — Broadway & Washington Pl
          [-73.9925, 40.7275], // E — Broadway & W 3rd
          [-73.9935, 40.7255], // SE — Broadway & Bleecker
          [-73.9945, 40.7240], // S — Mercer & Houston
          [-73.9980, 40.7240], // SW — Sullivan & Houston
          [-74.0005, 40.7255], // W — MacDougal & Bleecker
          [-74.0005, 40.7285], // W — MacDougal & W 3rd
          [-73.9998, 40.7310], // close
        ]],
      },
    },
    // ── NYU East / 3rd Ave Corridor (Manhattan) ──
    // Separate cluster: 14th St down to ~10th St, 3rd Ave area
    // (Palladium, Third North, Founders, University Hall, Alumni Hall)
    {
      type: 'Feature',
      properties: { name: 'NYU East', campus: 'manhattan' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-73.9910, 40.7360], // NW — University Pl & 14th
          [-73.9870, 40.7355], // NE — 3rd Ave & 14th
          [-73.9860, 40.7340], // E — 3rd Ave & 13th
          [-73.9850, 40.7310], // SE — 3rd Ave & 10th
          [-73.9895, 40.7305], // SW — University Pl & 10th
          [-73.9910, 40.7320], // W — University Pl & 12th
          [-73.9910, 40.7360], // close
        ]],
      },
    },
    // ── Brooklyn MetroTech Core ──
    // Tight polygon around MetroTech Center campus
    {
      type: 'Feature',
      properties: { name: 'MetroTech Core', campus: 'brooklyn' },
      geometry: {
        type: 'Polygon',
        coordinates: [[
          [-73.9880, 40.6955], // NW — Jay & Johnson
          [-73.9835, 40.6955], // NE — Gold & Johnson
          [-73.9825, 40.6935], // E — Gold & Willoughby
          [-73.9830, 40.6920], // SE — Gold & Myrtle
          [-73.9875, 40.6920], // SW — Jay & Myrtle
          [-73.9885, 40.6935], // W — Jay & Willoughby
          [-73.9880, 40.6955], // close
        ]],
      },
    },
  ],
};

// ─── Building Points (label-only — violet text on map) ──────────────────────

interface BuildingProperties {
  name: string;
  tier: 1 | 2;
  campus: 'manhattan' | 'brooklyn';
}

function pt(
  lng: number,
  lat: number,
  name: string,
  tier: 1 | 2,
  campus: 'manhattan' | 'brooklyn' = 'manhattan',
): GeoJSON.Feature<GeoJSON.Point, BuildingProperties> {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [lng, lat] },
    properties: { name, tier, campus },
  };
}

export const nyuBuildingPoints: GeoJSON.FeatureCollection<GeoJSON.Point, BuildingProperties> = {
  type: 'FeatureCollection',
  features: [
    // ════════════════════════════════════════════════════════════════════════
    // MANHATTAN — TIER 1 (major, shown at zoom >= 15)
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.99710, 40.72935, 'Bobst Library',                 1),
    pt(-73.99835, 40.72895, 'Kimmel Center',                 1),
    pt(-73.99575, 40.72975, 'Silver Center',                 1),
    pt(-73.99910, 40.72880, 'Vanderbilt Hall',               1),
    pt(-73.99555, 40.72810, 'Courant Institute',             1),
    pt(-73.99600, 40.72840, 'Tisch Hall (Stern)',            1),
    pt(-73.99360, 40.72960, 'Tisch School of the Arts',      1),
    pt(-73.99725, 40.72675, '181 Mercer (Coles)',            1),
    pt(-73.98810, 40.73340, 'Palladium Hall',                1),
    pt(-73.99900, 40.73060, 'Hayden Residence Hall',         1),

    // ════════════════════════════════════════════════════════════════════════
    // MANHATTAN — TIER 2 (secondary, shown at zoom >= 16.5)
    // ════════════════════════════════════════════════════════════════════════

    // ── Washington Square South ──
    pt(-73.99735, 40.72870, 'Kevorkian Center',              2),
    pt(-73.99730, 40.72865, 'King Juan Carlos I Center',     2),
    pt(-73.99725, 40.72860, 'Skirball Department',           2),
    pt(-73.99720, 40.72945, 'Gould Plaza',                   2),
    pt(-73.99660, 40.72870, 'Shimkin Hall',                  2),
    pt(-73.99820, 40.72740, 'Skirball Center',               2),

    // ── West 4th / West 3rd ──
    pt(-73.99660, 40.72870, 'Gould Welcome Center',          2),
    pt(-73.99615, 40.72845, 'Kaufman Management Center',     2),
    pt(-73.99560, 40.72830, 'Education Building',            2),
    pt(-73.99540, 40.72910, 'Student Services Center',       2),
    pt(-73.99950, 40.72810, "D'Agostino Hall",               2),
    pt(-73.99880, 40.72775, 'Furman Hall',                   2),

    // ── Washington Place / Waverly ──
    pt(-73.99620, 40.72985, 'Meyer Hall',                    2),
    pt(-73.99600, 40.72980, 'Psychology Building',           2),
    pt(-73.99545, 40.73010, 'Brown Building',                2),
    pt(-73.99555, 40.73005, 'Pless Annex',                   2),
    pt(-73.99585, 40.72990, 'Pless Hall',                    2),
    pt(-73.99595, 40.72990, 'NYU Bookstore',                 2),
    pt(-73.99610, 40.72985, 'Public Safety',                 2),
    pt(-73.99670, 40.73060, 'Waverly Building',              2),
    pt(-73.99650, 40.73055, 'Rufus D. Smith Hall',           2),
    pt(-73.99600, 40.73040, 'Torch Club',                    2),

    // ── Washington Square East / Greene ──
    pt(-73.99555, 40.72965, 'Goddard Hall',                  2),
    pt(-73.99545, 40.72970, 'East Building',                 2),
    pt(-73.99490, 40.73010, 'Kimball Hall',                  2),
    pt(-73.99575, 40.72950, 'Copy Central',                  2),

    // ── Broadway corridor ──
    pt(-73.99375, 40.73005, '726 Broadway',                  2),
    pt(-73.99340, 40.72940, 'Moses Center',                  2),

    // ── Washington Mews ──
    pt(-73.99650, 40.73100, 'Deutsches Haus',                2),
    pt(-73.99600, 40.73095, 'Glucksman Ireland House',       2),
    pt(-73.99620, 40.73098, 'Inst. of French Studies',       2),
    pt(-73.99630, 40.73098, 'La Maison Française',           2),

    // ── Washington Square North / 5th Ave ──
    pt(-73.99740, 40.73110, 'Graduate School of Arts & Sci', 2),
    pt(-73.99710, 40.73160, '60 Fifth Avenue',               2),

    // ── 8th–12th St area ──
    pt(-73.99350, 40.73055, 'Cantor Film Center',            2),
    pt(-73.99490, 40.73130, 'Bronfman Center',               2),
    pt(-73.99850, 40.73200, 'Lillian Vernon Center',         2),
    pt(-73.99650, 40.73300, 'Casa Italiana Zerilli-Marimò',  2),

    // ── Residence halls / East Village / Union Square ──
    pt(-73.99490, 40.73110, 'Weinstein Residence Hall',      2),
    pt(-73.99510, 40.73350, 'Rubin Residence Hall',          2),
    pt(-73.99180, 40.73200, 'Brittany Residence Hall',       2),
    pt(-73.98805, 40.73160, 'Third Avenue North',            2),
    pt(-73.98925, 40.73210, 'Founders Hall',                 2),
    pt(-73.98910, 40.73385, 'University Hall',               2),
    pt(-73.98860, 40.73310, 'Wasserman Center',              2),
    pt(-73.98980, 40.73260, 'Alumni Hall',                   2),
    pt(-73.99110, 40.73630, 'Carlyle Court',                 2),
    pt(-73.98685, 40.73340, 'Coral Towers',                  2),
    pt(-73.99630, 40.73640, 'Thirteenth St Residence',       2),
    pt(-73.98870, 40.72810, 'Seventh St Residence',          2),
    pt(-73.98800, 40.72985, 'Barney Building',               2),

    // ── Bleecker / Houston / Mercer south ──
    pt(-73.99565, 40.72795, 'Mercer Street Residence',       2),
    pt(-74.00020, 40.72865, 'Provincetown Playhouse',        2),
    pt(-73.99800, 40.72690, 'Silver Towers',                 2),
    pt(-73.99810, 40.72855, 'Mail Services',                 2),
    pt(-73.99850, 40.72690, 'University Plaza',              2),

    // ── More distant Manhattan ──
    pt(-73.99540, 40.72460, 'Puck Building',                 2),
    pt(-73.99200, 40.72680, 'Housing Office',                2),
    pt(-73.99780, 40.71920, 'Lafayette St Residence',        2),
    pt(-73.99310, 40.72500, 'Second St Residence',           2),
    pt(-73.99750, 40.72120, 'Broome Street Residence',       2),
    pt(-74.00130, 40.72640, 'Butterick Building',            2),
    pt(-74.00900, 40.72720, 'Greenwich Hotel',               2),
    pt(-73.99750, 40.72700, 'Washington Square Village',     2),
    pt(-73.97800, 40.73950, 'Twenty-sixth St Residence',     2),
    pt(-73.97850, 40.73900, 'University Court',              2),
    pt(-74.00120, 40.70690, 'Water Street Residence',        2),
    pt(-74.00800, 40.71260, 'Woolworth Building',            2),

    // ════════════════════════════════════════════════════════════════════════
    // BROOKLYN — TIER 1 (major Tandon buildings)
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.98600, 40.69455, 'Dibner Building',               1, 'brooklyn'),
    pt(-73.98560, 40.69465, 'Rogers Hall / Jacobs Academic', 1, 'brooklyn'),
    pt(-73.98690, 40.69340, '370 Jay Street',                1, 'brooklyn'),

    // ════════════════════════════════════════════════════════════════════════
    // BROOKLYN — TIER 2
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.98565, 40.69470, 'Jacobs Admin Building',         2, 'brooklyn'),
    pt(-73.98560, 40.69530, 'Othmer Residence Hall',         2, 'brooklyn'),
    pt(-73.98430, 40.69360, 'Wunsch Hall',                   2, 'brooklyn'),
    pt(-73.98340, 40.69320, '325 Gold Street',               2, 'brooklyn'),
    pt(-73.98560, 40.69400, '1 MetroTech Center',            2, 'brooklyn'),
    pt(-73.98470, 40.69350, '2 MetroTech Center',            2, 'brooklyn'),
    pt(-73.99050, 40.69750, 'St. George Clark Residence',    2, 'brooklyn'),
    pt(-73.99050, 40.69380, '1 Pierrepont Plaza',            2, 'brooklyn'),
  ],
};
