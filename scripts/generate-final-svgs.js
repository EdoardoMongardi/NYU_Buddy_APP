const fs = require('fs');
const path = require('path');

const FINAL_DIR = path.join(__dirname, '../public/brand/final');

if (!fs.existsSync(FINAL_DIR)) {
    fs.mkdirSync(FINAL_DIR, { recursive: true });
}

// Brand Tokens 
const tokens = {
    generic: {
        primary: '#1e293b', // slate-800
        accent: '#475569', // slate-600
        background: '#f8fafc', // slate-50
    },
    nyu: {
        primary: '#1e293b', // slate-800
        accent: '#8b5cf6', // violet-500
        background: '#f5f3ff', // violet-50
    },
    neutral: {
        white: '#ffffff',
        black: '#0f172a',
    },
    typography: {
        fontFamily: "'Inter', -apple-system, sans-serif"
    }
};

fs.writeFileSync(path.join(FINAL_DIR, 'brand-tokens.json'), JSON.stringify(tokens, null, 2));

// SVG Builders (using consistent sizing)
const renderMark = (paths) => `<svg viewBox="0 0 100 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <g stroke-linecap="round" stroke-linejoin="round">
    ${paths}
  </g>
</svg>`;

const renderIcon = (paths) => `<svg viewBox="0 0 120 120" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <rect width="120" height="120" rx="28" fill="${tokens.generic.primary}"/>
  <g transform="translate(10, 10)">
    <g stroke-linecap="round" stroke-linejoin="round">
      ${paths}
    </g>
  </g>
</svg>`;

const renderLockup = (paths, text, isNYU = false) => {
    // Better optical centering and kerning for lockup
    const textColor = tokens.generic.primary;
    return `<svg viewBox="0 0 320 100" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(15, 10) scale(0.8)">
    <g stroke-linecap="round" stroke-linejoin="round">
      ${paths}
    </g>
  </g>
  <text x="110" y="58" font-family="${tokens.typography.fontFamily}" font-weight="700" font-size="34" letter-spacing="-0.03em" fill="${textColor}">
    ${text}
  </text>
</svg>`;
}

// Refined Concept C Geometry:
// Kept the original silhouette and "B" structure exactly as requested.
// Refinements:
// 1) Consistent 12px stroke weight for both the stem and the loops.
// 2) The core dot is intentionally placed at the intersection (50, 50).
const getGeometry = (primaryColor, dotColor) => `
  <!-- The exact original continuous 'B' shape -->
  <path d="M 30 20 L 30 80" fill="none" stroke="${primaryColor}" stroke-width="12" stroke-linecap="round" />
  <path d="M 30 20 Q 70 20 70 40 Q 70 50 50 50 Q 80 50 80 65 Q 80 80 30 80" fill="none" stroke="${primaryColor}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" />
  
  <!-- Original dot placement with 40% opacity -->
  <circle cx="50" cy="50" r="10" fill="${dotColor}" stroke="none" opacity="0.4" />
`;

// 1. mark.svg (Neutral, purely for form)
fs.writeFileSync(path.join(FINAL_DIR, 'mark.svg'), renderMark(getGeometry('currentColor', 'currentColor')));

// 2. icon.svg (Square icon, white paths on dark generic primary bg. Dot matches paths)
fs.writeFileSync(path.join(FINAL_DIR, 'icon.svg'), renderIcon(getGeometry(tokens.neutral.white, tokens.neutral.white)));

// 3. lockup-generic.svg (Generic primary text, generic accent dot)
fs.writeFileSync(path.join(FINAL_DIR, 'lockup-generic.svg'), renderLockup(getGeometry(tokens.generic.primary, tokens.generic.accent), 'Buddy'));

// 4. lockup-nyu.svg (Generic primary text, NYU purple accent dot)
fs.writeFileSync(path.join(FINAL_DIR, 'lockup-nyu.svg'), renderLockup(getGeometry(tokens.nyu.primary, tokens.nyu.accent), 'NYU Buddy', true));

console.log('Successfully generated Final assets.');
