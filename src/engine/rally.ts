import { v, type Side, type Vec } from './geometry';
import type { Rng } from './rng';
import { applyRallyResult, initialMatch, onCourt, type MatchState } from './rotation';
import {
  buildAttackCoverage,
  buildDefense,
  buildFirstContact,
  buildFreeBall,
  buildRelease,
  buildServePre,
  buildServeReceive,
  buildServingBase,
  buildTip,
  makeWorld,
  name,
  positionsOf,
  resolveFocus,
  seg,
  withDefensiveSpecialist,
  type Focus,
  type GenOptions,
  type Scenario,
  type World,
} from './scenarios';
import { activeSetterId, attackOptions, LANE_NAME, receiveFormation } from './systems';
import { computePlan, opponentContactPoint, PASS_LABEL, SERVER_SPOT } from './tactics';
import { toLocal, toWorld } from './geometry';
import type { AttackSide, Lane, PassQuality } from './types';

export type RallyNode =
  | { k: 'receive' }
  | { k: 'release'; passer: string }
  | { k: 'first'; contact: string; quality: PassQuality; source: 'serve' | 'dig' | 'free'; from?: AttackSide; start?: Record<string, Vec> }
  | { k: 'attack'; attacker: string; lane: Lane; setFrom?: Vec; start?: Record<string, Vec> }
  | { k: 'defend'; from: AttackSide; set: 'high' | 'quick'; start?: Record<string, Vec> }
  | { k: 'tip'; from: AttackSide; tipAt: Vec }
  | { k: 'serve' }
  | { k: 'base' }
  | { k: 'free' };

/** Forced outcomes for scripted rallies (keys are read in order of use). */
export interface RallyScript {
  serveTo?: 'libero' | 'any';
  passQuality?: PassQuality[];
  attackOutcomes?: ('kill' | 'blocked' | 'dug' | 'error')[];
  defenseOutcomes?: ('dig' | 'tip' | 'kill' | 'error')[];
  forceLane?: Lane;
}

export interface RallyStep {
  scenario: Scenario;
  node: RallyNode;
  narration: string;
}

export interface RallyResult {
  winner: Side;
  reason: string;
}

export interface RallyRun {
  world: World;
  focusIds: string[];
  focusNote?: string;
  steps: RallyStep[];
  scores: number[];
  result: RallyResult | null;
  log: string[];
  script: RallyScript;
  stepCap: number;
  pendingNarration: string;
}

export interface RallyConfig {
  opts: GenOptions;
  focus: Focus;
  homeServing: boolean;
  homeRotation: number;
  awayRotation: number;
  script?: RallyScript;
  stepCap?: number;
}

export function startRally(cfg: RallyConfig): RallyRun {
  let world = makeWorld(cfg.opts, cfg.homeRotation, cfg.homeServing, cfg.awayRotation);
  let note: string | undefined;
  if (cfg.focus.kind === 'role' && cfg.focus.role === 'DS') {
    const r = withDefensiveSpecialist(world);
    world = r.world;
    note = r.note;
  }
  const f =
    cfg.focus.kind === 'role' && cfg.focus.role === 'DS' && note
      ? { ids: [world.home.team.players.find((p) => p.role === 'DS')!.id], note }
      : resolveFocus(world, cfg.focus.kind === 'role' && cfg.focus.role === 'DS' ? { kind: 'role', role: 'L' } : cfg.focus);
  const run: RallyRun = {
    world,
    focusIds: f.ids,
    focusNote: f.note,
    steps: [],
    scores: [],
    result: null,
    log: [],
    script: cfg.script ?? {},
    stepCap: cfg.stepCap ?? 9,
    pendingNarration: cfg.homeServing ? `${name(world.home.team, onCourt(world.home.team, world.home.rotation, true).find((o) => o.zone === 1)!.playerId)} is serving.` : 'The opponent is serving.',
  };
  const first: RallyNode = cfg.homeServing ? { k: 'serve' } : { k: 'receive' };
  pushStep(run, first, cfg.opts.rng);
  return run;
}

function common(run: RallyRun, title: string) {
  return { category: 'serveReceive' as const, title, focusIds: run.focusIds, focusNote: run.focusNote, coach: run.focusIds.length > 1 };
}

