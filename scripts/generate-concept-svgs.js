const fs = require('fs');
const path = require('path');

const CONCEPTS = ['C1', 'C2', 'C3', 'F1', 'F2', 'F3'];
const BASE_DIR = path.join(__dirname, '../public/brand/concepts');

const BRAND_COLORS = {
  generic: '#1e293b', // slate-800
  nyu: '#8b5cf6', // violet-500
  white: '#ffffff',
  bgMark: 'transparent',
  bgIconGen: '#f1f5f9', // slate-100
};

// SVG Builders
const renderMark = (paths, color) => `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <g fill="${color}" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
    ${paths}
  </g>
</svg>`;

const renderIcon = (paths, color, bgColor) => `<svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="120" rx="30" fill="${bgColor}"/>
  <g transform="translate(10, 10)">
    <g fill="${color}" stroke="${color}" stroke-linecap="round" stroke-linejoin="round">
      ${paths}
    </g>
  </g>
</svg>`;

const renderLockup = (paths, markColor, text, textColor) => `<svg viewBox="0 0 300 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(10, 10) scale(0.8)">
    <g fill="${markColor}" stroke="${markColor}" stroke-linecap="round" stroke-linejoin="round">
      ${paths}
    </g>
  </g>
  <text x="100" y="56" font-family="'Inter', -apple-system, sans-serif" font-weight="700" font-size="32" letter-spacing="-0.02em" fill="${textColor}">
    ${text}
  </text>
</svg>`;

const geometries = {
  // C1: Keeps 'destination' feeling but distorts the B shape into abstract folding path
  C1: `
    <path d="M 35 20 L 35 80" fill="none" stroke-width="12" stroke-linecap="round" />
    <path d="M 35 20 Q 75 20 75 40 Q 75 50 55 50 Q 85 50 85 65 Q 85 80 35 80" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="55" cy="50" r="8" fill="currentColor" stroke="none" />
  `,
  // C2: Abstract geometry resembling a route/map pin cluster without explicit letters
  C2: `
    <path d="M 30 75 Q 30 25 50 25 Q 70 25 70 50 Q 70 75 30 75 Z" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="50" cy="50" r="12" fill="none" stroke-width="10" />
    <circle cx="50" cy="50" r="4" fill="currentColor" stroke="none" />
  `,
  // C3: Heavily abstracted "B" resembling two linked map locations
  C3: `
    <path d="M 40 20 A 15 15 0 1 1 40 50 A 15 15 0 1 1 40 80" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="40" cy="35" r="5" fill="currentColor" stroke="none" />
    <circle cx="40" cy="65" r="5" fill="currentColor" stroke="none" />
    <path d="M 25 20 L 25 80" fill="none" stroke-width="12" stroke-linecap="round" />
  `,
  // F1: Open-ring container with two buddy dots meeting in the center
  F1: `
    <path d="M 20 40 A 30 30 0 1 1 20 60" fill="none" stroke-width="10" stroke-linecap="round" />
    <circle cx="40" cy="50" r="8" fill="currentColor" stroke="none" />
    <circle cx="60" cy="50" r="8" fill="currentColor" stroke="none" />
  `,
  // F2: Geofence frame (dashed/broken squircle) with an expanding pulse center
  F2: `
    <rect x="20" y="20" width="60" height="60" rx="20" fill="none" stroke-width="8" stroke-dasharray="15 10" stroke-linecap="round" />
    <circle cx="50" cy="50" r="15" fill="none" stroke-width="6" opacity="0.5" />
    <circle cx="50" cy="50" r="6" fill="currentColor" stroke="none" />
  `,
  // F3: Non-camera squircle proportions + offset buddy encounter dots (dynamic)
  F3: `
    <rect x="25" y="15" width="50" height="70" rx="25" fill="none" stroke-width="10" />
    <circle cx="50" cy="35" r="8" fill="currentColor" stroke="none" />
    <circle cx="50" cy="65" r="8" fill="currentColor" stroke="none" />
    <path d="M 50 45 L 50 55" fill="none" stroke-width="6" stroke-linecap="round" opacity="0.5" />
  `
};

if (!fs.existsSync(BASE_DIR)) {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

CONCEPTS.forEach(concept => {
  const dir = path.join(BASE_DIR, concept);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const paths = geometries[concept];

  // mark.svg (Neutral)
  fs.writeFileSync(path.join(dir, 'mark.svg'), renderMark(paths, BRAND_COLORS.generic));

  // icon.svg (Neutral on nice bg)
  // For Icon, the prompt wants square-safe icon using ONLY the mark. We can do white background.
  fs.writeFileSync(path.join(dir, 'icon.svg'), renderIcon(paths, BRAND_COLORS.generic, BRAND_COLORS.white));

  // lockup-generic.svg: [mark] + "Buddy"
  fs.writeFileSync(path.join(dir, 'lockup-generic.svg'), renderLockup(paths, BRAND_COLORS.generic, 'Buddy', BRAND_COLORS.generic));

  // lockup-nyu.svg: [mark purple] + "NYU Buddy"
  // Re-read prompt: "accent uses NYU-purple-like token". Text is "NYU Buddy".
  fs.writeFileSync(path.join(dir, 'lockup-nyu.svg'), renderLockup(paths, BRAND_COLORS.nyu, 'NYU Buddy', BRAND_COLORS.generic));
});

console.log('Successfully generated concept SVGs.');
