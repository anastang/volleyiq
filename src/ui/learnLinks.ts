import { CURRICULUM } from '../engine/curriculum';
import type { Evaluation } from '../engine/evaluate';
import type { PlaceScenario } from '../engine/scenarios';
import { setterZone } from '../engine/systems';

export interface LearnLink {
  lessonId: string;
  cardId: string;
  /** The lesson card's title, for the button label. */
  title: string;
}

function link(lessonId: string, cardId: string): LearnLink | null {
  const lesson = CURRICULUM.flatMap((l) => l.lessons).find((l) => l.id === lessonId);
  const card = lesson?.cards.find((c) => c.id === cardId);
  return lesson && card ? { lessonId, cardId, title: card.title } : null;
}

const ROTATION_CARD: Record<number, string> = { 1: 'r1', 6: 'r2', 5: 'r3', 4: 'r4', 3: 'r56', 2: 'r56' };

/**
 * Pick the lesson card that explains why a placement was wrong (or right).
 * Rule violations take priority; otherwise the player's duty in this moment
 * decides which idea they need.
 */
export function learnLinkFor(sc: PlaceScenario, ev: Evaluation, playerId?: string): LearnLink | null {
  // 1. Rules first.
  if (ev.errorTags.includes('backRowBlock') || ev.errorTags.includes('liberoBlock')) return link('l7-block', 'who-can-block');
  const v = ev.violations[0];
  if (v) {
    if (v.kind === 'frontBack') return link('l4-overlap', 'front-back');
    if (v.kind === 'leftRight') return link('l4-overlap', 'same-row');
    if (v.kind === 'outOfCourt') return link('l4-overlap', 'which-team');
  }

  // 2. The duty of the player in question.
  const res = (playerId ? ev.perPlayer.find((p) => p.playerId === playerId) : undefined) ?? ev.perPlayer.find((p) => p.verdict === 'weak') ?? ev.perPlayer[0];
  const duty = res?.target.duty ?? '';
  const team = sc.scene.home.team;

  // Serving team
  if (/^Start near your|Stay in rotational order/.test(duty)) return link('l4-overlap', 'which-team');
  if (/^Base defence/.test(duty)) return link('l7-base', 'base');

  // Serve receive (before the serve)
  if (sc.objective.legality === 'receivingFormation') {
    if (/setter/i.test(duty)) return link('l3-tour', ROTATION_CARD[setterZone(team, sc.rotation)] ?? 'read-rotation');
    if (/Non-passer/.test(duty)) return link('l5-passing', 'who-passes');
    if (/passer/i.test(duty)) return link('l5-passing', 'lanes');
  }

  // Release after service contact
  if (/Release to the target/.test(duty)) return link('l5-release', 'setter-release');
  if (/Hold your passing area/.test(duty)) return link('l5-passing', 'seams');
  if (/Switch to your|Move to your base position/.test(duty)) return link('l5-release', 'non-passers-move');

  // First contact / transition
  if (/Setter took the first ball|Emergency setter/.test(duty)) return link('l8-transition', 'setter-digs');
  if (/^Pass, then/.test(duty)) return link('l5-firstball', 'after-pass');
  if (/second ball/.test(duty)) return link('l6-offence', 'in-system');
  if (/no quick|Get ready to cover/.test(duty)) return link('l5-firstball', 'teammate-passes');
  if (/approach/.test(duty)) return link('l6-offence', 'approach');
  if (/Transition to coverage/.test(duty)) return link('l6-coverage', 'why-cover');

  // Attack coverage
  if (/Tight coverage|Deep coverage/.test(duty)) return link('l6-coverage', 'cup');

  // Blocking and defence
  if (/Outside blocker|Close the block|lead the block|Read-block|Close to the middle/.test(duty)) return link('l7-block', 'who-blocks');
  if (/Off-blocker|Pinch off the net/.test(duty)) return link('l7-block', 'off-blocker');
  if (/Rotate up|Rotate to deep|Deep cross \/ middle/.test(duty)) return link('l7-systems', 'rotational');
  if (/Rover|Deep cross corner|Deep line corner/.test(duty)) return link('l7-systems', 'middle-up');
  if (/digger|Deep middle/.test(duty)) return link('l7-dig', 'shadow');

  // Tips and free balls
  if (/Tip is yours/.test(duty)) return link('l7-tips', 'spot-tip');
  if (/Close in and support|Land and transition|Release to set the dig/.test(duty)) return link('l7-tips', 'tip-who');
  if (/Free-ball passer|Drop off the net|Release — free ball/.test(duty)) return link('l8-free', 'free-ball');

  // Fallback by category.
  const byCat: Partial<Record<PlaceScenario['category'], [string, string]>> = {
    serveReceive: ['l4-stacking', 'stacking'],
    release: ['l4-stacking', 'switching'],
    attacking: ['l6-coverage', 'cup'],
    blocking: ['l7-block', 'who-blocks'],
    spikeDefense: ['l7-dig', 'shadow'],
    tip: ['l7-tips', 'tip-who'],
    freeBall: ['l8-free', 'free-ball'],
    transition: ['l8-transition', 'transition'],
  };
  const f = byCat[sc.category];
  return f ? link(f[0], f[1]) : null;
}
