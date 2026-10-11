import { v, isFrontZone, type Side, type Vec, type Zone } from './geometry';
import { baseIdInZone, onCourt, zoneOfPlayer } from './rotation';
import type { Lane, OnCourt, Player, Role, SystemId, Team } from './types';

export interface SystemDef {
  id: SystemId;
  name: string;
  tagline: string;
  description: string;
  setters: number;
  advantages: string[];
  limitations: string[];
  difficulty: 1 | 2 | 3;
  difficultyNote: string;
}

export const SYSTEMS: Record<SystemId, SystemDef> = {
  '5-1': {
    id: '5-1',
    name: '5–1',
    tagline: 'One setter, five hitters',
    description:
      'A single setter runs the offence in all six rotations. When the setter is back row the team has three front-row attackers; when the setter is front row it has two (plus the setter’s legal dump).',
    setters: 1,
    advantages: [
      'One set of hands every rally — consistent tempo and hitter–setter timing.',
      'Three front-row attackers in the three rotations where the setter is back row.',
      'Setter can attack the second ball (dump) in the three front-row rotations.',
    ],
    limitations: [
      'Only two front-row hitters in half the rotations.',
      'Setter must release from every zone, including long releases from zones 5 and 4.',
      'Heavy reliance on one player’s fitness and decision-making.',
    ],
    difficulty: 3,
    difficultyNote: 'Most demanding on the setter; the standard system in competitive play.',
  },
  '6-2': {
    id: '6-2',
    name: '6–2',
    tagline: 'Back-row setter runs it, three hitters always',
    description:
      'Two setters stand opposite each other in the rotation. Whichever setter is in the back row sets; the front-row setter becomes a right-side attacker. The team keeps three front-row attackers in every rotation.',
    setters: 2,
    advantages: [
      'Three front-row attackers in all six rotations.',
      'Setter always releases from the back row (zones 1, 6, 5) — shorter, more predictable releases.',
      'Develops two setters at once.',
    ],
    limitations: [
      'Setter never has a legal front-row dump (the setting setter is always back row).',
      'Two setting styles to adjust to; requires two capable setters who can also hit.',
      'Back-row setter is also a back-row defender — the setter digging the first ball is a common problem.',
    ],
    difficulty: 2,
    difficultyNote: 'Common in high school and club; balances offence with simpler setter releases.',
  },
  '4-2': {
    id: '4-2',
    name: '4–2',
    tagline: 'Front-row setter, simple and stable',
    description:
      'Two setters opposite each other; whichever is in the FRONT row sets, usually from middle-front or right-front. The team always has two front-row attackers and very short setter releases.',
    setters: 2,
    advantages: [
      'Setter starts at the net — shortest possible release, very easy to learn.',
      'Front-row setter can legally dump the second ball.',
      'Great introduction to roles, switching and serve-receive concepts.',
    ],
    limitations: [
      'Only two front-row attackers in every rotation, so the block can key on them.',
      'Setter in the front row means one blocker is often a smaller setter.',
      'Less offensive variety (no three-hitter rotations).',
    ],
    difficulty: 1,
    difficultyNote: 'Recommended first system for newer players.',
  },
  custom: {
    id: 'custom',
    name: 'Custom / 5–2',
    tagline: 'You define who sets each rotation',
    description:
      '“5–2” has no universal definition — coaching sources use it for different arrangements. Here you choose which setter runs the offence in each of the six rotations, so you can model the variant your team actually uses.',
    setters: 2,
    advantages: ['Matches your team’s real arrangement.', 'Lets you explore hybrid setter plans.'],
    limitations: ['Recommendations assume a standard S–OH–MB–(OPP/S2)–OH–MB rotational order.'],
    difficulty: 3,
    difficultyNote: 'Advanced: depends on your configuration.',
  },
};

export const SYSTEM_ORDER: SystemId[] = ['5-1', '6-2', '4-2', 'custom'];

export interface RosterOverride {
  name?: string;
  number?: number;
}

const HOME_DEFAULTS: Record<string, { name: string; number: number; role: Role; label?: string }> = {
  S: { name: 'Alex', number: 7, role: 'S', label: 'S1' },
  OH1: { name: 'Jordan', number: 12, role: 'OH', label: 'OH1' },
  MB1: { name: 'Riley', number: 5, role: 'MB', label: 'MB1' },
  OPP: { name: 'Sam', number: 9, role: 'OPP' },
  S2: { name: 'Casey', number: 10, role: 'S', label: 'S2' },
  OH2: { name: 'Taylor', number: 3, role: 'OH', label: 'OH2' },
  MB2: { name: 'Morgan', number: 15, role: 'MB', label: 'MB2' },
  L: { name: 'Jamie', number: 1, role: 'L' },
  DS: { name: 'Drew', number: 8, role: 'DS' },
};

