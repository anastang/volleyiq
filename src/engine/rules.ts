import { backFootY, COURT, feetOf, frontFootY, isFrontZone, leftFootX, rightFootX, type Vec, type Zone } from './geometry';
import { onCourt, serverBaseId } from './rotation';
import type { Ruleset } from './rulesets';
import { playerById } from './systems';
import type { Team } from './types';

export type ViolationKind = 'frontBack' | 'leftRight' | 'outOfCourt' | 'wrongServer';

export interface Violation {
  kind: ViolationKind;
  zones: Zone[];
  players: string[];
  message: string;
  rule: string;
}

/** Pairs that must keep front→back order: [front zone, back zone]. */
export const FRONT_BACK_PAIRS: [Zone, Zone][] = [
  [4, 5],
  [3, 6],
  [2, 1],
];

/**
 * Same-row pairs that must keep lateral order: [player nearer the left, player nearer the right].
 * Rule 7.4.3.2 compares each side player with ALL the other players in that row.
 */
export const SIDE_PAIRS: [Zone, Zone][] = [
  [4, 3],
  [3, 2],
  [4, 2],
  [5, 6],
  [6, 1],
  [5, 1],
];
const ZONE_WORD: Record<Zone, string> = {
  1: 'Position 1 (right-back)',
  2: 'Position 2 (right-front)',
  3: 'Position 3 (middle-front)',
  4: 'Position 4 (left-front)',
  5: 'Position 5 (left-back)',
  6: 'Position 6 (middle-back)',
};

export interface FormationCheck {
  legal: boolean;
  judged: boolean;
  violations: Violation[];
  note: string;
}

export interface FormationInput {
  team: Team;
  rotation: number;
  positions: Record<string, Vec>;
  /** Optional per-player foot stagger (left foot forward when negative). */
  stagger?: Record<string, number>;
  serving: boolean;
  ruleset: Ruleset;
}

const footWord = (n: string) => `${n}’s`;

/**
 * Positional check at the moment of service contact (FIVB 7.4), judged on the
 * feet in contact with the floor:
 *  - 7.4.3.1 each back-row player must be LEVEL WITH or have at least part of one
 *    foot further from the centre line than the FRONT foot of the corresponding
 *    front-row player;
 *  - 7.4.3.2 each right (left) side player must be LEVEL WITH or have at least part
 *    of one foot closer to the right (left) sideline than the foot further from
 *    that sideline of each other player in the row.
 * Under FIVB 2025–2028 only the receiving team must be in rotational order, but
 * both teams (except the server) must be within their own court.
 */
