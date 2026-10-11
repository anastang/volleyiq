import { add, clamp, dist, isFrontZone, mirrorX, norm, rotate, scale, sub, v, type Vec } from './geometry';
import { onCourt } from './rotation';
import {
  activeSetterId,
  attackOptions,
  playerById,
  receiveFormation,
  setTarget,
  SLOT_NAME,
  specialtySlots,
  type Slot,
} from './systems';
import type { AttackSide, DefenseSystemId, Lane, PassQuality, Team } from './types';

/**
 * Tactical engine. Given a team, its rotation and a rally situation, it
 * produces a target REGION (centre + tolerance) for every on-court player,
 * with the reasoning. These are coaching recommendations, not rules — the
 * rules engine is separate.
 */

export type Situation =
  | { kind: 'serveReceive' }
  | { kind: 'release' }
  | { kind: 'firstContact'; contactId: string; quality: PassQuality; ballAt: Vec; source: 'serve' | 'dig' | 'free' }
  | { kind: 'attack'; attackerId: string; lane: Lane; from?: Record<string, Vec> }
  | { kind: 'defense'; from: AttackSide; set: 'high' | 'quick'; system: DefenseSystemId; tendency?: 'line' | 'cross' }
  | { kind: 'tip'; from: AttackSide; system: DefenseSystemId; tipAt: Vec }
  | { kind: 'freeBall' }
  | { kind: 'servePre'; servingFree: boolean }
  | { kind: 'servingBase' };

export interface Target {
  pos: Vec;
  radius: number;
  duty: string;
  why: string;
  /** Other defensible spots. */
  alt?: { pos: Vec; radius: number; label: string; why: string }[];
  /** Where this player is likely to go next (transition readiness). */
  next?: Vec;
  nextLabel?: string;
  /** This player is executing (contacting the ball) — not graded on position. */
  locked?: boolean;
}

export interface TacticalPlan {
  targets: Record<string, Target>;
  blockers: string[];
  secondContactId?: string;
  setPoint?: Vec;
  notes: string[];
}

export interface TeamCtx {
  team: Team;
  rotation: number;
  /** Whether this team served THIS rally (affects libero/server on court). */
  serving: boolean;
}

export const APPROACH = {
  left: v(0.3, 3.7),
  right: v(8.7, 3.7),
  pipe: v(4.5, 6.4),
  D: v(7.3, 6.4),
} as const;

export function middleApproach(team: Team): Vec {
  const t = setTarget(team.systemId);
  return v(t.x - 1.3, 2.7);
}

export function attackContact(team: Team, lane: Lane): Vec {
  const t = setTarget(team.systemId);
  switch (lane) {
    case 'left':
      return v(0.9, 0.7);
    case 'right':
      return v(8.2, 0.7);
    case 'middle':
      return v(t.x - 1.0, 0.55);
    case 'pipe':
      return v(4.5, 3.4);
    case 'D':
      return v(7.3, 3.4);
    case 'dump':
      return v(t.x, 0.5);
  }
}

export function approachFor(team: Team, lane: Lane): Vec {
  switch (lane) {
    case 'left':
      return APPROACH.left;
    case 'right':
      return APPROACH.right;
    case 'pipe':
      return APPROACH.pipe;
    case 'D':
      return APPROACH.D;
    case 'middle':
      return middleApproach(team);
    case 'dump':
      return setTarget(team.systemId);
  }
}

/** Where the second contact will happen for each pass quality (local coords). */
export function passLanding(team: Team, q: PassQuality, from?: Vec): Vec {
  const t = setTarget(team.systemId);
  switch (q) {
    case 'perfect':
      return { ...t };
    case 'good':
      return v(t.x - 0.7, 1.5);
    case 'tight':
      return v(t.x + 0.3, 0.25);
    case 'off':
      return v(t.x - 1.6, 3.8);
    case 'poor':
      return from ? v(clamp(from.x * 0.6 + 2.2, 1.5, 7.5), clamp(from.y * 0.5 + 2.5, 4, 6.5)) : v(3.0, 5.8);
  }
}