const AWAY_DEFAULTS: Record<string, { name: string; number: number; role: Role; label?: string }> = {
  S: { name: 'Setter', number: 4, role: 'S', label: 'S1' },
  OH1: { name: 'Outside', number: 11, role: 'OH', label: 'OH1' },
  MB1: { name: 'Middle', number: 14, role: 'MB', label: 'MB1' },
  OPP: { name: 'Opposite', number: 2, role: 'OPP' },
  S2: { name: 'Setter 2', number: 6, role: 'S', label: 'S2' },
  OH2: { name: 'Outside', number: 17, role: 'OH', label: 'OH2' },
  MB2: { name: 'Middle', number: 18, role: 'MB', label: 'MB2' },
  L: { name: 'Libero', number: 13, role: 'L' },
  DS: { name: 'DS', number: 19, role: 'DS' },
};

/** Lineup slot keys in rotational order (index 0 starts in zone 1). */
export function lineupKeys(systemId: SystemId): string[] {
  return systemId === '5-1' ? ['S', 'OH1', 'MB1', 'OPP', 'OH2', 'MB2'] : ['S', 'OH1', 'MB1', 'S2', 'OH2', 'MB2'];
}

export const slotKeyOf = (id: string) => id.slice(2);

export function buildTeam(
  systemId: SystemId,
  side: Side,
  roster: Record<string, RosterOverride> = {},
  customSetters?: string[],
): Team {
  const defaults = side === 'home' ? HOME_DEFAULTS : AWAY_DEFAULTS;
  const prefix = side === 'home' ? 'h-' : 'a-';
  const keys = lineupKeys(systemId);
  const bench = ['L', 'DS'];
  const players: Player[] = [...keys, ...bench].map((k) => {
    const d = defaults[k];
    const o = side === 'home' ? roster[k] ?? {} : {};
    return {
      id: prefix + k,
      role: d.role,
      name: o.name?.trim() || d.name,
      number: o.number ?? d.number,
      label: d.label,
    };
  });
  const lineup = keys.map((k) => prefix + k);
  const team: Team = {
    side,
    name: side === 'home' ? 'Your Team' : 'Opponent',
    players,
    lineup,
    liberoId: prefix + 'L',
    liberoReplaces: [prefix + 'MB1', prefix + 'MB2'],
    systemId,
  };
  if (systemId === 'custom') {
    team.customSetters = customSetters?.length === 6 ? customSetters.map((k) => prefix + k) : defaultCustomSetters(prefix);
  }
  return team;
}

/** Default custom plan: back-row setter sets (a 6-2 pattern), editable by the user. */
function defaultCustomSetters(prefix: string): string[] {
  const t = { lineup: lineupKeys('custom').map((k) => prefix + k) } as Team;
  return [0, 1, 2, 3, 4, 5].map((r) => {
    const z = zoneOfPlayer(t, r, prefix + 'S')!;
    return isFrontZone(z) ? prefix + 'S2' : prefix + 'S';
  });
}

export const playerById = (team: Team, id: string) => team.players.find((p) => p.id === id)!;

export function setterIds(team: Team): string[] {
  return team.lineup.filter((id) => playerById(team, id).role === 'S');
}

/** The player designated to take the second contact in this rotation. */
export function activeSetterId(team: Team, rotation: number): string {
  const setters = setterIds(team);
  switch (team.systemId) {
    case '5-1':
      return setters[0];
    case '6-2':
      return setters.find((id) => !isFrontZone(zoneOfPlayer(team, rotation, id)!)) ?? setters[0];
    case '4-2':
      return setters.find((id) => isFrontZone(zoneOfPlayer(team, rotation, id)!)) ?? setters[0];
    case 'custom':
      return team.customSetters?.[rotation] ?? setters[0];
  }
}

/** Setting target (where the setter wants the pass), in local coordinates. */
export function setTarget(systemId: SystemId): Vec {
  return systemId === '4-2' ? v(5.0, 0.9) : v(6.0, 0.9);
}

/**
 * Serve-receive formations keyed by the ZONE of the active setter. Each maps
 * zone → position. Positions depend only on zones, so they stay legal no
 * matter which players occupy them; the rules engine double-checks this.
 * Passers are listed by zone.
 */
export interface FormationDef {
  setterZone: Zone;
  spots: Record<Zone, Vec>;
  passers: Zone[];
  note: string;
}

