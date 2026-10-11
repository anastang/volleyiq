import { clamp, isFrontZone, toWorld, v, ZONE_INFO, ZONES, type Side, type Vec, type Zone } from './geometry';
import type { PlaceObjective, Variant } from './evaluate';
import type { Rng } from './rng';
import { checkAttack, checkServiceFormation, FRONT_BACK_PAIRS, SIDE_PAIRS, substitute, freshSubs } from './rules';
import { CLOCKWISE_NEXT, onCourt, zoneOfPlayer } from './rotation';
import type { Ruleset } from './rulesets';
import {
  activeSetterId,
  attackOptions,
  buildTeam,
  LANE_NAME,
  playerById,
  receiveFormation,
  setTarget,
  setterZone,
  type RosterOverride,
} from './systems';
import {
  attackContact,
  computePlan,
  opponentContactPoint,
  passLanding,
  PASS_LABEL,
  SERVER_SPOT,
  type Situation,
  type TacticalPlan,
  type TeamCtx,
} from './tactics';
import type { AttackSide, DefenseSystemId, Difficulty, Lane, PassQuality, Phase, Role, SystemId, Team } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SkillKey = 'rotation' | 'rules' | 'serveReceive' | 'offense' | 'coverage' | 'defense' | 'transition' | 'reading';

export const SKILL_LABEL: Record<SkillKey, string> = {
  rotation: 'Rotation Knowledge',
  rules: 'Rules Knowledge',
  serveReceive: 'Serve-Receive Positioning',
  offense: 'Offensive Positioning',
  coverage: 'Attack Coverage',
  defense: 'Defensive Coverage',
  transition: 'Transition Awareness',
  reading: 'Game Reading',
};

export type Category =
  | 'fundamentals'
  | 'serveReceive'
  | 'release'
  | 'receiveYou'
  | 'someoneElse'
  | 'setting'
  | 'attacking'
  | 'blocking'
  | 'tip'
  | 'spikeDefense'
  | 'transition'
  | 'brokenPlay'
  | 'freeBall'
  | 'serving'
  | 'reading'
  | 'rules';

export const CATEGORY_INFO: Record<Category, { name: string; blurb: string; skills: SkillKey[] }> = {
  fundamentals: { name: 'Court Fundamentals', blurb: 'Zones, rows and clockwise rotation.', skills: ['rotation'] },
  serveReceive: { name: 'Serve Receive', blurb: 'Legal, effective spots before the serve.', skills: ['serveReceive', 'rules'] },
  release: { name: 'Setter Release & Switching', blurb: 'Where to go the instant the serve is contacted.', skills: ['transition', 'offense'] },
  receiveYou: { name: 'You Receive the Ball', blurb: 'Make the first contact — then move.', skills: ['transition', 'serveReceive'] },
  someoneElse: { name: 'Someone Else Receives', blurb: 'Never stand still when it is not your ball.', skills: ['transition', 'offense'] },
  setting: { name: 'Setting Situations', blurb: 'Good, tight, off-the-net and broken passes.', skills: ['offense', 'reading'] },
  attacking: { name: 'Attack & Coverage', blurb: 'Approach preparation and covering your hitter.', skills: ['coverage', 'offense'] },
  blocking: { name: 'Blocking', blurb: 'Who blocks, where, and who defends behind.', skills: ['defense', 'rules'] },
  tip: { name: 'Tip Coverage', blurb: 'Recognise when to move forward.', skills: ['defense', 'reading'] },
  spikeDefense: { name: 'Spike Defence', blurb: 'Defend around the block and read the hitter.', skills: ['defense', 'reading'] },
  transition: { name: 'Defence → Offence', blurb: 'After the dig: recover, find the setter, attack.', skills: ['transition', 'offense'] },
  brokenPlay: { name: 'Broken Plays', blurb: 'Adapt when the rally falls apart.', skills: ['transition', 'reading'] },
  freeBall: { name: 'Free Balls', blurb: 'Switch from defence to offence instantly.', skills: ['transition', 'offense'] },
  serving: { name: 'Serving Team', blurb: 'Pre-serve freedom and base defence.', skills: ['rules', 'defense'] },
  reading: { name: 'Reading the Opponent', blurb: 'Anticipate from pass quality, setter and approach.', skills: ['reading'] },
  rules: { name: 'Rules & Legality', blurb: 'Overlap, back-row, libero and rotation rules.', skills: ['rules', 'rotation'] },
};

export interface BallSeg {
  from: Vec; // world
  to: Vec; // world
  h0: number;
  h1: number;
  peak: number;
  ms: number;
  label?: string;
}

export interface SideScene {
  team: Team;
  rotation: number;
  serving: boolean;
  positions: Record<string, Vec>;
}

export interface SceneOverlays {
  hitter?: Vec; // home local
  blockShadowFor?: string[]; // home blockers to draw shadow for (from recommended)
  passTarget?: Vec; // home local
  tipAt?: Vec;
  attackRays?: boolean;
}

export interface Scene {
  home: SideScene;
  away: SideScene;
  ball: BallSeg[];
  /** Ball resting point when there is no path (world, height). */
  ballRest?: { p: Vec; h: number };
  phase: Phase;
  caption: string;
  overlays?: SceneOverlays;
}

export interface AfterEvent {
  home: Record<string, Vec>;
  away: Record<string, Vec>;
  ball: BallSeg[];
  caption: string;
  phase: Phase;
}

export interface ScenarioBase {
  id: string;
  category: Category;
  title: string;
  prompt: string;
  skills: SkillKey[];
  difficulty: 1 | 2 | 3;
  systemId: SystemId;
  rotation: number;
  focusIds: string[];
  focusNote?: string;
  scene: Scene;
  three: { now: string; watch: string; next: string };
  hints: string[];
  explanation: string;
  whenChanges?: string;
  after?: AfterEvent;
}

export interface PlaceScenario extends ScenarioBase {
  kind: 'place';
  objective: PlaceObjective;
  start: Record<string, Vec>;
  ruleset: Ruleset;
}

export interface ChoiceOption {
  id: string;
  text: string;
  verdict: 'best' | 'ok' | 'wrong' | 'illegal';
  why: string;
}

export interface ChoiceScenario extends ScenarioBase {
  kind: 'choice';
  question: string;
  options: ChoiceOption[];
}

export interface TapScenario extends ScenarioBase {
  kind: 'tapZone';
  question: string;
  correct: Zone[];
  why: string;
}

export type Scenario = PlaceScenario | ChoiceScenario | TapScenario;

export type Focus = { kind: 'role'; role: Role } | { kind: 'zone'; zone: Zone } | { kind: 'all' };

export interface GenOptions {
  systemId: SystemId;
  rotation?: number;
  focus: Focus;
  difficulty: Difficulty;
  ruleset: Ruleset;
  defenseSystem: DefenseSystemId;
  roster?: Record<string, RosterOverride>;
  customSetters?: string[];
  rng: Rng;
}

