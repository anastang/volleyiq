import { describe, expect, it } from 'vitest';
import { isFrontZone, v, zoneAt, ZONE_INFO, type Zone } from '../geometry';
import {
  applyRallyResult,
  baseIdInZone,
  CLOCKWISE_NEXT,
  initialMatch,
  isFrontRowPlayer,
  onCourt,
  serverBaseId,
  zoneOfPlayer,
} from '../rotation';
import { CLASSIC_OVERLAP, FIVB_2025 } from '../rulesets';
import {
  checkAttack,
  checkBlock,
  checkContact,
  checkLiberoEnter,
  checkLiberoExit,
  checkServeEligibility,
  checkServer,
  checkServiceFormation,
  freshContacts,
  freshSubs,
  substitute,
  validateTeamState,
} from '../rules';
import {
  activeSetterId,
  attackOptions,
  buildTeam,
  frontRowAttackerCount,
  receiveFormation,
  setterZone,
  specialtySlots,
} from '../systems';
import { computePlan, tacticalLocationName } from '../tactics';
import { evaluatePlacement } from '../evaluate';
import { DRILL_CATEGORIES, generate, scenarioIsConsistent, buildServeReceive, makeWorld, type GenOptions } from '../scenarios';
import { makeRng } from '../rng';
import { advanceRally, newScrimmage, recordRally, startRally } from '../rally';
import type { SystemId } from '../types';

const SYSTEMS: SystemId[] = ['5-1', '6-2', '4-2', 'custom'];
const ROTS = [0, 1, 2, 3, 4, 5];

describe('court positions', () => {
  it('identifies all six numbered positions', () => {
    expect(zoneAt(v(7.5, 6))).toBe(1);
    expect(zoneAt(v(7.5, 1))).toBe(2);
    expect(zoneAt(v(4.5, 1))).toBe(3);
    expect(zoneAt(v(1.5, 1))).toBe(4);
    expect(zoneAt(v(1.5, 6))).toBe(5);
    expect(zoneAt(v(4.5, 6))).toBe(6);
    expect(ZONE_INFO[1].name).toBe('Right Back');
    expect(ZONE_INFO[4].row).toBe('front');
    expect([2, 3, 4].every((z) => isFrontZone(z as Zone))).toBe(true);
    expect([1, 5, 6].some((z) => isFrontZone(z as Zone))).toBe(false);
  });
});

describe('rotation engine', () => {
  const team = buildTeam('5-1', 'home');
  it('starts with lineup index i in zone i+1', () => {
    team.lineup.forEach((id, i) => expect(zoneOfPlayer(team, 0, id)).toBe(i + 1));
  });
  it('rotates clockwise 2→1, 1→6, 6→5, 5→4, 4→3, 3→2', () => {
    for (const id of team.lineup) {
      const z0 = zoneOfPlayer(team, 0, id)!;
      expect(zoneOfPlayer(team, 1, id)).toBe(CLOCKWISE_NEXT[z0]);
    }
    expect(serverBaseId(team, 1)).toBe(baseIdInZone(team, 0, 2));
  });
  it('rotates the receiving team when it wins the rally', () => {
    const m = applyRallyResult(initialMatch('away'), 'home');
    expect(m.serving).toBe('home');
    expect(m.rotation.home).toBe(1);
    expect(m.rotation.away).toBe(0);
    expect(m.score.home).toBe(1);
  });
  it('does not rotate when the serving team wins', () => {
    const m = applyRallyResult(initialMatch('home'), 'home');
    expect(m.rotation.home).toBe(0);
    expect(m.serving).toBe('home');
  });
  it('rotates the right players into new zones after a side-out', () => {
    const before = initialMatch('away');
    const after = applyRallyResult(before, 'home');
    const z2 = baseIdInZone(team, before.rotation.home, 2);
    expect(serverBaseId(team, after.rotation.home)).toBe(z2);
  });
});

describe('5-1 system: all six rotations', () => {
  const team = buildTeam('5-1', 'home');
  it('setter goes 1 → 6 → 5 → 4 → 3 → 2 through the rotations', () => {
    expect(ROTS.map((r) => setterZone(team, r))).toEqual([1, 6, 5, 4, 3, 2]);
  });
  it('has three front-row attackers when the setter is back row and two when front row', () => {
    for (const r of ROTS) {
      const front = isFrontZone(setterZone(team, r));
      expect(frontRowAttackerCount(team, r)).toBe(front ? 2 : 3);
    }
  });
  it('setter has a legal dump only when front row', () => {
    for (const r of ROTS) {
      const hasDump = attackOptions(team, r).some((o) => o.lane === 'dump');
      expect(hasDump).toBe(isFrontZone(setterZone(team, r)));
    }
  });
});