export const RECEIVE_FORMATIONS: Record<Zone, FormationDef> = {
  1: {
    setterZone: 1,
    spots: { 1: v(8.2, 6.0), 2: v(7.0, 4.8), 3: v(4.0, 0.8), 4: v(1.0, 1.0), 5: v(1.8, 5.4), 6: v(4.5, 5.6) },
    passers: [5, 6, 2],
    note: 'Setter hides behind the right-side passer and releases straight up the right side. The front-row player in zone 4 tucks in at the net so they can switch to the right after contact.',
  },
  6: {
    setterZone: 6,
    spots: { 1: v(6.8, 5.4), 2: v(8.0, 0.8), 3: v(5.0, 0.7), 4: v(1.6, 4.6), 5: v(4.0, 5.4), 6: v(5.2, 1.7) },
    passers: [4, 5, 1],
    note: 'Setter stacks directly behind the middle-front player — still behind them and between the zone-5 and zone-1 players laterally — and is only a step from the target.',
  },
  5: {
    setterZone: 5,
    spots: { 1: v(7.0, 5.4), 2: v(8.2, 0.8), 3: v(2.2, 4.4), 4: v(0.8, 0.6), 5: v(1.2, 1.6), 6: v(4.6, 5.4) },
    passers: [3, 6, 1],
    note: 'The longest setter release: the setter hides behind the left-front player at the net and runs along the net to the target after contact.',
  },
  4: {
    setterZone: 4,
    spots: { 1: v(8.3, 6.4), 2: v(7.0, 4.8), 3: v(4.6, 0.6), 4: v(3.2, 0.5), 5: v(1.6, 5.0), 6: v(4.4, 5.6) },
    passers: [5, 6, 2],
    note: 'Front-row setter in zone 4 pushes as far right as the overlap rule allows (just left of the middle-front player) and slides right along the net after contact.',
  },
  3: {
    setterZone: 3,
    spots: { 1: v(7.0, 5.4), 2: v(7.8, 0.6), 3: v(6.0, 0.5), 4: v(1.6, 4.6), 5: v(4.0, 5.4), 6: v(5.6, 1.6) },
    passers: [4, 5, 1],
    note: 'Setter starts at the net almost on target. The back-row player in zone 6 hides directly behind the setter, staying out of the passing lanes.',
  },
  2: {
    setterZone: 2,
    spots: { 1: v(7.0, 5.4), 2: v(8.0, 0.6), 3: v(2.0, 4.4), 4: v(0.8, 0.6), 5: v(0.6, 2.0), 6: v(4.4, 5.4) },
    passers: [3, 6, 1],
    note: 'Setter is already front-right. The middle in zone 4 and the back-row player in zone 5 both tuck into the left corner by the net so three passers can spread across the court.',
  },
};

export function setterZone(team: Team, rotation: number): Zone {
  return zoneOfPlayer(team, rotation, activeSetterId(team, rotation))!;
}

export function receiveFormation(team: Team, rotation: number): { positions: Record<string, Vec>; passers: string[]; def: FormationDef } {
  const def = RECEIVE_FORMATIONS[setterZone(team, rotation)];
  const oc = onCourt(team, rotation, false);
  const positions: Record<string, Vec> = {};
  for (const o of oc) positions[o.playerId] = { ...def.spots[o.zone] };
  const passers = oc.filter((o) => def.passers.includes(o.zone)).map((o) => o.playerId);
  return { positions, passers, def };
}

/** Rotational base positions (zone centres) – useful as a neutral start. */
export function zoneCenterPositions(team: Team, rotation: number, serving: boolean, centers: Record<Zone, Vec>): Record<string, Vec> {
  const out: Record<string, Vec> = {};
  for (const o of onCourt(team, rotation, serving)) out[o.playerId] = { ...centers[o.zone] };
  return out;
}

// ---------------------------------------------------------------------------
// Specialty slots: where each player plays once they are free to switch.
// ---------------------------------------------------------------------------

export type Slot = 'LF' | 'MF' | 'RF' | 'LB' | 'MB' | 'RB';
export const FRONT_SLOTS: Slot[] = ['LF', 'MF', 'RF'];
export const BACK_SLOTS: Slot[] = ['LB', 'MB', 'RB'];
export const SLOT_NAME: Record<Slot, string> = {
  LF: 'left-front',
  MF: 'middle-front',
  RF: 'right-front',
  LB: 'left-back',
  MB: 'middle-back',
  RB: 'right-back',
};

