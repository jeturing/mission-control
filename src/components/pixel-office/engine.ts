// Pixel Office - Game engine: character state, pathfinding, animation
import {
  TILE_SIZE, CHAR_W, CHAR_H, WALK_SPEED, WALK_FRAME_MS, TYPE_FRAME_MS,
  WANDER_PAUSE_MIN, WANDER_PAUSE_MAX,
  PALETTES, FLOOR_LIGHT, FLOOR_DARK,
  DESK_COLOR, DESK_TOP, DESK_SHADOW,
  MONITOR_FRAME, MONITOR_SCREEN_ON,
  type Direction, type CharState, type Palette, type BubbleType, BUBBLES,
} from './sprites';

// ── Types ──────────────────────────────────────────────

export interface OfficeChar {
  id: string;
  name: string;
  emoji: string;
  palette: Palette;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  state: CharState;
  direction: Direction;
  frame: number;
  frameTimer: number;
  path: { x: number; y: number }[];
  pathIdx: number;
  moveProgress: number;
  seatX: number;
  seatY: number;
  bubble: BubbleType | null;
  bubbleTimer: number;
  wanderTimer: number;
  status: 'standby' | 'working' | 'offline';
  taskName: string;
  isSubAgent: boolean;
  // Spawn animation
  spawnProgress: number;
  spawning: boolean;
}

export interface Desk {
  x: number;
  y: number;
  monitorOn: boolean;
  occupantId: string | null;
}

export interface OfficeState {
  chars: Map<string, OfficeChar>;
  desks: Desk[];
  gridW: number;
  gridH: number;
  cameraX: number;
  cameraY: number;
  selectedId: string | null;
}

// ── Grid & Pathfinding ─────────────────────────────────

const WALKABLE = 1;
const BLOCKED = 0;

function createGrid(w: number, h: number, desks: Desk[]): number[][] {
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      grid[y][x] = WALKABLE;
    }
  }
  // Block desk tiles (2x2 each)
  for (const d of desks) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const gy = d.y + dy;
        const gx = d.x + dx;
        if (gy < h && gx < w) grid[gy][gx] = BLOCKED;
      }
    }
  }
  return grid;
}

interface ANode {
  x: number; y: number;
  g: number; h: number; f: number;
  parent: ANode | null;
}

export function findPath(
  grid: number[][],
  sx: number, sy: number,
  ex: number, ey: number
): { x: number; y: number }[] {
  const h = grid.length;
  const w = grid[0]?.length || 0;
  if (sx === ex && sy === ey) return [];
  if (ex < 0 || ey < 0 || ex >= w || ey >= h) return [];
  if (grid[ey]?.[ex] === BLOCKED) {
    // Find nearest walkable neighbor
    const neighbors = [
      { x: ex, y: ey - 1 },
      { x: ex, y: ey + 1 },
      { x: ex - 1, y: ey },
      { x: ex + 1, y: ey },
    ].filter(n => n.x >= 0 && n.y >= 0 && n.x < w && n.y < h && grid[n.y][n.x] === WALKABLE);
    if (neighbors.length === 0) return [];
    const nearest = neighbors.sort((a, b) =>
      Math.abs(a.x - sx) + Math.abs(a.y - sy) - Math.abs(b.x - sx) - Math.abs(b.y - sy)
    )[0];
    ex = nearest.x;
    ey = nearest.y;
  }

  const open: ANode[] = [];
  const closed = new Set<string>();
  const key = (x: number, y: number) => `${x},${y}`;
  const heuristic = (x: number, y: number) => Math.abs(x - ex) + Math.abs(y - ey);

  open.push({ x: sx, y: sy, g: 0, h: heuristic(sx, sy), f: heuristic(sx, sy), parent: null });

  while (open.length > 0) {
    open.sort((a, b) => a.f - b.f);
    const curr = open.shift()!;
    if (curr.x === ex && curr.y === ey) {
      const path: { x: number; y: number }[] = [];
      let node: ANode | null = curr;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path.slice(1); // Skip start position
    }
    closed.add(key(curr.x, curr.y));

    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const nx = curr.x + dx;
      const ny = curr.y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (grid[ny][nx] === BLOCKED) continue;
      if (closed.has(key(nx, ny))) continue;
      const g = curr.g + 1;
      const existing = open.find(n => n.x === nx && n.y === ny);
      if (existing && g >= existing.g) continue;
      if (existing) {
        existing.g = g;
        existing.f = g + existing.h;
        existing.parent = curr;
      } else {
        const hn = heuristic(nx, ny);
        open.push({ x: nx, y: ny, g, h: hn, f: g + hn, parent: curr });
      }
    }
  }
  return [];
}

