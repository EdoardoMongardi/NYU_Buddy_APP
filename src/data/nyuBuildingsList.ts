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
  { id: 'bobst-library',        name: 'Bobst Library',              address: '70 Washington Square South',   campus: 'manhattan', tier: 1, lat: 40.72920, lng: -73.99724 },
  { id: 'kimmel-center',        name: 'Kimmel Center',              address: '60 Washington Square South',   campus: 'manhattan', tier: 1, lat: 40.72905, lng: -73.99790 },
  { id: 'vanderbilt-hall',      name: 'Vanderbilt Hall',            address: '40 Washington Square South',   campus: 'manhattan', tier: 1, lat: 40.72877, lng: -73.99835 },
  { id: 'silver-center',        name: 'Silver Center',              address: '100 Washington Square East',   campus: 'manhattan', tier: 1, lat: 40.72960, lng: -73.99595 },
  { id: 'kevorkian-center',     name: 'Kevorkian Center',           address: '50 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72885, lng: -73.99760 },
  { id: 'king-juan-carlos',     name: 'King Juan Carlos I Center',  address: '53 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72872, lng: -73.99740 },
  { id: 'skirball-dept',        name: 'Skirball Department',        address: '53 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72868, lng: -73.99736 },
  { id: 'gould-plaza',          name: 'Gould Plaza',                address: '52 Washington Square South',   campus: 'manhattan', tier: 2, lat: 40.72930, lng: -73.99755 },
  { id: 'gould-welcome',        name: 'Gould Welcome Center',       address: '50 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72935, lng: -73.99770 },
  { id: 'hayden-hall',          name: 'Hayden Residence Hall',      address: '33 Washington Square West',    campus: 'manhattan', tier: 2, lat: 40.73050, lng: -73.99870 },

  // ── WSP South & West 3rd/4th ──
  { id: 'stern-tisch-hall',     name: 'Tisch Hall (Stern)',         address: '40 West 4th Street',           campus: 'manhattan', tier: 1, lat: 40.72870, lng: -73.99650 },
  { id: 'courant-institute',    name: 'Courant Institute',          address: '251 Mercer Street',            campus: 'manhattan', tier: 1, lat: 40.72780, lng: -73.99630 },
  { id: 'schwartz-shimkin',     name: 'Schwartz Plaza / Shimkin',   address: '50 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72870, lng: -73.99710 },
  { id: 'kaufman-management',   name: 'Kaufman Management Center',  address: '44 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72858, lng: -73.99670 },
  { id: 'education-building',   name: 'Education Building',         address: '35 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72845, lng: -73.99620 },
  { id: 'student-services',     name: 'Student Services Center',    address: '25 West 4th Street',           campus: 'manhattan', tier: 2, lat: 40.72835, lng: -73.99580 },
  { id: 'dagostino-hall',       name: "D'Agostino Hall",            address: '110 West 3rd Street',          campus: 'manhattan', tier: 2, lat: 40.72830, lng: -73.99920 },
  { id: 'furman-hall',          name: 'Furman Hall',                address: '245 Sullivan Street',          campus: 'manhattan', tier: 2, lat: 40.72760, lng: -73.99870 },
  { id: 'skirball-center',     name: 'Skirball Center',            address: '566 LaGuardia Place',          campus: 'manhattan', tier: 2, lat: 40.72690, lng: -73.99900 },

  // ── Washington Place / Waverly ──
  { id: 'meyer-hall',           name: 'Meyer Hall',                 address: '4 Washington Place',           campus: 'manhattan', tier: 2, lat: 40.72985, lng: -73.99665 },
  { id: 'psychology-bldg',      name: 'Psychology Building',        address: '6 Washington Place',           campus: 'manhattan', tier: 2, lat: 40.72990, lng: -73.99645 },
  { id: 'brown-building',       name: 'Brown Building',             address: '29 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.73015, lng: -73.99560 },
  { id: 'pless-annex',          name: 'Pless Annex',                address: '26 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.73020, lng: -73.99580 },
  { id: 'bookstore',            name: 'NYU Bookstore',              address: '18 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.73000, lng: -73.99630 },
  { id: 'public-safety',        name: 'Public Safety',              address: '14 Washington Place',          campus: 'manhattan', tier: 2, lat: 40.72995, lng: -73.99650 },
  { id: 'waverly-building',     name: 'Waverly Building',           address: '24 Waverly Place',             campus: 'manhattan', tier: 2, lat: 40.73020, lng: -73.99700 },
  { id: 'rufus-smith',          name: 'Rufus D. Smith Hall',        address: '25 Waverly Place',             campus: 'manhattan', tier: 2, lat: 40.73035, lng: -73.99680 },
  { id: 'torch-club',           name: 'Torch Club',                 address: '18 Waverly Place',             campus: 'manhattan', tier: 2, lat: 40.73030, lng: -73.99620 },

  // ── Washington Square East / Greene ──
  { id: 'goddard-hall',         name: 'Goddard Hall',               address: '79 Washington Square East',    campus: 'manhattan', tier: 2, lat: 40.72955, lng: -73.99560 },
  { id: 'pless-hall',           name: 'Pless Hall',                 address: '82 Washington Square East',    campus: 'manhattan', tier: 2, lat: 40.72945, lng: -73.99545 },
  { id: 'east-building',        name: 'East Building',              address: '239 Greene Street',            campus: 'manhattan', tier: 2, lat: 40.72940, lng: -73.99530 },
  { id: 'kimball-hall',         name: 'Kimball Hall',               address: '246 Greene Street',            campus: 'manhattan', tier: 2, lat: 40.72960, lng: -73.99510 },
  { id: 'lipton-hall',          name: 'Lipton Hall',                address: '108 Washington Square East',   campus: 'manhattan', tier: 2, lat: 40.72925, lng: -73.99590 },

  // ── Broadway corridor ──
  { id: 'tisch-school',         name: 'Tisch School of the Arts',   address: '721 Broadway',                 campus: 'manhattan', tier: 1, lat: 40.72960, lng: -73.99360 },
  { id: '726-broadway',         name: '726 Broadway',               address: '726 Broadway',                 campus: 'manhattan', tier: 2, lat: 40.73005, lng: -73.99375 },
  { id: 'moses-center',         name: 'Moses Center',               address: '715 Broadway',                 campus: 'manhattan', tier: 2, lat: 40.72940, lng: -73.99340 },

  // ── Washington Mews ──
  { id: 'deutsches-haus',       name: 'Deutsches Haus',             address: '42 Washington Mews',           campus: 'manhattan', tier: 2, lat: 40.73080, lng: -73.99680 },
  { id: 'glucksman-ireland',    name: 'Glucksman Ireland House',    address: '1 Washington Mews',            campus: 'manhattan', tier: 2, lat: 40.73070, lng: -73.99590 },
  { id: 'inst-french-studies',  name: 'Inst. of French Studies',    address: '15 Washington Mews',           campus: 'manhattan', tier: 2, lat: 40.73075, lng: -73.99640 },
  { id: 'la-maison-francaise',  name: 'La Maison Française',        address: '16 Washington Mews',           campus: 'manhattan', tier: 2, lat: 40.73078, lng: -73.99650 },

  // ── Washington Square North & 5th Ave ──
  { id: 'grad-school-arts',     name: 'Graduate School of Arts & Science', address: '6 Washington Square North', campus: 'manhattan', tier: 2, lat: 40.73100, lng: -73.99770 },
  { id: '60-fifth-ave',         name: '60 Fifth Avenue',            address: '60 Fifth Avenue',              campus: 'manhattan', tier: 2, lat: 40.73130, lng: -73.99700 },

  // ── 8th–10th St area ──
  { id: 'cantor-film-center',   name: 'Cantor Film Center',         address: '36 East 8th Street',           campus: 'manhattan', tier: 2, lat: 40.73055, lng: -73.99350 },
  { id: 'bronfman-center',      name: 'Bronfman Center',            address: '7 East 10th Street',           campus: 'manhattan', tier: 2, lat: 40.73130, lng: -73.99490 },
  { id: 'lillian-vernon',       name: 'Lillian Vernon Center',      address: '58 West 10th Street',          campus: 'manhattan', tier: 2, lat: 40.73200, lng: -73.99850 },
  { id: 'casa-italiana',        name: 'Casa Italiana',              address: '24 West 12th Street',          campus: 'manhattan', tier: 2, lat: 40.73300, lng: -73.99650 },

  // ── Residence halls: East Village / Union Square ──
  { id: 'weinstein-hall',       name: 'Weinstein Residence Hall',   address: '11 University Place',          campus: 'manhattan', tier: 2, lat: 40.73065, lng: -73.99360 },
  { id: 'rubin-hall',           name: 'Rubin Residence Hall',       address: '35 Fifth Avenue',              campus: 'manhattan', tier: 2, lat: 40.73100, lng: -73.99470 },
  { id: 'brittany-hall',        name: 'Brittany Residence Hall',    address: '55 East 10th Street',          campus: 'manhattan', tier: 2, lat: 40.73125, lng: -73.99180 },
  { id: 'third-north',          name: 'Third Avenue North',         address: '75 Third Avenue',              campus: 'manhattan', tier: 2, lat: 40.73200, lng: -73.98920 },
  { id: 'founders-hall',        name: 'Founders Hall',              address: '120 East 12th Street',         campus: 'manhattan', tier: 2, lat: 40.73260, lng: -73.98970 },
  { id: 'university-hall',      name: 'University Hall',            address: '110 East 14th Street',         campus: 'manhattan', tier: 2, lat: 40.73430, lng: -73.99010 },
  { id: 'palladium-hall',       name: 'Palladium Hall',             address: '140 East 14th Street',         campus: 'manhattan', tier: 1, lat: 40.73405, lng: -73.98810 },
  { id: 'wasserman-center',     name: 'Wasserman Center',           address: '133 East 13th Street',         campus: 'manhattan', tier: 2, lat: 40.73330, lng: -73.98870 },
  { id: 'alumni-hall',          name: 'Alumni Hall',                address: '33 Third Avenue',              campus: 'manhattan', tier: 2, lat: 40.73300, lng: -73.99050 },
  { id: 'carlyle-court',        name: 'Carlyle Court',              address: '25 Union Square West',         campus: 'manhattan', tier: 2, lat: 40.73590, lng: -73.99090 },
  { id: 'coral-towers',         name: 'Coral Towers',               address: '129 Third Avenue',             campus: 'manhattan', tier: 2, lat: 40.73280, lng: -73.98840 },
  { id: '13th-st-residence',    name: 'Thirteenth St Residence',    address: '47 West 13th Street',          campus: 'manhattan', tier: 2, lat: 40.73410, lng: -73.99430 },
  { id: 'seventh-st-residence', name: 'Seventh St Residence',       address: '40 East 7th Street',           campus: 'manhattan', tier: 2, lat: 40.72920, lng: -73.99100 },

  // ── Bleecker / Houston / Mercer south ──
  { id: '181-mercer',           name: '181 Mercer (Coles)',         address: '181 Mercer Street',            campus: 'manhattan', tier: 1, lat: 40.72620, lng: -73.99590 },
  { id: 'mercer-st-residence',  name: 'Mercer Street Residence',    address: '240 Mercer Street',            campus: 'manhattan', tier: 2, lat: 40.72700, lng: -73.99520 },
  { id: 'provincetown',         name: 'Provincetown Playhouse',     address: '133 MacDougal Street',         campus: 'manhattan', tier: 2, lat: 40.72835, lng: -74.00010 },
  { id: 'silver-towers',        name: 'Silver Towers',              address: '100 Bleecker Street',          campus: 'manhattan', tier: 2, lat: 40.72630, lng: -73.99940 },
  { id: 'mail-services',        name: 'Mail Services',              address: '547 LaGuardia Place',          campus: 'manhattan', tier: 2, lat: 40.72630, lng: -73.99810 },

  // ── More distant Manhattan ──
  { id: 'barney-building',      name: 'Barney Building',            address: '34 Stuyvesant Street',         campus: 'manhattan', tier: 2, lat: 40.73070, lng: -73.98900 },
  { id: 'puck-building',        name: 'Puck Building',              address: '295 Lafayette Street',         campus: 'manhattan', tier: 2, lat: 40.72430, lng: -73.99370 },
  { id: 'housing-office',       name: 'Housing Office',             address: '383 Lafayette Street',         campus: 'manhattan', tier: 2, lat: 40.72680, lng: -73.99200 },
  { id: 'lafayette-residence',  name: 'Lafayette St Residence',     address: '80 Lafayette Street',          campus: 'manhattan', tier: 2, lat: 40.71920, lng: -73.99780 },
  { id: 'second-st-residence',  name: 'Second St Residence',        address: '1 East 2nd Street',            campus: 'manhattan', tier: 2, lat: 40.72500, lng: -73.99310 },
  { id: 'university-plaza',     name: 'University Plaza',           address: '100 Bleecker Street',          campus: 'manhattan', tier: 2, lat: 40.72650, lng: -73.99850 },

  // ═══════════════════════════════════════════════════════════════════════
  // BROOKLYN (MetroTech / Downtown Brooklyn)
  // ═══════════════════════════════════════════════════════════════════════
  { id: 'dibner-building',      name: 'Dibner Building',            address: '5 MetroTech Center',           campus: 'brooklyn', tier: 1, lat: 40.69435, lng: -73.98615 },
  { id: 'rogers-jacobs',        name: 'Rogers Hall / Jacobs',       address: '6 MetroTech Center',           campus: 'brooklyn', tier: 1, lat: 40.69440, lng: -73.98570 },
  { id: '370-jay-street',       name: '370 Jay Street',             address: '370 Jay Street',               campus: 'brooklyn', tier: 1, lat: 40.69310, lng: -73.98720 },
  { id: 'othmer-residence',     name: 'Othmer Residence Hall',      address: '101 Johnson Street',           campus: 'brooklyn', tier: 2, lat: 40.69510, lng: -73.98560 },
  { id: 'wunsch-hall',          name: 'Wunsch Hall',                address: '311 Bridge Street',            campus: 'brooklyn', tier: 2, lat: 40.69350, lng: -73.98410 },
  { id: '1-metrotech',          name: '1 MetroTech Center',         address: '1 MetroTech Center',           campus: 'brooklyn', tier: 2, lat: 40.69380, lng: -73.98530 },
  { id: '2-metrotech',          name: '2 MetroTech Center',         address: '2 MetroTech Center',           campus: 'brooklyn', tier: 2, lat: 40.69340, lng: -73.98470 },
  { id: '325-gold-street',      name: '325 Gold Street',            address: '325 Gold Street',              campus: 'brooklyn', tier: 2, lat: 40.69290, lng: -73.98310 },
  { id: 'jacobs-admin',         name: 'Jacobs Admin Building',      address: '6 MetroTech Center',           campus: 'brooklyn', tier: 2, lat: 40.69450, lng: -73.98580 },
];