function slotCost(role: Role, isSettingSetter: boolean, systemId: SystemId, slot: Slot): number {
  if (role === 'S') {
    if (isSettingSetter && systemId === '4-2') return { MF: 0, RF: 0.5, LF: 3, LB: 2, MB: 2, RB: 0 }[slot];
    return { RF: 0, MF: 1, LF: 3, RB: 0, MB: 2, LB: 2 }[slot];
  }
  const table: Record<Role, Partial<Record<Slot, number>>> = {
    S: {},
    OPP: { RF: 0, MF: 2, LF: 2, RB: 0, MB: 1, LB: 2 },
    OH: { LF: 0, RF: 1, MF: 2, MB: 0, LB: 1, RB: 1.2 },
    MB: { MF: 0, LF: 2, RF: 2, LB: 1, MB: 1, RB: 1.5 },
    L: { LB: 0, MB: 0.6, RB: 1, LF: 9, MF: 9, RF: 9 },
    DS: { LB: 0.5, MB: 0.5, RB: 0.8, LF: 2, MF: 2, RF: 2 },
  };
  return table[role][slot] ?? 5;
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Assign each on-court player to a specialty slot (front players to front slots only). */
export function specialtySlots(team: Team, rotation: number, serving: boolean): Record<string, Slot> {
  const oc = onCourt(team, rotation, serving);
  const setter = activeSetterId(team, rotation);
  const out: Record<string, Slot> = {};
  const assign = (group: OnCourt[], slots: Slot[]) => {
    let best: Slot[] = slots;
    let bestCost = Infinity;
    for (const perm of permutations(slots)) {
      const c = group.reduce(
        (s, o, i) => s + slotCost(playerById(team, o.playerId).role, o.playerId === setter, team.systemId, perm[i]),
        0,
      );
      if (c < bestCost) {
        bestCost = c;
        best = perm;
      }
    }
    group.forEach((o, i) => (out[o.playerId] = best[i]));
  };
  assign(oc.filter((o) => isFrontZone(o.zone)), FRONT_SLOTS);
  assign(oc.filter((o) => !isFrontZone(o.zone)), BACK_SLOTS);
  return out;
}

export interface AttackOption {
  playerId: string;
  lane: Lane;
  frontRow: boolean;
}

export const LANE_NAME: Record<Lane, string> = {
  left: 'Outside (left)',
  middle: 'Middle quick',
  right: 'Right side',
  pipe: 'Pipe (back-row middle)',
  D: 'D-ball (back-row right)',
  dump: 'Setter dump',
};

/** Legal attacking options in this rotation, by lane. */
export function attackOptions(team: Team, rotation: number, serving = false): AttackOption[] {
  const setter = activeSetterId(team, rotation);
  const slots = specialtySlots(team, rotation, serving);
  const oc = onCourt(team, rotation, serving);
  const opts: AttackOption[] = [];
  for (const o of oc) {
    const p = playerById(team, o.playerId);
    const front = isFrontZone(o.zone);
    if (p.role === 'L') continue;
    if (o.playerId === setter) {
      if (front) opts.push({ playerId: p.id, lane: 'dump', frontRow: true });
      continue;
    }
    const slot = slots[o.playerId];
    if (front) {
      opts.push({ playerId: p.id, lane: slot === 'LF' ? 'left' : slot === 'MF' ? 'middle' : 'right', frontRow: true });
    } else if (p.role === 'OH' && slot === 'MB') {
      opts.push({ playerId: p.id, lane: 'pipe', frontRow: false });
    } else if (p.role === 'OPP' && slot === 'RB') {
      opts.push({ playerId: p.id, lane: 'D', frontRow: false });
    }
  }
  return opts;
}

export function frontRowAttackerCount(team: Team, rotation: number): number {
  return attackOptions(team, rotation).filter((o) => o.frontRow && o.lane !== 'dump').length;
}

export function describeRotation(team: Team, rotation: number): string {
  const z = setterZone(team, rotation);
  return `Rotation ${rotation + 1} · setter in zone ${z}`;
}

export function playerLabel(p: Player): string {
  return `#${p.number} ${p.name}`;
}

export function roleTag(team: Team, rotation: number, id: string): string {
  const p = playerById(team, id);
  if (p.role === 'S' && team.systemId !== '5-1') {
    return activeSetterId(team, rotation) === id ? 'S' : team.systemId === '4-2' ? 'S·H' : 'S·RS';
  }
  return p.role;
}

/** Plain-English role word for labels (newer players read words more easily than abbreviations). */
export function roleWord(team: Team, rotation: number, id: string): string {
  const p = playerById(team, id);
  switch (p.role) {
    case 'S':
      if (team.systemId === '5-1' || activeSetterId(team, rotation) === id) return 'Setter';
      return team.systemId === '4-2' ? 'Hitter' : 'Right side';
    case 'OH':
      return 'Outside';
    case 'MB':
      return 'Middle';
    case 'OPP':
      return 'Opposite';
    case 'L':
      return 'Libero';
    case 'DS':
      return 'Def. spec.';
  }
}

export function baseInZone(team: Team, rotation: number, zone: Zone) {
  return playerById(team, baseIdInZone(team, rotation, zone));
}
