import type mapboxgl from 'mapbox-gl';

// ── Canvas Emoji Sticker Renderer ──

type SpriteState = 'normal' | 'selected';

interface SpriteConfig {
  size: number;
  fontSize: number;
  bgRadius: number;
  borderWidth: number;
  borderColor: string;
  shadowBlur: number;
  shadowOffsetY: number;
}

const CONFIGS: Record<SpriteState, SpriteConfig> = {
  normal: {
    size: 48,
    fontSize: 26,
    bgRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowBlur: 4,
    shadowOffsetY: 2,
  },
  selected: {
    size: 64,
    fontSize: 34,
    bgRadius: 29,
    borderWidth: 3,
    borderColor: '#7c3aed',
    shadowBlur: 8,
    shadowOffsetY: 3,
  },
};

// Cache: Map<"emoji_state", HTMLCanvasElement>
const canvasCache = new Map<string, HTMLCanvasElement>();

function cacheKey(emoji: string, state: SpriteState): string {
  return `${emoji}_${state}`;
}

/**
 * Renders an emoji as a sticker on an offscreen canvas.
 * Returns the canvas (cached on subsequent calls).
 */
export function getEmojiCanvas(
  emoji: string,
  state: SpriteState
): HTMLCanvasElement {
  const key = cacheKey(emoji, state);
  const cached = canvasCache.get(key);
  if (cached) return cached;

  const cfg = CONFIGS[state];
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 2;
  const pxSize = cfg.size * dpr;

  const canvas = document.createElement('canvas');
  canvas.width = pxSize;
  canvas.height = pxSize;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  const cx = cfg.size / 2;
  const cy = cfg.size / 2;

  // Drop shadow
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = cfg.shadowBlur;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = cfg.shadowOffsetY;

  // White circle background
  ctx.beginPath();
  ctx.arc(cx, cy, cfg.bgRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Reset shadow for border
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Border
  ctx.beginPath();
  ctx.arc(cx, cy, cfg.bgRadius, 0, Math.PI * 2);
  ctx.strokeStyle = cfg.borderColor;
  ctx.lineWidth = cfg.borderWidth;
  ctx.stroke();

  // Emoji text
  ctx.font = `${cfg.fontSize}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000';
  ctx.fillText(emoji, cx, cy + 1);

  canvasCache.set(key, canvas);
  return canvas;
}

// ── Mapbox Image Registry ──

const registeredImages = new Set<string>();

/**
 * Image name used in Mapbox's icon-image expression.
 */
export function emojiImageName(emoji: string, state: SpriteState = 'normal'): string {
  return state === 'normal' ? `emoji_${emoji}` : `emoji_${emoji}_selected`;
}

/**
 * Ensures all emojis in the list have their normal + selected images
 * registered on the Mapbox map instance. Idempotent.
 */
export async function ensureEmojiImages(
  map: mapboxgl.Map,
  emojis: string[]
): Promise<void> {
  const unique = Array.from(new Set(emojis));

  for (const emoji of unique) {
    for (const state of ['normal', 'selected'] as SpriteState[]) {
      const name = emojiImageName(emoji, state);
      if (registeredImages.has(name) || map.hasImage(name)) {
        registeredImages.add(name);
        continue;
      }

      const canvas = getEmojiCanvas(emoji, state);
      try {
        const bitmap = await createImageBitmap(canvas);
        if (!map.hasImage(name)) {
          map.addImage(name, bitmap, { sdf: false });
        }
        registeredImages.add(name);
      } catch {
        // Fallback: use canvas directly (some browsers don't support createImageBitmap well)
        if (!map.hasImage(name)) {
          const imgData = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height);
          map.addImage(name, {
            width: canvas.width,
            height: canvas.height,
            data: new Uint8Array(imgData.data.buffer),
          });
        }
        registeredImages.add(name);
      }
    }
  }
}