// ── Office Layout ──────────────────────────────────────

export function createOfficeState(agentCount: number): OfficeState {
  const cols = Math.max(3, Math.ceil(Math.sqrt(agentCount)));
  const rows = Math.max(2, Math.ceil(agentCount / cols));
  const gridW = cols * 5 + 4;
  const gridH = rows * 4 + 6;

  const desks: Desk[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      if (idx >= agentCount) break;
      desks.push({
        x: 3 + c * 5,
        y: 3 + r * 4,
        monitorOn: false,
        occupantId: null,
      });
    }
  }

  return {
    chars: new Map(),
    desks,
    gridW,
    gridH,
    cameraX: 0,
    cameraY: 0,
    selectedId: null,
  };
}

export function addCharacter(
  state: OfficeState,
  id: string,
  name: string,
  emoji: string,
  status: 'standby' | 'working' | 'offline',
  taskName: string,
  isSubAgent: boolean
): OfficeChar {
  // Find available desk
  const deskIdx = state.desks.findIndex(d => !d.occupantId);
  const paletteIdx = state.chars.size % PALETTES.length;
  const desk = state.desks[deskIdx] || state.desks[0];

  const seatX = desk ? desk.x + 1 : 2;
  const seatY = desk ? desk.y + 2 : 4;

  if (desk) desk.occupantId = id;

  const char: OfficeChar = {
    id,
    name,
    emoji,
    palette: PALETTES[paletteIdx],
    x: seatX,
    y: seatY,
    targetX: seatX,
    targetY: seatY,
    state: status === 'working' ? 'type' : 'idle',
    direction: 'down',
    frame: 0,
    frameTimer: 0,
    path: [],
    pathIdx: 0,
    moveProgress: 0,
    seatX,
    seatY,
    bubble: status === 'working' ? BUBBLES.working : null,
    bubbleTimer: 0,
    wanderTimer: WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN),
    status,
    taskName,
    isSubAgent,
    spawnProgress: 0,
    spawning: true,
  };

  state.chars.set(id, char);
  if (desk) desk.monitorOn = status === 'working';
  return char;
}

// ── Update Loop ────────────────────────────────────────

