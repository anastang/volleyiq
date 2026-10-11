import { MISTAKES, CURRICULUM } from '../../engine/curriculum';
import { onCourt } from '../../engine/rotation';
import {
  buildFirstContact,
  buildRelease,
  buildServePre,
  buildServeReceive,
  buildTapZone,
  chooseWorld,
  CATEGORY_INFO,
  ROLE_CURRICULUM,
  type Category,
  type Focus,
  type GenOptions,
  type Scenario,
} from '../../engine/scenarios';
import { receiveFormation, SYSTEMS } from '../../engine/systems';
import { FIVB_2025 } from '../../engine/rulesets';
import { makeRng } from '../../engine/rng';
import { ROLE_INFO, type SystemId } from '../../engine/types';
import type { RoleChoice, SessionConfig, SessionItem } from '../store';

type FixedKind = 'identify' | 'receive' | 'release' | 'response' | 'servePre';

export function fixedItem(kind: FixedKind, rotation: number, focus: Focus, label?: string): SessionItem {
  return {
    rotation,
    focus,
    label,
    make: (o: GenOptions): Scenario => {
      const opts = { ...o, rotation, focus };
      const coach = focus.kind === 'all';
      const w = chooseWorld(opts, kind === 'servePre');
      const b = (category: Category, title: string) => ({ category, title, focusIds: w.ids, focusNote: w.note, coach });
      switch (kind) {
        case 'identify':
          return buildTapZone(w.world, b('fundamentals', 'Identify the rotation'), o.rng, 1);
        case 'receive':
          return buildServeReceive(w.world, b('serveReceive', `Arrange: Rotation ${rotation + 1}`));
        case 'release':
          return buildRelease(w.world, b('release', 'Service contact: transition'));
        case 'servePre':
          return buildServePre(w.world, b('serving', 'Serving-team positioning'));
        case 'response': {
          const f = receiveFormation(w.world.home.team, rotation);
          const mine = f.passers.find((id) => w.ids.includes(id));
          const youPass = mine && !coach && o.rng.chance(0.5);
          const contact = youPass ? mine! : o.rng.pick(f.passers.filter((id) => !w.ids.includes(id) || coach));
          return buildFirstContact(w.world, b(youPass ? 'receiveYou' : 'someoneElse', youPass ? 'You receive the serve' : 'A teammate receives'), {
            contactId: contact,
            quality: o.rng.pick(['perfect', 'good', 'off'] as const),
            source: 'serve',
          });
        }
      }
    },
  };
}

export function roleFocus(role: RoleChoice): Focus {
  return role === 'ALL' ? { kind: 'role', role: 'S' } : { kind: 'role', role };
}

function startZone(systemId: SystemId, focus: Focus): number | string {
  const w = chooseWorld({ systemId, rotation: 0, focus, difficulty: 'beginner', ruleset: FIVB_2025, defenseSystem: 'perimeter', rng: makeRng(1) }, false);
  return onCourt(w.world.home.team, 0, false).find((o) => o.playerId === w.ids[0])?.zone ?? '?';
}

export function firstLessonConfig(role: RoleChoice, systemId: SystemId): SessionConfig {
  const focus = roleFocus(role);
  const roleName = role === 'ALL' ? 'setter' : ROLE_INFO[role].name.toLowerCase();
  return {
    title: 'Your first lesson',
    subtitle: `You’re playing ${roleName} in a ${SYSTEMS[systemId].name} offence. Your team is receiving serve, and you’re currently in Position ${startZone(systemId, focus)}. First find your legal pre-serve spot, then move after service contact.`,
    mode: 'first',
    systemId,
    focus,
    items: [fixedItem('receive', 0, focus, 'Before the serve'), fixedItem('release', 0, focus, 'After service contact'), fixedItem('response', 0, focus, 'First contact')],
  };
}

export function rotationTrainerConfig(systemId: SystemId, focus: Focus, rotations: number[], includeServing: boolean): SessionConfig {
  const items: SessionItem[] = [];
  for (const r of rotations) {
    items.push(fixedItem('identify', r, focus, `R${r + 1} · identify`));
    items.push(fixedItem('receive', r, focus, `R${r + 1} · arrange & service contact`));
    items.push(fixedItem('release', r, focus, `R${r + 1} · release`));
    items.push(fixedItem('response', r, focus, `R${r + 1} · first contact`));
    if (includeServing) items.push(fixedItem('servePre', r, focus, `R${r + 1} · serving`));
  }
  return {
    title: `Rotation Trainer · ${SYSTEMS[systemId].name}`,
    subtitle: rotations.length === 6 ? 'All six rotations in order' : rotations.length === 1 ? `Rotation ${rotations[0] + 1}` : 'Randomised rotations',
    mode: 'rotation',
    systemId,
    focus,
    items,
  };
}

