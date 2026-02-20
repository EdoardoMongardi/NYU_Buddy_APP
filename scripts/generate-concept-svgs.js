const fs = require('fs');
const path = require('path');

const CONCEPTS = ['A', 'B', 'C', 'D', 'E', 'F'];
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
    // A) Beacon/Pulse + location hint
    A: `
    <circle cx="50" cy="80" r="8" stroke="none" />
    <path d="M 30 55 Q 50 35 70 55" fill="none" stroke-width="8" />
    <path d="M 15 40 Q 50 5 85 40" fill="none" stroke-width="8" />
  `,
    // B) Two dots meeting (buddy encounter) + subtle pin
    B: `
    <circle cx="25" cy="40" r="12" stroke="none" />
    <circle cx="75" cy="40" r="12" stroke="none" />
    <path d="M 25 40 Q 50 90 75 40" fill="none" stroke-width="8" />
  `,
    // C) Map glyph + abstract "B"
    C: `
    <path d="M 30 20 L 70 20 L 80 80 L 20 80 Z" fill="none" stroke-width="8" />
    <path d="M 30 20 L 50 80" fill="none" stroke-width="8" />
    <circle cx="65" cy="45" r="8" stroke="none" />
  `,
    // D) Minimal monogram (NB)
    D: `
    <path d="M 25 80 L 25 20 L 60 80 L 60 20" fill="none" stroke-width="8" />
    <path d="M 60 50 Q 80 50 80 65 Q 80 80 60 80" fill="none" stroke-width="8" />
    <path d="M 60 20 Q 75 20 75 35 Q 75 50 60 50" fill="none" stroke-width="8" />
  `,
    // E) Route/path convergence
    E: `
    <path d="M 20 80 C 20 50 80 50 50 20" fill="none" stroke-width="8" />
    <path d="M 80 80 C 80 50 20 50 50 20" fill="none" stroke-width="8" />
    <circle cx="50" cy="20" r="10" stroke="none" />
  `,
    // F) Rounded-square badge mark
    F: `
    <rect x="20" y="20" width="60" height="60" rx="16" fill="none" stroke-width="8" />
    <circle cx="50" cy="50" r="12" stroke="none" />
    <path d="M 20 20 L 35 35 M 80 80 L 65 65" fill="none" stroke-width="6" />
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
