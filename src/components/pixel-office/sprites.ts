// Pixel-art sprite definitions for agent characters
// Based on pixel-agents visual model - 16x24 characters

export const TILE_SIZE = 16;
export const CHAR_W = 16;
export const CHAR_H = 24;

// Animation constants
export const WALK_FRAME_MS = 150;
export const TYPE_FRAME_MS = 300;
export const WALK_SPEED = 48; // px/sec
export const WANDER_PAUSE_MIN = 2000;
export const WANDER_PAUSE_MAX = 8000;

export type Direction = 'down' | 'up' | 'left' | 'right';
export type CharState = 'idle' | 'walk' | 'type';

export interface Palette {
  skin: string;
  shirt: string;
  pants: string;
  hair: string;
  shoes: string;
  outline: string;
}

export const PALETTES: Palette[] = [
  { skin: '#f5c9a0', shirt: '#4a90d9', pants: '#2c3e50', hair: '#5a3825', shoes: '#333', outline: '#222' },
  { skin: '#f0be8a', shirt: '#e74c3c', pants: '#34495e', hair: '#f1c40f', shoes: '#444', outline: '#222' },
  { skin: '#d4a574', shirt: '#27ae60', pants: '#2c3e50', hair: '#1a1a2e', shoes: '#333', outline: '#222' },
  { skin: '#f5c9a0', shirt: '#9b59b6', pants: '#34495e', hair: '#8b4513', shoes: '#444', outline: '#222' },
  { skin: '#d4a574', shirt: '#f39c12', pants: '#2c3e50', hair: '#5a3825', shoes: '#333', outline: '#222' },
  { skin: '#f0be8a', shirt: '#e67e22', pants: '#34495e', hair: '#1a1a2e', shoes: '#444', outline: '#222' },
];

// 16x24 character sprite template (simplified pixel art)
// Each row is 16 pixels wide, 24 rows tall
// Legend: 0=transparent, H=hair, S=skin, C=shirt, P=pants, O=shoes, X=outline
const CHAR_DOWN_IDLE = [
  '0000XXHHHXX00000',
  '000XHHHHHHHX0000',
  '000XHHHHHHHX0000',
  '000XSSSSSSSSX000',
  '000XSESSSESSX000',
  '000XSSSMSSSSX000',
  '000XSSSSSSSX0000',
  '0000XXSSSXX00000',
  '000XCCCCCCCCX000',
  '00XCCCCCCCCCCX00',
  '00XCSCCCCCCSCX00',
  '00XCSCCCCCCSCX00',
  '000XSCCCCCCSXX00',
  '000XXCCCCCCXX000',
  '0000XCCCCCCX0000',
  '0000XPPPPPPX0000',
  '0000XPPPPPPX0000',
  '000XXPPPPPPXX000',
  '000XPPPXXPPPX000',
  '000XPPX00XPPX000',
  '000XPXX00XXPX000',
  '000XXXX00XXXXX00',
  '000XOOX00XOOOX00',
  '000XXXX00XXXXX00',
];

// Generate a sprite bitmap from template and palette
export function generateSprite(palette: Palette): ImageData {
  const canvas = new OffscreenCanvas(CHAR_W, CHAR_H);
  const ctx = canvas.getContext('2d')!;
  const imageData = ctx.createImageData(CHAR_W, CHAR_H);

  for (let y = 0; y < CHAR_H; y++) {
    const row = CHAR_DOWN_IDLE[y] || '';
    for (let x = 0; x < CHAR_W; x++) {
      const ch = row[x] || '0';
      let color: string | null = null;
      switch (ch) {
        case 'H': color = palette.hair; break;
        case 'S': color = palette.skin; break;
        case 'C': color = palette.shirt; break;
        case 'P': color = palette.pants; break;
        case 'O': color = palette.shoes; break;
        case 'X': color = palette.outline; break;
        case 'E': color = '#222222'; break; // eyes
        case 'M': color = palette.skin; break; // mouth
        default: break;
      }
      if (color) {
        const idx = (y * CHAR_W + x) * 4;
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        imageData.data[idx] = r;
        imageData.data[idx + 1] = g;
        imageData.data[idx + 2] = b;
        imageData.data[idx + 3] = 255;
      }
    }
  }
  return imageData;
}

// Desk sprite (32x24 - 2 tiles wide)
export const DESK_COLOR = '#8B6914';
export const DESK_TOP = '#A0782C';
export const DESK_SHADOW = '#6B5010';

// Monitor sprite on desk
export const MONITOR_FRAME = '#333';
export const MONITOR_SCREEN = '#0a1628';
export const MONITOR_SCREEN_ON = '#1a3a5c';

// Floor tile colors
export const FLOOR_LIGHT = '#2a2a3e';
export const FLOOR_DARK = '#242438';
export const FLOOR_ACCENT = '#1e1e32';

// Bubble sprites
export interface BubbleType {
  bg: string;
  icon: string;
  color: string;
}

export const BUBBLES = {
  thinking: { bg: '#fff', icon: '...', color: '#f59e0b' },
  working: { bg: '#fff', icon: '⚡', color: '#3b82f6' },
  done: { bg: '#fff', icon: '✓', color: '#22c55e' },
  error: { bg: '#fff', icon: '!', color: '#ef4444' },
  waiting: { bg: '#fff', icon: '⏳', color: '#a855f7' },
} as const;
