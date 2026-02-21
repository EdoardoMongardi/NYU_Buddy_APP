/**
 * Canonical list of NYU buildings for footprint fetching.
 *
 * Sources:
 *   - Manhattan campus map PDF (nyu.edu)
 *   - Brooklyn campus map PDF (engineering.nyu.edu)
 *
 * Each entry has an approximate lat/lng (must be INSIDE or very near the
 * physical building for point-in-polygon matching against NYC Open Data).
 *
 * Tier 1 = major / well-known (labels shown at zoom ≥ 15)
 * Tier 2 = secondary (labels shown at zoom ≥ 16.5)
 */

export interface NyuBuilding {
  id: string;
  name: string;
  address: string;
  campus: 'manhattan' | 'brooklyn';
  tier: 1 | 2;
  lat: number;
  lng: number;
}

export const nyuBuildings: NyuBuilding[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // MANHATTAN
  // ═══════════════════════════════════════════════════════════════════════

  // ── Washington Square Park core ──
  // Bobst is the large square library building between WSS & W 4th, LaGuardia & Mercer
  { id: 'bobst-library',        name: 'Bobst Library',              address: '70 Washington Square South',   campus: 'manhattan', tier: 1, lat: 40.72935, lng: -73.99710 },
  // Kimmel is WEST of Bobst, between Thompson & LaGuardia on WSS
  { id: 'kimmel-center',        name: 'Kimmel Center',              address: '60 Washington Square South',   campus: 'manhattan', tier: 1, lat: 40.72895, lng: -73.99835 },
  // Vanderbilt is WEST of Kimmel, between MacDougal & Thompson on WSS
  { id: 'vanderbilt-hall',      name: 'Vanderbilt Hall',            address: '40 Washington Square South',   campus: 'manhattan', tier: 1, lat: 40.72880, lng: -73.99910 },
  // Silver Center is on WSE between Washington Pl & W 4th
  { id: 'silver-center',        name: 'Silver Center',              address: '100 Washington Square East',   campus: 'manhattan', tier: 1, lat: 40.72975, lng: -73.99575 },
  // Kevorkian/King Juan Carlos/Skirball share one building south of Bobst
  { id: 'kevorkian-center',     name: 'Kevorkian Center',           address: '50 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72870, lng: -73.99735 },
  { id: 'king-juan-carlos',     name: 'King Juan Carlos I Center',  address: '53 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72865, lng: -73.99730 },
  { id: 'skirball-dept',        name: 'Skirball Department',        address: '53 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72860, lng: -73.99725 },
  // Gould Plaza is the open area in front of Bobst — skip or use Bobst coords
  { id: 'gould-plaza',          name: 'Gould Plaza',                address: '52 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72945, lng: -73.99720 },
  // Gould Welcome Center / Shimkin is on W 4th between Mercer & Greene
  { id: 'gould-welcome',        name: 'Gould Welcome Center',       address: '50 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72870, lng: -73.99660 },
  // Hayden is on WSW near 5th Ave
  { id: 'hayden-hall',          name: 'Hayden Residence Hall',      address: '33 Washington Square West',    campus: 'manhattan', tier: 2, lat: 40.73060, lng: -73.99900 },

  // ── WSP South & West 3rd/4th ──
  // Tisch/Stern is on W 4th between Mercer & Greene (south side)
  { id: 'stern-tisch-hall',     name: 'Tisch Hall (Stern)',         address: '40 West 4th Street',           campus: 'manhattan', tier: 1, lat: 40.72840, lng: -73.99600 },
  // Courant is on Mercer between W 3rd & W 4th
  { id: 'courant-institute',    name: 'Courant Institute',          address: '251 Mercer Street',            campus: 'manhattan', tier: 1, lat: 40.72810, lng: -73.99555 },
  // Shimkin/Schwartz is between Bobst and Stern on W 4th
  { id: 'schwartz-shimkin',     name: 'Schwartz Plaza / Shimkin',   address: '50 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72870, lng: -73.99660 },
  // Kaufman is in the Stern complex on W 4th
  { id: 'kaufman-management',   name: 'Kaufman Management Center',  address: '44 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72845, lng: -73.99615 },
  // Education Building is on W 4th near Greene
  { id: 'education-building',   name: 'Education Building',         address: '35 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72830, lng: -73.99560 },
  // Student Services is on W 4th near Greene/Mercer
  { id: 'student-services',     name: 'Student Services Center',    address: '25 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72910, lng: -73.99540 },
  // D'Agostino is on W 3rd between MacDougal & Sullivan
  { id: 'dagostino-hall',       name: "D'Agostino Hall",            address: '110 West 3rd Street',          campus: 'manhattan', tier: 2, lat: 40.72810, lng: -73.99950 },
  // Furman Hall is on Sullivan between W 3rd & Bleecker
  { id: 'furman-hall',          name: 'Furman Hall',                address: '245 Sullivan Street',          campus: 'manhattan', tier: 2, lat: 40.72775, lng: -73.99880 },
  // Skirball performing arts center is on LaGuardia south of W 3rd
  { id: 'skirball-center',     name: 'Skirball Center',            address: '566 LaGuardia Place',          campus: 'manhattan', tier: 2, lat: 40.72740, lng: -73.99820 },

  // ── Washington Place / Waverly ──
  { id: 'meyer-hall',           name: 'Meyer Hall',                 address: '4 Washington Place',           campus: 'manhattan', tier: 2, lat: 40.72985, lng: -73.99620 },
  { id: 'psychology-bldg',      name: 'Psychology Building',        address: '6 Washington Place',           campus: 'manhattan', tier: 2, lat: 40.72980, lng: -73.99600 },
  { id: 'brown-building',       name: 'Brown Building',             address: '29 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.73010, lng: -73.99545 },
  { id: 'pless-annex',          name: 'Pless Annex',                address: '26 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.73005, lng: -73.99555 },
  { id: 'bookstore',            name: 'NYU Bookstore',              address: '18 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.72990, lng: -73.99595 },
  { id: 'public-safety',        name: 'Public Safety',              address: '14 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.72985, lng: -73.99610 },
  { id: 'waverly-building',     name: 'Waverly Building',           address: '24 Waverly Place',             campus: 'manhattan', tier: 2, lat: 40.73060, lng: -73.99670 },
  { id: 'rufus-smith',          name: 'Rufus D. Smith Hall',        address: '25 Waverly Place',             campus: 'manhattan', tier: 2, lat: 40.73055, lng: -73.99650 },
  { id: 'torch-club',           name: 'Torch Club',                 address: '18 Waverly Place',             campus: 'manhattan', tier: 2, lat: 40.73040, lng: -73.99600 },

  // ── Washington Square East / Greene ──
  { id: 'goddard-hall',         name: 'Goddard Hall',               address: '79 Washington Square East',    campus: 'manhattan', tier: 2, lat: 40.72965, lng: -73.99555 },
  { id: 'pless-hall',           name: 'Pless Hall',                 address: '82 Washington Square East',    campus: 'manhattan', tier: 2, lat: 40.72990, lng: -73.99585 },
  { id: 'east-building',        name: 'East Building',              address: '239 Greene Street',            campus: 'manhattan', tier: 2, lat: 40.72970, lng: -73.99545 },
  { id: 'kimball-hall',         name: 'Kimball Hall',               address: '246 Greene Street',            campus: 'manhattan', tier: 2, lat: 40.73010, lng: -73.99490 },
  { id: 'lipton-hall',          name: 'Lipton Hall',                address: '108 Washington Square East',   campus: 'manhattan', tier: 2, lat: 40.72950, lng: -73.99575 },

  // ── Broadway corridor ──
  { id: 'tisch-school',         name: 'Tisch School of the Arts',   address: '721 Broadway',                 campus: 'manhattan', tier: 1, lat: 40.72960, lng: -73.99360 },
  { id: '726-broadway',         name: '726 Broadway',               address: '726 Broadway',                 campus: 'manhattan', tier: 2, lat: 40.73005, lng: -73.99375 },
  { id: 'moses-center',         name: 'Moses Center',               address: '715 Broadway',                 campus: 'manhattan', tier: 2, lat: 40.72940, lng: -73.99340 },

  // ── Washington Mews ──
  { id: 'deutsches-haus',       name: 'Deutsches Haus',             address: '42 Washington Mews',           campus: 'manhattan', tier: 2, lat: 40.73100, lng: -73.99650 },
  { id: 'glucksman-ireland',    name: 'Glucksman Ireland House',    address: '1 Washington Mews',            campus: 'manhattan', tier: 2, lat: 40.73095, lng: -73.99600 },
  { id: 'inst-french-studies',  name: 'Inst. of French Studies',    address: '15 Washington Mews',           campus: 'manhattan', tier: 2, lat: 40.73098, lng: -73.99620 },
  { id: 'la-maison-francaise',  name: 'La Maison Française',        address: '16 Washington Mews',           campus: 'manhattan', tier: 2, lat: 40.73098, lng: -73.99630 },

  // ── Washington Square North & 5th Ave ──
  { id: 'grad-school-arts',     name: 'Graduate School of Arts & Science', address: '6 Washington Square North', campus: 'manhattan', tier: 2, lat: 40.73110, lng: -73.99740 },
  { id: '60-fifth-ave',         name: '60 Fifth Avenue',            address: '60 Fifth Avenue',              campus: 'manhattan', tier: 2, lat: 40.73160, lng: -73.99710 },

  // ── 8th–10th St area ──
  { id: 'cantor-film-center',   name: 'Cantor Film Center',         address: '36 East 8th Street',           campus: 'manhattan', tier: 2, lat: 40.73055, lng: -73.99350 },
  { id: 'bronfman-center',      name: 'Bronfman Center',            address: '7 East 10th Street',           campus: 'manhattan', tier: 2, lat: 40.73130, lng: -73.99490 },
  { id: 'lillian-vernon',       name: 'Lillian Vernon Center',      address: '58 West 10th Street',          campus: 'manhattan', tier: 2, lat: 40.73200, lng: -73.99850 },
  { id: 'casa-italiana',        name: 'Casa Italiana',              address: '24 West 12th Street',          campus: 'manhattan', tier: 2, lat: 40.73300, lng: -73.99650 },

  // ── Residence halls: East Village / Union Square ──
  { id: 'weinstein-hall',       name: 'Weinstein Residence Hall',   address: '11 University Place',          campus: 'manhattan', tier: 2, lat: 40.73110, lng: -73.99490 },
  { id: 'rubin-hall',           name: 'Rubin Residence Hall',       address: '35 Fifth Avenue',              campus: 'manhattan', tier: 2, lat: 40.73350, lng: -73.99510 },
  { id: 'brittany-hall',        name: 'Brittany Residence Hall',    address: '55 East 10th Street',          campus: 'manhattan', tier: 2, lat: 40.73200, lng: -73.99180 },
  { id: 'third-north',          name: 'Third Avenue North',         address: '75 Third Avenue',              campus: 'manhattan', tier: 2, lat: 40.73160, lng: -73.98805 },
  { id: 'founders-hall',        name: 'Founders Hall',              address: '120 East 12th Street',         campus: 'manhattan', tier: 2, lat: 40.73210, lng: -73.98925 },
  { id: 'university-hall',      name: 'University Hall',            address: '110 East 14th Street',         campus: 'manhattan', tier: 2, lat: 40.73385, lng: -73.98910 },
  { id: 'palladium-hall',       name: 'Palladium Hall',             address: '140 East 14th Street',         campus: 'manhattan', tier: 1, lat: 40.73340, lng: -73.98810 },
  { id: 'wasserman-center',     name: 'Wasserman Center',           address: '133 East 13th Street',         campus: 'manhattan', tier: 2, lat: 40.73310, lng: -73.98860 },
  { id: 'alumni-hall',          name: 'Alumni Hall',                address: '33 Third Avenue',              campus: 'manhattan', tier: 2, lat: 40.73260, lng: -73.98980 },
  { id: 'carlyle-court',        name: 'Carlyle Court',              address: '25 Union Square West',         campus: 'manhattan', tier: 2, lat: 40.73630, lng: -73.99110 },
  { id: 'coral-towers',         name: 'Coral Towers',               address: '129 Third Avenue',             campus: 'manhattan', tier: 2, lat: 40.73340, lng: -73.98685 },
  { id: '13th-st-residence',    name: 'Thirteenth St Residence',    address: '47 West 13th Street',          campus: 'manhattan', tier: 2, lat: 40.73640, lng: -73.99630 },
  { id: 'seventh-st-residence', name: 'Seventh St Residence',       address: '40 East 7th Street',           campus: 'manhattan', tier: 2, lat: 40.72810, lng: -73.98870 },

  // ── Bleecker / Houston / Mercer south ──
  { id: '181-mercer',           name: '181 Mercer (Coles)',         address: '181 Mercer Street',            campus: 'manhattan', tier: 1, lat: 40.72675, lng: -73.99725 },
  { id: 'mercer-st-residence',  name: 'Mercer Street Residence',    address: '240 Mercer Street',            campus: 'manhattan', tier: 2, lat: 40.72795, lng: -73.99565 },
  { id: 'provincetown',         name: 'Provincetown Playhouse',     address: '133 MacDougal Street',         campus: 'manhattan', tier: 2, lat: 40.72865, lng: -74.00020 },
  { id: 'silver-towers',        name: 'Silver Towers',              address: '100 Bleecker Street',          campus: 'manhattan', tier: 2, lat: 40.72690, lng: -73.99800 },
  { id: 'mail-services',        name: 'Mail Services',              address: '547 LaGuardia Place',          campus: 'manhattan', tier: 2, lat: 40.72855, lng: -73.99810 },

  // ── More distant Manhattan ──
  { id: 'barney-building',      name: 'Barney Building',            address: '34 Stuyvesant Street',         campus: 'manhattan', tier: 2, lat: 40.72985, lng: -73.98800 },
  { id: 'puck-building',        name: 'Puck Building',              address: '295 Lafayette Street',         campus: 'manhattan', tier: 2, lat: 40.72460, lng: -73.99540 },
  { id: 'housing-office',       name: 'Housing Office',             address: '383 Lafayette Street',         campus: 'manhattan', tier: 2, lat: 40.72680, lng: -73.99200 },
  { id: 'lafayette-residence',  name: 'Lafayette St Residence',     address: '80 Lafayette Street',          campus: 'manhattan', tier: 2, lat: 40.71920, lng: -73.99780 },
  { id: 'second-st-residence',  name: 'Second St Residence',        address: '1 East 2nd Street',            campus: 'manhattan', tier: 2, lat: 40.72500, lng: -73.99310 },
  { id: 'university-plaza',     name: 'University Plaza',           address: '100 Bleecker Street',          campus: 'manhattan', tier: 2, lat: 40.72690, lng: -73.99850 },

  // ═══════════════════════════════════════════════════════════════════════
  // BROOKLYN (MetroTech / Downtown Brooklyn)
  // ═══════════════════════════════════════════════════════════════════════
  { id: 'dibner-building',      name: 'Dibner Building',            address: '5 MetroTech Center',           campus: 'brooklyn', tier: 1, lat: 40.69455, lng: -73.98600 },
  { id: 'rogers-jacobs',        name: 'Rogers Hall / Jacobs',       address: '6 MetroTech Center',           campus: 'brooklyn', tier: 1, lat: 40.69465, lng: -73.98560 },
  { id: '370-jay-street',       name: '370 Jay Street',             address: '370 Jay Street',               campus: 'brooklyn', tier: 1, lat: 40.69340, lng: -73.98690 },
  { id: 'othmer-residence',     name: 'Othmer Residence Hall',      address: '101 Johnson Street',           campus: 'brooklyn', tier: 2, lat: 40.69530, lng: -73.98560 },
  { id: 'wunsch-hall',          name: 'Wunsch Hall',                address: '311 Bridge Street',            campus: 'brooklyn', tier: 2, lat: 40.69360, lng: -73.98430 },
  { id: '1-metrotech',          name: '1 MetroTech Center',         address: '1 MetroTech Center',           campus: 'brooklyn', tier: 2, lat: 40.69400, lng: -73.98560 },
  { id: '2-metrotech',          name: '2 MetroTech Center',         address: '2 MetroTech Center',           campus: 'brooklyn', tier: 2, lat: 40.69350, lng: -73.98470 },
  { id: '325-gold-street',      name: '325 Gold Street',            address: '325 Gold Street',              campus: 'brooklyn', tier: 2, lat: 40.69320, lng: -73.98340 },
  { id: 'jacobs-admin',         name: 'Jacobs Admin Building',      address: '6 MetroTech Center',           campus: 'brooklyn', tier: 2, lat: 40.69470, lng: -73.98565 },
];