export interface World {
  home: TeamCtx;
  away: TeamCtx;
  ruleset: Ruleset;
  defenseSystem: DefenseSystemId;
  difficulty: Difficulty;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let uid = 0;
const nextId = (p: string) => `${p}-${Date.now().toString(36)}-${(uid++).toString(36)}`;

export const positionsOf = (plan: TacticalPlan): Record<string, Vec> =>
  Object.fromEntries(Object.entries(plan.targets).map(([id, t]) => [id, { ...t.pos }]));

const W = (side: Side, p: Vec) => toWorld(side, p);

export function seg(from: Vec, to: Vec, h0: number, h1: number, peak: number, ms: number, label?: string): BallSeg {
  return { from, to, h0, h1, peak, ms, label };
}

const diffNum = (d: Difficulty): 1 | 2 | 3 => (d === 'beginner' ? 1 : d === 'intermediate' ? 2 : 3);

export function makeWorld(opts: Pick<GenOptions, 'systemId' | 'roster' | 'customSetters' | 'ruleset' | 'defenseSystem' | 'difficulty'>, rotation: number, homeServing: boolean, awayRotation = 0): World {
  const home = buildTeam(opts.systemId, 'home', opts.roster, opts.customSetters);
  const away = buildTeam('5-1', 'away');
  return {
    home: { team: home, rotation, serving: homeServing },
    away: { team: away, rotation: awayRotation, serving: !homeServing },
    ruleset: opts.ruleset,
    defenseSystem: opts.defenseSystem,
    difficulty: opts.difficulty,
  };
}

export const name = (team: Team, id: string) => {
  const p = playerById(team, id);
  return `#${p.number} ${p.name}`;
};

const roleName = (team: Team, id: string) => {
  const r = playerById(team, id).role;
  return { S: 'setter', OH: 'outside hitter', MB: 'middle blocker', OPP: 'opposite', L: 'libero', DS: 'defensive specialist' }[r];
};

export function onCourtIds(ctx: TeamCtx) {
  return onCourt(ctx.team, ctx.rotation, ctx.serving).map((o) => o.playerId);
}

const zoneIn = (ctx: TeamCtx, id: string) => onCourt(ctx.team, ctx.rotation, ctx.serving).find((o) => o.playerId === id)?.zone;

/** Resolve which on-court player(s) the user controls. */
export function resolveFocus(world: World, focus: Focus): { ids: string[]; note?: string } {
  const ctx = world.home;
  const oc = onCourt(ctx.team, ctx.rotation, ctx.serving);
  if (focus.kind === 'all') return { ids: oc.map((o) => o.playerId) };
  if (focus.kind === 'zone') {
    const o = oc.find((x) => x.zone === focus.zone)!;
    return { ids: [o.playerId], note: `You are training the Position ${focus.zone} spot — this rotation it is ${name(ctx.team, o.playerId)} (${roleName(ctx.team, o.playerId)}). A court location is not a permanent role.` };
  }
  const role = focus.role;
  const team = ctx.team;
  const onIds = oc.map((o) => o.playerId);
  const setter = activeSetterId(team, ctx.rotation);
  if (role === 'S') {
    return { ids: [setter], note: team.systemId !== '5-1' ? `In a ${team.systemId} you follow whichever setter is running the offence this rotation: ${name(team, setter)}.` : undefined };
  }
  if (role === 'OPP' && team.systemId !== '5-1') {
    const other = team.lineup.find((id) => playerById(team, id).role === 'S' && id !== setter)!;
    return {
      ids: [other],
      note: `A ${team.systemId} has no dedicated opposite. You follow ${name(team, other)}, the setter who is not setting this rotation and plays the right side${team.systemId === '6-2' ? ' as a front-row hitter' : ''}.`,
    };
  }
  const matches = onIds.filter((id) => playerById(team, id).role === role);
  if (matches.length) {
    const pick = matches.find((id) => playerById(team, id).label?.endsWith('1')) ?? matches[0];
    return { ids: [pick] };
  }
  if (role === 'L') {
    const serverId = oc.find((o) => o.zone === 1)!.playerId;
    return {
      ids: [serverId],
      note: `The libero is off court this rally: ${name(team, serverId)} is serving and the libero may not serve. You follow ${name(team, serverId)}, the player the libero normally replaces.`,
    };
  }
  return { ids: [setter], note: 'That role is not on court this rotation — following the setter instead.' };
}

/** Defensive specialists are substitutes; put one on court for a back-row player when focusing on DS. */
export function withDefensiveSpecialist(world: World): { world: World; note?: string } {
  const ctx = world.home;
  const team = ctx.team;
  const ds = team.players.find((p) => p.role === 'DS');
  if (!ds || team.lineup.includes(ds.id)) return { world };
  const oc = onCourt(team, ctx.rotation, ctx.serving);
  const setter = activeSetterId(team, ctx.rotation);
  const cand = oc.find(
    (o) => !isFrontZone(o.zone) && !o.liberoIn && o.playerId !== setter && ['OPP', 'OH', 'S'].includes(playerById(team, o.playerId).role) && !(o.zone === 1 && ctx.serving),
  );
  if (!cand) return { world };
  const r = substitute(team, freshSubs(), cand.playerId, ds.id, world.ruleset);
  if (!r.legal) return { world };
  return {
    world: { ...world, home: { ...ctx, team: r.team } },
    note: `${name(team, ds.id)} (DS) has subbed in for ${name(team, cand.playerId)} while they are in the back row — a regular substitution, not a libero replacement.`,
  };
}

const STAGING = (i: number) => v(9.9, 1.2 + i * 1.0);

function stagingFor(ids: string[]): Record<string, Vec> {
  return Object.fromEntries(ids.map((id, i) => [id, STAGING(i)]));
}

function variantFrom(plan: TacticalPlan, id: string, label: string, description: string, widen = 0): Variant {
  const targets = Object.fromEntries(Object.entries(plan.targets).map(([k, t]) => [k, { ...t, radius: t.radius + widen }]));
  return { id, label, description, targets };
}

function focusWhy(plan: TacticalPlan, ids: string[], team: Team): string {
  return ids
    .filter((id) => plan.targets[id] && !plan.targets[id].locked)
    .slice(0, 3)
    .map((id) => `${name(team, id)} — ${plan.targets[id].duty}: ${plan.targets[id].why}`)
    .join('\n\n');
}

function regionHint(plan: TacticalPlan, ids: string[]): string {
  const id = ids.find((i) => plan.targets[i] && !plan.targets[i].locked);
  if (!id) return 'Look at where the ball is going.';
  const p = plan.targets[id].pos;
  const side = p.x < 3 ? 'left third' : p.x < 6 ? 'middle third' : 'right third';
  const depth = p.y < 1.2 ? 'right at the net' : p.y < 3 ? 'inside the 3 m line' : p.y < 4.5 ? 'just behind the 3 m line' : p.y < 7 ? 'mid-court' : 'deep in the court';
  return `Look in the ${side} of the court, ${depth}.`;
}

function awayLaneFor(from: AttackSide): Lane {
  return from === 'ourRight' ? 'left' : from === 'ourLeft' ? 'right' : from === 'pipe' ? 'pipe' : 'middle';
}

function homeLaneToAwaySide(lane: Lane): AttackSide {
  return lane === 'left' ? 'ourRight' : lane === 'right' || lane === 'D' ? 'ourLeft' : lane === 'pipe' ? 'pipe' : 'middle';
}

/** Away team's positions while it attacks from a lane. */
function awayAttacking(world: World, lane: Lane): { pos: Record<string, Vec>; attackerId: string; setterId: string } {
  const opts = attackOptions(world.away.team, world.away.rotation, world.away.serving);
  const opt = opts.find((o) => o.lane === lane) ?? opts.find((o) => o.lane === 'left')!;
  const plan = computePlan(world.away, { kind: 'attack', attackerId: opt.playerId, lane: opt.lane });
  return { pos: positionsOf(plan), attackerId: opt.playerId, setterId: activeSetterId(world.away.team, world.away.rotation) };
}

function defenseCoverage(from: AttackSide): { p: Vec; w: number }[] {
  const right = [
    { p: v(1.5, 6.0), w: 3 },
    { p: v(2.6, 8.0), w: 2 },
    { p: v(4.6, 6.6), w: 2 },
    { p: v(8.2, 7.6), w: 2 },
    { p: v(8.0, 5.0), w: 1.5 },
    { p: v(6.3, 2.8), w: 1 },
    { p: v(4.5, 4.2), w: 1 },
  ];
  if (from === 'ourRight') return right;
  if (from === 'ourLeft') return right.map((x) => ({ ...x, p: v(9 - x.p.x, x.p.y) }));
  return [
    { p: v(1.6, 5.8), w: 2 },
    { p: v(7.4, 5.8), w: 2 },
    { p: v(4.5, 7.6), w: 2 },
    { p: v(2.6, 3.0), w: 1 },
    { p: v(6.4, 3.0), w: 1 },
    { p: v(4.5, 4.2), w: 1 },
  ];
}

const RECEIVE_COVERAGE = [1, 2.6, 4.5, 6.4, 8].flatMap((x) => [4.6, 6.2, 7.6].map((y) => ({ p: v(x, y), w: x === 2.6 || x === 6.4 ? 1.3 : 1 })));

// ---------------------------------------------------------------------------
// Place-scenario builders (explicit parameters — also used by the rally engine)
// ---------------------------------------------------------------------------

export interface BuildCommon {
  category: Category;
  title: string;
  focusIds: string[];
  focusNote?: string;
  coach?: boolean;
}

function base(world: World, b: BuildCommon, rest: Omit<ScenarioBase, 'id' | 'category' | 'title' | 'skills' | 'difficulty' | 'systemId' | 'rotation' | 'focusIds' | 'focusNote'>): ScenarioBase {
  return {
    id: nextId(b.category),
    category: b.category,
    title: b.title,
    skills: CATEGORY_INFO[b.category].skills,
    difficulty: diffNum(world.difficulty),
    systemId: world.home.team.systemId,
    rotation: world.home.rotation,
    focusIds: b.focusIds,
    focusNote: b.focusNote,
    ...rest,
  };
}

export function buildServeReceive(world: World, b: BuildCommon): PlaceScenario {
  const plan = computePlan(world.home, { kind: 'serveReceive' });
  const f = receiveFormation(world.home.team, world.home.rotation);
  const awayPlan = computePlan(world.away, { kind: 'servePre', servingFree: !world.ruleset.servingTeamPositionalFault });
  const all = positionsOf(plan);
  const start = b.coach
    ? Object.fromEntries(onCourt(world.home.team, world.home.rotation, false).map((o) => [o.playerId, { ...rotationalSpot(o.zone) }]))
    : { ...all, ...stagingFor(b.focusIds) };
  const passer = f.passers[1] ?? f.passers[0];
  const release = computePlan(world.home, { kind: 'release' });
  const serverW = W('away', SERVER_SPOT);
  const team = world.home.team;
  const isSetter = b.focusIds.includes(activeSetterId(team, world.home.rotation));
  const anyPasser = b.focusIds.some((id) => f.passers.includes(id));
  const concept = b.coach
    ? 'Start with the legal relationships: each front-row player ahead of the player behind them, and each side player outside the centre player of their row. Then choose your three passers.'
    : isSetter
      ? 'Think about how your setter can reach the setting area without disrupting the passers — while staying legal relative to their neighbours.'
      : anyPasser
        ? 'You are passing in this rotation. Split the court with the other passers so no seam is unclaimed, and keep your rotational neighbours in order.'
        : 'You are not passing in this rotation. Where can you stand that is legal, out of the passers’ way and close to where you go next?';
  return {
    ...base(world, b, {
      prompt: b.coach
        ? 'Position your whole team for serve receive while keeping the rotation legal.'
        : `Position ${b.focusIds.map((id) => name(team, id)).join(', ')} for serve receive while keeping the rotation legal.`,
      scene: {
        home: { ...world.home, serving: false, positions: start },
        away: { ...world.away, serving: true, positions: positionsOf(awayPlan) },
        ball: [],
        ballRest: { p: serverW, h: 1.2 },
        phase: 'preServe',
        caption: `Opponent serving · ${world.home.team.systemId} ${rotationText(world.home)}`,
      },
      three: {
        now: 'In a legal serve-receive spot that suits your role.',
        watch: 'The server’s position, toss and shoulders — and your neighbours in the rotation.',
        next: isSetter ? 'Release to the target the instant the serve is contacted.' : 'Pass the ball or transition to your attack/cover spot.',
      },
      hints: [concept, regionHint(plan, b.focusIds)],
      explanation: focusWhy(plan, b.focusIds, team) || f.def.note,
      whenChanges:
        'Many teams use other legal formations: four passers for newer teams, or two passers (libero + one outside) at high levels. Server location and a weak passer also shift the formation. Legality never changes: only the relationships between neighbours matter.',
      after: {
        home: positionsOf(release),
        away: positionsOf(computePlan(world.away, { kind: 'servingBase' })),
        ball: [seg(serverW, W('home', all[passer] ?? v(4.5, 6)), 2.6, 0.9, 3.4, 1400, 'Serve')],
        caption: 'Service contact — the overlap rule ends and everyone transitions.',
        phase: 'release',
      },
    }),
    kind: 'place',
    start,
    ruleset: world.ruleset,
    objective: {
      controlled: b.focusIds,
      variants: [variantFrom(plan, 'std', 'Three-passer formation', 'The standard receive pattern for this rotation.', b.coach ? 0.6 : 0)],
      legality: 'receivingFormation',
      coverage: b.coach ? { points: RECEIVE_COVERAGE, reach: 1.7, exclude: onCourtIds({ ...world.home, serving: false }).filter((id) => !f.passers.includes(id)) } : undefined,
    },
  };
}

export const ROTATIONAL_SPOTS: Record<Zone, Vec> = {
  4: v(1.5, 1.6),
  3: v(4.5, 1.6),
  2: v(7.5, 1.6),
  5: v(1.5, 6.0),
  6: v(4.5, 6.6),
  1: v(7.5, 6.0),
};
export const rotationalSpot = (z: Zone) => ROTATIONAL_SPOTS[z];

export const rotationText = (ctx: TeamCtx) => `Rotation ${ctx.rotation + 1} (setter in zone ${setterZone(ctx.team, ctx.rotation)})`;

export function buildRelease(world: World, b: BuildCommon): PlaceScenario {
  const team = world.home.team;
  const f = receiveFormation(team, world.home.rotation);
  const plan = computePlan(world.home, { kind: 'release' });
  const serverW = W('away', SERVER_SPOT);
  const passer = f.passers[0];
  const midW = { x: serverW.x + (W('home', f.positions[passer]).x - serverW.x) * 0.18, y: serverW.y + (W('home', f.positions[passer]).y - serverW.y) * 0.18 };
  const setterId = activeSetterId(team, world.home.rotation);
  return {
    ...base(world, b, {
      prompt: 'The serve has been contacted. Move your player into their next responsibility.',
      scene: {
        home: { ...world.home, serving: false, positions: f.positions },
        away: { ...world.away, serving: true, positions: positionsOf(computePlan(world.away, { kind: 'servePre', servingFree: true })) },
        ball: [seg(serverW, midW, 2.6, 3.0, 0.4, 500, 'Service contact')],
        phase: 'release',
        caption: 'Service contact! Players may now leave their rotational spots.',
      },
      three: {
        now: 'Leaving your legal start spot for your tactical position.',
        watch: 'The serve’s path — is it coming to you or a teammate?',
        next: 'Pass, set, or approach depending on who takes the first ball.',
      },
      hints: [
        b.focusIds.includes(setterId)
          ? 'The setter’s job right now is to beat the pass to the target without crossing a passer’s path.'
          : 'If you are not passing, your next responsibility is usually an attacking lane or a defensive base spot — get there before the pass.',
        regionHint(plan, b.focusIds),
      ],
      explanation: focusWhy(plan, b.focusIds, team),
      whenChanges: 'If the serve is coming straight at the setter, the setter may have to pass — then the emergency-setting plan takes over.',
      after: {
        home: positionsOf(plan),
        away: positionsOf(computePlan(world.away, { kind: 'servingBase' })),
        ball: [seg(midW, W('home', f.positions[passer]), 3.0, 0.9, 2.6, 1000, 'Serve arrives')],
        caption: 'Everyone has transitioned — the pass is on its way.',
        phase: 'firstContact',
      },
    }),
    kind: 'place',
    start: f.positions,
    ruleset: world.ruleset,
    objective: { controlled: b.focusIds, variants: [variantFrom(plan, 'release', 'Release pattern', 'Standard release for this rotation.')], legality: 'none' },
  };
}

export interface FirstContactParams {
  contactId: string;
  quality: PassQuality;
  source: 'serve' | 'dig' | 'free';
  /** Where the contact happens (home local). Defaults to the contactor's spot. */
  contactAt?: Vec;
  /** Starting positions of all home players (defaults derived from the source). */
  startPositions?: Record<string, Vec>;
  /** Incoming ball path before the contact. */
  incoming?: BallSeg[];
}

export function buildFirstContact(world: World, b: BuildCommon, p: FirstContactParams): PlaceScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const startPositions =
    p.startPositions ??
    (p.source === 'serve'
      ? { ...positionsOf(computePlan(world.home, { kind: 'release' })), ...pick(receiveFormation(team, rot).positions, p.contactId) }
      : positionsOf(computePlan(world.home, { kind: 'defense', from: 'ourRight', set: 'high', system: world.defenseSystem })));
  const contactAt = p.contactAt ?? startPositions[p.contactId];
  startPositions[p.contactId] = contactAt;
  const P = passLanding(team, p.quality, contactAt);
  const plan = computePlan(world.home, { kind: 'firstContact', contactId: p.contactId, quality: p.quality, ballAt: P, source: p.source });
  const incoming = p.incoming ?? (p.source === 'serve' ? [seg(W('away', SERVER_SPOT), W('home', contactAt), 2.6, 0.8, 3.4, 1300, 'Serve')] : [seg(W('home', opponentContactPoint('ourRight')), W('home', contactAt), 3.0, 0.7, 0.4, 700, 'Attack')]);
  const passSeg = seg(W('home', contactAt), W('home', P), 0.8, 2.6, 4.6, 1100, p.source === 'serve' ? 'Pass' : 'Dig');
  const youContact = b.focusIds.includes(p.contactId);
  const second = plan.secondContactId!;
  const ao = attackOptions(team, rot, world.home.serving).filter((o) => o.playerId !== second && o.playerId !== p.contactId && o.lane !== 'dump');
  const outOfSystem = p.quality === 'off' || p.quality === 'poor';
  const setTo = (outOfSystem ? ao.find((o) => o.lane === 'left') : ao[Math.floor(Math.random() * ao.length)]) ?? ao[0];
  const after: AfterEvent | undefined = setTo
    ? {
        home: positionsOf(plan),
        away: positionsOf(computePlan(world.away, { kind: 'servingBase' })),
        ball: [seg(W('home', P), W('home', attackContact(team, setTo.lane)), 2.4, 3.0, outOfSystem ? 6 : 4, 1100, `Set → ${LANE_NAME[setTo.lane]}`)],
        caption: `${name(team, second)} sets ${LANE_NAME[setTo.lane].toLowerCase()} to ${name(team, setTo.playerId)}.`,
        phase: 'set',
      }
    : undefined;
  const sourceWord = p.source === 'serve' ? 'serve' : p.source === 'dig' ? 'attack' : 'free ball';
  return {
    ...base(world, b, {
      prompt: youContact
        ? `The ${p.source === 'dig' ? 'ball' : sourceWord} came to you and you made the first contact (${PASS_LABEL[p.quality].toLowerCase()}). Where should you move now?`
        : `${name(team, p.contactId)} plays the first contact — ${PASS_LABEL[p.quality].toLowerCase()}. Where should ${b.focusIds.map((id) => name(team, id)).join(', ')} go?`,
      scene: {
        home: { ...world.home, positions: startPositions },
        away: { ...world.away, positions: positionsOf(computePlan(world.away, { kind: 'servingBase' })) },
        ball: [...incoming, passSeg],
        phase: p.source === 'dig' ? 'transition' : 'firstContact',
        caption: `${PASS_LABEL[p.quality]}. ${plan.notes[0] ?? ''}`,
        overlays: { passTarget: setTarget(team.systemId) },
      },
      three: {
        now: youContact ? 'Finishing your contact and turning to the next job.' : 'Moving even though it is not your ball.',
        watch: 'Where the pass is going and who will take the second contact.',
        next: 'Attack, set, or cover depending on your role and the pass quality.',
      },
      hints: [
        youContact
          ? 'After the first contact, ask: am I an attacking option on this ball? If yes, get to an approach; if not, get ready to cover.'
          : 'Players who are not touching the ball are never spectators. Who sets this ball, and what does that mean for you?',
        regionHint(plan, b.focusIds),
      ],
      explanation: [plan.notes.join(' '), focusWhy(plan, b.focusIds, team)].filter(Boolean).join('\n\n'),
      whenChanges: outOfSystem
        ? 'Out of system the options shrink: the middle quick and most back-row combinations disappear, and a high ball to a pin is the norm.'
        : 'If the pass were off the net, the middle would no longer be a quick option and the set would go high to a pin.',
      after,
    }),
    kind: 'place',
    start: startPositions,
    ruleset: world.ruleset,
    objective: { controlled: b.focusIds.filter((id) => !plan.targets[id]?.locked), variants: [variantFrom(plan, 'fc', 'Transition pattern', 'Recommended movement for this pass.')], legality: 'none' },
  };
}