describe('6-2 and 4-2 setter selection', () => {
  it('6-2 uses the back-row setter in every rotation', () => {
    const t = buildTeam('6-2', 'home');
    for (const r of ROTS) {
      const s = activeSetterId(t, r);
      expect(isFrontZone(zoneOfPlayer(t, r, s)!)).toBe(false);
      expect(frontRowAttackerCount(t, r)).toBe(3);
    }
  });
  it('6-2 switches setters when they rotate through the front row', () => {
    const t = buildTeam('6-2', 'home');
    expect(activeSetterId(t, 0)).toBe('h-S');
    expect(activeSetterId(t, 3)).toBe('h-S2');
  });
  it('4-2 uses the front-row setter and always has two front-row attackers', () => {
    const t = buildTeam('4-2', 'home');
    for (const r of ROTS) {
      expect(isFrontZone(zoneOfPlayer(t, r, activeSetterId(t, r))!)).toBe(true);
      expect(frontRowAttackerCount(t, r)).toBe(2);
    }
  });
  it('custom systems use the configured setter per rotation', () => {
    const t = buildTeam('custom', 'home', {}, ['S', 'S', 'S', 'S', 'S2', 'S2']);
    expect(activeSetterId(t, 3)).toBe('h-S');
    expect(activeSetterId(t, 4)).toBe('h-S2');
  });
  it('changing systems updates lineup and recommendations consistently', () => {
    const a = buildTeam('5-1', 'home');
    const b = buildTeam('6-2', 'home');
    expect(a.lineup).toContain('h-OPP');
    expect(b.lineup).toContain('h-S2');
    expect(setterZone(a, 3)).toBe(4);
    expect(setterZone(b, 3)).toBe(1);
    expect(receiveFormation(b, 3).def.setterZone).toBe(1);
  });
});