export function checkServiceFormation(input: FormationInput): FormationCheck {
  const { team, rotation, positions, serving, ruleset } = input;
  const judged = serving ? ruleset.servingTeamPositionalFault : ruleset.receivingTeamPositionalFault;
  const oc = onCourt(team, rotation, serving);
  const byZone = new Map<Zone, string>(oc.map((o) => [o.zone, o.playerId]));
  const feet = (id: string) => feetOf(positions[id], input.stagger?.[id] ?? 0);
  const name = (id: string) => {
    const p = playerById(team, id);
    return `#${p.number} ${p.name}`;
  };
  const violations: Violation[] = [];

  if (judged) {
    for (const [fz, bz] of FRONT_BACK_PAIRS) {
      const f = byZone.get(fz)!;
      const b = byZone.get(bz)!;
      // Back player's foot furthest from the net must be level with or behind the front player's front foot.
      if (!(backFootY(feet(b)) >= frontFootY(feet(f)))) {
        violations.push({
          kind: 'frontBack',
          zones: [bz, fz],
          players: [b, f],
          message: `Your ${ZONE_WORD[bz]} player (${name(b)}) is too far forward relative to ${ZONE_WORD[fz]} (${name(f)}) at service contact. At least part of one of ${footWord(name(b))} feet must be level with or further from the net than ${footWord(name(f))} front foot.`,
          rule: 'Front-row / back-row order (FIVB 7.4.3.1)',
        });
      }
    }
    for (const [lz, rz] of SIDE_PAIRS) {
      const l = byZone.get(lz)!;
      const r = byZone.get(rz)!;
      // Left player's leftmost foot must be level with or left of the other player's foot furthest from the left sideline.
      if (!(leftFootX(feet(l)) <= rightFootX(feet(r)))) {
        violations.push({
          kind: 'leftRight',
          zones: [lz, rz],
          players: [l, r],
          message: `Your ${ZONE_WORD[lz]} player (${name(l)}) and ${ZONE_WORD[rz]} player (${name(r)}) have swapped sides at service contact. ${name(l)} must have part of one foot level with or closer to the left sideline than ${footWord(name(r))} foot that is furthest from the left sideline.`,
          rule: 'Left / right order within a row (FIVB 7.4.3.2)',
        });
      }
    }
  }
  // Both teams (except the server) must be positioned within their own court (FIVB 7.4).
  const serverId = serving ? oc.find((o) => o.zone === 1)!.playerId : null;
  for (const o of oc) {
    if (o.playerId === serverId) continue;
    const f = feet(o.playerId);
    // Lines belong to the court (FIVB 1.3.2).
    const inCourt = (p: Vec) => p.x >= 0 && p.x <= COURT.width && p.y >= 0 && p.y <= COURT.half;
    if (!inCourt(f.left) && !inCourt(f.right)) {
      violations.push({
        kind: 'outOfCourt',
        zones: [o.zone],
        players: [o.playerId],
        message: `${name(o.playerId)} (${ZONE_WORD[o.zone]}) is standing outside the court. At service contact every player except the server must be positioned within their own court.`,
        rule: 'Positioned within own court (FIVB 7.4)',
      });
    }
  }
  const freeNote = `Under ${ruleset.name} the serving team is not judged for rotational order: its players may stand anywhere on their own court at service contact (no screening, FIVB 12.5). Only the correct server matters.`;
  return {
    legal: violations.length === 0,
    judged,
    violations,
    note: violations.length
      ? 'Positional fault: the opponent is awarded a point and the service (FIVB 7.5.4).'
      : judged
        ? 'Legal: every front/back and same-row relationship holds at service contact.'
        : freeNote,
  };
}

export function checkServer(team: Team, rotation: number, serverId: string): Violation | null {
  const correct = serverBaseId(team, rotation);
  if (serverId === correct) return null;
  const p = playerById(team, serverId);
  const c = playerById(team, correct);
  return {
    kind: 'wrongServer',
    zones: [1],
    players: [serverId, correct],
    message: `#${p.number} ${p.name} is not the server — it must be the player in Position 1, #${c.number} ${c.name}. Serving out of order is a rotational fault.`,
    rule: 'Rotational order / service order (FIVB 7.6–7.7)',
  };
}

// ---------------------------------------------------------------------------
// Attack, block and libero restrictions
// ---------------------------------------------------------------------------

export interface RuleResult {
  legal: boolean;
  reason: string;
}

export interface AttackAttempt {
  isLibero: boolean;
  /** Rotational row status, regardless of where the player is standing. */
  frontRow: boolean;
  /** Local position of the take-off foot (y = distance from the net). */
  takeoff: Vec;
  /** At contact, is the ball ENTIRELY higher than the top of the net? */
  ballEntirelyAboveNet: boolean;
  /** Set came from the libero's overhand finger pass made in the front zone. */
  afterLiberoOverhandInFrontZone?: boolean;
  /** Attacking the opponent's serve while the ball is in the front zone and above the net. */
  onOpponentServeInFrontZone?: boolean;
}

