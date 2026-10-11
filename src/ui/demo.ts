import { v, type Vec } from '../engine/geometry';
import { onCourt } from '../engine/rotation';
import { makeWorld, positionsOf, rotationalSpot, type World } from '../engine/scenarios';
import { attackOptions, receiveFormation, setTarget } from '../engine/systems';
import { blockShadow, computePlan, opponentContactPoint, type TacticalPlan } from '../engine/tactics';
import type { Ruleset } from '../engine/rulesets';
import type { DefenseSystemId, Lane, Phase, SystemId } from '../engine/types';
import type { RosterOverride } from '../engine/systems';

export type DemoPhase =
  | 'rotational'
  | 'receive'
  | 'release'
  | 'firstGood'
  | 'firstOff'
  | 'attackLeft'
  | 'attackMiddle'
  | 'attackRight'
  | 'attackPipe'
  | 'servePre'
  | 'base'
  | 'defRight'
  | 'defLeft'
  | 'defMiddle'
  | 'tip'
  | 'free';

export const DEMO_PHASES: { id: DemoPhase; label: string; group: string }[] = [
  { id: 'rotational', label: 'Rotational spots', group: 'Rotation' },
  { id: 'receive', label: 'Serve receive', group: 'Receiving' },
  { id: 'release', label: 'After service contact', group: 'Receiving' },
  { id: 'firstGood', label: 'Good pass', group: 'Offence' },
  { id: 'firstOff', label: 'Off-the-net pass', group: 'Offence' },
  { id: 'attackLeft', label: 'Cover: outside attack', group: 'Offence' },
  { id: 'attackMiddle', label: 'Cover: middle attack', group: 'Offence' },
  { id: 'attackRight', label: 'Cover: right-side attack', group: 'Offence' },
  { id: 'attackPipe', label: 'Cover: pipe', group: 'Offence' },
  { id: 'servePre', label: 'Serving: before contact', group: 'Serving' },
  { id: 'base', label: 'Base defence', group: 'Defence' },
  { id: 'defRight', label: 'Defend their outside', group: 'Defence' },
  { id: 'defLeft', label: 'Defend their right side', group: 'Defence' },
  { id: 'defMiddle', label: 'Defend their middle', group: 'Defence' },
  { id: 'tip', label: 'Tip over the block', group: 'Defence' },
  { id: 'free', label: 'Free ball', group: 'Transition' },
];

export interface DemoScene {
  world: World;
  serving: boolean;
  home: Record<string, Vec>;
  away: Record<string, Vec>;
  plan: TacticalPlan | null;
  phase: Phase;
  caption: string;
  hitter?: Vec;
  shadow?: Vec[] | null;
  passTarget?: Vec;
  ball?: { p: Vec; h: number };
}

const SERVING_PHASES: DemoPhase[] = ['servePre', 'base', 'defRight', 'defLeft', 'defMiddle', 'tip', 'free'];

