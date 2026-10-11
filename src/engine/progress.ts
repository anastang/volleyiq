import { ERROR_LABEL, MISTAKES } from './curriculum';
import { CATEGORY_INFO, SKILL_LABEL, type Category, type SkillKey } from './scenarios';
import type { SystemId } from './types';

export interface AttemptRecord {
  t: number;
  category: Category;
  skills: SkillKey[];
  score: number;
  verdict: string;
  systemId: SystemId;
  rotation: number;
  role: string;
  errorTags: string[];
}

export interface Progress {
  attempts: AttemptRecord[];
  lessonsDone: string[];
  iqBest: number;
  scrimmage: { won: number; lost: number };
  rallies: { played: number; won: number };
}

export const emptyProgress = (): Progress => ({ attempts: [], lessonsDone: [], iqBest: 0, scrimmage: { won: 0, lost: 0 }, rallies: { played: 0, won: 0 } });

export function addAttempt(p: Progress, a: AttemptRecord): Progress {
  return { ...p, attempts: [...p.attempts, a].slice(-3000) };
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Skill percentage from the most recent 30 attempts touching that skill (null = no data yet). */
export function skillPercent(p: Progress, skill: SkillKey): { pct: number; n: number } | null {
  const xs = p.attempts.filter((a) => a.skills.includes(skill)).slice(-30);
  if (!xs.length) return null;
  return { pct: Math.round(avg(xs.map((a) => a.score))), n: xs.length };
}

export type Mastery = 'Mastered' | 'Learning' | 'Needs Practice' | 'Not started';

export function rotationMastery(p: Progress, systemId: SystemId, role: string): Mastery[] {
  return [0, 1, 2, 3, 4, 5].map((r) => {
    const xs = p.attempts.filter((a) => a.systemId === systemId && a.role === role && a.rotation === r).slice(-10);
    if (!xs.length) return 'Not started';
    const m = avg(xs.map((a) => a.score));
    if (xs.length >= 3 && m >= 85) return 'Mastered';
    if (m >= 60) return 'Learning';
    return 'Needs Practice';
  });
}

export function errorSummary(p: Progress): { tag: string; label: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const a of p.attempts.slice(-200)) for (const t of a.errorTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, label: ERROR_LABEL[tag] ?? tag, count }))
    .sort((a, b) => b.count - a.count);
}

export interface Recommendation {
  title: string;
  reason: string;
  category: Category;
}

const SKILL_TO_CATEGORY: Record<SkillKey, Category> = {
  rotation: 'fundamentals',
  rules: 'rules',
  serveReceive: 'serveReceive',
  offense: 'setting',
  coverage: 'attacking',
  defense: 'spikeDefense',
  transition: 'transition',
  reading: 'reading',
};

export function recommendations(p: Progress): Recommendation[] {
  const recs: Recommendation[] = [];
  const skills = (Object.keys(SKILL_LABEL) as SkillKey[])
    .map((s) => ({ s, v: skillPercent(p, s) }))
    .filter((x) => x.v && x.v.n >= 2)
    .sort((a, b) => a.v!.pct - b.v!.pct);
  for (const { s, v } of skills.slice(0, 2)) {
    if (v!.pct >= 85) continue;
    const cat = SKILL_TO_CATEGORY[s];
    recs.push({ title: `Practise ${CATEGORY_INFO[cat].name}`, reason: `${SKILL_LABEL[s]} is at ${v!.pct}% over your last ${v!.n} attempts.`, category: cat });
  }
  const errs = errorSummary(p);
  for (const e of errs.slice(0, 2)) {
    const m = MISTAKES.find((x) => x.tag === e.tag);
    if (m && !recs.some((r) => r.category === m.practice)) recs.push({ title: m.title, reason: `Seen ${e.count}× recently: ${m.fix}`, category: m.practice });
  }
  if (!recs.length) {
    const untried = (Object.keys(CATEGORY_INFO) as Category[]).find((c) => !p.attempts.some((a) => a.category === c));
    if (untried) recs.push({ title: `Try ${CATEGORY_INFO[untried].name}`, reason: 'You have not practised this category yet.', category: untried });
  }
  return recs;
}

const KEY = 'volleyiq.progress.v1';

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyProgress();
    return { ...emptyProgress(), ...JSON.parse(raw) };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(p: Progress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}