function buildFor(run: RallyRun, node: RallyNode, rng: Rng): Scenario {
  const w = run.world;
  const c = (title: string, cat: Scenario['category']) => ({ ...common(run, title), category: cat });
  switch (node.k) {
    case 'receive':
      return buildServeReceive(w, c('Prepare: serve receive', 'serveReceive'));
    case 'release':
      return buildRelease(w, c('Service contact: release', 'release'));
    case 'first': {
      const incoming =
        node.source === 'dig' && node.from
          ? [seg(toWorld('home', opponentContactPoint(node.from)), toWorld('home', node.start?.[node.contact] ?? v(4.5, 6)), 3, 0.7, 0.3, 700, 'Attack')]
          : node.source === 'free'
            ? [seg(toWorld('away', v(4.5, 6)), toWorld('home', node.start?.[node.contact] ?? v(4.5, 6)), 1, 0.8, 3.5, 1200, 'Free ball')]
            : undefined;
      return buildFirstContact(w, c(node.source === 'serve' ? 'First contact' : 'Transition', node.source === 'serve' ? 'someoneElse' : 'transition'), {
        contactId: node.contact,
        quality: node.quality,
        source: node.source,
        startPositions: node.start ? { ...node.start } : undefined,
        incoming,
      });
    }
    case 'attack':
      return buildAttackCoverage(w, c('Attack & coverage', 'attacking'), { attackerId: node.attacker, lane: node.lane, setFrom: node.setFrom, startPositions: node.start ? { ...node.start } : undefined });
    case 'defend':
      return buildDefense(w, c('Defend the attack', 'blocking'), { from: node.from, set: node.set, startPositions: node.start ? { ...node.start } : undefined }, rng.chance(0.5) ? 'blocking' : 'spikeDefense');
    case 'tip':
      return buildTip(w, c('Tip!', 'tip'), { from: node.from, tipAt: node.tipAt });
    case 'serve':
      return buildServePre(w, c('Prepare: your serve', 'serving'));
    case 'base':
      return buildServingBase(w, c('Base defence', 'serving'));
    case 'free':
      return buildFreeBall(w, c('Free ball', 'freeBall'));
  }
}

function pushStep(run: RallyRun, node: RallyNode, rng: Rng) {
  const scenario = buildFor(run, node, rng);
  run.steps.push({ scenario, node, narration: run.pendingNarration });
  run.pendingNarration = '';
}

const shift = <T>(arr: T[] | undefined): T | undefined => (arr && arr.length ? arr.shift() : undefined);

function end(run: RallyRun, winner: Side, reason: string) {
  run.result = { winner, reason };
  run.log.push(reason);
}

/**
 * Advance the rally after the user completes the current step with a score
 * (0–100). Better positioning shifts the odds of the next event in your
 * team's favour — the opponent behaves plausibly but is not scripted unless a
 * script is given.
 */