export function checkAttack(a: AttackAttempt): RuleResult {
  if (a.onOpponentServeInFrontZone && a.ballEntirelyAboveNet) {
    return { legal: false, reason: 'Completing an attack hit on the opponent’s serve, in the front zone with the ball entirely above the net, is a fault.' };
  }
  if (a.isLibero) {
    if (a.ballEntirelyAboveNet)
      return { legal: false, reason: 'A libero may not complete an attack hit from anywhere if the ball is entirely higher than the top of the net at contact.' };
    return { legal: true, reason: 'A libero may send the ball over if at contact it is not entirely above the top of the net.' };
  }
  if (a.afterLiberoOverhandInFrontZone && a.ballEntirelyAboveNet) {
    return {
      legal: false,
      reason: 'The ball came from the libero’s overhand finger pass in the front zone, so no player may complete an attack hit with it entirely above the top of the net. (Legal if the libero sets from behind the attack line, or bumps the set.)',
    };
  }
  if (a.frontRow) return { legal: true, reason: 'Front-row players may attack at any height.' };
  if (!a.ballEntirelyAboveNet) {
    return { legal: true, reason: 'A back-row player may attack from anywhere if part of the ball is below the top of the net at contact.' };
  }
  // Take-off must be behind the attack line: the line belongs to the front zone.
  if (a.takeoff.y > COURT.attackLine) {
    return { legal: true, reason: 'Legal back-row attack: take-off was from behind the attack line (landing in front of it is fine).' };
  }
  return {
    legal: false,
    reason: 'Back-row attack fault: the player took off on or in front of the attack line and contacted a ball entirely above the top of the net. Standing in the front zone is not illegal by itself — this combination is.',
  };
}

export function checkBlock(team: Team, rotation: number, serving: boolean, playerId: string): RuleResult {
  const p = playerById(team, playerId);
  if (p.role === 'L') return { legal: false, reason: 'A libero may not block or attempt to block.' };
  const o = onCourt(team, rotation, serving).find((x) => x.playerId === playerId);
  if (!o) return { legal: false, reason: 'Player is not on court.' };
  if (!isFrontZone(o.zone)) {
    return {
      legal: false,
      reason: `#${p.number} is a back-row player (rotational Position ${o.zone}). Back-row players may not complete a block or take part in a collective block that touches the ball — no matter where they are standing.`,
    };
  }
  return { legal: true, reason: `Front-row player (Position ${o.zone}) — eligible to block.` };
}

export function checkServeEligibility(team: Team, playerId: string, ruleset: Ruleset): RuleResult {
  const p = playerById(team, playerId);
  if (p.role === 'L' && !ruleset.liberoMayServe) return { legal: false, reason: 'Under FIVB rules the libero may not serve.' };
  return { legal: true, reason: 'Eligible to serve when in Position 1.' };
}

// ---------------------------------------------------------------------------
// Team contacts
// ---------------------------------------------------------------------------

export interface ContactState {
  teamHits: number;
  lastPlayer: string | null;
  lastWasBlock: boolean;
}

export const freshContacts = (): ContactState => ({ teamHits: 0, lastPlayer: null, lastWasBlock: false });

export function checkContact(state: ContactState, playerId: string, isBlock: boolean): RuleResult & { next: ContactState } {
  if (isBlock) {
    return { legal: true, reason: 'A block contact does not count as a team hit.', next: { teamHits: 0, lastPlayer: playerId, lastWasBlock: true } };
  }
  if (state.lastPlayer === playerId && !state.lastWasBlock) {
    return { legal: false, reason: 'Double contact: a player may not hit the ball twice consecutively (except after a block or within one action on the first hit).', next: state };
  }
  if (state.teamHits >= 3) {
    return { legal: false, reason: 'Four hits: a team has at most three hits (block not counted) to return the ball.', next: state };
  }
  // After a block the blocker may make the first hit; that hit counts as hit one.
  const teamHits = state.teamHits + 1;
  return { legal: true, reason: `Team hit ${teamHits} of 3.`, next: { teamHits, lastPlayer: playerId, lastWasBlock: false } };
}

// ---------------------------------------------------------------------------
// Libero replacements and substitutions
// ---------------------------------------------------------------------------

export interface LiberoState {
  /** Player the libero is currently replacing (null = libero on bench). */
  replacing: string | null;
  /** Rally index of the most recent replacement. */
  lastChangeRally: number;
}