export function updateState(state: OfficeState, dt: number): void {
  const grid = createGrid(state.gridW, state.gridH, state.desks);

  for (const char of Array.from(state.chars.values())) {
    // Spawn animation
    if (char.spawning) {
      char.spawnProgress += dt / 300;
      if (char.spawnProgress >= 1) {
        char.spawnProgress = 1;
        char.spawning = false;
      }
      continue;
    }

    // Bubble timer
    if (char.bubble && char.bubbleTimer > 0) {
      char.bubbleTimer -= dt;
      if (char.bubbleTimer <= 0) {
        char.bubble = null;
        char.bubbleTimer = 0;
      }
    }

    // Animation frame update
    char.frameTimer += dt;
    const frameDuration = char.state === 'walk' ? WALK_FRAME_MS : TYPE_FRAME_MS;
    if (char.frameTimer >= frameDuration) {
      char.frameTimer -= frameDuration;
      if (char.state === 'walk') {
        char.frame = (char.frame + 1) % 4;
      } else if (char.state === 'type') {
        char.frame = (char.frame + 1) % 2;
      }
    }

    // Movement along path
    if (char.path.length > 0 && char.pathIdx < char.path.length) {
      char.state = 'walk';
      const target = char.path[char.pathIdx];
      const dx = target.x - char.x;
      const dy = target.y - char.y;

      // Direction
      if (Math.abs(dx) > Math.abs(dy)) {
        char.direction = dx > 0 ? 'right' : 'left';
      } else {
        char.direction = dy > 0 ? 'down' : 'up';
      }

      char.moveProgress += (WALK_SPEED * dt) / (1000 * TILE_SIZE);
      if (char.moveProgress >= 1) {
        char.x = target.x;
        char.y = target.y;
        char.moveProgress = 0;
        char.pathIdx++;
        if (char.pathIdx >= char.path.length) {
          char.path = [];
          char.pathIdx = 0;
          // Arrived at destination
          if (char.x === char.seatX && char.y === char.seatY) {
            char.state = char.status === 'working' ? 'type' : 'idle';
            char.direction = 'up'; // Face desk
          } else {
            char.state = 'idle';
          }
        }
      }
    } else if (char.status === 'working' && char.x === char.seatX && char.y === char.seatY) {
      // At desk, working
      char.state = 'type';
      char.direction = 'up';
    } else if (char.status === 'standby') {
      // Idle wander behavior
      char.wanderTimer -= dt;
      if (char.wanderTimer <= 0) {
        // Wander to random nearby tile or back to seat
        const atSeat = char.x === char.seatX && char.y === char.seatY;
        let tx: number, ty: number;
        if (atSeat) {
          // Wander away
          tx = Math.max(1, Math.min(state.gridW - 2, char.seatX + Math.floor(Math.random() * 5) - 2));
          ty = Math.max(1, Math.min(state.gridH - 2, char.seatY + Math.floor(Math.random() * 5) - 2));
        } else {
          // Return to seat
          tx = char.seatX;
          ty = char.seatY;
        }
        const path = findPath(grid, char.x, char.y, tx, ty);
        if (path.length > 0) {
          char.path = path;
          char.pathIdx = 0;
          char.moveProgress = 0;
        }
        char.wanderTimer = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN);
      }
    }
  }
}

// ── Renderer ───────────────────────────────────────────

export function renderOffice(
  ctx: CanvasRenderingContext2D,
  state: OfficeState,
  canvasW: number,
  canvasH: number,
  scale: number
): void {
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvasW, canvasH);

  const offsetX = Math.floor((canvasW - state.gridW * TILE_SIZE * scale) / 2) - state.cameraX * scale;
  const offsetY = Math.floor((canvasH - state.gridH * TILE_SIZE * scale) / 2) - state.cameraY * scale;

  // Floor tiles
  for (let y = 0; y < state.gridH; y++) {
    for (let x = 0; x < state.gridW; x++) {
      const px = offsetX + x * TILE_SIZE * scale;
      const py = offsetY + y * TILE_SIZE * scale;
      ctx.fillStyle = (x + y) % 2 === 0 ? FLOOR_LIGHT : FLOOR_DARK;
      ctx.fillRect(px, py, TILE_SIZE * scale, TILE_SIZE * scale);
    }
  }

  // Walls (top border)
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(offsetX, offsetY - 2 * scale, state.gridW * TILE_SIZE * scale, 2 * scale);

  // Collect renderable items for z-sorting
  const renderItems: { y: number; render: () => void }[] = [];

  // Desks
  for (const desk of state.desks) {
    const deskY = desk.y;
    renderItems.push({
      y: (deskY + 2) * TILE_SIZE,
      render: () => {
        const dx = offsetX + desk.x * TILE_SIZE * scale;
        const dy = offsetY + desk.y * TILE_SIZE * scale;
        const dw = 2 * TILE_SIZE * scale;
        const dh = 2 * TILE_SIZE * scale;

        // Desk body
        ctx.fillStyle = DESK_SHADOW;
        ctx.fillRect(dx + 2 * scale, dy + TILE_SIZE * scale, dw - 4 * scale, TILE_SIZE * scale);
        ctx.fillStyle = DESK_COLOR;
        ctx.fillRect(dx, dy + 2 * scale, dw, TILE_SIZE * scale - 2 * scale);
        ctx.fillStyle = DESK_TOP;
        ctx.fillRect(dx, dy, dw, 4 * scale);

        // Monitor
        const mx = dx + (dw - 12 * scale) / 2;
        const my = dy - 8 * scale;
        ctx.fillStyle = MONITOR_FRAME;
        ctx.fillRect(mx, my, 12 * scale, 10 * scale);
        ctx.fillStyle = desk.monitorOn ? MONITOR_SCREEN_ON : '#0a1020';
        ctx.fillRect(mx + 1 * scale, my + 1 * scale, 10 * scale, 7 * scale);
        // Monitor stand
        ctx.fillStyle = MONITOR_FRAME;
        ctx.fillRect(mx + 5 * scale, my + 10 * scale, 2 * scale, 2 * scale);

        // Screen glow when on
        if (desk.monitorOn) {
          ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
          ctx.fillRect(dx - 2 * scale, dy - 12 * scale, dw + 4 * scale, 16 * scale);
          // Scanlines
          for (let sy = 0; sy < 7; sy += 2) {
            ctx.fillStyle = 'rgba(100, 200, 255, 0.15)';
            ctx.fillRect(mx + 1 * scale, my + (1 + sy) * scale, 10 * scale, 1 * scale);
          }
        }
      },
    });
  }

  // Characters
  for (const char of Array.from(state.chars.values())) {
    renderItems.push({
      y: char.y * TILE_SIZE + TILE_SIZE,
      render: () => renderCharacter(ctx, char, offsetX, offsetY, scale, state.selectedId === char.id),
    });
  }

  // Sort by y (painter's algorithm)
  renderItems.sort((a, b) => a.y - b.y);
  for (const item of renderItems) {
    item.render();
  }
}