function pick<T>(o: Record<string, T>, k: string): Record<string, T> {
  return o[k] ? { [k]: o[k] } : {};
}

export interface AttackParams {
  attackerId: string;
  lane: Lane;
  setFrom?: Vec;
  startPositions?: Record<string, Vec>;
}

export function buildAttackCoverage(world: World, b: BuildCommon, p: AttackParams): PlaceScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const setter = activeSetterId(team, rot);
  const setFrom = p.setFrom ?? setTarget(team.systemId);
  const prev =
    p.startPositions ??
    positionsOf(computePlan(world.home, { kind: 'firstContact', contactId: receiveFormation(team, rot).passers[1], quality: 'good', ballAt: setFrom, source: 'serve' }));
  prev[setter] = prev[setter] ?? setFrom;
  const plan = computePlan(world.home, { kind: 'attack', attackerId: p.attackerId, lane: p.lane, from: prev });
  const A = attackContact(team, p.lane);
  const start = { ...prev, [p.attackerId]: A };
  const awaySide = homeLaneToAwaySide(p.lane);
  const awayDef = computePlan(world.away, { kind: 'defense', from: awaySide, set: p.lane === 'middle' ? 'quick' : 'high', system: 'perimeter' });
  const others = onCourtIds(world.home).filter((id) => id !== p.attackerId);
  return {
    ...base(world, b, {
      prompt: `${name(team, p.attackerId)} is attacking ${LANE_NAME[p.lane].toLowerCase()}. Position ${b.focusIds.map((id) => name(team, id)).join(', ')} to cover the attack.`,
      scene: {
        home: { ...world.home, positions: start },
        away: { ...world.away, positions: positionsOf(awayDef) },
        ball: [seg(W('home', setFrom), W('home', A), 2.4, 3.1, p.lane === 'middle' ? 3.2 : 5, 1000, 'Set')],
        phase: 'attackCoverage',
        caption: `Set to ${LANE_NAME[p.lane].toLowerCase()} — two blockers are forming against ${name(team, p.attackerId)}.`,
      },
      three: {
        now: 'Low and close to the hitter, eyes on the block.',
        watch: 'The blockers’ hands — a stuff block drops fast and steep.',
        next: 'Play the covered ball high to the middle so the team can attack again.',
      },
      hints: ['Picture a cup around the hitter: who is close enough to dig a ball that rebounds straight down off the block?', regionHint(plan, b.focusIds)],
      explanation: [plan.notes.join(' '), focusWhy(plan, b.focusIds, team)].join('\n\n'),
      whenChanges: 'On a quick attack there is less time — coverage is tighter and players already near the net cover. Out of system, coverage shifts toward the pin receiving the high ball.',
      after: {
        home: positionsOf(plan),
        away: positionsOf(awayDef),
        ball: [seg(W('home', A), W('home', clampCourtLocal(v(A.x + (A.x < 4.5 ? 1.2 : -1.2), 1.8))), 3.1, 0.4, 0.6, 600, 'Blocked! Covered')],
        caption: 'The ball is blocked back — your coverage keeps it alive.',
        phase: 'attackCoverage',
      },
    }),
    kind: 'place',
    start,
    ruleset: world.ruleset,
    objective: {
      controlled: b.focusIds.filter((id) => id !== p.attackerId),
      variants: [variantFrom(plan, 'cup', 'Coverage cup', 'Three close, two deep around the hitter.')],
      legality: 'none',
      coverage: { points: coverageCup(A), reach: 1.4, exclude: [p.attackerId, ...onCourtIds(world.home).filter((id) => !others.includes(id))] },
    },
  };
}

function coverageCup(A: Vec): { p: Vec; w: number }[] {
  const pts: { p: Vec; w: number }[] = [];
  for (const [dx, dy, w] of [
    [-1.2, 1.6, 2],
    [0, 2.0, 3],
    [1.4, 1.4, 2],
    [-0.6, 4.0, 1],
    [1.6, 3.8, 1],
  ])
    pts.push({ p: clampCourtLocal(v(A.x + (A.x > 4.5 ? -dx : dx), A.y + dy)), w });
  return pts;
}

const clampCourtLocal = (p: Vec) => v(clamp(p.x, 0.4, 8.6), clamp(p.y, 0.5, 8.7));

export interface DefenseParams {
  from: AttackSide;
  set: 'high' | 'quick';
  system?: DefenseSystemId;
  tendency?: 'line' | 'cross';
  startPositions?: Record<string, Vec>;
}

export function buildDefense(world: World, b: BuildCommon, p: DefenseParams, category: Category = 'blocking'): PlaceScenario {
  const team = world.home.team;
  const sys = p.system ?? world.defenseSystem;
  const sit: Situation = { kind: 'defense', from: p.from, set: p.set, system: sys, tendency: p.tendency };
  const plan = computePlan(world.home, sit);
  const variants: Variant[] = [variantFrom(plan, sys, SYSTEM_LABEL[sys], SYSTEM_DESC[sys])];
  if (p.from === 'ourRight' || p.from === 'ourLeft') {
    for (const alt of (['perimeter', 'rotation', 'middleUp'] as DefenseSystemId[]).filter((s) => s !== sys && !(sys === 'read' && s === 'perimeter'))) {
      variants.push(variantFrom(computePlan(world.home, { ...sit, system: alt } as Situation), alt, SYSTEM_LABEL[alt], `${SYSTEM_DESC[alt]} A different, legitimate system — make sure your team agrees on it.`));
    }
  }
  const start = p.startPositions ?? positionsOf(computePlan(world.home, { kind: 'servingBase' }));
  const awayLane = awayLaneFor(p.from);
  const away = awayAttacking(world, awayLane);
  const H = opponentContactPoint(p.from);
  const setterAway = (away.pos[away.setterId] ?? v(6, 0.9));
  const blockSpots = plan.blockers.map((id) => plan.targets[id].pos);
  const tendencyText = p.tendency === 'line' ? ' The hitter is squared up to the line.' : p.tendency === 'cross' ? ' The hitter is approaching from wide, angled cross-court.' : '';
  return {
    ...base(world, { ...b, category }, {
      prompt:
        `The opponent is attacking from ${sideText(p.from)} (${p.set === 'quick' ? 'quick set' : 'high set'}).${tendencyText} Position ${b.focusIds.map((id) => name(team, id)).join(', ')} for ${category === 'blocking' ? 'the block and defence' : 'defence'}.`,
      scene: {
        home: { ...world.home, positions: start },
        away: { ...world.away, positions: away.pos },
        ball: [seg(W('away', setterAway), W('home', H), 2.4, 3.1, p.set === 'quick' ? 3 : 5.5, p.set === 'quick' ? 700 : 1200, 'Opponent set')],
        phase: 'defense',
        caption: `Opponent ${LANE_NAME[awayLane].toLowerCase()} attack · ${SYSTEM_LABEL[sys]} defence`,
        overlays: { hitter: H, blockShadowFor: plan.blockers, attackRays: true },
      },
      three: {
        now: 'Blockers at the net in front of the hitter; defenders around the block’s shadow.',
        watch: 'The set’s location, the hitter’s approach angle and shoulder.',
        next: 'Dig high to the middle, or move forward if they tip.',
      },
      hints: [
        b.focusIds.some((id) => isFrontZone(zoneIn(world.home, id)!))
          ? 'Front-row players: is this your hitter to block? If not, what does the off-blocker do?'
          : 'Defenders work around the block: where does the block take away court, and where can the hitter still hit?',
        regionHint(plan, b.focusIds),
      ],
      explanation: [plan.notes.join(' '), focusWhy(plan, b.focusIds, team)].join('\n\n'),
      whenChanges: 'If the block is late or only one blocker gets there, the line opens up. Against a hitter who tips a lot, a team may move a defender forward (rotational or middle-up).',
      after: {
        home: positionsOf(plan),
        away: away.pos,
        ball: [seg(W('home', H), W('home', plan.targets[nearestDigger(plan)]?.pos ?? v(4.5, 6)), 3.1, 0.7, 0.3, 650, 'Attack')],
        caption: 'Attack — dug by your defence.',
        phase: 'transition',
      },
    }),
    kind: 'place',
    start,
    ruleset: world.ruleset,
    objective: {
      controlled: b.focusIds,
      variants,
      legality: 'blocking',
      blockSpots,
      coverage: { points: defenseCoverage(p.from), reach: 1.8, exclude: plan.blockers },
    },
  };
}

function nearestDigger(plan: TacticalPlan): string {
  const ids = Object.keys(plan.targets).filter((id) => !plan.blockers.includes(id));
  return ids.reduce((a, b) => (plan.targets[a].pos.y > plan.targets[b].pos.y ? a : b));
}

