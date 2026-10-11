import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { addAttempt, emptyProgress, loadProgress, saveProgress, type AttemptRecord, type Progress } from '../engine/progress';
import { getRuleset, type Ruleset } from '../engine/rulesets';
import { makeRng } from '../engine/rng';
import type { Category, Focus, GenOptions } from '../engine/scenarios';
import type { RosterOverride } from '../engine/systems';
import type { DefenseSystemId, Difficulty, Role, SystemId } from '../engine/types';
import type { Zone } from '../engine/geometry';

export type RoleChoice = Role | 'ALL';

export interface Settings {
  onboarded: boolean;
  level: Difficulty;
  role: RoleChoice;
  systemId: SystemId;
  defenseSystem: DefenseSystemId;
  rulesetId: string;
  motion: 'system' | 'reduced' | 'full';
  speed: number;
  showZones: 'auto' | 'on' | 'off';
  view: 'full' | 'half';
  /** Player labels: plain words (Setter, Outside…) or short codes (S, OH…). */
  labels: 'words' | 'short';
  /** Show rotational position numbers on player markers. */
  zoneBadges: boolean;
  roster: Record<string, RosterOverride>;
  /** Slot keys ('S' | 'S2') naming the setter for each rotation of the custom system. */
  customSetters: string[];
}

const DEFAULTS: Settings = {
  onboarded: false,
  level: 'beginner',
  role: 'ALL',
  systemId: '5-1',
  defenseSystem: 'perimeter',
  rulesetId: 'fivb-2025',
  motion: 'system',
  speed: 1,
  showZones: 'auto',
  view: 'full',
  labels: 'words',
  zoneBadges: true,
  roster: {},
  customSetters: ['S', 'S', 'S', 'S2', 'S2', 'S2'],
};

const SKEY = 'volleyiq.settings.v1';

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(SKEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export interface SessionItem {
  category?: Category;
  focus?: Focus;
  rotation?: number;
  difficulty?: Difficulty;
  defenseSystem?: DefenseSystemId;
  /** Custom builder (used by Rotation Trainer / first lesson). */
  make?: (opts: GenOptions) => import('../engine/scenarios').Scenario;
  label?: string;
}

export interface SessionConfig {
  title: string;
  subtitle?: string;
  items: SessionItem[];
  mode: 'drill' | 'mastery' | 'iq' | 'rotation' | 'lesson' | 'coach' | 'mistake' | 'first';
  lessonId?: string;
  focus?: Focus;
  systemId?: SystemId;
}

export type Screen =
  | { name: 'welcome' }
  | { name: 'setup' }
  | { name: 'home' }
  | { name: 'learn' }
  | { name: 'lesson'; id: string }
  | { name: 'session'; config: SessionConfig; key: number }
  | { name: 'rotation' }
  | { name: 'mastery' }
  | { name: 'drills' }
  | { name: 'iq' }
  | { name: 'rally'; scripted?: boolean; key: number }
  | { name: 'scrimmage'; key: number }
  | { name: 'game'; key: number }
  | { name: 'explorer'; zone?: Zone }
  | { name: 'coach' }
  | { name: 'compare' }
  | { name: 'defense' }
  | { name: 'mistakes' }
  | { name: 'progress' }
  | { name: 'settings' };

interface Store {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  progress: Progress;
  record: (a: AttemptRecord) => void;
  patchProgress: (fn: (p: Progress) => Progress) => void;
  resetProgress: () => void;
  screen: Screen;
  go: (s: Screen) => void;
  back: () => void;
  ruleset: Ruleset;
  reduced: boolean;
  genOptions: (over?: Partial<GenOptions>) => GenOptions;
  defaultFocus: Focus;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [progress, setProgress] = useState<Progress>(loadProgress);
  const [stack, setStack] = useState<Screen[]>(() => [settings.onboarded ? { name: 'home' } : { name: 'welcome' }]);
  const [sysReduced, setSysReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const h = () => setSysReduced(mq.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SKEY, JSON.stringify(settings));
    } catch {
      /* ignore */
    }
  }, [settings]);
  useEffect(() => saveProgress(progress), [progress]);

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), []);
  const record = useCallback((a: AttemptRecord) => setProgress((p) => addAttempt(p, a)), []);
  const patchProgress = useCallback((fn: (p: Progress) => Progress) => setProgress(fn), []);
  const resetProgress = useCallback(() => setProgress(emptyProgress()), []);
  const go = useCallback((s: Screen) => {
    setStack((st) => (s.name === 'home' ? [s] : [...st, s]));
    window.scrollTo?.({ top: 0 });
  }, []);
  const back = useCallback(() => setStack((st) => (st.length > 1 ? st.slice(0, -1) : [{ name: 'home' }])), []);

  const ruleset = getRuleset(settings.rulesetId);
  const reduced = settings.motion === 'reduced' || (settings.motion === 'system' && sysReduced);
  const defaultFocus: Focus = settings.role === 'ALL' ? { kind: 'role', role: 'S' } : { kind: 'role', role: settings.role };

  const genOptions = useCallback(
    (over: Partial<GenOptions> = {}): GenOptions => ({
      systemId: settings.systemId,
      focus: defaultFocus,
      difficulty: settings.level,
      ruleset,
      defenseSystem: settings.defenseSystem,
      roster: settings.roster,
      customSetters: settings.customSetters,
      rng: makeRng(),
      ...over,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, ruleset],
  );

  const value = useMemo<Store>(
    () => ({
      settings,
      update,
      progress,
      record,
      patchProgress,
      resetProgress,
      screen: stack[stack.length - 1],
      go,
      back,
      ruleset,
      reduced,
      genOptions,
      defaultFocus,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [settings, progress, stack, ruleset, reduced, genOptions],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

export const ROLE_CHOICES: { id: RoleChoice; label: string; blurb: string }[] = [
  { id: 'S', label: 'Setter', blurb: 'Run the offence from every zone' },
  { id: 'OH', label: 'Outside Hitter', blurb: 'Pass, attack left, play all the way around' },
  { id: 'OPP', label: 'Opposite', blurb: 'Right-side attack and block' },
  { id: 'MB', label: 'Middle Blocker', blurb: 'Block, quick attacks, transitions' },
  { id: 'L', label: 'Libero', blurb: 'Back-row passing and defence' },
  { id: 'DS', label: 'Defensive Specialist', blurb: 'Back-row sub for passing & defence' },
  { id: 'ALL', label: 'Not sure / All positions', blurb: 'Learn the whole team' },
];

export function focusFromRole(r: RoleChoice): Focus {
  return r === 'ALL' ? { kind: 'all' } : { kind: 'role', role: r };
}

export function zonesVisible(s: Settings): boolean {
  if (s.showZones === 'on') return true;
  if (s.showZones === 'off') return false;
  return s.level === 'beginner';
}