export function masteryConfig(role: RoleChoice): SessionConfig {
  const cats = ROLE_CURRICULUM[role === 'ALL' ? 'ALL' : role];
  const focus: Focus = role === 'ALL' ? { kind: 'all' } : { kind: 'role', role };
  return {
    title: `${role === 'ALL' ? 'All Positions' : ROLE_INFO[role].name} Mastery`,
    subtitle: 'Realistic situations for this role across rotations.',
    mode: 'mastery',
    focus,
    items: cats.map((category) => ({ category, focus })),
  };
}

export function drillConfig(category: Category, count: number, focus: Focus): SessionConfig {
  return {
    title: CATEGORY_INFO[category].name,
    subtitle: `${count} scenarios · ${CATEGORY_INFO[category].blurb}`,
    mode: 'drill',
    focus,
    items: Array.from({ length: count }, () => ({ category, focus })),
  };
}

export function mixedDrillConfig(categories: Category[], count: number, focus: Focus): SessionConfig {
  return {
    title: 'Practice Randomizer',
    subtitle: `${count} unexpected situations from real rally patterns`,
    mode: 'drill',
    focus,
    items: Array.from({ length: count }, (_, i) => ({ category: categories[(i * 7 + Math.floor(Math.random() * categories.length)) % categories.length], focus })),
  };
}

const IQ_POOL: Category[] = ['reading', 'rules', 'serveReceive', 'release', 'someoneElse', 'setting', 'attacking', 'blocking', 'tip', 'spikeDefense', 'transition', 'brokenPlay', 'freeBall', 'fundamentals'];

export function iqConfig(focus: Focus): SessionConfig {
  const items: SessionItem[] = Array.from({ length: 12 }, (_, i) => ({
    category: IQ_POOL[Math.floor(Math.random() * IQ_POOL.length)],
    focus,
    difficulty: i < 4 ? 'beginner' : i < 8 ? 'intermediate' : 'competitive',
  }));
  return { title: 'Volleyball IQ Challenge', subtitle: '12 rounds · gets harder as you go', mode: 'iq', focus, items };
}

export function lessonConfig(lessonId: string, focus: Focus): SessionConfig {
  const lesson = CURRICULUM.flatMap((l) => l.lessons).find((l) => l.id === lessonId)!;
  return {
    title: lesson.title,
    subtitle: `Practice · ${lesson.summary}`,
    mode: 'lesson',
    lessonId,
    focus,
    items: Array.from({ length: lesson.practice.count }, () => ({ category: lesson.practice.category, focus })),
  };
}

export function mistakeConfig(mistakeId: string, fallback: Focus): SessionConfig {
  const m = MISTAKES.find((x) => x.id === mistakeId)!;
  const focus: Focus = m.role ? { kind: 'role', role: m.role } : fallback;
  return { title: m.title, subtitle: m.fix, mode: 'mistake', focus, items: Array.from({ length: 5 }, () => ({ category: m.practice, focus })) };
}

export const COACH_CATEGORIES: Category[] = ['serveReceive', 'serving', 'freeBall', 'blocking', 'spikeDefense', 'attacking', 'transition'];

export function coachConfig(category: Category | 'mixed', count: number, rotation?: number): SessionConfig {
  const focus: Focus = { kind: 'all' };
  return {
    title: 'Coach Mode',
    subtitle: 'Position all six players — graded on legality, coverage and team coordination.',
    mode: 'coach',
    focus,
    items: Array.from({ length: count }, (_, i) => ({ category: category === 'mixed' ? COACH_CATEGORIES[i % COACH_CATEGORIES.length] : category, focus, rotation })),
  };
}

/** Text describing where the focus player starts (for session intros). */
export function focusIntro(o: GenOptions, rotation: number): string {
  const w = chooseWorld({ ...o, rotation }, false);
  const oc = onCourt(w.world.home.team, rotation, false);
  const z = oc.find((x) => x.playerId === w.ids[0])?.zone;
  return z ? `You’re currently in Position ${z}.` : '';
}