export const SYSTEM_LABEL: Record<DefenseSystemId, string> = {
  perimeter: 'Perimeter',
  rotation: 'Rotational',
  middleUp: 'Middle-up (rover)',
  read: 'Read-and-react',
};
export const SYSTEM_DESC: Record<DefenseSystemId, string> = {
  perimeter: 'Back-row defenders stay on the edges and deep; good against hard hitters.',
  rotation: 'Line-side defender rotates up for tips; middle-back rotates to the line.',
  middleUp: 'Middle-back plays up behind the block for tips; deep corners left to the wings.',
  read: 'Start from base and react to the set, block and hitter.',
};

const sideText = (from: AttackSide) =>
  from === 'ourRight' ? 'their left side (attacking toward your right side)' : from === 'ourLeft' ? 'their right side (attacking toward your left side)' : from === 'pipe' ? 'their back row (pipe)' : 'the middle';

export interface TipParams {
  from: AttackSide;
  system?: DefenseSystemId;
  tipAt: Vec;
}

export function buildTip(world: World, b: BuildCommon, p: TipParams): PlaceScenario {
  const team = world.home.team;
  const sys = p.system ?? world.defenseSystem;
  const defPlan = computePlan(world.home, { kind: 'defense', from: p.from, set: 'high', system: sys });
  const plan = computePlan(world.home, { kind: 'tip', from: p.from, system: sys, tipAt: p.tipAt });
  const start = positionsOf(defPlan);
  const H = opponentContactPoint(p.from);
  const away = awayAttacking(world, awayLaneFor(p.from));
  const mid = v((H.x + p.tipAt.x) / 2, (H.y + p.tipAt.y) / 2);
  const shortDesc = p.tipAt.y < 2 ? 'just over the block' : p.tipAt.x > 3 && p.tipAt.x < 6 ? 'into the middle of the court' : 'toward the sideline';
  return {
    ...base(world, b, {
      prompt: `The hitter tips ${shortDesc}! Where should ${b.focusIds.map((id) => name(team, id)).join(', ')} go?`,
      scene: {
        home: { ...world.home, positions: start },
        away: { ...world.away, positions: away.pos },
        ball: [seg(W('home', H), W('home', mid), 3.0, 2.8, 0.5, 450, 'Tip!')],
        phase: 'tip',
        caption: `Tip ${shortDesc} · ${SYSTEM_LABEL[sys]} defence`,
        overlays: { hitter: H, tipAt: p.tipAt },
      },
      three: {
        now: 'Moving forward early if the tip is yours; supporting if not.',
        watch: 'The hitter’s arm slowing down — the tip cue.',
        next: 'Keep the ball up high so the setter can run the transition.',
      },
      hints: ['Tips are slow: whoever is closest from their defensive spot should already be moving forward — the others must not freeze.', regionHint(plan, b.focusIds)],
      explanation: [plan.notes.join(' '), focusWhy(plan, b.focusIds, team)].join('\n\n'),
      whenChanges: 'In a rotational or middle-up system, the tip is pre-assigned to the player moved forward; in perimeter it falls to the closest edge defender or off-blocker.',
      after: {
        home: positionsOf(plan),
        away: away.pos,
        ball: [seg(W('home', mid), W('home', p.tipAt), 2.8, 0.5, 0.4, 500, 'Dug!')],
        caption: 'Tip picked up — transition!',
        phase: 'transition',
      },
    }),
    kind: 'place',
    start,
    ruleset: world.ruleset,
    objective: { controlled: b.focusIds, variants: [variantFrom(plan, 'tip', 'Tip response', 'Closest defender plays the tip; the rest support and transition.')], legality: 'none' },
  };
}

export function buildFreeBall(world: World, b: BuildCommon): PlaceScenario {
  const team = world.home.team;
  const start = positionsOf(computePlan(world.home, { kind: 'servingBase' }));
  const plan = computePlan(world.home, { kind: 'freeBall' });
  const fromW = W('away', v(4.5, 6.5));
  const netW = W('home', v(4.5, -0.1));
  return {
    ...base(world, b, {
      prompt: `The opponent is sending over a free ball. Position ${b.focusIds.map((id) => name(team, id)).join(', ')}.`,
      scene: {
        home: { ...world.home, positions: start },
        away: { ...world.away, positions: positionsOf(computePlan(world.away, { kind: 'firstContact', contactId: onCourtIds(world.away)[4], quality: 'poor', ballAt: v(4.5, 6.5), source: 'dig' })) },
        ball: [seg(fromW, netW, 1.0, 3.6, 3.5, 1100, 'Free ball')],
        phase: 'freeBall',
        caption: '“Free ball!” — an easy, slow ball over the net.',
      },
      three: { now: 'Switching from defence to offence.', watch: 'Where the free ball is heading.', next: 'A perfect pass and a full-tempo attack.' },
      hints: ['A free ball needs no block. What does that mean for your front-row players — and for your setter?', regionHint(plan, b.focusIds)],
      explanation: [plan.notes.join(' '), focusWhy(plan, b.focusIds, team)].join('\n\n'),
      whenChanges: 'If the ball is a “down ball” (attacked standing from deep), front-row players may stay to block instead of dropping off.',
      after: {
        home: positionsOf(plan),
        away: positionsOf(computePlan(world.away, { kind: 'servingBase' })),
        ball: [seg(netW, W('home', v(4.5, 6.3)), 3.6, 0.8, 0.8, 700)],
        caption: 'Free-ball formation set — pass it to the target.',
        phase: 'firstContact',
      },
    }),
    kind: 'place',
    start,
    ruleset: world.ruleset,
    objective: { controlled: b.focusIds, variants: [variantFrom(plan, 'free', 'Free-ball formation', 'Setter releases, hitters drop off, back row passes.')], legality: 'none' },
  };
}

export function buildServePre(world: World, b: BuildCommon): PlaceScenario {
  const team = world.home.team;
  const free = !world.ruleset.servingTeamPositionalFault;
  const plan = computePlan(world.home, { kind: 'servePre', servingFree: free });
  const all = positionsOf(plan);
  const start = b.coach
    ? Object.fromEntries(onCourt(team, world.home.rotation, true).map((o) => [o.playerId, o.zone === 1 ? SERVER_SPOT : rotationalSpot(o.zone)]))
    : { ...all, ...stagingFor(b.focusIds) };
  const server = onCourt(team, world.home.rotation, true).find((o) => o.zone === 1)!.playerId;
  const baseAfter = computePlan(world.home, { kind: 'servingBase' });
  const awayF = receiveFormation(world.away.team, world.away.rotation);
  return {
    ...base(world, b, {
      prompt: `Your team is serving (${name(team, server)} serves). Position ${b.focusIds.filter((id) => id !== server).map((id) => name(team, id)).join(', ')} before the serve.`,
      scene: {
        home: { ...world.home, serving: true, positions: start },
        away: { ...world.away, serving: false, positions: awayF.positions },
        ball: [],
        ballRest: { p: W('home', SERVER_SPOT), h: 1.2 },
        phase: 'serving',
        caption: free ? 'Serving team — no positional fault under FIVB 2025–2028.' : 'Serving team — this ruleset still judges overlap.',
      },
      three: { now: 'Wherever lets you switch fastest (if the rules allow).', watch: 'The opponent’s receive formation — where is their setter hiding?', next: 'Base defence: read their pass and setter.' },
      hints: [
        free ? 'Under the default ruleset, does the serving team need to stay in rotational order at all?' : 'Under this ruleset both teams are judged: keep your neighbours in order.',
        regionHint(plan, b.focusIds),
      ],
      explanation: focusWhy(plan, b.focusIds, team),
      whenChanges: 'Under rulesets where the serving team is judged (older FIVB editions and many leagues), serving players must keep rotational order until contact.',
      after: {
        home: positionsOf(baseAfter),
        away: positionsOf(computePlan(world.away, { kind: 'release' })),
        ball: [seg(W('home', SERVER_SPOT), W('away', awayF.positions[awayF.passers[1]]), 2.6, 0.8, 3.4, 1300, 'Serve')],
        caption: 'Serve away — everyone switches to base defence.',
        phase: 'defense',
      },
    }),
    kind: 'place',
    start,
    ruleset: world.ruleset,
    objective: {
      controlled: b.focusIds.filter((id) => id !== server),
      variants: [variantFrom(plan, 'pre', free ? 'Pre-switched' : 'Rotational order', free ? 'Players start near their specialty spots.' : 'Legal rotational order.')],
      legality: 'servingFormation',
    },
  };
}

export function buildServingBase(world: World, b: BuildCommon): PlaceScenario {
  const team = world.home.team;
  const pre = positionsOf(computePlan(world.home, { kind: 'servePre', servingFree: !world.ruleset.servingTeamPositionalFault }));
  const plan = computePlan(world.home, { kind: 'servingBase' });
  const awayF = receiveFormation(world.away.team, world.away.rotation);
  const tgt = W('away', awayF.positions[awayF.passers[1]]);
  const mid = { x: (W('home', SERVER_SPOT).x + tgt.x) / 2, y: (W('home', SERVER_SPOT).y + tgt.y) / 2 };
  return {
    ...base(world, b, {
      prompt: `Your teammate has served. Move ${b.focusIds.map((id) => name(team, id)).join(', ')} into base defence.`,
      scene: {
        home: { ...world.home, serving: true, positions: pre },
        away: { ...world.away, serving: false, positions: awayF.positions },
        ball: [seg(W('home', SERVER_SPOT), mid, 2.6, 3.0, 1.5, 700, 'Serve')],
        phase: 'serving',
        caption: 'Ball in flight — switch to base.',
      },
      three: { now: 'Getting to base before their pass.', watch: 'Their pass quality and where their setter goes.', next: 'Block or dig the attack that follows.' },
      hints: ['After your serve, everyone plays their specialty: front-row blockers at the net, back-row defenders in their areas.', regionHint(plan, b.focusIds)],
      explanation: focusWhy(plan, b.focusIds, team),
      after: {
        home: positionsOf(plan),
        away: positionsOf(computePlan(world.away, { kind: 'release' })),
        ball: [seg(mid, tgt, 3.0, 0.8, 1.6, 700, 'Serve lands')],
        caption: 'Base defence set.',
        phase: 'defense',
      },
    }),
    kind: 'place',
    start: pre,
    ruleset: world.ruleset,
    objective: { controlled: b.focusIds, variants: [variantFrom(plan, 'base', 'Base defence', 'Specialty positions after the serve.')], legality: 'none' },
  };
}

// ---------------------------------------------------------------------------
// Choice / tap builders
// ---------------------------------------------------------------------------

function neutralScene(world: World, caption: string, phase: Phase = 'preServe'): Scene {
  if (world.home.serving) {
    return {
      home: { ...world.home, positions: positionsOf(computePlan(world.home, { kind: 'servingBase' })) },
      away: { ...world.away, positions: receiveFormation(world.away.team, world.away.rotation).positions },
      ball: [],
      phase,
      caption,
    };
  }
  const homePos = receiveFormation(world.home.team, world.home.rotation).positions;
  return {
    home: { ...world.home, serving: false, positions: homePos },
    away: { ...world.away, serving: true, positions: positionsOf(computePlan(world.away, { kind: 'servePre', servingFree: true })) },
    ball: [],
    ballRest: { p: W('away', SERVER_SPOT), h: 1.2 },
    phase,
    caption,
  };
}

function choice(world: World, b: BuildCommon, scene: Scene, question: string, options: ChoiceOption[], extra: Partial<ScenarioBase> & { explanation: string; three: ScenarioBase['three']; hints: string[] }): ChoiceScenario {
  const on = onCourtIds(scene.home);
  return {
    ...base(world, { ...b, focusIds: b.focusIds.filter((id) => on.includes(id)) }, { prompt: question, scene, ...extra }),
    kind: 'choice',
    question,
    options,
  };
}

function rotationalScene(world: World, serving: boolean, caption: string): Scene {
  const pos = Object.fromEntries(onCourt(world.home.team, world.home.rotation, serving).map((o) => [o.playerId, serving && o.zone === 1 ? SERVER_SPOT : rotationalSpot(o.zone)]));
  return {
    home: { ...world.home, serving, positions: pos },
    away: { ...world.away, serving: !serving, positions: positionsOf(computePlan(world.away, { kind: 'servingBase' })) },
    ball: [],
    phase: 'preServe',
    caption,
  };
}