describe('receiving-team overlap', () => {
  it('every recommended serve-receive formation is legal in every system and rotation', () => {
    for (const s of SYSTEMS) {
      const team = buildTeam(s, 'home');
      for (const r of ROTS) {
        const f = receiveFormation(team, r);
        const chk = checkServiceFormation({ team, rotation: r, positions: f.positions, serving: false, ruleset: FIVB_2025 });
        expect(chk.violations.map((x) => x.message), `${s} R${r + 1}`).toEqual([]);
      }
    }
  });
  it('allows a back-row player exactly level with the front foot (FIVB 7.4.3.1, Diagram 4A)', () => {
    const team = buildTeam('5-1', 'home');
    const pos = { ...receiveFormation(team, 0).positions };
    const mf = onCourt(team, 0, false).find((o) => o.zone === 3)!.playerId;
    const mb = onCourt(team, 0, false).find((o) => o.zone === 6)!.playerId;
    pos[mb] = v(pos[mf].x + 0.8, pos[mf].y);
    expect(checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 }).legal).toBe(true);
    // Staggered: back player's rear foot behind the front player's front foot is legal even if the other foot is ahead.
    pos[mb] = v(pos[mf].x + 0.8, pos[mf].y - 0.2);
    expect(checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025, stagger: { [mb]: 0.6 } }).legal).toBe(true);
  });
  it('flags a middle-back entirely in front of the middle-front player', () => {
    const team = buildTeam('5-1', 'home');
    const f = receiveFormation(team, 0);
    const pos = { ...f.positions };
    const mf = onCourt(team, 0, false).find((o) => o.zone === 3)!.playerId;
    const mb = onCourt(team, 0, false).find((o) => o.zone === 6)!.playerId;
    pos[mb] = v(pos[mf].x + 0.8, pos[mf].y - 0.3);
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 });
    expect(chk.legal).toBe(false);
    expect(chk.violations[0].players).toContain(mb);
    expect(chk.violations[0].message).toMatch(/Position 6.*too far forward relative to Position 3/);
  });
  it('flags left/right order violations', () => {
    const team = buildTeam('5-1', 'home');
    const pos = { ...receiveFormation(team, 0).positions };
    const lf = onCourt(team, 0, false).find((o) => o.zone === 4)!.playerId;
    const mf = onCourt(team, 0, false).find((o) => o.zone === 3)!.playerId;
    pos[lf] = v(pos[mf].x + 0.5, pos[lf].y);
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 });
    expect(chk.violations.some((x) => x.kind === 'leftRight' && x.zones.includes(4) && x.zones.includes(3))).toBe(true);
  });
  it('same-row order: side player overlapping the centre player is legal while a foot is level or outside (Diagram 4B)', () => {
    const team = buildTeam('5-1', 'home');
    const pos = { ...receiveFormation(team, 0).positions };
    const lf = onCourt(team, 0, false).find((o) => o.zone === 4)!.playerId;
    const mf = onCourt(team, 0, false).find((o) => o.zone === 3)!.playerId;
    // Left player's centre 0.3 m RIGHT of the centre player's centre: left foot (x-0.17) still left of centre's right foot (x+0.17).
    pos[lf] = v(pos[mf].x + 0.3, pos[lf].y);
    expect(checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 }).legal).toBe(true);
  });
  it('compares side players with every other player in the row (4 vs 2)', () => {
    const team = buildTeam('5-1', 'home');
    const pos = { ...receiveFormation(team, 0).positions };
    const lf = onCourt(team, 0, false).find((o) => o.zone === 4)!.playerId;
    const rf = onCourt(team, 0, false).find((o) => o.zone === 2)!.playerId;
    const mf = onCourt(team, 0, false).find((o) => o.zone === 3)!.playerId;
    pos[mf] = v(7.8, 0.6);
    pos[rf] = v(8.0, 4.5);
    pos[lf] = v(8.5, 0.8);
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 });
    expect(chk.violations.some((x) => x.kind === 'leftRight' && x.zones.includes(4) && x.zones.includes(2))).toBe(true);
  });
  it('uses feet, not marker centres: a slightly forward centre can still be legal with a staggered stance', () => {
    const team = buildTeam('5-1', 'home');
    const pos = { ...receiveFormation(team, 0).positions };
    const rf = onCourt(team, 0, false).find((o) => o.zone === 2)!.playerId;
    const rb = onCourt(team, 0, false).find((o) => o.zone === 1)!.playerId;
    pos[rb] = v(pos[rb].x, pos[rf].y - 0.1); // RB centre in front of RF centre
    const illegal = checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 });
    expect(illegal.legal).toBe(false);
    // Right-front steps one foot forward 0.6 m: now has a foot closer to the net than both of RB's feet.
    const legal = checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025, stagger: { [rf]: 0.6 } });
    expect(legal.violations.filter((x) => x.zones.includes(1) && x.zones.includes(2))).toEqual([]);
  });
  it('does not penalise legal stacks where players are far from their zone', () => {
    const team = buildTeam('5-1', 'home');
    const f = receiveFormation(team, 2); // setter in 5 stacked at the net
    const s = activeSetterId(team, 2);
    expect(zoneAt(f.positions[s])).not.toBe(5); // physically in the front zone
    expect(checkServiceFormation({ team, rotation: 2, positions: f.positions, serving: false, ruleset: FIVB_2025 }).legal).toBe(true);
  });
  it('flags players standing outside the court', () => {
    const team = buildTeam('5-1', 'home');
    const pos = { ...receiveFormation(team, 0).positions };
    const lb = onCourt(team, 0, false).find((o) => o.zone === 5)!.playerId;
    pos[lb] = v(-1.2, 5.4);
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: false, ruleset: FIVB_2025 });
    expect(chk.violations.some((x) => x.kind === 'outOfCourt')).toBe(true);
  });
});

describe('serving-team freedom (FIVB 2025–2028)', () => {
  it('requires the serving team (except the server) to be within its own court', () => {
    const team = buildTeam('5-1', 'home');
    const pos = Object.fromEntries(onCourt(team, 0, true).map((o, i) => [o.playerId, v(1 + i, 0.5)]));
    const server = onCourt(team, 0, true).find((o) => o.zone === 1)!.playerId;
    pos[server] = v(7, 10);
    expect(checkServiceFormation({ team, rotation: 0, positions: pos, serving: true, ruleset: FIVB_2025 }).legal).toBe(true);
    const other = onCourt(team, 0, true).find((o) => o.zone === 3)!.playerId;
    pos[other] = v(10.5, 2);
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: true, ruleset: FIVB_2025 });
    expect(chk.violations.map((x) => x.kind)).toEqual(['outOfCourt']);
  });
  it('does not judge the serving team for overlap', () => {
    const team = buildTeam('5-1', 'home');
    const pos = Object.fromEntries(onCourt(team, 0, true).map((o, i) => [o.playerId, v(1 + i, 0.5)]));
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: true, ruleset: FIVB_2025 });
    expect(chk.legal).toBe(true);
    expect(chk.judged).toBe(false);
  });
  it('does judge the serving team under the classic ruleset', () => {
    const team = buildTeam('5-1', 'home');
    const pos = Object.fromEntries(onCourt(team, 0, true).map((o, i) => [o.playerId, v(1 + i, 0.5)]));
    const chk = checkServiceFormation({ team, rotation: 0, positions: pos, serving: true, ruleset: CLASSIC_OVERLAP });
    expect(chk.legal).toBe(false);
  });
  it('still requires the correct server', () => {
    const team = buildTeam('5-1', 'home');
    expect(checkServer(team, 0, serverBaseId(team, 0))).toBeNull();
    expect(checkServer(team, 0, baseIdInZone(team, 0, 2))?.kind).toBe('wrongServer');
  });
});