export function checkLiberoEnter(team: Team, rotation: number, serving: boolean, st: LiberoState, targetId: string, rallyIndex: number, ruleset: Ruleset): RuleResult {
  if (!team.liberoId) return { legal: false, reason: 'No libero registered.' };
  if (st.replacing) return { legal: false, reason: 'The libero is already on court. Only one libero may be on court at a time.' };
  if (ruleset.completedRallyBetweenLiberoReplacements && rallyIndex <= st.lastChangeRally) {
    return { legal: false, reason: 'There must be a completed rally between two libero replacements.' };
  }
  const o = onCourt({ ...team, liberoId: null }, rotation, serving).find((x) => x.playerId === targetId);
  if (!o) return { legal: false, reason: 'That player is not on court.' };
  if (isFrontZone(o.zone)) return { legal: false, reason: 'The libero may replace back-row players only.' };
  if (o.zone === 1 && serving && !ruleset.liberoMayServe) return { legal: false, reason: 'That player is about to serve, and the libero may not serve.' };
  return { legal: true, reason: 'Legal libero replacement (does not count as a substitution).' };
}

export function checkLiberoExit(st: LiberoState, returningId: string, rallyIndex: number, ruleset: Ruleset): RuleResult {
  if (!st.replacing) return { legal: false, reason: 'The libero is not on court.' };
  if (returningId !== st.replacing) return { legal: false, reason: 'The libero can only be replaced by the player they replaced.' };
  if (ruleset.completedRallyBetweenLiberoReplacements && rallyIndex <= st.lastChangeRally) {
    return { legal: false, reason: 'There must be a completed rally between two libero replacements.' };
  }
  return { legal: true, reason: 'Legal: the replaced player returns.' };
}

export interface SubState {
  count: number;
  /** starterId → substitute currently or previously paired with them. */
  pairs: Record<string, string>;
  /** Pairs whose round trip (out and back in) is complete. */
  closed: string[];
}

export const freshSubs = (): SubState => ({ count: 0, pairs: {}, closed: [] });

export function substitute(team: Team, st: SubState, outId: string, inId: string, ruleset: Ruleset): RuleResult & { team: Team; state: SubState } {
  const fail = (reason: string) => ({ legal: false, reason, team, state: st });
  if (st.count >= ruleset.maxSubstitutionsPerSet) return fail(`Maximum of ${ruleset.maxSubstitutionsPerSet} substitutions per set reached.`);
  const idx = team.lineup.indexOf(outId);
  if (idx < 0) return fail('The outgoing player is not in the rotational lineup.');
  if (team.lineup.includes(inId)) return fail('The incoming player is already on court.');
  if (inId === team.liberoId || outId === team.liberoId) return fail('Libero changes are replacements, not substitutions.');
  const starterOf = Object.entries(st.pairs).find(([, sub]) => sub === outId)?.[0];
  if (starterOf) {
    // A substitute leaving: only the starter they replaced may return.
    if (inId !== starterOf) return fail('A substitute may only be replaced by the starting player they replaced.');
    const lineup = [...team.lineup];
    lineup[idx] = inId;
    return { legal: true, reason: 'Starter returns to their original position.', team: { ...team, lineup }, state: { ...st, count: st.count + 1, closed: [...st.closed, starterOf] } };
  }
  if (st.pairs[outId] || st.closed.includes(outId)) return fail('This starter has already left once this set.');
  if (Object.values(st.pairs).includes(inId)) return fail('This substitute has already entered once this set.');
  const lineup = [...team.lineup];
  lineup[idx] = inId;
  return {
    legal: true,
    reason: 'Substitution: the substitute takes the starter’s place in the rotational order.',
    team: { ...team, lineup },
    state: { ...st, count: st.count + 1, pairs: { ...st.pairs, [outId]: inId } },
  };
}

/** Sanity checks that catch impossible states before a scenario continues. */
export function validateTeamState(team: Team, rotation: number, serving: boolean, ruleset: Ruleset): string[] {
  const errs: string[] = [];
  const oc = onCourt(team, rotation, serving, ruleset.liberoMayServe);
  if (oc.length !== 6) errs.push('A team must have exactly six players on court.');
  const ids = new Set(oc.map((o) => o.playerId));
  if (ids.size !== 6) errs.push('A player appears in two zones.');
  for (const o of oc) {
    if (o.playerId === team.liberoId && isFrontZone(o.zone)) errs.push('Libero is in the front row.');
    if (o.playerId === team.liberoId && o.zone === 1 && serving && !ruleset.liberoMayServe) errs.push('Libero is serving.');
  }
  return errs;
}