export function demoScene(opts: { systemId: SystemId; rotation: number; ruleset: Ruleset; defenseSystem: DefenseSystemId; roster?: Record<string, RosterOverride>; customSetters?: string[]; awayRotation?: number }, phase: DemoPhase): DemoScene {
  const serving = SERVING_PHASES.includes(phase);
  const world = makeWorld({ ...opts, difficulty: 'beginner' }, opts.rotation, serving, opts.awayRotation ?? 2);
  const H = world.home;
  const team = H.team;
  const rot = H.rotation;
  const awayBase = positionsOf(computePlan(world.away, { kind: 'servingBase' }));
  const awayRecv = receiveFormation(world.away.team, world.away.rotation).positions;
  let plan: TacticalPlan | null = null;
  let home: Record<string, Vec>;
  let away = awayBase;
  let p: Phase = 'preServe';
  let caption = '';
  let hitter: Vec | undefined;
  let shadow: Vec[] | null | undefined;
  const lane = (l: Lane) => attackOptions(team, rot).find((o) => o.lane === l);
  const attack = (l: Lane, label: string) => {
    const opt = lane(l) ?? attackOptions(team, rot).find((o) => o.lane === 'left')!;
    const prev = positionsOf(computePlan(H, { kind: 'firstContact', contactId: receiveFormation(team, rot).passers[1], quality: 'good', ballAt: setTarget(team.systemId), source: 'serve' }));
    plan = computePlan(H, { kind: 'attack', attackerId: opt.playerId, lane: opt.lane, from: prev });
    p = 'attackCoverage';
    caption = label + (lane(l) ? '' : ' (not available this rotation — showing outside)');
  };
  switch (phase) {
    case 'rotational':
      home = Object.fromEntries(onCourt(team, rot, false).map((o) => [o.playerId, rotationalSpot(o.zone)]));
      caption = 'Rotational order: each player in their numbered zone.';
      away = awayRecv;
      break;
    case 'receive':
      plan = computePlan(H, { kind: 'serveReceive' });
      caption = 'Serve-receive formation — legal at service contact.';
      away = positionsOf(computePlan(world.away, { kind: 'servePre', servingFree: true }));
      break;
    case 'release':
      plan = computePlan(H, { kind: 'release' });
      p = 'release';
      caption = 'Service contact: setter releases, hitters switch to their lanes.';
      break;
    case 'firstGood':
    case 'firstOff': {
      const q = phase === 'firstGood' ? 'good' : 'off';
      const f = receiveFormation(team, rot);
      plan = computePlan(H, { kind: 'firstContact', contactId: f.passers[1], quality: q, ballAt: q === 'good' ? v(5.4, 1.4) : v(4.3, 3.8), source: 'serve' });
      p = 'firstContact';
      caption = q === 'good' ? 'Good pass: every attacker is live.' : 'Off the net: high ball to a pin, middle holds and covers.';
      break;
    }
    case 'attackLeft':
      attack('left', 'Outside attack: coverage cup around the hitter.');
      break;
    case 'attackMiddle':
      attack('middle', 'Middle quick: tight, fast coverage.');
      break;
    case 'attackRight':
      attack('right', 'Right-side attack: coverage shifts right.');
      break;
    case 'attackPipe':
      attack('pipe', 'Pipe: back-row attack from behind the 3 m line.');
      break;
    case 'servePre':
      plan = computePlan(H, { kind: 'servePre', servingFree: !opts.ruleset.servingTeamPositionalFault });
      p = 'serving';
      caption = opts.ruleset.servingTeamPositionalFault ? 'Serving (classic rules): stay in rotational order.' : 'Serving (FIVB 2025–2028): free to pre-switch.';
      away = awayRecv;
      break;
    case 'base':
      plan = computePlan(H, { kind: 'servingBase' });
      p = 'defense';
      caption = 'Base defence after the serve.';
      away = awayRecv;
      break;
    case 'defRight':
    case 'defLeft':
    case 'defMiddle': {
      const from = phase === 'defRight' ? 'ourRight' : phase === 'defLeft' ? 'ourLeft' : 'middle';
      plan = computePlan(H, { kind: 'defense', from, set: 'high', system: opts.defenseSystem });
      p = 'defense';
      hitter = opponentContactPoint(from);
      const pl = plan;
      shadow = blockShadow(hitter, pl.blockers.map((id) => pl.targets[id].pos));
      const awayLane: Lane = from === 'ourRight' ? 'left' : from === 'ourLeft' ? 'right' : 'middle';
      const opt = attackOptions(world.away.team, world.away.rotation).find((o) => o.lane === awayLane) ?? attackOptions(world.away.team, world.away.rotation)[0];
      away = positionsOf(computePlan(world.away, { kind: 'attack', attackerId: opt.playerId, lane: opt.lane }));
      caption = from === 'ourRight' ? 'Their outside attacks toward your right side.' : from === 'ourLeft' ? 'Their right side attacks toward your left.' : 'Middle attack.';
      break;
    }
    case 'tip':
      plan = computePlan(H, { kind: 'tip', from: 'ourRight', system: opts.defenseSystem, tipAt: v(6.4, 1.8) });
      p = 'tip';
      hitter = opponentContactPoint('ourRight');
      caption = 'Tip over the block: closest defender goes forward.';
      break;
    case 'free':
      plan = computePlan(H, { kind: 'freeBall' });
      p = 'freeBall';
      caption = 'Free ball: setter releases, hitters drop off the net.';
      break;
  }
  home = plan ? positionsOf(plan) : home!;
  return { world, serving, home, away, plan, phase: p, caption, hitter, shadow, passTarget: phase.startsWith('first') || phase === 'release' ? setTarget(team.systemId) : undefined };
}
