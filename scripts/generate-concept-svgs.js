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
  // A) Overlapping Chevrons (Forward Movement)
  A: `
    <path d="M 30 20 L 50 50 L 30 80" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M 50 20 L 70 50 L 50 80" fill="none" stroke-width="12" stroke-linecap="round" stroke-linejoin="round" opacity="0.5" />
  `,
  // B) Two abstract speech bubbles/nodes overlapping
  B: `
    <path d="M 25 35 a 20 20 0 1 0 40 0 a 20 20 0 1 0 -40 0" fill="currentColor" fill-opacity="0.2" stroke="none" />
    <path d="M 45 65 a 20 20 0 1 0 40 0 a 20 20 0 1 0 -40 0" fill="none" stroke-width="8" />
    <circle cx="45" cy="35" r="5" fill="currentColor" stroke="none" />
    <circle cx="65" cy="65" r="5" fill="currentColor" stroke="none" />
  `,
  // C) Bold geometric letter "B" and location pin fusion
  C: `
    <path d="M 30 20 L 30 80" fill="none" stroke-width="12" stroke-linecap="round" />
    <path d="M 30 20 Q 70 20 70 40 Q 70 50 50 50 Q 80 50 80 65 Q 80 80 30 80" fill="none" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="50" cy="50" r="10" fill="currentColor" stroke="none" opacity="0.4" />
  `,
  // D) Interlocking Rings (Connection)
  D: `
    <circle cx="40" cy="50" r="22" fill="none" stroke-width="10" />
    <circle cx="65" cy="50" r="22" fill="none" stroke-width="10" opacity="0.6" />
  `,
  // E) Dynamic star/sparkle map point
  E: `
    <path d="M 50 15 Q 50 45 20 50 Q 50 55 50 85 Q 50 55 80 50 Q 50 45 50 15 Z" fill="currentColor" fill-opacity="0.2" stroke-width="6" stroke-linejoin="round" />
    <path d="M 50 25 Q 50 45 30 50 Q 50 55 50 75 Q 50 55 70 50 Q 50 45 50 25 Z" fill="currentColor" stroke="none" />
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