function renderCharacter(
  ctx: CanvasRenderingContext2D,
  char: OfficeChar,
  offsetX: number,
  offsetY: number,
  scale: number,
  selected: boolean
): void {
  const lerp = char.path.length > 0 && char.pathIdx < char.path.length ? char.moveProgress : 0;
  let px = char.x;
  let py = char.y;
  if (lerp > 0 && char.path[char.pathIdx]) {
    const target = char.path[char.pathIdx];
    px = char.x + (target.x - char.x) * lerp;
    py = char.y + (target.y - char.y) * lerp;
  }

  const sx = offsetX + px * TILE_SIZE * scale;
  const sy = offsetY + py * TILE_SIZE * scale - (CHAR_H - TILE_SIZE) * scale / 2;

  // Spawn effect (matrix-like green reveal)
  if (char.spawning) {
    const progress = char.spawnProgress;
    ctx.save();
    ctx.globalAlpha = progress;
    // Green glow
    ctx.fillStyle = `rgba(0, 255, 100, ${0.3 * (1 - progress)})`;
    ctx.fillRect(sx - 2 * scale, sy - 2 * scale, (CHAR_W + 4) * scale, (CHAR_H + 4) * scale);
  }

  // Selection highlight
  if (selected) {
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 2]);
    ctx.strokeRect(sx - 2 * scale, sy - 2 * scale, (CHAR_W + 4) * scale, (CHAR_H + 4) * scale);
    ctx.setLineDash([]);
  }

  // Character body (simplified pixel rendering)
  const p = char.palette;
  const s = scale;

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(sx + 2 * s, sy + (CHAR_H - 2) * s, (CHAR_W - 4) * s, 3 * s);

  // Head (hair + face)
  ctx.fillStyle = p.hair;
  ctx.fillRect(sx + 4 * s, sy, 8 * s, 3 * s);
  ctx.fillStyle = p.skin;
  ctx.fillRect(sx + 3 * s, sy + 3 * s, 10 * s, 5 * s);
  // Eyes
  ctx.fillStyle = '#222';
  if (char.direction === 'down' || char.direction === 'left' || char.direction === 'right') {
    ctx.fillRect(sx + 5 * s, sy + 4 * s, 2 * s, 2 * s);
    ctx.fillRect(sx + 9 * s, sy + 4 * s, 2 * s, 2 * s);
  }
  // Typing animation - blink
  if (char.state === 'type' && char.frame === 1) {
    ctx.fillStyle = p.skin;
    ctx.fillRect(sx + 5 * s, sy + 4 * s, 2 * s, 1 * s);
    ctx.fillRect(sx + 9 * s, sy + 4 * s, 2 * s, 1 * s);
  }

  // Body (shirt)
  ctx.fillStyle = p.shirt;
  ctx.fillRect(sx + 3 * s, sy + 8 * s, 10 * s, 6 * s);
  // Arms
  if (char.state === 'type') {
    // Arms forward (typing)
    const armOff = char.frame === 0 ? 0 : -1;
    ctx.fillStyle = p.skin;
    ctx.fillRect(sx + 2 * s, sy + 10 * s + armOff * s, 2 * s, 3 * s);
    ctx.fillRect(sx + 12 * s, sy + 10 * s - armOff * s, 2 * s, 3 * s);
  } else if (char.state === 'walk') {
    // Arms swinging
    const swing = char.frame % 2 === 0 ? 1 : -1;
    ctx.fillStyle = p.skin;
    ctx.fillRect(sx + 1 * s, sy + (10 + swing) * s, 2 * s, 3 * s);
    ctx.fillRect(sx + 13 * s, sy + (10 - swing) * s, 2 * s, 3 * s);
  } else {
    // Arms at sides
    ctx.fillStyle = p.skin;
    ctx.fillRect(sx + 2 * s, sy + 10 * s, 2 * s, 3 * s);
    ctx.fillRect(sx + 12 * s, sy + 10 * s, 2 * s, 3 * s);
  }

  // Legs (pants)
  ctx.fillStyle = p.pants;
  ctx.fillRect(sx + 4 * s, sy + 14 * s, 8 * s, 5 * s);
  if (char.state === 'walk') {
    const legOff = char.frame < 2 ? 1 : -1;
    ctx.fillRect(sx + 4 * s, sy + (18 + legOff) * s, 3 * s, 2 * s);
    ctx.fillRect(sx + 9 * s, sy + (18 - legOff) * s, 3 * s, 2 * s);
  }

  // Shoes
  ctx.fillStyle = p.shoes;
  if (char.state === 'walk') {
    const legOff = char.frame < 2 ? 1 : -1;
    ctx.fillRect(sx + 3 * s, sy + (20 + legOff) * s, 4 * s, 2 * s);
    ctx.fillRect(sx + 9 * s, sy + (20 - legOff) * s, 4 * s, 2 * s);
  } else {
    ctx.fillRect(sx + 4 * s, sy + 20 * s, 3 * s, 2 * s);
    ctx.fillRect(sx + 9 * s, sy + 20 * s, 3 * s, 2 * s);
  }

  if (char.spawning) {
    ctx.restore();
  }

  // Bubble above head
  if (char.bubble) {
    const bx = sx + (CHAR_W * s) / 2;
    const by = sy - 8 * s;
    ctx.fillStyle = char.bubble.bg;
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(bx - 8 * s, by - 6 * s, 16 * s, 10 * s, 3 * s);
    ctx.fill();
    ctx.stroke();
    // Bubble tail
    ctx.fillStyle = char.bubble.bg;
    ctx.beginPath();
    ctx.moveTo(bx - 2 * s, by + 4 * s);
    ctx.lineTo(bx, by + 8 * s);
    ctx.lineTo(bx + 2 * s, by + 4 * s);
    ctx.fill();
    // Icon
    ctx.fillStyle = char.bubble.color;
    ctx.font = `bold ${7 * s}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillText(char.bubble.icon, bx, by + 1 * s);
  }
}

// ── Render agent labels (called from React overlay) ────

export function getCharScreenPos(
  char: OfficeChar,
  state: OfficeState,
  canvasW: number,
  canvasH: number,
  scale: number
): { x: number; y: number } {
  const offsetX = Math.floor((canvasW - state.gridW * TILE_SIZE * scale) / 2) - state.cameraX * scale;
  const offsetY = Math.floor((canvasH - state.gridH * TILE_SIZE * scale) / 2) - state.cameraY * scale;

  const lerp = char.path.length > 0 && char.pathIdx < char.path.length ? char.moveProgress : 0;
  let px = char.x;
  let py = char.y;
  if (lerp > 0 && char.path[char.pathIdx]) {
    const target = char.path[char.pathIdx];
    px = char.x + (target.x - char.x) * lerp;
    py = char.y + (target.y - char.y) * lerp;
  }

  return {
    x: offsetX + px * TILE_SIZE * scale + (CHAR_W * scale) / 2,
    y: offsetY + py * TILE_SIZE * scale - (CHAR_H - TILE_SIZE) * scale / 2,
  };
}
