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
  // A) Friendly Mascot/Robot Face (Literal Buddy)
  A: `
    <rect x="25" y="25" width="50" height="50" rx="16" fill="none" stroke-width="8" stroke-linejoin="round" />
    <circle cx="40" cy="45" r="5" fill="currentColor" stroke="none" />
    <circle cx="60" cy="45" r="5" fill="currentColor" stroke="none" />
    <path d="M 40 60 Q 50 68 60 60" fill="none" stroke-width="6" stroke-linecap="round" />
    <path d="M 25 40 L 15 40 M 75 40 L 85 40" fill="none" stroke-width="6" stroke-linecap="round" />
    <path d="M 40 25 L 40 15 M 60 25 L 60 15" fill="none" stroke-width="6" stroke-linecap="round" />
  `,
  // B) Two Toasting Coffee Cups (Meet up)
  B: `
    <path d="M 25 35 L 45 35 L 40 65 C 40 70 30 70 30 65 Z" fill="none" stroke-width="6" stroke-linejoin="round" />
    <path d="M 45 42 C 52 42 52 52 43 52" fill="none" stroke-width="6" stroke-linecap="round" />
    <path d="M 55 25 L 75 25 L 70 55 C 70 60 60 60 60 55 Z" fill="none" stroke-width="6" stroke-linejoin="round" />
    <path d="M 75 32 C 82 32 82 42 73 42" fill="none" stroke-width="6" stroke-linecap="round" />
    <path d="M 33 25 C 33 15 36 20 36 10 M 63 15 C 63 5 66 10 66 0" fill="none" stroke-width="4" stroke-linecap="round" opacity="0.5" />
  `,
  // C) Bold geometric letter "B" and location pin fusion
  C: `
    <path d="M 30 20 L 30 80" fill="none" stroke-width="12" stroke-linecap="round" />
    <path d="M 30 20 Q 70 20 70 40 Q 70 50 50 50 Q 80 50 80 65 Q 80 80 30 80" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" opacity="0.4" />
  `,
  // D) Open Book (Academic Buddy)
  D: `
    <path d="M 50 75 L 50 25 L 50 80" fill="none" stroke-width="6" stroke-linecap="round" />
    <path d="M 50 75 C 35 75 20 70 20 60 L 20 20 C 35 30 50 25 50 25" fill="none" stroke-width="6" stroke-linejoin="round" />
    <path d="M 50 75 C 65 75 80 70 80 60 L 80 20 C 65 30 50 25 50 25" fill="none" stroke-width="6" stroke-linejoin="round" />
    <path d="M 30 40 L 40 40 M 30 55 L 40 55 M 60 40 L 70 40 M 60 55 L 70 55" fill="none" stroke-width="4" stroke-linecap="round" opacity="0.5" />
  `,
  // E) Two Hands High-Five / Holding
  E: `
    <path d="M 40 65 L 40 35 Q 40 28 35 28 Q 30 28 30 35 L 30 60 M 35 30 L 35 25 Q 35 20 40 20 C 45 20 50 25 50 35 L 50 55 C 50 65 45 75 35 75 Z" fill="none" stroke-width="6" stroke-linejoin="round" />
    <path d="M 60 65 L 60 35 Q 60 28 65 28 Q 70 28 70 35 L 70 60 M 65 30 L 65 25 Q 65 20 60 20 C 55 20 50 25 50 35 L 50 55 C 50 65 55 75 65 75 Z" fill="none" stroke-width="6" stroke-linejoin="round" />
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