export function buildTapZone(world: World, b: BuildCommon, rng: Rng, forceKind?: number): TapScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const kind = forceKind ?? rng.int(0, 3);
  const scene = rotationalScene(world, false, `${rotationText(world.home)} · rotational spots`);
  const mk = (question: string, correct: Zone[], why: string, three: ScenarioBase['three'], hint: string): TapScenario => ({
    ...base(world, b, { prompt: question, scene, three, hints: [hint], explanation: why }),
    kind: 'tapZone',
    question,
    correct,
    why,
  });
  if (kind === 0) {
    const z = rng.pick(ZONES);
    return mk(
      `Tap Position ${z}.`,
      [z],
      `Position ${z} is ${ZONE_INFO[z].name.toLowerCase()} — a ${ZONE_INFO[z].row}-row position. Zones run anticlockwise from the server’s spot: 1 right-back, 2 right-front, 3 middle-front, 4 left-front, 5 left-back, 6 middle-back.`,
      { now: 'Knowing the six zones by number.', watch: 'Where the net is — front row is nearest it.', next: 'Use zone numbers to describe every rotation.' },
      'Position 1 is where the server stands (right-back). Count anticlockwise from there.',
    );
  }
  if (kind === 1) {
    const s = activeSetterId(team, rot);
    const z = zoneOfPlayer(team, rot, s)!;
    return mk(
      `In this rotation, which zone does the setter ${name(team, s)} start in?`,
      [z],
      `The setter is in Position ${z} (${ZONE_INFO[z].name}) — a ${ZONE_INFO[z].row}-row player this rotation. That rotational position does not change when they run to the setting target.`,
      { now: 'Identifying the rotation from the setter’s zone.', watch: 'The yellow S marker.', next: 'Predict the setter’s release path.' },
      'Find the setter’s marker and read which numbered area it occupies.',
    );
  }
  if (kind === 2) {
    const s = activeSetterId(team, rot);
    const z = zoneOfPlayer(team, rot, s)!;
    const nz = CLOCKWISE_NEXT[z];
    return mk(
      `The setter ${name(team, s)} is in zone ${z}. Your team is receiving and wins the rally. Which zone does the setter move to?`,
      [nz],
      `A receiving team that wins the rally gains the serve and rotates one place clockwise: 2→1, 1→6, 6→5, 5→4, 4→3, 3→2. Zone ${z} → zone ${nz}.`,
      { now: 'Tracking the rotation after a side-out.', watch: 'Who was receiving when the rally was won.', next: 'The new player in zone 1 serves.' },
      'Clockwise rotation: the player in zone 2 goes to serve in zone 1.',
    );
  }
  const z = rng.pick([2, 3, 4] as Zone[]);
  const id = onCourt(team, rot, false).find((o) => o.zone === z)!.playerId;
  return mk(
    `${name(team, id)} is about to rotate. After TWO more side-outs, which zone will they be in?`,
    [CLOCKWISE_NEXT[CLOCKWISE_NEXT[z]]],
    `Each side-out moves everyone one place clockwise. From zone ${z}: → ${CLOCKWISE_NEXT[z]} → ${CLOCKWISE_NEXT[CLOCKWISE_NEXT[z]]}.`,
    { now: 'Thinking two rotations ahead.', watch: 'The clockwise order 1→6→5→4→3→2→1.', next: 'Anticipating which rotation is coming.' },
    'Move them one step clockwise, then one more.',
  );
}

export function buildFormationLegality(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const pos = { ...receiveFormation(team, rot).positions };
  const oc = onCourt(team, rot, false);
  const byZone = (z: Zone) => oc.find((o) => o.zone === z)!.playerId;
  const makeIllegal = rng.chance(0.55);
  let levelPair: [Zone, Zone] | null = null;
  if (makeIllegal) {
    if (rng.chance(0.5)) {
      const [fz, bz] = rng.pick(FRONT_BACK_PAIRS);
      const f = byZone(fz);
      const bk = byZone(bz);
      pos[bk] = v(pos[f].x + (pos[bk].x > pos[f].x ? 0.6 : -0.6), Math.max(0.15, pos[f].y - 0.8));
    } else {
      const [lz, rz] = rng.pick(SIDE_PAIRS.filter(([l, r]) => !(l === 4 && r === 2) && !(l === 5 && r === 1)));
      const l = byZone(lz);
      const r = byZone(rz);
      pos[l] = v(pos[r].x + 0.7, pos[l].y);
    }
  } else if (rng.chance(0.6)) {
    // Legal but tight: a back-row player exactly LEVEL with the front foot of the player in front.
    const [fz, bz] = rng.pick(FRONT_BACK_PAIRS);
    levelPair = [fz, bz];
    const f = byZone(fz);
    const bk = byZone(bz);
    pos[bk] = v(pos[f].x + (pos[bk].x > pos[f].x ? 0.8 : -0.8), pos[f].y);
  }
  const chk = checkServiceFormation({ team, rotation: rot, positions: pos, serving: false, ruleset: world.ruleset });
  const opts: ChoiceOption[] = [];
  opts.push({
    id: 'legal',
    text: 'Legal — every relationship holds',
    verdict: chk.legal ? 'best' : 'wrong',
    why: chk.legal
      ? levelPair
        ? `Correct. Position ${levelPair[1]} is exactly level with Position ${levelPair[0]} — FIVB 7.4.3.1 says "level with" is legal.`
        : 'Correct. Unusual-looking stacks can still be legal; only the relationships between players matter.'
      : chk.violations[0].message,
  });
  const vio = (kind: string, z1: Zone, z2: Zone) => chk.violations.find((x) => x.kind === kind && x.zones.includes(z1) && x.zones.includes(z2));
  const descs = [
    ...FRONT_BACK_PAIRS.map(([fz, bz]) => ({ key: `fb${fz}${bz}`, text: `Illegal — Position ${bz} is in front of Position ${fz}`, v: vio('frontBack', fz, bz) })),
    ...SIDE_PAIRS.map(([lz, rz]) => ({ key: `lr${lz}${rz}`, text: `Illegal — Positions ${lz} and ${rz} have swapped sides`, v: vio('leftRight', lz, rz) })),
  ];
  const hits = descs.filter((d) => d.v);
  const misses = rng.shuffle(descs.filter((d) => !d.v)).slice(0, Math.max(1, 3 - hits.length));
  for (const d of [...hits.slice(0, 3), ...misses]) {
    opts.push({ id: d.key, text: d.text, verdict: d.v ? 'best' : 'wrong', why: d.v ? d.v.message : 'That relationship is fine here — remember that "level with" counts as legal.' });
  }
  const scene: Scene = { ...neutralScene(world, `Receiving · ${rotationText(world.home)} · moment of service contact`), home: { ...world.home, serving: false, positions: pos } };
  return choice(world, b, scene, 'At the moment of service contact, is this receiving formation legal?', rng.shuffle(opts), {
    explanation: chk.legal ? 'This arrangement is legal. ' + chk.note : chk.violations.map((x) => x.message).join('\n'),
    three: { now: 'Judging overlap like a referee.', watch: 'Each front/back pair (4–5, 3–6, 2–1) and each side pair within a row.', next: 'Fix the specific pair at fault, not the whole formation.' },
    hints: ['Check the three front/back pairs (4–5, 3–6, 2–1), then the order within each row. Feet decide, not marker centres — and being level counts as legal.'],
  });
}

export function buildAttackRule(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const libero = rng.chance(0.2);
  const front = !libero && rng.chance(0.3);
  const takeoff = rng.pick([v(4.5, 2.2), v(4.5, 3.0), v(4.5, 3.9), v(7.3, 4.2)]);
  const above = rng.chance(0.75);
  const afterLibero = !libero && !front && rng.chance(0.25);
  const res = checkAttack({ isLibero: libero, frontRow: front, takeoff, ballEntirelyAboveNet: above, afterLiberoOverhandInFrontZone: afterLibero });
  const who = libero ? 'The libero' : front ? 'A front-row hitter' : 'A back-row hitter';
  const desc = `${who} takes off ${takeoff.y > 3 ? `behind the attack line (${takeoff.y.toFixed(1)} m from the net)` : takeoff.y === 3 ? 'ON the attack line' : `in front of the attack line (${takeoff.y.toFixed(1)} m from the net)`} and contacts the ball ${above ? 'entirely above the top of the net' : 'with part of the ball below the top of the net'}${afterLibero ? ', from a set the libero made overhand while standing inside the front zone' : ''}.`;
  const scene = neutralScene(world, 'Rules check · attack-hit restrictions', 'set');
  return choice(world, b, scene, `${desc} Is this attack hit legal?`, [
    { id: 'legal', text: 'Legal', verdict: res.legal ? 'best' : 'wrong', why: res.reason },
    { id: 'illegal', text: 'Fault', verdict: res.legal ? 'wrong' : 'best', why: res.reason },
  ], {
    explanation: res.reason,
    three: { now: 'Applying back-row and libero attack rules.', watch: 'Take-off spot, ball height at contact, and who set it.', next: 'Choose a legal option — e.g. a back-row attack from behind the line.' },
    hints: ['A back-row player standing in the front zone is not automatically at fault. What matters is take-off position AND ball height at contact.'],
  });
}

const SERVICE_QUESTIONS: { q: string; options: ChoiceOption[]; why: string }[] = [
  {
    q: 'The opponent’s float serve is dropping just over the net in front of your middle blocker. Your middle jumps and blocks it straight back down. Legal?',
    options: [
      { id: 'a', text: 'Fault — blocking the opponent’s service is forbidden', verdict: 'best', why: 'FIVB 14.5 / 14.6.3: to block an opponent’s service is a fault.' },
      { id: 'b', text: 'Legal — your middle is front row', verdict: 'illegal', why: 'Front-row status lets you block attacks, never the serve.' },
      { id: 'c', text: 'Legal if it counts as the first team hit', verdict: 'wrong', why: 'It is still a block of the service, which is forbidden.' },
    ],
    why: 'Pass the serve. A serve may not be blocked, and it may not be attacked in the front zone while the ball is entirely above the net (FIVB 13.2.4).',
  },
  {
    q: 'A short serve floats high over the net. Your outside hitter, standing in the front zone, swings and spikes it back while the ball is entirely above the net. Legal?',
    options: [
      { id: 'a', text: 'Fault — no attack hit on the opponent’s serve in the front zone above the net', verdict: 'best', why: 'FIVB 13.2.4 / 13.3.5.' },
      { id: 'b', text: 'Legal — front-row players may attack at any height', verdict: 'illegal', why: 'That is true for attack hits in general, but Rule 13.2.4 makes an exception for the opponent’s service.' },
      { id: 'c', text: 'Legal if the hitter jumped from behind the 3 m line', verdict: 'wrong', why: 'The rule is about where the ball is (front zone, above the net), not where the hitter took off.' },
    ],
    why: 'Receive the serve and run your offence instead.',
  },
  {
    q: 'Your team is serving. Two teammates stand side by side directly in front of your server and raise their arms so the receivers cannot see the toss. Allowed?',
    options: [
      { id: 'a', text: 'No — that is screening', verdict: 'best', why: 'FIVB 12.5: the serving team must not prevent the opponent from seeing the service hit and the ball’s flight; arms may not be raised above the head during the service.' },
      { id: 'b', text: 'Yes — the serving team may stand anywhere', verdict: 'wrong', why: 'Positional freedom does not allow screening.' },
      { id: 'c', text: 'Yes, as long as they are inside the court', verdict: 'wrong', why: 'Being inside the court is required, but screening is still a fault.' },
    ],
    why: 'Under FIVB 2025–2028 the serving team can stand anywhere on its own court — but must not screen the server (Rule 12.5).',
  },
];

export function buildServiceRule(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const q = rng.pick(SERVICE_QUESTIONS);
  return choice(world, b, neutralScene(world, 'Rules check · the service'), q.q, rng.shuffle(q.options), {
    explanation: q.why,
    three: { now: 'Applying the service rules.', watch: 'Who served and where the ball is.', next: 'Make a legal play on the serve.' },
    hints: ['The service has its own restrictions — on the serving team and on the receivers.'],
  });
}

