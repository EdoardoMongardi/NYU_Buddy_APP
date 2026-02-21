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
    // Coordinates from Mapbox Geocoding API, manually corrected where needed
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.99707, 40.72963, 'Bobst Library',                 1),  // 70 WSS
    pt(-73.99774, 40.72998, 'Kimmel Center',                 1),  // 60 WSS
    pt(-73.99570, 40.73045, 'Silver Center',                 1),  // 100 WSE
    pt(-73.99950, 40.72920, 'Vanderbilt Hall',               1),  // 40 WSS — fixed: geocoder placed in park
    pt(-73.99558, 40.72865, 'Courant Institute',             1),  // 251 Mercer
    pt(-73.99600, 40.72865, 'Tisch Hall (Stern)',            1),  // 40 W 4th
    pt(-73.99357, 40.72946, 'Tisch School of the Arts',      1),  // 721 Broadway
    pt(-73.99726, 40.72675, '181 Mercer (Coles)',            1),  // 181 Mercer
    pt(-73.98809, 40.73343, 'Palladium Hall',                1),  // 140 E 14th
    pt(-73.99933, 40.73153, 'Hayden Residence Hall',         1),  // 33 WSW

    // ════════════════════════════════════════════════════════════════════════
    // MANHATTAN — TIER 2 (secondary, shown at zoom >= 16.5)
    // ════════════════════════════════════════════════════════════════════════

    // ── Washington Square South ──
    pt(-73.99870, 40.72900, 'Kevorkian Center',              2),  // 50 WSS — fixed
    pt(-73.99863, 40.72895, 'King Juan Carlos I Center',     2),  // 53 WSS — fixed
    pt(-73.99787, 40.72975, 'Skirball Center',               2),  // 566 LaGuardia Pl

    // ── West 4th / West 3rd ──
    pt(-73.99647, 40.72940, 'Gould Welcome Center',          2),  // 50 W 4th
    pt(-73.99614, 40.72882, 'Kaufman Management Center',     2),  // 44 W 4th
    pt(-73.99597, 40.72941, 'Education Building',            2),  // 35 W 4th
    pt(-73.99541, 40.72910, 'Student Services Center',       2),  // 25 W 4th
    pt(-73.99995, 40.72810, "D'Agostino Hall",               2),  // 110 W 3rd — west of park
    pt(-73.99950, 40.72770, 'Furman Hall',                   2),  // 245 Sullivan — fixed: south of park

    // ── Washington Place / Waverly ──
    pt(-73.99438, 40.72917, 'Meyer Hall',                    2),  // 4 Washington Pl
    pt(-73.99442, 40.72922, 'Psychology Building',           2),  // 6 Washington Pl
    pt(-73.99546, 40.72997, 'Brown Building',                2),  // 29 Washington Pl
    pt(-73.99584, 40.72984, 'Pless Annex',                   2),  // 26 Washington Pl
    pt(-73.99603, 40.72994, 'Pless Hall',                    2),  // 82 WSE
    pt(-73.99564, 40.72975, 'NYU Bookstore',                 2),  // 18 Washington Pl
    pt(-73.99518, 40.72951, 'Public Safety',                 2),  // 14 Washington Pl
    pt(-73.99509, 40.73031, 'Waverly Building',              2),  // 24 Waverly Pl
    pt(-73.99482, 40.73056, 'Rufus D. Smith Hall',           2),  // 25 Waverly Pl
    pt(-73.99469, 40.73012, 'Torch Club',                    2),  // 18 Waverly Pl

    // ── Washington Square East / Greene ──
    pt(-73.99626, 40.72965, 'Goddard Hall',                  2),  // 79 WSE
    pt(-73.99549, 40.72970, 'East Building',                 2),  // 239 Greene
    pt(-73.99487, 40.73015, 'Kimball Hall',                  2),  // 246 Greene
    pt(-73.99447, 40.72964, 'Copy Central',                  2),  // 283 Mercer

    // ── Broadway corridor ──
    pt(-73.99240, 40.73000, '726 Broadway',                  2),  // fixed: geocoder placed in Williamsburg
    pt(-73.99230, 40.72945, 'Moses Center',                  2),  // 715 Broadway — fixed

    // ── Washington Mews ──
    pt(-73.99523, 40.73133, 'Deutsches Haus',                2),  // 42 Washington Mews
    pt(-73.99649, 40.73172, 'Glucksman Ireland House',       2),  // 1 Washington Mews
    pt(-73.99540, 40.73127, 'Inst. of French Studies',       2),  // 15 Washington Mews
    pt(-73.99531, 40.73123, 'La Maison Française',           2),  // 16 Washington Mews

    // ── Washington Square North / 5th Ave ──
    pt(-73.99595, 40.73120, 'Graduate School of Arts & Sci', 2),  // 6 WSN
    pt(-73.99680, 40.73180, '60 Fifth Avenue',               2),  // fixed: geocoder placed in Brooklyn

    // ── 8th–12th St area ──
    pt(-73.99443, 40.73124, 'Cantor Film Center',            2),  // 36 E 8th
    pt(-73.99464, 40.73326, 'Bronfman Center',               2),  // 7 E 10th
    pt(-73.99801, 40.73432, 'Lillian Vernon Center',         2),  // 58 W 10th
    pt(-73.99577, 40.73499, 'Casa Italiana',                 2),  // 24 W 12th

    // ── Residence halls / East Village / Union Square ──
    pt(-73.99486, 40.73109, 'Weinstein Residence Hall',      2),  // 11 University Pl
    pt(-73.99510, 40.73350, 'Rubin Residence Hall',          2),  // 35 Fifth Ave
    pt(-73.99183, 40.73200, 'Brittany Residence Hall',       2),  // 55 E 10th
    pt(-73.98805, 40.73159, 'Third Avenue North',            2),  // 75 Third Ave
    pt(-73.98924, 40.73211, 'Founders Hall',                 2),  // 120 E 12th
    pt(-73.98910, 40.73384, 'University Hall',               2),  // 110 E 14th
    pt(-73.98860, 40.73310, 'Wasserman Center',              2),  // 133 E 13th
    pt(-73.98980, 40.73260, 'Alumni Hall',                   2),  // 33 Third Ave — fixed: geocoder placed in Brooklyn
    pt(-73.99108, 40.73630, 'Carlyle Court',                 2),  // 25 Union Square W
    pt(-73.98685, 40.73343, 'Coral Towers',                  2),  // 129 Third Ave
    pt(-73.99631, 40.73636, 'Thirteenth St Residence',       2),  // 47 W 13th
    pt(-73.98873, 40.72810, 'Seventh St Residence',          2),  // 40 E 7th
    pt(-73.98800, 40.72983, 'Barney Building',               2),  // 34 Stuyvesant

    // ── Bleecker / Houston / Mercer south ──
    pt(-73.99564, 40.72795, 'Mercer Street Residence',       2),  // 240 Mercer
    pt(-74.00020, 40.72880, 'Provincetown Playhouse',        2),  // 133 MacDougal — fixed: south of WSS
    pt(-73.99853, 40.72677, 'Silver Towers',                 2),  // 110 Bleecker
    pt(-73.99810, 40.72855, 'Mail Services',                 2),  // 547 LaGuardia Pl
    pt(-73.99800, 40.72689, 'University Plaza',              2),  // 100 Bleecker

    // ── More distant Manhattan ──
    pt(-73.99542, 40.72458, 'Puck Building',                 2),  // 295 Lafayette
    pt(-73.99308, 40.72757, 'Housing Office',                2),  // 383 Lafayette
    pt(-74.00193, 40.71717, 'Lafayette St Residence',        2),  // 80 Lafayette
    pt(-73.99170, 40.72534, 'Second St Residence',           2),  // 1 E 2nd
    pt(-73.99738, 40.72090, 'Broome Street Residence',       2),  // 400 Broome
    pt(-74.00422, 40.72579, 'Butterick Building',            2),  // 161 Sixth Ave
    pt(-74.00817, 40.73131, 'Greenwich Hotel',               2),  // 636 Greenwich
    pt(-73.99800, 40.72700, 'Washington Square Village',     2),  // fixed: geocoder placed in Brooklyn
    pt(-73.97795, 40.73896, 'Twenty-sixth St Residence',     2),  // 334 E 26th
    pt(-73.97846, 40.73834, 'University Court',              2),  // 334 E 25th
    pt(-73.98577, 40.70291, 'Water Street Residence',        2),  // 200 Water
    pt(-74.00859, 40.71231, 'Woolworth Building',            2),  // 15 Barclay

    // ════════════════════════════════════════════════════════════════════════
    // BROOKLYN — TIER 1 (major Tandon buildings)
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.98563, 40.69446, 'Dibner Building',               1, 'brooklyn'),  // 5 MetroTech
    pt(-73.98678, 40.69418, 'Rogers Hall / Jacobs Academic', 1, 'brooklyn'),  // 6 MetroTech
    pt(-73.98744, 40.69274, '370 Jay Street',                1, 'brooklyn'),

    // ════════════════════════════════════════════════════════════════════════
    // BROOKLYN — TIER 2
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.98678, 40.69418, 'Jacobs Admin Building',         2, 'brooklyn'),  // 6 MetroTech
    pt(-73.98637, 40.69507, 'Othmer Residence Hall',         2, 'brooklyn'),  // 101 Johnson
    pt(-73.98500, 40.69433, 'Wunsch Hall',                   2, 'brooklyn'),  // 311 Bridge
    pt(-73.98306, 40.69456, '325 Gold Street',               2, 'brooklyn'),
    pt(-73.98699, 40.69338, '1 MetroTech Center',            2, 'brooklyn'),
    pt(-73.98579, 40.69345, '2 MetroTech Center',            2, 'brooklyn'),
    pt(-73.99357, 40.69769, 'St. George Clark Residence',    2, 'brooklyn'),  // 55 Clark
    pt(-73.99759, 40.69633, '1 Pierrepont Plaza',            2, 'brooklyn'),
  ],
};