describe('rotational vs tactical position', () => {
  it('a setter in Position 1 who releases to the net is still back row', () => {
    const team = buildTeam('5-1', 'home');
    const s = activeSetterId(team, 0);
    const plan = computePlan({ team, rotation: 0, serving: false }, { kind: 'release' });
    const atNet = plan.targets[s].pos;
    expect(atNet.y).toBeLessThan(3);
    expect(zoneOfPlayer(team, 0, s)).toBe(1);
    expect(isFrontRowPlayer(team, 0, false, s)).toBe(false);
    expect(tacticalLocationName(team, atNet)).toBe('Setting area');
    expect(checkBlock(team, 0, false, s).legal).toBe(false);
  });
  it('specialty slots keep front-row players in front slots', () => {
    for (const s of SYSTEMS) {
      const team = buildTeam(s, 'home');
      for (const r of ROTS) {
        const slots = specialtySlots(team, r, false);
        for (const o of onCourt(team, r, false)) {
          expect(['LF', 'MF', 'RF'].includes(slots[o.playerId])).toBe(isFrontZone(o.zone));
        }
      }
    }
  });
  it('defensive plans only put front-row players in the block', () => {
    for (const s of SYSTEMS) {
      const team = buildTeam(s, 'home');
      for (const r of ROTS) {
        for (const from of ['ourRight', 'ourLeft', 'middle', 'pipe'] as const) {
          const plan = computePlan({ team, rotation: r, serving: true }, { kind: 'defense', from, set: 'high', system: 'perimeter' });
          for (const b of plan.blockers) expect(checkBlock(team, r, true, b).legal).toBe(true);
        }
      }
    }
  });
});

describe('attack and block restrictions', () => {
  it('back-row attack: legal from behind the line, fault from in front above the net', () => {
    expect(checkAttack({ isLibero: false, frontRow: false, takeoff: v(4.5, 3.6), ballEntirelyAboveNet: true }).legal).toBe(true);
    expect(checkAttack({ isLibero: false, frontRow: false, takeoff: v(4.5, 2.5), ballEntirelyAboveNet: true }).legal).toBe(false);
    expect(checkAttack({ isLibero: false, frontRow: false, takeoff: v(4.5, 3.0), ballEntirelyAboveNet: true }).legal).toBe(false);
  });
  it('back-row player in the front zone may attack a ball partly below net height', () => {
    expect(checkAttack({ isLibero: false, frontRow: false, takeoff: v(4.5, 1.5), ballEntirelyAboveNet: false }).legal).toBe(true);
  });
  it('front-row player may attack at any height', () => {
    expect(checkAttack({ isLibero: false, frontRow: true, takeoff: v(4.5, 0.5), ballEntirelyAboveNet: true }).legal).toBe(true);
  });
  it('restricts attacks after a libero overhand set in the front zone', () => {
    expect(checkAttack({ isLibero: false, frontRow: true, takeoff: v(1, 1), ballEntirelyAboveNet: true, afterLiberoOverhandInFrontZone: true }).legal).toBe(false);
    expect(checkAttack({ isLibero: false, frontRow: true, takeoff: v(1, 1), ballEntirelyAboveNet: false, afterLiberoOverhandInFrontZone: true }).legal).toBe(true);
  });
  it('back-row players and the libero may not block', () => {
    const team = buildTeam('5-1', 'home');
    for (const o of onCourt(team, 0, false)) {
      expect(checkBlock(team, 0, false, o.playerId).legal).toBe(isFrontZone(o.zone));
    }
    expect(checkBlock(team, 0, false, team.liberoId!).legal).toBe(false);
  });
  it('libero may not attack a ball entirely above the net', () => {
    expect(checkAttack({ isLibero: true, frontRow: false, takeoff: v(4, 6), ballEntirelyAboveNet: true }).legal).toBe(false);
    expect(checkAttack({ isLibero: true, frontRow: false, takeoff: v(4, 6), ballEntirelyAboveNet: false }).legal).toBe(true);
  });
  it('tracks team contacts (block does not count)', () => {
    let st = freshContacts();
    st = checkContact(st, 'a', true).next;
    const r1 = checkContact(st, 'a', false);
    expect(r1.legal).toBe(true);
    const r2 = checkContact(r1.next, 'a', false);
    expect(r2.legal).toBe(false);
    let s2 = freshContacts();
    for (const p of ['a', 'b', 'c']) s2 = checkContact(s2, p, false).next;
    expect(checkContact(s2, 'd', false).legal).toBe(false);
  });
});