const LIBERO_QUESTIONS: { q: string; options: ChoiceOption[]; why: string }[] = [
  {
    q: 'Your libero is in left-back. The opponent’s outside hitter is attacking on your right… your libero runs to the net to help block. Allowed?',
    options: [
      { id: 'a', text: 'No — a libero may not block or attempt to block', verdict: 'best', why: 'FIVB: the libero may not complete a block or attempt to block.' },
      { id: 'b', text: 'Yes, if they stay in the back row rotationally', verdict: 'illegal', why: 'The libero may never block or attempt to block, whatever their rotational position.' },
      { id: 'c', text: 'Yes, as long as they do not touch the ball', verdict: 'wrong', why: 'Even an attempt to block is a fault for the libero.' },
    ],
    why: 'The libero is a back-row specialist: no blocking, no attempted blocks, no serving (FIVB), and no attack hits with the ball entirely above the net.',
  },
  {
    q: 'The middle blocker is about to serve from Position 1. Can the libero come in and serve instead?',
    options: [
      { id: 'a', text: 'No — under FIVB rules the libero may not serve', verdict: 'best', why: 'Under FIVB the libero cannot serve, so the middle serves and the libero comes back in later.' },
      { id: 'b', text: 'Yes, libero replacements are unlimited', verdict: 'wrong', why: 'Replacements are unlimited, but the libero may not serve under FIVB.' },
      { id: 'c', text: 'Yes, but only once per set', verdict: 'wrong', why: 'There is no once-per-set libero serve under FIVB.' },
    ],
    why: 'Some other competitions allow the libero to serve in one rotation — this is a ruleset difference, not a universal rule.',
  },
  {
    q: 'The libero (standing inside the 3 m line) sets the outside hitter with an overhand finger pass. The hitter jumps and spikes the ball well above the net. Legal?',
    options: [
      { id: 'a', text: 'Fault — the attack must be completed with part of the ball below the net top', verdict: 'best', why: 'After a libero’s overhand finger pass in the front zone, a teammate may not complete an attack hit above net height.' },
      { id: 'b', text: 'Legal — the hitter is front row', verdict: 'wrong', why: 'The hitter’s row does not matter here; the restriction comes from the libero’s overhand set in the front zone.' },
      { id: 'c', text: 'Legal if the libero is back row', verdict: 'wrong', why: 'The libero is always back row; the restriction still applies.' },
    ],
    why: 'Fix: the libero sets from behind the attack line (anything goes) or bump-sets (underhand) from in front of it.',
  },
  {
    q: 'The libero replaced the middle blocker last rally. The rally is over and the middle rotates to Position 4 (front row). What happens?',
    options: [
      { id: 'a', text: 'The libero leaves and the middle returns', verdict: 'best', why: 'The libero may not play in the front row. They must be replaced by the player they replaced.' },
      { id: 'b', text: 'The libero stays and plays left-front', verdict: 'illegal', why: 'The libero may never be in the front row.' },
      { id: 'c', text: 'Any bench player may replace the libero', verdict: 'wrong', why: 'The libero can only be replaced by the player they replaced (or a second libero).' },
    ],
    why: 'Libero replacements do not count as substitutions, but there must be a completed rally between two replacements.',
  },
];

export function buildLiberoRule(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const q = rng.pick(LIBERO_QUESTIONS);
  return choice(world, b, neutralScene(world, 'Rules check · libero'), q.q, rng.shuffle(q.options), {
    explanation: q.why,
    three: { now: 'Applying libero restrictions.', watch: 'Where the libero is and what they are about to do.', next: 'Pick the legal alternative.' },
    hints: ['The libero is a back-row-only specialist. Think about what back-row players can never do — and the extra libero restrictions.'],
  });
}

export function buildServeOrderRule(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const servingNow = rng.chance(0.5);
  const oc = onCourt(team, rot, servingNow);
  const z1 = oc.find((o) => o.zone === 1)!.baseId;
  const z2 = oc.find((o) => o.zone === 2)!.baseId;
  const z6 = oc.find((o) => o.zone === 6)!.baseId;
  const q = servingNow
    ? `Your team is SERVING (${name(team, z1)} serves) and wins the rally. Who serves next?`
    : `Your team is RECEIVING and wins the rally. Who serves next?`;
  const correct = servingNow ? z1 : z2;
  const opts: ChoiceOption[] = [z1, z2, z6].map((id) => ({
    id,
    text: `${name(team, id)} (now in zone ${oc.find((o) => o.baseId === id)!.zone})`,
    verdict: id === correct ? 'best' : 'wrong',
    why: servingNow
      ? 'A team that wins a rally while serving does not rotate — the same player serves again.'
      : 'A receiving team that wins the rally gains the serve and rotates clockwise: the player in zone 2 moves to zone 1 and serves.',
  }));
  return choice(world, b, rotationalScene(world, servingNow, servingNow ? 'Your team serving' : 'Your team receiving'), q, rng.shuffle(opts), {
    explanation: servingNow ? 'No rotation when the serving team wins the rally.' : 'Side-out → rotate clockwise: 2→1, 1→6, 6→5, 5→4, 4→3, 3→2.',
    three: { now: 'Tracking service order.', watch: 'Which team was serving when the rally was won.', next: 'The correct server — serving out of order is a fault.' },
    hints: ['Rotation only happens when you win the right to serve.'],
  });
}

export function buildServingFreedomRule(world: World, b: BuildCommon): ChoiceScenario {
  const team = world.home.team;
  const free = !world.ruleset.servingTeamPositionalFault;
  const s = activeSetterId(team, world.home.rotation);
  const z = zoneOfPlayer(team, world.home.rotation, s)!;
  const q = `Your team is serving. Your setter ${name(team, s)} is in rotational Position ${z}. Before the serve, may the setter already stand at the right-front setting spot, ahead of and right of their neighbours?`;
  return choice(world, b, rotationalScene(world, true, `Serving · ${world.ruleset.name}`), q, [
    { id: 'yes', text: free ? 'Yes — the serving team has no positional fault' : 'Yes — it does not matter for the serving team', verdict: free ? 'best' : 'wrong', why: free ? 'Under FIVB 2025–2028 only the receiving team is judged for positional faults; the serving team may stand anywhere on its own court.' : 'Under this ruleset the serving team is also judged for overlap.' },
    { id: 'no', text: 'No — they must stay in rotational order until the serve is contacted', verdict: free ? 'wrong' : 'best', why: free ? 'That was true under older rules (and still is in some leagues), but not under FIVB 2025–2028.' : 'Correct for this ruleset: both teams must be in rotational order at service contact.' },
    { id: 'row', text: 'Only if they are a front-row player', verdict: 'wrong', why: 'Row status never makes a positional fault disappear; it is about the ruleset.' },
  ], {
    explanation: world.ruleset.description,
    three: { now: 'Knowing which team the overlap rule applies to.', watch: 'Which team is serving.', next: 'Use the freedom to pre-switch into specialty positions.' },
    hints: ['Which team does the 2025–2028 FIVB positional-fault rule apply to?'],
  });
}

export function buildSetDecision(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const s = activeSetterId(team, rot);
  const sFront = isFrontZone(zoneOfPlayer(team, rot, s)!);
  const q: PassQuality = rng.pick(['perfect', 'tight', 'off', 'poor'] as PassQuality[]);
  const P = passLanding(team, q);
  const ao = attackOptions(team, rot);
  const hasMiddle = ao.some((o) => o.lane === 'middle');
  const opts: ChoiceOption[] = [];
  const inSystem = q === 'perfect' || q === 'tight';
  opts.push({ id: 'high', text: 'High ball to the outside hitter', verdict: inSystem ? 'ok' : 'best', why: inSystem ? 'Safe, but you are giving up the faster options a good pass creates.' : 'Out of system, a high, hittable ball to the left pin is the reliable choice.' });
  if (hasMiddle) opts.push({ id: 'quick', text: 'Quick set to the middle', verdict: q === 'perfect' ? 'best' : q === 'tight' ? 'ok' : 'wrong', why: q === 'perfect' ? 'A perfect pass is exactly when the quick works — it freezes the opposing middle.' : q === 'tight' ? 'Possible off a tight pass, but timing is harder.' : 'A quick needs a pass near the target. Off the net, the middle cannot be set in rhythm.' });
  const dumpAbove = true;
  const dumpRule = checkAttack({ isLibero: false, frontRow: sFront, takeoff: v(P.x, P.y), ballEntirelyAboveNet: dumpAbove });
  opts.push({
    id: 'dump',
    text: 'Setter dump (attack the second ball over the net)',
    verdict: !dumpRule.legal ? 'illegal' : q === 'tight' ? 'best' : q === 'perfect' ? 'ok' : 'wrong',
    why: !dumpRule.legal
      ? `Illegal: you are a back-row setter. ${dumpRule.reason}`
      : q === 'tight'
        ? 'Tight to the net and front row: attacking or dumping the ball is often the best play.'
        : q === 'perfect'
          ? 'Legal and occasionally effective as a surprise — but use it sparingly.'
          : 'From off the net, a dump is easy to defend.',
  });
  opts.push({ id: 'back', text: 'Back set to the right side', verdict: q === 'perfect' ? 'ok' : q === 'tight' ? 'ok' : q === 'off' ? 'ok' : 'wrong', why: q === 'poor' ? 'From deep in the court a back set is long and hard to control.' : 'A reasonable option when your right-side is available and the block is shading left.' });
  if (q === 'tight' && !sFront) {
    opts.push({ id: 'push', text: 'Set it — keep the ball on your side', verdict: 'best', why: 'Back-row setter on a tight pass: you may not attack it above the net from the front zone, so set it away from the net to a hitter.' });
  }
  return choice(
    world,
    b,
    { ...neutralScene(world, `${PASS_LABEL[q]} · setter ${sFront ? 'front' : 'back'} row`, 'set'), home: { ...world.home, positions: { ...positionsOf(computePlan(world.home, { kind: 'firstContact', contactId: receiveFormation(team, rot).passers[1], quality: q, ballAt: P, source: 'serve' })) } }, ballRest: { p: W('home', P), h: 2.6 } },
    `${PASS_LABEL[q]}. You are the ${sFront ? 'front-row' : 'back-row'} setter. What is your best decision?`,
    rng.shuffle(opts),
    {
      explanation: `Pass quality decides the menu: on target, every attacker is live (including the middle quick${sFront ? ' and your dump' : ''}); off the net, the menu shrinks to high balls to the pins.`,
      three: { now: 'Choosing the set before the ball arrives.', watch: 'Pass quality, which hitters are in their approach, and the opposing middle.', next: 'Cover your hitter after the set.' },
      hints: ['How far off the net is the pass? And are you front row or back row — can you legally attack the second ball?'],
    },
  );
}