export const PASS_LABEL: Record<PassQuality, string> = {
  perfect: 'Perfect pass — on target',
  good: 'Good pass — slightly off, still in system',
  tight: 'Tight pass — right on the net',
  off: 'Off the net — out of system',
  poor: 'Poor pass — well off the net',
};

const clampCourt = (p: Vec): Vec => v(clamp(p.x, 0.35, 8.65), clamp(p.y, 0.55, 8.7));

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  return arr.flatMap((x, i) => permutations([...arr.slice(0, i), ...arr.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Assign players to spots minimising total travel. */
export function assignSpots(players: { id: string; from: Vec }[], spots: Vec[]): Record<string, number> {
  const idx = spots.map((_, i) => i);
  let best: number[] = idx.slice(0, players.length);
  let bestCost = Infinity;
  for (const perm of permutations(idx)) {
    const cost = players.reduce((s, p, i) => s + dist(p.from, spots[perm[i]]) ** 1.3, 0);
    if (cost < bestCost) {
      bestCost = cost;
      best = perm;
    }
  }
  const out: Record<string, number> = {};
  players.forEach((p, i) => (out[p.id] = best[i]));
  return out;
}

// ---------------------------------------------------------------------------
// Defence
// ---------------------------------------------------------------------------

interface SlotSpot {
  pos: Vec;
  duty: string;
  why: string;
  radius?: number;
}

/** Opponent attack contact point, in OUR local frame (negative y = their side). */
export function opponentContactPoint(from: AttackSide): Vec {
  switch (from) {
    case 'ourRight':
      return v(8.3, -0.7);
    case 'ourLeft':
      return v(0.7, -0.7);
    case 'middle':
      return v(4.4, -0.5);
    case 'pipe':
      return v(4.5, -3.4);
  }
}

const mirrorSlot: Record<Slot, Slot> = { LF: 'RF', RF: 'LF', MF: 'MF', LB: 'RB', RB: 'LB', MB: 'MB' };

function defenseVsRight(system: DefenseSystemId): Record<Slot, SlotSpot> {
  const block = {
    RF: { pos: v(7.85, 0.4), duty: 'Outside blocker', why: 'Set the block on the hitter’s hitting arm and seal the line so the middle can close to you.' },
    MF: { pos: v(6.95, 0.4), duty: 'Close the block', why: 'Move along the net and close the seam next to the outside blocker — no gap between the hands.' },
    LF: { pos: v(1.7, 3.2), duty: 'Off-blocker: drop off the net', why: 'You are not needed in the block, so drop to the attack line: cover the sharp cross-court shot and short tips, and you are already in your approach for the transition.' },
  } satisfies Partial<Record<Slot, SlotSpot>>;
  switch (system) {
    case 'perimeter':
    case 'read':
      return {
        ...block,
        LB: { pos: v(1.3, 5.9), duty: 'Cross-court digger', why: 'Line up on the hitter’s cross-court angle just outside the block’s shadow — the hardest-driven ball usually comes here.' },
        MB: { pos: v(5.0, 8.1), duty: 'Deep middle', why: 'Stay deep and read the seam between blockers and the deep corner. In perimeter defence middle-back protects the deep court; do not creep forward for tips.' },
        RB: { pos: v(8.25, 5.6), duty: 'Line digger', why: 'Stay outside the block on the line. You also take tips over the block on your side in a perimeter defence.' },
      };
    case 'rotation':
      return {
        ...block,
        RB: { pos: v(7.3, 3.3), duty: 'Rotate up for the tip', why: 'In rotational defence the line-side back defender rotates up behind the block to take tips and roll shots.' },
        MB: { pos: v(8.2, 7.6), duty: 'Rotate to deep line', why: 'Middle-back rotates toward the line to cover the deep line shot that right-back gave up.' },
        LB: { pos: v(2.6, 7.0), duty: 'Deep cross / middle', why: 'Left-back slides toward the middle and deep to cover the cross court and the seam.' },
      };
    case 'middleUp':
      return {
        ...block,
        MB: { pos: v(5.8, 3.1), duty: 'Rover up behind the block', why: 'In middle-up defence the middle-back player sits right behind the block to take tips and soft shots, leaving the deep corners to the wings.' },
        LB: { pos: v(1.1, 6.7), duty: 'Deep cross corner', why: 'With middle-back up, you own the deep cross court.' },
        RB: { pos: v(8.3, 6.7), duty: 'Deep line corner', why: 'With middle-back up, you own the deep line.' },
      };
  }
}

function mirrorSpots(spots: Record<Slot, SlotSpot>): Record<Slot, SlotSpot> {
  const out = {} as Record<Slot, SlotSpot>;
  for (const k of Object.keys(spots) as Slot[]) {
    const s = spots[k];
    out[mirrorSlot[k]] = {
      ...s,
      pos: mirrorX(s.pos),
      why: s.why.replace(/right-back/g, '§').replace(/left-back/g, 'right-back').replace(/§/g, 'left-back'),
    };
  }
  return out;
}

function defenseVsMiddle(set: 'high' | 'quick', system: DefenseSystemId, pipe: boolean): Record<Slot, SlotSpot> {
  const double = set === 'high' || pipe;
  const spots: Record<Slot, SlotSpot> = {
    MF: { pos: v(4.5, 0.4), duty: double ? 'Middle blocker — lead the block' : 'Read-block the quick', why: double ? 'Square up on the hitter and let a wing blocker close to you.' : 'The quick comes fast: read the setter’s hands and go with the hitter — you are the only blocker who can get there.' },
    RF: double
      ? { pos: v(5.45, 0.4), duty: 'Close to the middle', why: 'Against a high middle/back-row set there is time to form a double block. Close to your middle blocker.' }
      : { pos: v(7.6, 2.5), duty: 'Pinch off the net', why: 'You cannot reach a quick attack in time, so pull off the net to defend the sharp angle and tips on your side.' },
    LF: { pos: v(1.5, 2.6), duty: 'Pinch off the net', why: 'Defend the sharp angle and short balls on your side, ready to transition to your approach.' },
    LB: { pos: v(1.6, 6.0), duty: 'Left-side digger', why: 'Cover the angle to your side of the block.' },
    MB: { pos: v(4.2, 7.8), duty: 'Deep middle', why: 'Cover the deep court and balls deflected off the block.' },
    RB: { pos: v(7.4, 6.0), duty: 'Right-side digger', why: 'Cover the angle to your side of the block.' },
  };
  if (system === 'middleUp') spots.MB = { pos: v(4.5, 3.6), duty: 'Rover up', why: 'Middle-up: take tips and soft shots behind the block.' };
  return spots;
}

export function defenseSlotSpots(from: AttackSide, set: 'high' | 'quick', system: DefenseSystemId, tendency?: 'line' | 'cross'): Record<Slot, SlotSpot> {
  let spots: Record<Slot, SlotSpot>;
  if (from === 'middle' || from === 'pipe') spots = defenseVsMiddle(set, system, from === 'pipe');
  else {
    const right = defenseVsRight(system);
    if (tendency && (system === 'perimeter' || system === 'read')) {
      if (tendency === 'line') {
        right.RB = { ...right.RB, pos: v(8.3, 6.6), why: 'The hitter is approaching straight on and has been going line — stay outside the block and a step deeper for the line shot.' };
        right.MB = { ...right.MB, pos: v(6.1, 8.2), why: 'Shade toward the deep line behind your right-back.' };
      } else {
        right.LB = { ...right.LB, pos: v(1.8, 6.1), why: 'The hitter is approaching from outside the court (an inside-out approach) — expect the cross court; take away the hardest angle.' };
        right.MB = { ...right.MB, pos: v(3.9, 8.0), why: 'Shade toward the deep cross corner.' };
      }
    }
    spots = from === 'ourRight' ? right : mirrorSpots(right);
  }
  return spots;
}

/** Polygon of the court shadowed by blockers' hands (local coords, conceptual). */
export function blockShadow(contact: Vec, blockers: Vec[]): Vec[] | null {
  if (!blockers.length) return null;
  // The ball is struck ~3 m above the floor; projecting from a point further back
  // approximates the downward hitting angle so the wedge stays conceptual, not huge.
  const hitter = { x: contact.x, y: contact.y - 3.8 };
  const hands = blockers.flatMap((b) => [v(b.x - 0.45, 0), v(b.x + 0.45, 0)]);
  const leftHand = hands.reduce((a, b) => (b.x < a.x ? b : a));
  const rightHand = hands.reduce((a, b) => (b.x > a.x ? b : a));
  const extend = (hand: Vec) => {
    const d = sub(hand, hitter);
    const k = (9 - hitter.y) / d.y;
    return add(hitter, scale(d, k));
  };
  return [leftHand, rightHand, extend(rightHand), extend(leftHand)];
}

// ---------------------------------------------------------------------------
// Plans
// ---------------------------------------------------------------------------

const SERVE_BASE: Record<Slot, Vec> = {
  LF: v(1.3, 1.0),
  MF: v(4.5, 0.8),
  RF: v(7.7, 1.0),
  LB: v(1.5, 6.2),
  MB: v(4.5, 7.6),
  RB: v(7.5, 6.2),
};

const CLASSIC_SERVE_ZONE = { 4: v(1.5, 1.4), 3: v(4.5, 1.4), 2: v(7.5, 1.4), 5: v(1.5, 6.0), 6: v(4.5, 7.0), 1: v(7.5, 6.0) } as const;
export const SERVER_SPOT = v(7.4, 9.7);

export function computePlan(ctx: TeamCtx, sit: Situation): TacticalPlan {
  const { team, rotation, serving } = ctx;
  const oc = onCourt(team, rotation, serving);
  const setter = activeSetterId(team, rotation);
  const slots = specialtySlots(team, rotation, serving);
  const targets: Record<string, Target> = {};
  const notes: string[] = [];
  const role = (id: string) => playerById(team, id).role;
  const front = (id: string) => isFrontZone(oc.find((o) => o.playerId === id)!.zone);
  const zoneOf = (id: string) => oc.find((o) => o.playerId === id)!.zone;
  const ST = setTarget(team.systemId);
  const opts = attackOptions(team, rotation, serving);
  const laneOf = (id: string) => opts.find((o) => o.playerId === id)?.lane;

  switch (sit.kind) {
    case 'serveReceive': {
      const f = receiveFormation(team, rotation);
      for (const o of oc) {
        const id = o.playerId;
        const pos = f.positions[id];
        const isPasser = f.passers.includes(id);
        let duty: string;
        let why: string;
        let next: Vec | undefined;
        let nextLabel: string | undefined;
        if (id === setter) {
          duty = front(id) ? 'Front-row setter: hide at the net' : 'Back-row setter: hide and release';
          why = `${f.def.note} Stay out of the passing lanes and keep your rotational relationships until the serve is contacted.`;
          next = ST;
          nextLabel = 'Release to the setting target';
        } else if (isPasser) {
          duty = role(id) === 'L' ? 'Primary passer' : 'Passer';
          why = `You are one of the three passers in this rotation. Split the court with the other passers so there is no unclaimed seam, and stand deep enough that you move forward to most serves.`;
          const lane = laneOf(id);
          if (lane && lane !== 'dump') {
            next = approachFor(team, lane);
            nextLabel = `After passing, open up to your ${lane === 'left' ? 'left-side' : lane === 'right' ? 'right-side' : lane} approach`;
          }
        } else {
          const lane = laneOf(id);
          duty = front(id) ? 'Non-passer: hide at the net' : 'Non-passer: stay out of the lanes';
          why = 'You are not passing in this formation. Stand where you do not block a passer’s view or movement, while keeping your legal relationships to your neighbours.';
          if (lane) {
            next = approachFor(team, lane);
            nextLabel = `Transition to your ${lane} approach after contact`;
          }
        }
        targets[id] = { pos, radius: isPasser ? 1.3 : 1.1, duty, why, next, nextLabel };
      }
      notes.push(f.def.note);
      break;
    }
    case 'release': {
      const f = receiveFormation(team, rotation);
      for (const o of oc) {
        const id = o.playerId;
        const start = f.positions[id];
        if (id === setter) {
          targets[id] = {
            pos: ST,
            radius: 1.2,
            duty: 'Release to the target',
            why: 'The serve is contacted, so the overlap rule no longer applies. Get to the setting target (right of centre, about a metre off the net) before the pass arrives, then face the left sideline.',
            next: ST,
            nextLabel: 'Play the second ball',
          };
        } else if (f.passers.includes(id)) {
          targets[id] = {
            pos: start,
            radius: 1.3,
            duty: 'Hold your passing area',
            why: 'You are a passer. Hold your area and read the serve; do not leave your seam until you know the ball is not yours.',
            next: laneOf(id) ? approachFor(team, laneOf(id)!) : undefined,
            nextLabel: 'Approach after the pass',
          };
        } else {
          const lane = laneOf(id);
          if (lane) {
            const fr = front(id);
            targets[id] = {
              pos: approachFor(team, lane),
              radius: 1.3,
              duty: `Switch to your ${lane} attacking lane`,
              why: fr
                ? `After contact you may switch. Get off the net to your ${lane === 'middle' ? 'quick-attack' : lane + '-side'} approach start so you can attack the first ball.`
                : `You are back row, so any attack above the net must take off from behind the attack line. Move to your ${lane === 'pipe' ? 'pipe' : 'D'} approach start behind the 3 m line.`,
            };
          } else {
            const slot = slots[id];
            targets[id] = { pos: SERVE_BASE[slot], radius: 1.4, duty: 'Move to your base position', why: 'Get out of the passers’ way and into your specialty area.' };
          }
        }
      }
      break;
    }
    case 'firstContact': {
      const contact = sit.contactId;
      const P = sit.ballAt;
      const setterTouched = contact === setter;
      let second = setter;
      if (setterTouched) {
        const libero = oc.find((o) => o.playerId === team.liberoId && o.playerId !== contact);
        const rf = oc.find((o) => slots[o.playerId] === 'RF' && o.playerId !== contact);
        second = libero?.playerId ?? rf?.playerId ?? oc.find((o) => o.playerId !== contact)!.playerId;
        notes.push(
          `The setter took the first ball, so ${playerById(team, second).role === 'L' ? 'the libero' : 'the right-front player'} takes the second contact. ${
            playerById(team, second).role === 'L' ? 'If the libero sets overhand in the front zone, the attacker must hit with part of the ball below the net top — so set from behind the 3 m line or bump-set.' : ''
          }`,
        );
      }
      const outOfSystem = sit.quality === 'off' || sit.quality === 'poor';
      for (const o of oc) {
        const id = o.playerId;
        if (id === contact) {
          // The passer/digger: after the contact, what next?
          const lane = laneOf(id);
          if (id === setter) {
            targets[id] = {
              pos: front(id) ? v(8.0, 2.2) : v(7.4, 5.4),
              radius: 1.6,
              duty: 'Setter took the first ball — get out and cover',
              why: 'You played the first contact, so you cannot set this ball. Call “help!”, recover toward the right side, and become a coverage player (or a right-side option if you are front row).',
              locked: false,
            };
          } else if (lane && lane !== 'dump' && !(outOfSystem && lane === 'middle')) {
            targets[id] = {
              pos: approachFor(team, lane),
              radius: 1.4,
              duty: 'Pass, then open up to attack',
              why: `You made the first contact — do not admire it. Open up and get back to your ${lane} approach start so you are a real attacking option.`,
            };
          } else {
            targets[id] = {
              pos: v(clamp(P.x - 0.5, 1.5, 7.5), clamp(P.y + 2.2, 4.0, 6.5)),
              radius: 1.6,
              duty: 'Pass, then follow toward coverage',
              why: 'You are not an attacking option on this ball. Recover toward the middle of the court and prepare to cover the attack.',
            };
          }
          continue;
        }
        if (id === second) {
          targets[id] = {
            pos: P,
            radius: 1.0,
            duty: setterTouched ? 'Emergency setter — take the second ball' : 'Get under the second ball',
            why: setterTouched
              ? 'The setter is out of the play. You are the designated emergency setter: get to the ball, square to your target, and give a high, hittable set (usually to the outside).'
              : outOfSystem
                ? 'The pass is off target. Chase it, beat the ball to the spot, and turn to face your target — a high, hittable ball to the outside is the safe play.'
                : sit.quality === 'tight'
                  ? 'The pass is tight to the net. Get there, keep the ball on your side, and avoid a net fault — you can also attack or dump it if you are front row.'
                  : 'Good pass — get to the ball early and square up so all attackers stay live.',
          };
          continue;
        }
        const lane = laneOf(id);
        if (lane && lane !== 'dump') {
          if (outOfSystem && (lane === 'middle' || lane === 'pipe' || lane === 'D')) {
            targets[id] = {
              pos: lane === 'middle' ? v(ST.x - 0.5, 3.0) : v(lane === 'D' ? 6.6 : 4.5, 5.0),
              radius: 1.6,
              duty: lane === 'middle' ? 'Hold off — no quick on a bad pass' : 'Get ready to cover',
              why:
                lane === 'middle'
                  ? 'Out-of-system passes take the quick attack away. Still approach to hold the middle blocker if you can, but expect a high ball to the outside and get ready to cover it.'
                  : 'On an out-of-system pass the high ball almost always goes to a pin. Move in behind the attack to cover.',
            };
          } else {
            targets[id] = {
              pos: approachFor(team, lane),
              radius: 1.4,
              duty: `Get to your ${lane} approach`,
              why:
                lane === 'left'
                  ? 'Get wide and deep — outside the court and behind the 3 m line — so your approach brings you in at an angle to the set.'
                  : lane === 'right'
                    ? 'Get wide on the right; you are the setter’s back-set option.'
                    : lane === 'middle'
                      ? 'Stay close to the setter so you can hit the quick in rhythm with the set.'
                      : 'Back-row attacker: start behind the 3 m line so your take-off is legal.',
            };
          }
        } else {
          const z = zoneOf(id);
          targets[id] = {
            pos: z === 5 || z === 4 ? v(2.6, 5.3) : z === 6 ? v(4.5, 5.6) : v(6.4, 5.3),
            radius: 1.6,
            duty: 'Transition to coverage',
            why: 'You are not attacking this ball. Move up behind the hitters into a low, ready position for attack coverage.',
          };
        }
      }
      return { targets, blockers: [], secondContactId: second, setPoint: P, notes };
    }
    case 'attack': {
      const A = attackContact(team, sit.lane);
      const others = oc.filter((o) => o.playerId !== sit.attackerId);
      const dir = norm(sub(v(4.5, 4.8), A));
      const close = [rotate(dir, -55), dir, rotate(dir, 55)].map((d) => clampCourt(add(A, scale(d, 2.0))));
      const deep = [rotate(dir, -22), rotate(dir, 22)].map((d) => clampCourt(add(A, scale(d, 4.7))));
      const spots = [...close, ...deep];
      const prev = sit.from ?? {};
      const asg = assignSpots(
        others.map((o) => ({ id: o.playerId, from: prev[o.playerId] ?? receiveFormation(team, rotation).positions[o.playerId] })),
        spots,
      );
      targets[sit.attackerId] = { pos: A, radius: 1.0, duty: 'Attack', why: 'You are hitting.', locked: true };
      for (const o of others) {
        const i = asg[o.playerId];
        const isClose = i < 3;
        targets[o.playerId] = {
          pos: spots[i],
          radius: isClose ? 1.2 : 1.5,
          duty: isClose ? 'Tight coverage' : 'Deep coverage',
          why: isClose
            ? 'Get low within about two metres of the hitter, eyes on the block. Most blocked balls drop steeply right behind the attacker.'
            : 'Fill the second layer of the coverage cup to pick up balls that rebound deeper off the block.',
          alt: [],
        };
      }
      notes.push('Coverage forms a “cup” around the hitter: three players close, two deeper. Exact spots vary — the principle is to fill the gaps around the attacker.');
      return { targets, blockers: [], notes };
    }
    case 'defense': {
      const spots = defenseSlotSpots(sit.from, sit.set, sit.system, sit.tendency);
      const blockers: string[] = [];
      for (const o of oc) {
        const s = spots[slots[o.playerId]];
        targets[o.playerId] = { pos: s.pos, radius: s.radius ?? (s.pos.y < 0.8 ? 0.8 : 1.3), duty: s.duty, why: s.why };
        if (s.pos.y < 0.8) blockers.push(o.playerId);
      }
      for (const id of blockers) {
        targets[id].next = laneOf(id) ? approachFor(team, laneOf(id)!) : undefined;
        targets[id].nextLabel = 'Land, turn, and get to your approach for transition';
      }
      if (sit.system === 'read') {
        for (const id of Object.keys(targets)) if (!blockers.includes(id)) targets[id].radius += 0.5;
        notes.push('Read-and-react: start from base and adjust to what you see — the setter, the set, and the hitter’s shoulder. Tolerances are wider because reads vary.');
      }
      notes.push(
        sit.system === 'perimeter'
          ? 'Perimeter: back-row defenders stay on the edges and deep; tips are taken by the line digger or off-blocker.'
          : sit.system === 'rotation'
            ? 'Rotational: the line-side back defender rotates up for tips while middle-back rotates to the line.'
            : sit.system === 'middleUp'
              ? 'Middle-up (rover): middle-back plays up behind the block for tips; deep corners are left to the wing defenders.'
              : 'Read defence starts from perimeter-like positions.',
      );
      return { targets, blockers, notes };
    }
    case 'tip': {
      const base = defenseSlotSpots(sit.from, 'high', sit.system);
      const blockerSlots = (Object.keys(base) as Slot[]).filter((s) => base[s].pos.y < 0.8);
      const candidates = oc.filter((o) => !blockerSlots.includes(slots[o.playerId]));
      const responsible = candidates.reduce((a, b) =>
        dist(base[slots[a.playerId]].pos, sit.tipAt) <= dist(base[slots[b.playerId]].pos, sit.tipAt) ? a : b,
      ).playerId;
      const respSlot = slots[responsible];
      for (const o of oc) {
        const id = o.playerId;
        const s = slots[id];
        if (id === responsible) {
          targets[id] = {
            pos: sit.tipAt,
            radius: 1.0,
            duty: 'Tip is yours — go forward',
            why: `From your ${SLOT_NAME[respSlot]} spot in this ${sit.system === 'middleUp' ? 'middle-up' : sit.system} defence you are the closest defender to this tip. Move forward early, stay low and keep the ball up on your side.`,
          };
        } else if (id === setter && responsible !== setter) {
          targets[id] = { pos: ST, radius: 1.3, duty: 'Release to set the dig', why: 'A teammate is playing the tip, so the setter releases to the target to run the transition.' };
        } else if (blockerSlots.includes(s)) {
          const lane = laneOf(id);
          targets[id] = {
            pos: lane && lane !== 'dump' ? approachFor(team, lane) : v(base[s].pos.x, 2.5),
            radius: 1.6,
            duty: 'Land and transition',
            why: 'The ball went over your block. Land, turn to find the ball, and get off the net to your approach for the counter-attack.',
          };
        } else {
          const p = base[s].pos;
          targets[id] = {
            pos: clampCourt(add(p, scale(norm(sub(sit.tipAt, p)), 1.0))),
            radius: 1.6,
            duty: 'Close in and support',
            why: 'Not your ball — stay balanced, close a step toward the play to support a bad touch, then transition.',
          };
        }
      }
      notes.push('Tip responsibility depends on the defensive system and where the block is, not on one fixed player.');
      return { targets, blockers: [], notes, secondContactId: responsible === setter ? undefined : setter };
    }
    case 'freeBall': {
      const backPassers = oc.filter((o) => !isFrontZone(o.zone) && o.playerId !== setter);
      const spots3 = [v(1.8, 5.2), v(4.5, 6.3), v(7.2, 5.2)];
      const spots2 = [v(2.4, 5.6), v(6.4, 5.6)];
      const sp = backPassers.length === 3 ? spots3 : spots2;
      const asg = assignSpots(backPassers.map((o) => ({ id: o.playerId, from: SERVE_BASE[slots[o.playerId]] })), sp);
      for (const o of oc) {
        const id = o.playerId;
        if (id === setter) {
          targets[id] = { pos: ST, radius: 1.2, duty: 'Release — free ball!', why: 'A free ball is an easy pass. Release to the target immediately so the team can run its full offence.' };
        } else if (isFrontZone(o.zone)) {
          const lane = laneOf(id);
          targets[id] = {
            pos: lane ? approachFor(team, lane) : SERVE_BASE[slots[id]],
            radius: 1.4,
            duty: 'Drop off the net',
            why: 'No block is needed on a free ball. Drop off the net to your approach start so you can attack the first ball.',
          };
        } else {
          targets[id] = {
            pos: sp[asg[id]],
            radius: 1.4,
            duty: 'Free-ball passer',
            why: 'Form the free-ball passing line: split the court and pass high to the target.',
          };
        }
      }
      return { targets, blockers: [], notes: ['Call “free!” early so everyone switches from defence to offence.'] };
    }
    case 'servePre': {
      const server = oc.find((o) => o.zone === 1)!.playerId;
      for (const o of oc) {
        const id = o.playerId;
        if (id === server) {
          targets[id] = { pos: SERVER_SPOT, radius: 1.6, duty: 'Server', why: 'Serve from anywhere in the service zone behind the endline. You must be the player in Position 1.', locked: true };
          continue;
        }
        if (sit.servingFree) {
          const s = slots[id];
          targets[id] = {
            pos: SERVE_BASE[s],
            radius: 1.6,
            duty: `Start near your ${SLOT_NAME[s]} spot`,
            why: 'Under FIVB 2025–2028 (Rule 7.4) the serving team may occupy any position at the service hit, so you may already stand in your specialty position. You must still be inside your own court, and you must not screen the server. That saves the switch after contact.',
            alt: [{ pos: CLASSIC_SERVE_ZONE[o.zone], radius: 1.3, label: 'Rotational spot', why: 'Standing in your rotational zone is also legal; you will just need to switch after the serve.' }],
          };
        } else {
          targets[id] = {
            pos: CLASSIC_SERVE_ZONE[o.zone],
            radius: 1.2,
            duty: 'Stay in rotational order',
            why: 'Under this ruleset the serving team is also judged for overlap, so keep your rotational relationships until the serve is contacted — then switch.',
          };
        }
      }
      return { targets, blockers: [], notes };
    }
    case 'servingBase': {
      for (const o of oc) {
        const s = slots[o.playerId];
        targets[o.playerId] = {
          pos: SERVE_BASE[s],
          radius: 1.3,
          duty: `Base defence: ${SLOT_NAME[s]}`,
          why:
            s === 'LF' || s === 'MF' || s === 'RF'
              ? 'Front-row base: stay at the net ready to block, then read the setter and move to the attacker.'
              : 'Back-row base: start in your area and read the opponent’s pass and setter before committing.',
        };
      }
      return { targets, blockers: [], notes: ['After the serve, everyone switches to their specialty positions and sets up base defence.'] };
    }
  }
  return { targets, blockers: [], notes };
}

/** Name a court location for tooltips (“Setting area”, “At the net – blocking” …). */
export function tacticalLocationName(team: Team, p: Vec): string {
  const ST = setTarget(team.systemId);
  if (p.y < 0) return 'Opponent side';
  if (p.y > 9) return 'Behind the endline (service zone)';
  if (dist(p, ST) < 1.4) return 'Setting area';
  if (p.y < 1.0) return p.x < 3 ? 'At the net — left side' : p.x < 6 ? 'At the net — middle' : 'At the net — right side';
  if (p.y < 3) return p.x < 3 ? 'Front zone — left' : p.x < 6 ? 'Front zone — middle' : 'Front zone — right';
  if (p.y < 4.2 && (p.x < 1 || p.x > 8)) return p.x < 1 ? 'Left approach lane' : 'Right approach lane';
  const col = p.x < 3 ? 'left' : p.x < 6 ? 'middle' : 'right';
  const depth = p.y < 6 ? 'mid-court' : 'deep';
  return `Back court — ${depth} ${col}`;
}