describe('libero', () => {
  it('is never in the front row and never serves, in any system or rotation', () => {
    for (const s of SYSTEMS) {
      const team = buildTeam(s, 'home');
      for (const r of ROTS) {
        for (const serving of [true, false]) {
          expect(validateTeamState(team, r, serving, FIVB_2025)).toEqual([]);
        }
      }
    }
  });
  it('replaces the back-row middle while receiving, and is off court while that middle serves', () => {
    const team = buildTeam('5-1', 'home');
    // Rotation 1 (index 0): MB2 in zone 6 → libero in.
    expect(onCourt(team, 0, false).find((o) => o.zone === 6)!.playerId).toBe(team.liberoId);
    // Find a rotation where a middle is in zone 1.
    const r = ROTS.find((x) => team.liberoReplaces.includes(baseIdInZone(team, x, 1)))!;
    expect(onCourt(team, r, true).some((o) => o.playerId === team.liberoId)).toBe(false);
    expect(onCourt(team, r, false).find((o) => o.zone === 1)!.playerId).toBe(team.liberoId);
  });
  it('validates libero replacements', () => {
    const team = buildTeam('5-1', 'home');
    const back = onCourt({ ...team, liberoId: null }, 0, false).find((o) => o.zone === 6)!.playerId;
    const front = onCourt({ ...team, liberoId: null }, 0, false).find((o) => o.zone === 3)!.playerId;
    const st = { replacing: null, lastChangeRally: 0 };
    expect(checkLiberoEnter(team, 0, false, st, back, 1, FIVB_2025).legal).toBe(true);
    expect(checkLiberoEnter(team, 0, false, st, front, 1, FIVB_2025).legal).toBe(false);
    expect(checkLiberoEnter(team, 0, false, st, back, 0, FIVB_2025).legal).toBe(false);
    expect(checkLiberoExit({ replacing: back, lastChangeRally: 1 }, front, 2, FIVB_2025).legal).toBe(false);
    expect(checkLiberoExit({ replacing: back, lastChangeRally: 1 }, back, 2, FIVB_2025).legal).toBe(true);
    expect(checkServeEligibility(team, team.liberoId!, FIVB_2025).legal).toBe(false);
  });
  it('enforces ordinary substitution rules', () => {
    const team = buildTeam('5-1', 'home');
    let r = substitute(team, freshSubs(), 'h-OPP', 'h-DS', FIVB_2025);
    expect(r.legal).toBe(true);
    expect(r.team.lineup).toContain('h-DS');
    const bad = substitute(r.team, r.state, 'h-DS', 'h-L', FIVB_2025);
    expect(bad.legal).toBe(false);
    const wrongReturn = substitute(r.team, r.state, 'h-DS', 'h-OH1', FIVB_2025);
    expect(wrongReturn.legal).toBe(false);
    r = substitute(r.team, r.state, 'h-DS', 'h-OPP', FIVB_2025);
    expect(r.legal).toBe(true);
    expect(r.team.lineup).toEqual(team.lineup);
    expect(substitute(r.team, r.state, 'h-OPP', 'h-DS', FIVB_2025).legal).toBe(false);
  });
});

describe('setter takes the first ball', () => {
  it('assigns an emergency setter and moves the setter out of the second contact', () => {
    const team = buildTeam('5-1', 'home');
    const s = activeSetterId(team, 0);
    const plan = computePlan({ team, rotation: 0, serving: false }, { kind: 'firstContact', contactId: s, quality: 'good', ballAt: v(5, 1.5), source: 'dig' });
    expect(plan.secondContactId).toBeDefined();
    expect(plan.secondContactId).not.toBe(s);
    expect(plan.targets[plan.secondContactId!].pos).toEqual(v(5, 1.5));
    expect(plan.targets[s].duty).toMatch(/Setter took the first ball/);
  });
});