export function buildReading(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const kind = rng.int(0, 4);
  const away = world.away;
  const awayOpts = attackOptions(away.team, away.rotation);
  const awaySetterFront = isFrontZone(zoneOfPlayer(away.team, away.rotation, activeSetterId(away.team, away.rotation))!);
  const sc = (caption: string): Scene => ({
    home: { ...world.home, positions: positionsOf(computePlan(world.home, { kind: 'servingBase' })) },
    away: { ...away, positions: positionsOf(computePlan(away, { kind: 'firstContact', contactId: onCourtIds(away)[4], quality: kind === 0 ? 'off' : 'perfect', ballAt: passLanding(away.team, kind === 0 ? 'off' : 'perfect'), source: 'serve' })) },
    ball: [],
    ballRest: { p: W('away', passLanding(away.team, kind === 0 ? 'off' : kind === 1 ? 'tight' : 'perfect')), h: 3 },
    phase: 'defense',
    caption,
  });
  const common = (three: ScenarioBase['three'], hint: string, explanation: string) => ({ three, hints: [hint], explanation });
  switch (kind) {
    case 0:
      return choice(world, b, sc('Opponent pass: well off the net'), 'The opponent’s pass is far off the net. What attack is most likely?', rng.shuffle([
        { id: 'a', text: 'A high ball to their outside hitter', verdict: 'best', why: 'Out of system, teams go high to the outside pin — the most forgiving set.' },
        { id: 'b', text: 'A quick to their middle', verdict: 'wrong', why: 'A quick needs a pass near the setter’s target.' },
        { id: 'c', text: 'A setter dump', verdict: 'wrong', why: 'The setter is chasing the ball far from the net — a dump is not realistic.' },
        { id: 'd', text: 'A free ball or down ball is also possible', verdict: 'ok', why: 'True if the pass is very poor — watch whether they can even get a hitter in their approach.' },
      ]), common({ now: 'Preparing to block the outside and defend a high ball.', watch: 'Where their setter gets to and which hitter is approaching.', next: 'Double-block the pin, defend around it.' }, 'What does a pass far off the net take away from the setter?', 'Reading pass quality lets you cheat toward the likely attacker before the set.'));
    case 1:
      return choice(world, b, sc('Opponent pass: tight to the net'), `The opponent’s pass is tight to the net and their setter is ${awaySetterFront ? 'FRONT' : 'BACK'} row. What should your front row watch for?`, rng.shuffle([
        { id: 'a', text: awaySetterFront ? 'A setter dump or attack on two' : 'An overpass or a quick set', verdict: 'best', why: awaySetterFront ? 'A front-row setter on a tight pass can legally attack the second ball — be ready to block it.' : 'A back-row setter cannot attack it above the net in the front zone, so expect a quick set or a ball that drifts over.' },
        { id: 'b', text: 'A high ball to the opposite', verdict: 'ok', why: 'Possible, but tight passes usually produce fast plays or second-ball attacks.' },
        { id: 'c', text: 'Nothing special — wait for the set', verdict: 'wrong', why: 'Tight passes create immediate threats; be ready at the net.' },
      ]), common({ now: 'Hands ready at the net.', watch: 'The setter’s row and hand position.', next: 'Block the dump or the quick.' }, 'Can their setter legally attack the second ball?', 'A front-row setter turns every tight pass into a possible attack.'));
    case 2:
      return choice(world, b, sc('Hitter approaching from outside the court'), 'Their outside hitter is approaching from well outside the sideline, angled toward the middle of your court. Where is the attack most likely to go?', rng.shuffle([
        { id: 'a', text: 'Cross-court', verdict: 'best', why: 'An outside-in approach lines the hitter’s body up with the cross court.' },
        { id: 'b', text: 'Down the line', verdict: 'ok', why: 'Good hitters can still turn it, but the approach angle favours cross.' },
        { id: 'c', text: 'A tip right over the block', verdict: 'ok', why: 'Always possible — watch for the arm slowing down.' },
      ]), common({ now: 'Cross-court digger lines up on the angle.', watch: 'Approach angle and the hitting shoulder.', next: 'Adjust the block and defence before contact.' }, 'Where is the hitter’s body facing at take-off?', 'Approach angle is one of the earliest cues of where a hitter will attack.'));
    case 3:
      return choice(world, b, sc('Opponent scrambling'), 'Their dig goes high to their back row, the setter is nowhere near, and no hitter is in their approach. What should your team expect — and do?', rng.shuffle([
        { id: 'a', text: 'A free ball — call “free!” and switch to the free-ball formation', verdict: 'best', why: 'No hitter ready and no setter: the ball is coming over easy. Release the setter and drop the hitters off the net.' },
        { id: 'b', text: 'A hard spike — stay in deep defence', verdict: 'wrong', why: 'Nobody is in position to attack hard.' },
        { id: 'c', text: 'Stay in base and wait', verdict: 'ok', why: 'Safe, but you lose time switching to offence.' },
      ]), common({ now: 'Switching to the free-ball formation early.', watch: 'Is anyone approaching? Is it an overhead attack or an easy pass over?', next: 'Pass, set, attack — full tempo.' }, 'Can they attack this ball at all?', 'Recognising free balls early gives your offence a head start.'));
    default: {
      const middleOpt = awayOpts.some((o) => o.lane === 'middle');
      return choice(world, b, sc('Perfect pass — opponent in system'), 'The opponent passes perfectly and their middle is running a quick. As your middle blocker, what is your priority?', rng.shuffle([
        { id: 'a', text: middleOpt ? 'Stay with their middle (read the setter), then close outside if they set high' : 'Read the setter and move to the set', verdict: 'best', why: 'On a perfect pass the quick must be respected first; a read blocker can still close to a high outside set.' },
        { id: 'b', text: 'Guess the outside early and leave', verdict: 'wrong', why: 'Leaving early gives up a free quick attack.' },
        { id: 'c', text: 'Commit-block the middle every time', verdict: 'ok', why: 'A legitimate tactic against a dominant middle — but you will be late to the pins.' },
      ]), common({ now: 'Square at the net in front of their middle.', watch: 'The setter’s hands and their middle’s approach.', next: 'Close the block to the set.' }, 'What attack is fastest off a perfect pass?', 'Reading their options in order of speed tells blockers who to stay with.'));
    }
  }
}

export function buildSeamChoice(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const team = world.home.team;
  const f = receiveFormation(team, world.home.rotation);
  const pts = f.passers.map((id) => ({ id, p: f.positions[id] })).sort((a, c) => a.p.x - c.p.x);
  const i = rng.int(0, pts.length - 2);
  const a = pts[i];
  const c = pts[i + 1];
  const seam = v((a.p.x + c.p.x) / 2, (a.p.y + c.p.y) / 2 + rng.pick([-0.5, 0, 0.6]));
  const lib = [a.id, c.id].find((id) => id === team.liberoId);
  const deepOut = rng.chance(0.25);
  const target = deepOut ? v(seam.x, 9.6) : seam;
  const opts: ChoiceOption[] = deepOut
    ? [
        { id: 'out', text: 'Let it go — it is going long', verdict: 'best', why: 'A serve dropping beyond the endline is out. Passers learn to read deep serves and leave them, calling “out!”.' },
        { id: 'a', text: `${name(team, a.id)} passes it`, verdict: 'wrong', why: 'Playing a ball that would land out gives away a good chance of a point.' },
        { id: 'c', text: `${name(team, c.id)} passes it`, verdict: 'wrong', why: 'Playing a ball that would land out gives away a good chance of a point.' },
      ]
    : [
        { id: 'a', text: `${name(team, a.id)} takes it`, verdict: lib === a.id ? 'best' : lib ? 'ok' : 'ok', why: lib === a.id ? 'The libero is usually the primary passer and takes seam balls they can reach.' : 'Fine if they call it early — the key is a loud, early call.' },
        { id: 'c', text: `${name(team, c.id)} takes it`, verdict: lib === c.id ? 'best' : lib ? 'ok' : 'ok', why: lib === c.id ? 'The libero is usually the primary passer and takes seam balls they can reach.' : 'Fine if they call it early — the key is a loud, early call.' },
        { id: 'none', text: 'Both wait to see who goes', verdict: 'wrong', why: 'Hesitation in the seam is the most common way serve receive breaks down. Someone must call it.' },
      ];
  if (!lib && !deepOut) {
    opts[0].verdict = 'best';
    opts[0].why = 'Many teams give seam balls to the passer on the inside or the one moving forward — what matters most is the team’s agreed rule and an early call.';
  }
  return choice(world, b, { ...neutralScene(world, 'Serve heading for the seam'), ball: [seg(W('away', SERVER_SPOT), W('home', v(target.x, Math.min(target.y, 8.9) - 0.6)), 2.6, 1.4, 3.4, 1100, 'Serve')] }, deepOut ? 'A hard, flat serve is heading between two passers — but it is still rising as it crosses the 6 m mark. What should happen?' : `The serve is heading into the seam between ${name(team, a.id)} and ${name(team, c.id)}. Who should pass it?`, rng.shuffle(opts), {
    explanation: 'Seam responsibility is a team agreement (often: libero takes everything they can reach; otherwise the inside or forward-moving passer). The non-negotiable part is an early call.',
    three: { now: 'Ready in the seam with a plan.', watch: 'The serve’s line and depth early in its flight.', next: 'The non-passer opens up and moves to their next job.' },
    hints: ['Who is your primary passer? And is this serve even going to land in?'],
  });
}

export function buildBrokenChoice(world: World, b: BuildCommon, rng: Rng): ChoiceScenario {
  const team = world.home.team;
  const rot = world.home.rotation;
  const kind = rng.int(0, 2);
  const s = activeSetterId(team, rot);
  const sc = neutralScene(world, 'Broken play', 'transition');
  if (kind === 0) {
    return choice(world, b, sc, `Your setter ${name(team, s)} digs the first ball. Who should take the second contact?`, rng.shuffle([
      { id: 'a', text: team.liberoId ? 'The libero (or the right-front player if the libero cannot get there)' : 'The right-front player', verdict: 'best', why: 'Teams pre-assign an emergency setter — most often the libero or the right-side player. The key is that someone is designated.' },
      { id: 'b', text: 'The setter again', verdict: 'illegal', why: 'A player may not contact the ball twice in a row (double contact).' },
      { id: 'c', text: 'Whoever is closest, no plan', verdict: 'ok', why: 'Sometimes it ends this way, but without a plan two players often go or nobody does.' },
    ]), { explanation: 'Plan for broken plays: designate who sets when the setter takes the first ball.', three: { now: 'Calling “help!” and the emergency setter moving in.', watch: 'Where the dig is going.', next: 'A high, hittable ball to the outside.' }, hints: ['Can the setter touch the ball twice in a row?'] });
  }
  if (kind === 1) {
    return choice(world, b, sc, 'Two passers both move toward a serve in the seam and both stop. What should have happened?', rng.shuffle([
      { id: 'a', text: 'An early, loud call — the agreed seam owner goes, the other opens up', verdict: 'best', why: 'Communication resolves seams. The non-passer opens away and gets to their next job.' },
      { id: 'b', text: 'Both should play it together', verdict: 'wrong', why: 'Simultaneous contacts are legal but lead to collisions and bad passes.' },
      { id: 'c', text: 'The front-row player should always take it', verdict: 'wrong', why: 'Front-row players need to attack; the libero/back-row usually takes priority.' },
    ]), { explanation: 'Seam conflicts are solved before the serve: agree on responsibility, then call it early.', three: { now: 'Communicating.', watch: 'The serve’s line.', next: 'Non-passer transitions.' }, hints: ['What prevents two players from freezing?'] });
  }
  return choice(world, b, sc, 'Your middle blocker blocked and landed late — the set is going to the middle anyway. What is the best adjustment?', rng.shuffle([
    { id: 'a', text: 'Setter sees it and sets a high ball to a pin instead', verdict: 'best', why: 'A setter reads hitter availability: no middle in approach means no quick.' },
    { id: 'b', text: 'Set the quick — the middle will catch up', verdict: 'wrong', why: 'A quick to a hitter who is not in their approach almost always fails.' },
    { id: 'c', text: 'Dump it regardless of row', verdict: 'illegal', why: 'Only a front-row setter may attack the second ball above the net.' },
  ]), { explanation: 'Broken plays demand reading teammates as well as the ball.', three: { now: 'Adjusting the set to available hitters.', watch: 'Which hitters are actually in their approach.', next: 'Cover the pin.' }, hints: ['Who is actually ready to attack?'] });
}

// ---------------------------------------------------------------------------
// Category generators
// ---------------------------------------------------------------------------

type Predicate = (world: World, ids: string[]) => boolean;

export function chooseWorld(opts: GenOptions, homeServing: boolean, pred: Predicate = () => true): { world: World; ids: string[]; note?: string } {
  const rots = opts.rotation !== undefined ? [opts.rotation] : opts.rng.shuffle([0, 1, 2, 3, 4, 5]);
  let fallback: { world: World; ids: string[]; note?: string } | null = null;
  for (const r of rots) {
    let world = makeWorld(opts, r, homeServing, opts.rng.int(0, 5));
    let dsNote: string | undefined;
    if (opts.focus.kind === 'role' && opts.focus.role === 'DS') {
      const res = withDefensiveSpecialist(world);
      world = res.world;
      dsNote = res.note;
    }
    const f = opts.focus.kind === 'role' && opts.focus.role === 'DS' ? { ids: dsNote ? [world.home.team.players.find((p) => p.role === 'DS')!.id] : resolveFocus(world, { kind: 'role', role: 'L' }).ids, note: dsNote ?? 'No back-row spot for a DS this rotation — following the libero instead.' } : resolveFocus(world, opts.focus);
    const cand = { world, ids: f.ids, note: f.note };
    if (pred(world, f.ids)) return cand;
    fallback ??= cand;
  }
  return fallback!;
}

const isFront = (w: World, id: string) => isFrontZone(zoneIn(w.home, id) ?? 5);

