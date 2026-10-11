import type { Side, Vec, Zone } from './geometry';

export type Role = 'S' | 'OH' | 'MB' | 'OPP' | 'L' | 'DS';

export const ROLE_INFO: Record<Role, { name: string; abbr: string; color: string; summary: string }> = {
  S: {
    name: 'Setter',
    abbr: 'S',
    color: '#fbbf24',
    summary: 'Runs the offence: takes the second contact and delivers hittable sets.',
  },
  OH: {
    name: 'Outside Hitter',
    abbr: 'OH',
    color: '#fb7185',
    summary: 'Primary passer and left-side attacker; plays all the way around in most systems.',
  },
  MB: {
    name: 'Middle Blocker',
    abbr: 'MB',
    color: '#a78bfa',
    summary: 'Front-row blocking anchor and quick attacker; usually replaced by the libero in the back row.',
  },
  OPP: {
    name: 'Opposite',
    abbr: 'OPP',
    color: '#a3e635',
    summary: 'Right-side attacker and blocker opposite the setter in the rotation; rarely passes serve.',
  },
  L: {
    name: 'Libero',
    abbr: 'L',
    color: '#34d399',
    summary: 'Back-row defensive specialist with a contrasting jersey. Cannot serve, block or attack above net height.',
  },
  DS: {
    name: 'Defensive Specialist',
    abbr: 'DS',
    color: '#22d3ee',
    summary: 'Back-row passing and defence substitute; follows normal substitution rules (not a libero).',
  },
};

export interface Player {
  id: string;
  number: number;
  name: string;
  role: Role;
  /** In a 6-2 / 4-2 the second setter has role 'S' too; this marks which is which. */
  label?: string;
}

export type SystemId = '5-1' | '6-2' | '4-2' | 'custom';

export interface Team {
  side: Side;
  name: string;
  players: Player[];
  /** Starting rotational order: index 0 starts in zone 1, index 1 in zone 2 … index 5 in zone 6. */
  lineup: string[];
  liberoId: string | null;
  /** Players the libero may replace while they are in the back row (normally both middles). */
  liberoReplaces: string[];
  systemId: SystemId;
  /** Custom systems (e.g. a 5-2 variant) name the setter for each of the six rotations. */
  customSetters?: string[];
}

export interface OnCourt {
  zone: Zone;
  /** The player who owns this place in the rotational order. */
  baseId: string;
  /** Who is physically on court there (the libero if they replaced the base player). */
  playerId: string;
  liberoIn: boolean;
}

export type Phase =
  | 'preServe'
  | 'serviceContact'
  | 'release'
  | 'firstContact'
  | 'set'
  | 'attackCoverage'
  | 'defense'
  | 'tip'
  | 'transition'
  | 'freeBall'
  | 'serving'
  | 'rallyOver';

export const PHASE_LABEL: Record<Phase, string> = {
  preServe: 'Before the serve',
  serviceContact: 'Service contact',
  release: 'Release & transition',
  firstContact: 'First contact',
  set: 'Setting & attack prep',
  attackCoverage: 'Attack coverage',
  defense: 'Defensive transition',
  tip: 'Tip coverage',
  transition: 'Defence → offence',
  freeBall: 'Free ball',
  serving: 'Serving',
  rallyOver: 'Rally over',
};

export type PlayerPositions = Record<string, Vec>;

export type DefenseSystemId = 'perimeter' | 'rotation' | 'middleUp' | 'read';

/** Where an opponent attack comes from, described from OUR side of the net. */
export type AttackSide = 'ourRight' | 'ourLeft' | 'middle' | 'pipe';

export type Lane = 'left' | 'middle' | 'right' | 'pipe' | 'D' | 'dump';

export type PassQuality = 'perfect' | 'good' | 'tight' | 'off' | 'poor';

export type Difficulty = 'beginner' | 'intermediate' | 'competitive';
