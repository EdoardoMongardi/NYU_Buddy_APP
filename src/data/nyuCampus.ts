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

// ─── Building Points ─────────────────────────────────────────────────────────

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
  campus: 'manhattan' | 'brooklyn' = 'manhattan'
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
    // MANHATTAN — TIER 1 (major landmarks, visible zoom >= 13)
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.9972, 40.7292, 'Bobst Library',          1),
    pt(-73.9981, 40.7289, 'Kimmel Center',          1),
    pt(-73.9960, 40.7295, 'Silver Center',          1),
    pt(-73.9983, 40.7280, 'Stern School',           1),
    pt(-73.9965, 40.7278, 'Courant Institute',      1),
    pt(-73.9930, 40.7300, 'Tisch School of the Arts', 1),
    pt(-73.9976, 40.7287, 'Vanderbilt Hall (Law)',   1),
    pt(-73.9960, 40.7260, '181 Mercer Athletics',   1),
    pt(-73.9878, 40.7340, 'Palladium Hall',         1),

    // ════════════════════════════════════════════════════════════════════════
    // MANHATTAN — TIER 2 (secondary, visible zoom >= 15.5)
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.9958, 40.7298, 'Brown Building',         2),
    pt(-73.9955, 40.7295, 'Goddard Hall',           2),
    pt(-73.9993, 40.7283, "D'Agostino Hall",        2),
    pt(-73.9985, 40.7276, 'Furman Hall',            2),
    pt(-73.9975, 40.7270, 'GCASL',                  2),
    pt(-73.9970, 40.7302, 'Waverly Building',       2),
    pt(-73.9962, 40.7258, 'Hayden Hall',            2),
    pt(-73.9940, 40.7305, 'Weinstein Hall',         2),
    pt(-73.9942, 40.7300, '726 Broadway',           2),
    pt(-73.9968, 40.7299, 'Meyer Hall',             2),
    pt(-73.9966, 40.7301, 'Psychology Building',    2),
    pt(-73.9948, 40.7308, 'Rubin Hall',             2),
    pt(-73.9980, 40.7301, 'Lipton Hall',            2),
    pt(-73.9951, 40.7312, 'Bronfman Center',        2),
    pt(-73.9920, 40.7311, 'Brittany Hall',          2),
    pt(-73.9893, 40.7318, 'Third North',            2),
    pt(-73.9898, 40.7325, 'Founders Hall',          2),
    pt(-73.9878, 40.7345, 'Palladium Athletic',     2),
    pt(-73.9908, 40.7348, 'University Hall',        2),
    pt(-73.9919, 40.7335, 'Alumni Hall',            2),
    pt(-73.9980, 40.7310, '60 Fifth Avenue',        2),
    pt(-73.9990, 40.7305, 'Lillian Vernon Center',  2),
    pt(-73.9988, 40.7268, 'Skirball Center',        2),
    pt(-73.9975, 40.7285, 'Kevorkian Center',       2),
    pt(-73.9977, 40.7293, 'Gould Welcome Center',   2),
    pt(-73.9940, 40.7257, '665 Broadway',           2),
    pt(-73.9930, 40.7250, 'Second St Residence',    2),
    pt(-73.9905, 40.7308, 'Barney Building',        2),
    pt(-73.9930, 40.7295, '20 Cooper Square',       2),
    pt(-73.9902, 40.7241, 'Puck Building',          2),

    // ════════════════════════════════════════════════════════════════════════
    // BROOKLYN — TIER 1
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.9862, 40.6943, 'Dibner Building',        1, 'brooklyn'),
    pt(-73.9860, 40.6946, 'Rogers Hall',            1, 'brooklyn'),
    pt(-73.9870, 40.6930, '370 Jay Street',         1, 'brooklyn'),

    // ════════════════════════════════════════════════════════════════════════
    // BROOKLYN — TIER 2
    // ════════════════════════════════════════════════════════════════════════
    pt(-73.9865, 40.6942, 'Jacobs Building',        2, 'brooklyn'),
    pt(-73.9840, 40.6935, 'Wunsch Hall',            2, 'brooklyn'),
    pt(-73.9852, 40.6940, '1 MetroTech Center',     2, 'brooklyn'),
    pt(-73.9848, 40.6938, '2 MetroTech Center',     2, 'brooklyn'),
    pt(-73.9828, 40.6928, '325 Gold Street',        2, 'brooklyn'),
    pt(-73.9857, 40.6950, 'Othmer Residence',       2, 'brooklyn'),
    pt(-73.9890, 40.6945, '1 Pierrepont Plaza',     2, 'brooklyn'),
  ],
};
