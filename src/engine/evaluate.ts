import { clamp, dist, type Vec } from './geometry';
import { checkBlock, checkServiceFormation, type Violation } from './rules';
import type { Ruleset } from './rulesets';
import { playerById } from './systems';
import type { Target } from './tactics';
import type { Team } from './types';

export type Verdict = 'illegal' | 'weak' | 'acceptable' | 'recommended';

export const VERDICT_LABEL: Record<Verdict, string> = {
  illegal: 'Illegal',
  weak: 'Legal but tactically weak',
  acceptable: 'Acceptable',
  recommended: 'Recommended',
};

export type Dimension = 'rules' | 'positioning' | 'role' | 'coverage' | 'transition' | 'decision';

export const DIMENSION_LABEL: Record<Dimension, string> = {
  rules: 'Rule legality',
  positioning: 'Tactical positioning',
  role: 'Role responsibility',
  coverage: 'Court coverage',
  transition: 'Transition readiness',
  decision: 'Decision quality',
};

export interface Variant {
  id: string;
  label: string;
  description: string;
  targets: Record<string, Target>;
}

export interface PlaceObjective {
  /** Players the user is responsible for placing. */
  controlled: string[];
  /** One or more acceptable team solutions; the first is the primary recommendation. */
  variants: Variant[];
  legality: 'receivingFormation' | 'servingFormation' | 'blocking' | 'none';
  /** Players that should be blocking (front-row only) — used to detect back-row blocks. */
  blockSpots?: Vec[];
  /** Weighted points the team should be able to reach (coverage dimension). */
  coverage?: { points: { p: Vec; w: number }[]; reach: number; exclude?: string[] };
}

export interface PlayerResult {
  playerId: string;
  verdict: Verdict;
  distance: number;
  messages: string[];
  target: Target;
}

export interface Evaluation {
  verdict: Verdict;
  score: number;
  dims: Partial<Record<Dimension, number>>;
  perPlayer: PlayerResult[];
  violations: Violation[];
  legalityNote?: string;
  matchedVariant: Variant;
  messages: string[];
  errorTags: string[];
}

function directional(user: Vec, target: Vec): string | null {
  const dx = user.x - target.x;
  const dy = user.y - target.y;
  const parts: string[] = [];
  if (dy > 0.9) parts.push('too deep (too far from the net)');
  else if (dy < -0.9) parts.push('too close to the net');
  if (dx > 0.9) parts.push('too far to the right');
  else if (dx < -0.9) parts.push('too far to the left');
  return parts.length ? parts.join(' and ') : null;
}

export function coverageScore(positions: Record<string, Vec>, cov: NonNullable<PlaceObjective['coverage']>): number {
  const ids = Object.keys(positions).filter((id) => !cov.exclude?.includes(id));
  let got = 0;
  let total = 0;
  for (const { p, w } of cov.points) {
    total += w;
    const d = Math.min(...ids.map((id) => dist(positions[id], p)));
    got += w * clamp(1 - (d - cov.reach) / cov.reach, 0, 1);
  }
  return total ? got / total : 1;
}

const TIER_SCORE: Record<Verdict, number> = { recommended: 100, acceptable: 82, weak: 45, illegal: 0 };

function judgePlayer(team: Team, id: string, pos: Vec, target: Target): PlayerResult {
  const p = playerById(team, id);
  const tag = `#${p.number} ${p.name} (${p.role})`;
  const d = Math.max(0, dist(pos, target.pos) - target.radius);
  const msgs: string[] = [];
  let verdict: Verdict;
  if (d === 0) {
    verdict = 'recommended';
    msgs.push(`${tag}: ${target.duty} — well placed.`);
  } else if (d <= 0.9) {
    verdict = 'acceptable';
    msgs.push(`${tag}: close enough to ${target.duty.toLowerCase()} — a defensible spot, slightly off the ideal.`);
  } else {
    // Check alternative spots.
    const alt = target.alt?.find((a) => dist(pos, a.pos) <= a.radius + 0.4);
    if (alt) {
      verdict = 'acceptable';
      msgs.push(`${tag}: ${alt.label} — ${alt.why}`);
    } else {
      verdict = 'weak';
      const dir = directional(pos, target.pos);
      msgs.push(`${tag} is ${dir ?? 'out of position'}. ${target.why}`);
    }
  }
  return { playerId: id, verdict, distance: d, messages: msgs, target };
}

export interface EvalInput {
  team: Team;
  rotation: number;
  serving: boolean;
  ruleset: Ruleset;
  positions: Record<string, Vec>;
  objective: PlaceObjective;
}

/**
 * Evaluate a placement. Legality is decided first and independently of any
 * tactical judgement. Tactics are then scored against every variant, and the
 * best-matching variant is reported (so defensible alternatives are not
 * penalised).
 */
