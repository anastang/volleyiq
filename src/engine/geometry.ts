/**
 * Court geometry.
 *
 * Every team works in its own LOCAL frame:
 *   x = metres from the team's LEFT sideline (as the players face the net), 0..9
 *   y = metres from the net (centre line), 0..9 (endline at 9)
 *
 * The WORLD frame is the full 18 m court seen top-down:
 *   x = 0..9 left→right on screen, y = 0..18 top→bottom, net at y = 9.
 *   The home team plays the bottom half, the away team the top half.
 */

export interface Vec {
  x: number;
  y: number;
}

export type Side = 'home' | 'away';
export type Zone = 1 | 2 | 3 | 4 | 5 | 6;

export const COURT = {
  length: 18,
  width: 9,
  half: 9,
  attackLine: 3,
  freeZoneSide: 3,
  freeZoneEnd: 3,
  netHeightMen: 2.43,
  netHeightWomen: 2.24,
} as const;

export const ZONES: Zone[] = [1, 2, 3, 4, 5, 6];

export interface ZoneInfo {
  zone: Zone;
  name: string;
  short: string;
  row: 'front' | 'back';
  rect: { x0: number; x1: number; y0: number; y1: number };
  center: Vec;
}

const mk = (zone: Zone, name: string, short: string, row: 'front' | 'back', x0: number, y0: number): ZoneInfo => {
  const x1 = x0 + 3;
  const y1 = row === 'front' ? 3 : 9;
  return { zone, name, short, row, rect: { x0, x1, y0, y1 }, center: { x: x0 + 1.5, y: (y0 + y1) / 2 } };
};

export const ZONE_INFO: Record<Zone, ZoneInfo> = {
  1: mk(1, 'Right Back', 'RB', 'back', 6, 3),
  2: mk(2, 'Right Front', 'RF', 'front', 6, 0),
  3: mk(3, 'Middle Front', 'MF', 'front', 3, 0),
  4: mk(4, 'Left Front', 'LF', 'front', 0, 0),
  5: mk(5, 'Left Back', 'LB', 'back', 0, 3),
  6: mk(6, 'Middle Back', 'MB', 'back', 3, 3),
};

export const isFrontZone = (z: Zone) => z === 2 || z === 3 || z === 4;

/** Which numbered court area a local point lies in (null if outside the court). */
export function zoneAt(p: Vec): Zone | null {
  if (p.x < 0 || p.x > 9 || p.y < 0 || p.y > 9) return null;
  const col = p.x < 3 ? 0 : p.x < 6 ? 1 : 2;
  if (p.y < 3) return ([4, 3, 2] as Zone[])[col];
  return ([5, 6, 1] as Zone[])[col];
}

export function toWorld(side: Side, p: Vec): Vec {
  return side === 'home' ? { x: p.x, y: 9 + p.y } : { x: 9 - p.x, y: 9 - p.y };
}

export function toLocal(side: Side, w: Vec): Vec {
  return side === 'home' ? { x: w.x, y: w.y - 9 } : { x: 9 - w.x, y: 9 - w.y };
}

export const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const norm = (a: Vec): Vec => {
  const l = Math.hypot(a.x, a.y) || 1;
  return { x: a.x / l, y: a.y / l };
};
export const rotate = (a: Vec, deg: number): Vec => {
  const r = (deg * Math.PI) / 180;
  return { x: a.x * Math.cos(r) - a.y * Math.sin(r), y: a.x * Math.sin(r) + a.y * Math.cos(r) };
};
export const mirrorX = (p: Vec): Vec => ({ x: 9 - p.x, y: p.y });
export const v = (x: number, y: number): Vec => ({ x, y });

/**
 * Feet model. Positional faults are judged on the feet in contact with the
 * floor, not the centre of a player marker. Each player stands with feet
 * FOOT_HALF_WIDTH either side of their centre; an optional stagger puts the
 * left foot forward (negative) or back (positive).
 */
export const FOOT_HALF_WIDTH = 0.17;

export interface Feet {
  left: Vec;
  right: Vec;
}

export function feetOf(p: Vec, stagger = 0): Feet {
  return {
    left: { x: p.x - FOOT_HALF_WIDTH, y: p.y + stagger / 2 },
    right: { x: p.x + FOOT_HALF_WIDTH, y: p.y - stagger / 2 },
  };
}

/** Closest-to-net foot (smallest y). */
export const frontFootY = (f: Feet) => Math.min(f.left.y, f.right.y);
/** Foot furthest from the net (largest y). */
export const backFootY = (f: Feet) => Math.max(f.left.y, f.right.y);
/** Leftmost and rightmost foot x. */
export const leftFootX = (f: Feet) => Math.min(f.left.x, f.right.x);
export const rightFootX = (f: Feet) => Math.max(f.left.x, f.right.x);
