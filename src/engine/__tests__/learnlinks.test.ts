import { describe, expect, it } from 'vitest';
import { CURRICULUM } from '../curriculum';
import { evaluatePlacement } from '../evaluate';
import { toWorld, v } from '../geometry';
import { receiveFormation } from '../systems';
import { makeRng } from '../rng';
import { FIVB_2025 } from '../rulesets';
import { buildRelease, buildServeReceive, DRILL_CATEGORIES, generate, makeWorld, onCourtIds, resolveFocus, type GenOptions } from '../scenarios';
import { learnLinkFor } from '../../ui/learnLinks';

const opts = (seed: number, role: 'S' | 'OH' | 'MB' | 'OPP' | 'L'): GenOptions => ({
  systemId: '5-1',
  focus: { kind: 'role', role },
  difficulty: 'beginner',
  ruleset: FIVB_2025,
  defenseSystem: 'perimeter',
  rng: makeRng(seed),
});

const cardExists = (lessonId: string, cardId: string) =>
  CURRICULUM.flatMap((l) => l.lessons).some((l) => l.id === lessonId && l.cards.some((c) => c.id === cardId));

describe('simulator → Learn links', () => {
  it('a middle blocker standing in a passing spot links to “who passes”', () => {
    const world = makeWorld(opts(1, 'MB'), 0, false);
    const ids = resolveFocus(world, { kind: 'role', role: 'MB' }).ids;
    const sc = buildServeReceive(world, { category: 'serveReceive', title: 't', focusIds: ids });
    const positions = { ...sc.scene.home.positions, ...sc.start, [ids[0]]: v(3.0, 5.0) };
    const ev = evaluatePlacement({ team: world.home.team, rotation: 0, serving: false, ruleset: FIVB_2025, positions, objective: sc.objective });
    expect(ev.violations).toEqual([]);
    expect(ev.verdict).toBe('weak');
    const l = learnLinkFor(sc, ev, ids[0]);
    expect(l?.cardId).toBe('who-passes');
  });

  it('every wrong move in every place scenario links to a lesson card that exists', () => {
    let seed = 1;
    let checked = 0;
    for (const role of ['S', 'OH', 'MB', 'OPP', 'L'] as const) {
      for (const cat of DRILL_CATEGORIES) {
        for (let k = 0; k < 2; k++) {
          const sc = generate(cat, opts(seed++, role));
          if (sc.kind !== 'place') continue;
          const me = sc.objective.controlled[0];
          if (!me) continue;
          const positions = { ...sc.scene.home.positions, ...sc.start, [me]: v(0.5, 8.6) };
          const ev = evaluatePlacement({ team: sc.scene.home.team, rotation: sc.scene.home.rotation, serving: sc.scene.home.serving, ruleset: FIVB_2025, positions, objective: sc.objective });
          const l = learnLinkFor(sc, ev, me);
          expect(l, `${role} ${cat}`).not.toBeNull();
          expect(cardExists(l!.lessonId, l!.cardId)).toBe(true);
          checked++;
        }
      }
    }
    expect(checked).toBeGreaterThan(50);
  });
});

describe('ball-contact markers', () => {
  it('always point at a player who is on court for that team', () => {
    let seed = 100;
    for (const role of ['S', 'OH', 'MB', 'L'] as const) {
      for (const cat of DRILL_CATEGORIES) {
        const sc = generate(cat, opts(seed++, role));
        for (const c of sc.scene.contacts ?? []) {
          const side = c.side === 'home' ? sc.scene.home : sc.scene.away;
          expect(onCourtIds(side), `${cat} ${c.label}`).toContain(c.id);
        }
      }
    }
  });
  it('the release step marks the same passer the serve is flying to', () => {
    for (let r = 0; r < 6; r++) {
      const world = makeWorld(opts(3, 'S'), r, false);
      for (const passer of receiveFormation(world.home.team, r).passers) {
        const sc = buildRelease(world, { category: 'release', title: 't', focusIds: [] }, passer);
        expect(sc.scene.contacts?.find((c) => c.label === 'Receiving')?.id).toBe(passer);
        const landing = toWorld('home', receiveFormation(world.home.team, r).positions[passer]);
        expect(sc.after!.ball.at(-1)!.to).toEqual(landing);
      }
    }
  });
});