export function evaluatePlacement(input: EvalInput): Evaluation {
  const { team, rotation, serving, ruleset, positions, objective } = input;
  const violations: Violation[] = [];
  let legalityNote: string | undefined;
  const errorTags: string[] = [];

  if (objective.legality === 'receivingFormation' || objective.legality === 'servingFormation') {
    const chk = checkServiceFormation({ team, rotation, positions, serving: objective.legality === 'servingFormation', ruleset });
    violations.push(...chk.violations);
    legalityNote = chk.note;
    if (chk.violations.length) errorTags.push('overlap');
  }
  if (objective.legality === 'blocking' && objective.blockSpots?.length) {
    for (const id of objective.controlled) {
      const pos = positions[id];
      const atNet = pos.y < 0.9 && objective.blockSpots.some((b) => Math.abs(b.x - pos.x) < 1.6);
      if (!atNet) continue;
      const r = checkBlock(team, rotation, serving, id);
      if (!r.legal) {
        violations.push({ kind: 'frontBack', zones: [], players: [id], message: `${r.reason} Standing in the block means you are about to commit a fault.`, rule: 'Blocking restrictions (FIVB 14.6)' });
        errorTags.push(playerById(team, id).role === 'L' ? 'liberoBlock' : 'backRowBlock');
      }
    }
  }

  // Tactical: score each variant.
  let best: { v: Variant; res: PlayerResult[]; score: number } | null = null;
  for (const variant of objective.variants) {
    const res = objective.controlled.filter((id) => variant.targets[id] && !variant.targets[id].locked).map((id) => judgePlayer(team, id, positions[id], variant.targets[id]));
    const score = res.length ? res.reduce((s, r) => s + TIER_SCORE[r.verdict] - Math.min(30, r.distance * 8), 0) / res.length : 100;
    if (!best || score > best.score) best = { v: variant, res, score };
  }
  const { v: matched, res: perPlayer } = best!;

  const dims: Partial<Record<Dimension, number>> = {};
  dims.rules = violations.length ? 0 : 100;
  dims.positioning = Math.round(perPlayer.length ? perPlayer.reduce((s, r) => s + TIER_SCORE[r.verdict] - Math.min(30, r.distance * 8), 0) / perPlayer.length : 100);
  // Role responsibility: is the player at least in the right part of the court for their duty?
  dims.role = Math.round(
    perPlayer.length ? (perPlayer.filter((r) => r.distance <= Math.max(2.2, r.target.radius * 1.8)).length / perPlayer.length) * 100 : 100,
  );
  // Transition readiness.
  const withNext = perPlayer.filter((r) => r.target.next);
  if (withNext.length) {
    dims.transition = Math.round(
      withNext.reduce((s, r) => {
        const ideal = dist(r.target.pos, r.target.next!);
        const actual = dist(positions[r.playerId], r.target.next!);
        return s + clamp(100 - Math.max(0, actual - ideal - 0.8) * 22, 0, 100);
      }, 0) / withNext.length,
    );
  }
  if (objective.coverage) {
    const userCov = coverageScore(positions, objective.coverage);
    const refPos: Record<string, Vec> = { ...positions };
    for (const id of objective.controlled) if (matched.targets[id]) refPos[id] = matched.targets[id].pos;
    const refCov = coverageScore(refPos, objective.coverage);
    dims.coverage = Math.round(clamp((userCov / Math.max(0.01, refCov)) * 100, 0, 100));
    if (dims.coverage < 70) errorTags.push('coverageGap');
  }

  for (const r of perPlayer) {
    if (r.verdict !== 'weak') continue;
    const m = r.messages[0];
    if (m.includes('too deep')) errorTags.push('tooDeep');
    if (m.includes('too close to the net')) errorTags.push('tooShallow');
    if (/approach|transition|open up|switch/i.test(r.target.duty)) errorTags.push('noTransition');
    if (/tip/i.test(r.target.duty)) errorTags.push('tipMissed');
    if (/coverage/i.test(r.target.duty)) errorTags.push('noCoverage');
    if (/release|second ball|setter/i.test(r.target.duty)) errorTags.push('setterRelease');
  }

  let verdict: Verdict;
  if (violations.length) verdict = 'illegal';
  else if (perPlayer.every((r) => r.verdict === 'recommended')) verdict = 'recommended';
  else if (perPlayer.every((r) => r.verdict !== 'weak')) verdict = 'acceptable';
  else verdict = 'weak';

  const parts = Object.entries(dims).filter(([k]) => k !== 'rules').map(([, v]) => v as number);
  const tactical = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : 100;
  const score = violations.length ? Math.round(Math.min(35, tactical * 0.35)) : Math.round(tactical);

  const messages: string[] = [];
  if (violations.length) messages.push(...violations.map((x) => x.message));
  else if (legalityNote) messages.push(legalityNote);
  if (objective.variants.length > 1 && verdict !== 'illegal') {
    messages.push(`Closest match: ${matched.label}. ${matched.description}`);
  }
  for (const r of perPlayer) messages.push(...r.messages);
  return { verdict, score, dims, perPlayer, violations, legalityNote, matchedVariant: matched, messages, errorTags: [...new Set(errorTags)] };
}