export function advanceRally(run: RallyRun, stepScore: number, rng: Rng): RallyRun {
  if (run.result) return run;
  run.scores.push(stepScore);
  const q = stepScore / 100;
  const step = run.steps[run.steps.length - 1];
  const node = step.node;
  const w = run.world;
  const team = w.home.team;
  const rot = w.home.rotation;
  const setter = activeSetterId(team, rot);
  const narrate = (s: string) => {
    run.pendingNarration = s;
    run.log.push(s);
  };
  const forceEnd = run.steps.length >= run.stepCap;
  const after = step.scenario.after?.home;

  switch (node.k) {
    case 'receive': {
      // Only an actual positional fault ends the rally here; the caller passes 0 for an illegal formation.
      if (stepScore === 0) return end(run, 'away', 'Positional fault at service contact — point to the opponent.'), run;
      if (rng.chance(0.07)) return end(run, 'home', 'Service error by the opponent — your point.'), run;
      if (rng.chance(0.04 + (1 - q) * 0.08)) return end(run, 'away', 'Ace! The serve found a gap in the formation.'), run;
      const f = receiveFormation(team, rot);
      const lib = onCourt(team, rot, false).find((o) => o.playerId === team.liberoId)?.playerId;
      const passer = run.script.serveTo === 'libero' && lib ? lib : rng.pick(f.passers);
      narrate(`Serve heading toward ${name(team, passer)}.`);
      pushStep(run, { k: 'release', passer }, rng);
      break;
    }
    case 'release': {
      const quality = shift(run.script.passQuality) ?? rng.pick(['perfect', 'good', 'good', 'off', q > 0.7 ? 'good' : 'poor'] as PassQuality[]);
      narrate(`${name(team, node.passer)} passes — ${PASS_LABEL[quality].toLowerCase()}.`);
      pushStep(run, { k: 'first', contact: node.passer, quality, source: 'serve' }, rng);
      break;
    }
    case 'first': {
      const outOfSystem = node.quality === 'off' || node.quality === 'poor';
      const ao = attackOptions(team, rot).filter((o) => o.lane !== 'dump' && o.playerId !== node.contact && o.playerId !== setter);
      let pickOpt = run.script.forceLane ? ao.find((o) => o.lane === run.script.forceLane) : undefined;
      pickOpt ??= outOfSystem ? ao.find((o) => o.lane === 'left') ?? ao[0] : rng.pick(ao);
      if (!pickOpt) return end(run, 'away', 'No attacker available — the ball goes over as a free ball and the opponent scores.'), run;
      narrate(`Set: ${LANE_NAME[pickOpt.lane].toLowerCase()} to ${name(team, pickOpt.playerId)}.`);
      run.script.forceLane = undefined;
      const setFromW = step.scenario.after?.ball[0]?.from;
      pushStep(run, { k: 'attack', attacker: pickOpt.playerId, lane: pickOpt.lane, start: after, setFrom: setFromW ? toLocal('home', setFromW) : undefined }, rng);
      break;
    }
    case 'attack': {
      const forced = shift(run.script.attackOutcomes);
      const r = rng.next();
      const outcome = forced ?? (forceEnd ? (r < 0.6 ? 'kill' : 'error') : r < 0.3 ? 'kill' : r < 0.38 ? 'error' : r < 0.55 ? 'blocked' : 'dug');
      if (outcome === 'kill') return end(run, 'home', `${name(team, node.attacker)} hits it down — kill! Your point.`), run;
      if (outcome === 'error') return end(run, 'away', `${name(team, node.attacker)}’s attack goes out — point to the opponent.`), run;
      if (outcome === 'blocked') {
        if (!forced && rng.next() > 0.35 + q * 0.5) return end(run, 'away', 'Stuff block! Nobody covered the ball — point to the opponent.'), run;
        narrate('Blocked! The ball rebounds into your court — and your coverage digs it up.');
        const covered = Object.entries(after ?? {}).filter(([id]) => id !== node.attacker).sort((a, b) => a[1].y - b[1].y)[0]?.[0] ?? setter;
        const blockSide: AttackSide = node.lane === 'left' ? 'ourLeft' : node.lane === 'right' || node.lane === 'D' ? 'ourRight' : 'middle';
        pushStep(run, { k: 'first', contact: covered, quality: 'off', source: 'dig', from: blockSide, start: after }, rng);
        break;
      }
      // Dug by the opponent: they transition and attack.
      const awayOpts = attackOptions(w.away.team, w.away.rotation).filter((o) => o.lane !== 'dump');
      const their = rng.pick(awayOpts);
      const from: AttackSide = their.lane === 'left' ? 'ourRight' : their.lane === 'right' || their.lane === 'D' ? 'ourLeft' : their.lane === 'pipe' ? 'pipe' : 'middle';
      const set = their.lane === 'middle' ? 'quick' : 'high';
      narrate(`The opponent digs it. Their setter runs it to their ${LANE_NAME[their.lane].toLowerCase()} — ${from === 'middle' ? 'a quick in the middle' : from === 'pipe' ? 'a back-row attack' : `coming at your ${from === 'ourRight' ? 'right' : 'left'} side`}.`);
      pushStep(run, { k: 'defend', from, set, start: positionsOf(computePlan(w.home, { kind: 'servingBase' })) }, rng);
      break;
    }
    case 'defend': {
      const forced = shift(run.script.defenseOutcomes);
      const r = rng.next();
      const outcome = forced ?? (forceEnd ? (r < 0.5 ? 'kill' : 'error') : r < 0.12 ? 'error' : r < 0.12 + (1 - q) * 0.3 + 0.08 ? 'kill' : r < 0.55 && (node.from === 'ourRight' || node.from === 'ourLeft') ? 'tip' : 'dig');
      if (outcome === 'error') return end(run, 'home', 'The opponent hits it into the net — your point.'), run;
      if (outcome === 'kill') return end(run, 'away', q < 0.6 ? 'Kill — the attack found the space your defence left open.' : 'Kill — a great swing beats a well-positioned defence. It happens!'), run;
      if (outcome === 'tip') {
        const right = node.from === 'ourRight';
        const tipAt = rng.pick([v(right ? 6.6 : 2.4, 1.7), v(4.5, 3.0), v(right ? 8.2 : 0.8, 3.4)]);
        narrate('The hitter slows the arm down — it is a tip!');
        pushStep(run, { k: 'tip', from: node.from, tipAt }, rng);
        break;
      }
      const plan = computePlan(w.home, { kind: 'defense', from: node.from, set: node.set, system: w.defenseSystem });
      const diggers = Object.keys(plan.targets).filter((id) => !plan.blockers.includes(id));
      const digger = rng.pick(diggers);
      const quality: PassQuality = rng.pick(q > 0.7 ? (['good', 'good', 'off'] as PassQuality[]) : (['off', 'poor', 'good'] as PassQuality[]));
      narrate(`${name(team, digger)} digs it — ${PASS_LABEL[quality].toLowerCase()}.`);
      pushStep(run, { k: 'first', contact: digger, quality, source: 'dig', from: node.from, start: after }, rng);
      break;
    }
    case 'tip': {
      if (rng.next() > 0.3 + q * 0.6) return end(run, 'away', 'The tip drops in — nobody moved forward in time. Point to the opponent.'), run;
      const plan = computePlan(w.home, { kind: 'tip', from: node.from, system: w.defenseSystem, tipAt: node.tipAt });
      const digger = Object.entries(plan.targets).find(([, t]) => t.duty.startsWith('Tip is yours'))?.[0] ?? setter;
      narrate(`${name(team, digger)} picks up the tip!`);
      pushStep(run, { k: 'first', contact: digger, quality: 'good', source: 'dig', start: after }, rng);
      break;
    }
    case 'serve': {
      if (rng.chance(0.08)) return end(run, 'away', 'Your serve goes into the net — point to the opponent.'), run;
      if (rng.chance(0.06)) return end(run, 'home', 'Ace! Your serve lands untouched.'), run;
      narrate('Good serve — the opponent passes.');
      pushStep(run, { k: 'base' }, rng);
      break;
    }
    case 'base': {
      if (rng.chance(0.15)) {
        narrate('Their pass is shanked — they can only send a free ball over!');
        pushStep(run, { k: 'free' }, rng);
        break;
      }
      const awayOpts = attackOptions(w.away.team, w.away.rotation).filter((o) => o.lane !== 'dump');
      const their = rng.pick(awayOpts);
      const from: AttackSide = their.lane === 'left' ? 'ourRight' : their.lane === 'right' || their.lane === 'D' ? 'ourLeft' : their.lane === 'pipe' ? 'pipe' : 'middle';
      narrate(`Their setter sets ${LANE_NAME[their.lane].toLowerCase()}.`);
      pushStep(run, { k: 'defend', from, set: their.lane === 'middle' ? 'quick' : 'high', start: after }, rng);
      break;
    }
    case 'free': {
      const backRow = onCourt(team, rot, w.home.serving).filter((o) => [1, 5, 6].includes(o.zone) && o.playerId !== setter);
      const passer = rng.pick(backRow).playerId;
      narrate(`${name(team, passer)} passes the free ball — perfect.`);
      pushStep(run, { k: 'first', contact: passer, quality: 'perfect', source: 'free', start: after }, rng);
      break;
    }
  }
  return run;
}

export const SERVER_WORLD = toWorld('away', SERVER_SPOT);

// ---------------------------------------------------------------------------
// Scrimmage
// ---------------------------------------------------------------------------

export interface Scrimmage {
  match: MatchState;
  target: number;
  rallies: { winner: Side; reason: string; homeRotation: number; serving: Side }[];
  over: boolean;
}

export function newScrimmage(target = 15, homeServesFirst = false): Scrimmage {
  return { match: initialMatch(homeServesFirst ? 'home' : 'away'), target, rallies: [], over: false };
}

export function recordRally(s: Scrimmage, result: RallyResult): Scrimmage {
  const before = s.match;
  const match = applyRallyResult(before, result.winner);
  const { home, away } = match.score;
  const over = (home >= s.target || away >= s.target) && Math.abs(home - away) >= 2;
  return {
    match,
    target: s.target,
    rallies: [...s.rallies, { winner: result.winner, reason: result.reason, homeRotation: before.rotation.home, serving: before.serving }],
    over,
  };
}