export function generate(category: Category, opts: GenOptions): Scenario {
  const { rng } = opts;
  const coach = opts.focus.kind === 'all';
  const B = (w: { ids: string[]; note?: string }, title: string): BuildCommon => ({ category, title, focusIds: w.ids, focusNote: w.note, coach });
  switch (category) {
    case 'fundamentals': {
      const w = chooseWorld(opts, false);
      return buildTapZone(w.world, B(w, 'Court fundamentals'), rng);
    }
    case 'serveReceive': {
      if (!coach && rng.chance(0.2)) {
        const w = chooseWorld(opts, false, (world) => receiveFormation(world.home.team, world.home.rotation).passers.length === 3);
        return buildSeamChoice(w.world, B(w, 'Seam responsibility'), rng);
      }
      const w = chooseWorld(opts, false);
      return buildServeReceive(w.world, B(w, `Serve receive · ${rotationText(w.world.home)}`));
    }
    case 'release': {
      const w = chooseWorld(opts, false, (world, ids) => !receiveFormation(world.home.team, world.home.rotation).passers.includes(ids[0]) || coach);
      return buildRelease(w.world, B(w, 'Release after service contact'));
    }
    case 'receiveYou': {
      const w = chooseWorld(opts, false, (world, ids) => receiveFormation(world.home.team, world.home.rotation).passers.includes(ids[0]));
      const f = receiveFormation(w.world.home.team, w.world.home.rotation);
      const quality = rng.pick(['perfect', 'good', 'good', 'off'] as PassQuality[]);
      if (f.passers.includes(w.ids[0])) {
        return buildFirstContact(w.world, B(w, 'You receive the serve'), { contactId: w.ids[0], quality, source: 'serve' });
      }
      // Not a passer in any rotation (e.g. MB/OPP/S): the ball comes to you on defence.
      const from = rng.pick(['ourRight', 'ourLeft'] as AttackSide[]);
      const defPos = positionsOf(computePlan(w.world.home, { kind: 'defense', from, set: 'high', system: w.world.defenseSystem }));
      return buildFirstContact(w.world, { ...B(w, 'You dig the attack'), focusNote: (w.note ? w.note + ' ' : '') + 'This player rarely passes serve, so the ball comes to them on defence.' }, {
        contactId: w.ids[0],
        quality,
        source: 'dig',
        startPositions: defPos,
        incoming: [seg(W('home', opponentContactPoint(from)), W('home', defPos[w.ids[0]]), 3.0, 0.7, 0.3, 700, 'Attack')],
      });
    }
    case 'someoneElse': {
      const w = chooseWorld(opts, false);
      const f = receiveFormation(w.world.home.team, w.world.home.rotation);
      const others = f.passers.filter((id) => !w.ids.includes(id));
      const contact = rng.pick(others.length ? others : f.passers);
      return buildFirstContact(w.world, B(w, 'Someone else receives'), { contactId: contact, quality: rng.pick(['perfect', 'good', 'off'] as PassQuality[]), source: 'serve' });
    }
    case 'setting': {
      const w = chooseWorld(opts, false);
      const team = w.world.home.team;
      const s = activeSetterId(team, w.world.home.rotation);
      if (w.ids.includes(s) && rng.chance(0.4)) return buildSetDecision(w.world, B(w, 'Setter decision'), rng);
      const f = receiveFormation(team, w.world.home.rotation);
      const v_ = rng.int(0, 4);
      if (v_ === 0) {
        // Setter must pass: serve aimed at the setter's hiding spot.
        const contactAt = f.positions[s].y > 3 ? f.positions[s] : v(f.positions[s].x, 4.2);
        return buildFirstContact(w.world, { ...B(w, 'The setter takes the first ball'), focusNote: w.note }, { contactId: s, quality: 'good', source: 'serve', contactAt });
      }
      const q = (['perfect', 'tight', 'off', 'poor'] as PassQuality[])[v_ - 1];
      return buildFirstContact(w.world, B(w, `Setting: ${PASS_LABEL[q].split(' —')[0].toLowerCase()}`), { contactId: rng.pick(f.passers.filter((id) => id !== s)), quality: q, source: 'serve' });
    }
    case 'attacking': {
      const w = chooseWorld(opts, false);
      const team = w.world.home.team;
      const rot = w.world.home.rotation;
      const ao = attackOptions(team, rot).filter((o) => o.lane !== 'dump');
      const myLane = ao.find((o) => w.ids.includes(o.playerId));
      if (myLane && !coach && rng.chance(0.4)) {
        const f = receiveFormation(team, rot);
        const contact = f.passers.find((id) => id !== myLane.playerId) ?? f.passers[0];
        return buildFirstContact(w.world, B(w, 'Approach preparation'), { contactId: contact, quality: 'good', source: 'serve' });
      }
      const attackers = ao.filter((o) => !w.ids.includes(o.playerId) || coach);
      const att = rng.pick(attackers.length ? attackers : ao);
      return buildAttackCoverage(w.world, B(w, `Cover the ${LANE_NAME[att.lane].toLowerCase()} attack`), { attackerId: att.playerId, lane: att.lane });
    }
    case 'blocking': {
      if (!coach && rng.chance(0.15)) {
        const w = chooseWorld(opts, true);
        return buildLiberoRule(w.world, B(w, 'Libero restrictions'), rng);
      }
      const w = chooseWorld(opts, true, (world, ids) => coach || isFront(world, ids[0]) || rng.chance(0.25));
      const from = rng.pick(['ourRight', 'ourRight', 'ourLeft', 'middle', 'pipe'] as AttackSide[]);
      return buildDefense(w.world, B(w, 'Blocking & defence'), { from, set: from === 'middle' && rng.chance(0.6) ? 'quick' : 'high' }, 'blocking');
    }
    case 'spikeDefense': {
      const w = chooseWorld(opts, true, (world, ids) => coach || !isFront(world, ids[0]));
      const from = rng.pick(['ourRight', 'ourLeft', 'ourRight', 'middle', 'pipe'] as AttackSide[]);
      const tendency = from === 'ourRight' || from === 'ourLeft' ? rng.pick([undefined, 'line', 'cross'] as const) : undefined;
      return buildDefense(w.world, B(w, 'Spike defence'), { from, set: 'high', tendency }, 'spikeDefense');
    }
    case 'tip': {
      const w = chooseWorld(opts, true);
      const from = rng.pick(['ourRight', 'ourLeft'] as AttackSide[]);
      const right = from === 'ourRight';
      const spots = [v(right ? 6.6 : 2.4, 1.6), v(4.5, 3.0), v(right ? 8.3 : 0.7, 3.2), v(right ? 5.2 : 3.8, 2.2), v(right ? 7.4 : 1.6, 4.4)];
      return buildTip(w.world, B(w, 'Tip coverage'), { from, tipAt: rng.pick(spots) });
    }
    case 'transition': {
      const w = chooseWorld(opts, true);
      const from = rng.pick(['ourRight', 'ourLeft'] as AttackSide[]);
      const defPlan = computePlan(w.world.home, { kind: 'defense', from, set: 'high', system: w.world.defenseSystem });
      const defPos = positionsOf(defPlan);
      const s = activeSetterId(w.world.home.team, w.world.home.rotation);
      const diggers = Object.keys(defPos).filter((id) => !defPlan.blockers.includes(id) && defPos[id].y > 3.5 && id !== s && !w.ids.includes(id));
      const digger = rng.pick(diggers.length ? diggers : Object.keys(defPos).filter((id) => !defPlan.blockers.includes(id)));
      return buildFirstContact(w.world, B(w, 'Transition: defence to offence'), {
        contactId: digger,
        quality: rng.pick(['good', 'off', 'poor'] as PassQuality[]),
        source: 'dig',
        startPositions: defPos,
        incoming: [seg(W('home', opponentContactPoint(from)), W('home', defPos[digger]), 3.0, 0.7, 0.3, 700, 'Attack')],
      });
    }
    case 'freeBall': {
      const w = chooseWorld(opts, true);
      return buildFreeBall(w.world, B(w, 'Free ball'));
    }
    case 'brokenPlay': {
      const w = chooseWorld(opts, true);
      const k = rng.int(0, 3);
      if (k === 0) return buildBrokenChoice(w.world, B(w, 'Broken play'), rng);
      const team = w.world.home.team;
      const s = activeSetterId(team, w.world.home.rotation);
      const from = rng.pick(['ourRight', 'ourLeft'] as AttackSide[]);
      const defPos = positionsOf(computePlan(w.world.home, { kind: 'defense', from, set: 'high', system: w.world.defenseSystem }));
      if (k === 1) {
        return buildFirstContact(w.world, B(w, 'Broken play: the setter digs'), {
          contactId: s,
          quality: 'off',
          source: 'dig',
          startPositions: defPos,
          incoming: [seg(W('home', opponentContactPoint(from)), W('home', defPos[s]), 3.0, 0.7, 0.3, 700, 'Attack')],
        });
      }
      if (k === 2) {
        const f = receiveFormation(team, w.world.home.rotation);
        return buildFirstContact(w.world, B(w, 'Broken play: pass too close to the net'), { contactId: rng.pick(f.passers), quality: 'tight', source: 'serve' });
      }
      return buildTip(w.world, B(w, 'Broken play: block deflection'), { from, tipAt: v(from === 'ourRight' ? 6.0 : 3.0, 6.8) });
    }
    case 'serving': {
      const w = chooseWorld(opts, true, (world, ids) => coach || ids[0] !== onCourt(world.home.team, world.home.rotation, true).find((o) => o.zone === 1)!.playerId);
      if (!coach && rng.chance(0.3)) return buildServingFreedomRule(w.world, B(w, 'Serving-team freedom'));
      if (!coach && rng.chance(0.4)) return buildServingBase(w.world, B(w, 'After your serve'));
      return buildServePre(w.world, B(w, 'Serving team positioning'));
    }
    case 'reading': {
      const w = chooseWorld(opts, true);
      return buildReading(w.world, B(w, 'Reading the opponent'), rng);
    }
    case 'rules': {
      const w = chooseWorld(opts, false);
      const k = rng.int(0, 4);
      if (k === 0) return buildFormationLegality(w.world, B(w, 'Overlap check'), rng);
      if (k === 1) return buildAttackRule(w.world, B(w, 'Attack-hit rules'), rng);
      if (k === 2) return rng.chance(0.5) ? buildLiberoRule(w.world, B(w, 'Libero rules'), rng) : buildServiceRule(w.world, B(w, 'Service rules'), rng);
      if (k === 3) return buildServeOrderRule(w.world, B(w, 'Service order'), rng);
      return buildServingFreedomRule(w.world, B(w, 'Serving-team freedom'));
    }
  }
}

/** Role → categories that matter most for that role (Role Mastery). */
export const ROLE_CURRICULUM: Record<Role | 'ALL', Category[]> = {
  S: ['serveReceive', 'release', 'setting', 'setting', 'brokenPlay', 'attacking', 'blocking', 'transition', 'freeBall', 'rules'],
  OH: ['serveReceive', 'receiveYou', 'someoneElse', 'attacking', 'blocking', 'spikeDefense', 'tip', 'transition', 'freeBall'],
  OPP: ['serveReceive', 'release', 'attacking', 'blocking', 'spikeDefense', 'transition', 'brokenPlay', 'freeBall'],
  MB: ['serveReceive', 'release', 'someoneElse', 'blocking', 'blocking', 'attacking', 'tip', 'transition', 'reading'],
  L: ['serveReceive', 'receiveYou', 'spikeDefense', 'spikeDefense', 'tip', 'brokenPlay', 'attacking', 'rules'],
  DS: ['serveReceive', 'receiveYou', 'spikeDefense', 'tip', 'transition', 'freeBall', 'attacking'],
  ALL: ['serveReceive', 'release', 'someoneElse', 'setting', 'attacking', 'blocking', 'spikeDefense', 'tip', 'transition', 'brokenPlay', 'freeBall', 'serving', 'reading', 'rules'],
};

export const DRILL_CATEGORIES: Category[] = ['serveReceive', 'release', 'receiveYou', 'someoneElse', 'setting', 'attacking', 'blocking', 'tip', 'spikeDefense', 'transition', 'brokenPlay', 'freeBall', 'serving', 'reading', 'rules', 'fundamentals'];

/** Sanity check used before a scenario is shown: no contradictory states. */
export function scenarioIsConsistent(s: Scenario): string[] {
  const errs: string[] = [];
  const { home } = s.scene;
  const ids = onCourtIds(home);
  for (const id of s.focusIds) if (!ids.includes(id)) errs.push(`Focus player ${id} is not on court.`);
  if (s.kind === 'place') {
    for (const id of ids) if (!s.start[id] && !home.positions[id]) errs.push(`No start position for ${id}.`);
    for (const id of s.objective.controlled) if (!s.objective.variants[0].targets[id]) errs.push(`No target for ${id}.`);
  }
  for (const segm of s.scene.ball) if (!Number.isFinite(segm.to.x) || !Number.isFinite(segm.to.y)) errs.push('Ball path is invalid.');
  const lib = home.team.liberoId;
  if (lib && ids.includes(lib) && isFrontZone(zoneIn(home, lib)!)) errs.push('Libero in front row.');
  return errs;
}