describe('legality is separate from tactics', () => {
  it('legal-but-weak is not marked illegal; illegal is flagged even when tactically close', () => {
    const team = buildTeam('5-1', 'home');
    const world = makeWorld({ systemId: '5-1', ruleset: FIVB_2025, defenseSystem: 'perimeter', difficulty: 'beginner' }, 0, false);
    const sc = buildServeReceive(world, { category: 'serveReceive', title: 't', focusIds: onCourt(team, 0, false).map((o) => o.playerId), coach: true });
    const rec = receiveFormation(team, 0).positions;
    const good = evaluatePlacement({ team, rotation: 0, serving: false, ruleset: FIVB_2025, positions: rec, objective: sc.objective });
    expect(good.verdict).toBe('recommended');
    // Legal but weak: everyone in the formation, but a passer hides deep in a corner.
    const lb = onCourt(team, 0, false).find((o) => o.zone === 5)!.playerId;
    const weakPos = { ...rec, [lb]: v(1.6, 8.8) };
    const weak = evaluatePlacement({ team, rotation: 0, serving: false, ruleset: FIVB_2025, positions: weakPos, objective: sc.objective });
    expect(weak.violations).toEqual([]);
    expect(weak.verdict).toBe('weak');
    // Illegal: middle-back creeps level with middle-front.
    const mb = onCourt(team, 0, false).find((o) => o.zone === 6)!.playerId;
    const mf = onCourt(team, 0, false).find((o) => o.zone === 3)!.playerId;
    const badPos = { ...rec, [mb]: v(rec[mb].x, rec[mf].y - 0.4) };
    const bad = evaluatePlacement({ team, rotation: 0, serving: false, ruleset: FIVB_2025, positions: badPos, objective: sc.objective });
    expect(bad.verdict).toBe('illegal');
    expect(bad.dims.rules).toBe(0);
  });
});

describe('scenario engine consistency', () => {
  const base = (seed: number): GenOptions => ({
    systemId: '5-1',
    focus: { kind: 'role', role: 'OH' },
    difficulty: 'intermediate',
    ruleset: FIVB_2025,
    defenseSystem: 'perimeter',
    rng: makeRng(seed),
  });
  it('generates consistent scenarios for every category, role and system', () => {
    let seed = 1;
    for (const sys of SYSTEMS) {
      for (const role of ['S', 'OH', 'OPP', 'MB', 'L', 'DS'] as const) {
        for (const cat of DRILL_CATEGORIES) {
          for (let k = 0; k < 3; k++) {
            const sc = generate(cat, { ...base(seed++), systemId: sys, focus: { kind: 'role', role } });
            expect(scenarioIsConsistent(sc), `${sys} ${role} ${cat}`).toEqual([]);
          }
        }
      }
    }
  });
  it('coach mode scenarios control all six players', () => {
    for (const cat of ['serveReceive', 'blocking', 'freeBall'] as const) {
      const sc = generate(cat, { ...base(7), focus: { kind: 'all' } });
      if (sc.kind === 'place') expect(sc.objective.controlled.length).toBeGreaterThanOrEqual(5);
    }
  });
  it('rallies always terminate with a winner', () => {
    for (let seed = 1; seed < 60; seed++) {
      const rng = makeRng(seed);
      const run = startRally({ opts: base(seed), focus: { kind: 'role', role: 'S' }, homeServing: seed % 2 === 0, homeRotation: seed % 6, awayRotation: 0 });
      let guard = 0;
      while (!run.result && guard++ < 20) advanceRally(run, 60 + (seed % 40), rng);
      expect(run.result).not.toBeNull();
      for (const st of run.steps) expect(scenarioIsConsistent(st.scenario)).toEqual([]);
    }
  });
  it('scrimmage rotates only on side-out and ends win-by-two', () => {
    let s = newScrimmage(5, false);
    s = recordRally(s, { winner: 'away', reason: '' });
    expect(s.match.rotation.away).toBe(0);
    s = recordRally(s, { winner: 'home', reason: '' });
    expect(s.match.rotation.home).toBe(1);
    expect(s.match.serving).toBe('home');
    for (let i = 0; i < 4; i++) s = recordRally(s, { winner: 'home', reason: '' });
    expect(s.match.score.home).toBe(5);
    expect(s.over).toBe(true);
  });
});
