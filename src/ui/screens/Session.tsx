import { useMemo, useState } from 'react';
import { makeRng } from '../../engine/rng';
import { CATEGORY_INFO, generate, scenarioIsConsistent, type Scenario } from '../../engine/scenarios';
import { ScenarioPlayer, type StepResult } from '../components/ScenarioPlayer';
import { Bar, Button, Card, Icon, Pill, ScreenHeader } from '../components/ui';
import { useStore, type SessionConfig } from '../store';
import { ERROR_LABEL } from '../../engine/curriculum';

interface Done {
  title: string;
  category: string;
  result: StepResult;
  points?: number;
}

export function roleKey(config: SessionConfig): string {
  const f = config.focus;
  if (!f) return 'ALL';
  return f.kind === 'role' ? f.role : f.kind === 'all' ? 'ALL' : `Z${f.zone}`;
}

export function SessionScreen({ config }: { config: SessionConfig }) {
  const { genOptions, record, back, go, patchProgress, settings, progress } = useStore();
  const [idx, setIdx] = useState(0);
  const [done, setDone] = useState<Done[]>([]);
  const [streak, setStreak] = useState(0);
  const [points, setPoints] = useState(0);
  const [seedBase] = useState(() => Date.now());

  const scenario: Scenario | null = useMemo(() => {
    if (idx >= config.items.length) return null;
    const item = config.items[idx];
    for (let attempt = 0; attempt < 4; attempt++) {
      const opts = genOptions({
        rng: makeRng(seedBase + idx * 101 + attempt),
        focus: item.focus ?? config.focus ?? genOptions().focus,
        rotation: item.rotation,
        difficulty: item.difficulty ?? settings.level,
        defenseSystem: item.defenseSystem ?? settings.defenseSystem,
        systemId: config.systemId ?? settings.systemId,
      });
      const sc = item.make ? item.make(opts) : generate(item.category!, opts);
      if (scenarioIsConsistent(sc).length === 0) return sc;
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx, seedBase]);

  const complete = (r: StepResult) => {
    if (!scenario) return;
    const item = config.items[idx];
    const diffMul = item.difficulty === 'competitive' ? 1.5 : item.difficulty === 'intermediate' ? 1.2 : 1;
    const good = r.score >= 70;
    const newStreak = good ? streak + 1 : 0;
    const pts = config.mode === 'iq' ? Math.round(r.score * diffMul * (1 + Math.min(5, streak) * 0.1)) : undefined;
    setStreak(newStreak);
    if (pts) setPoints((p) => p + pts);
    record({
      t: Date.now(),
      category: scenario.category,
      skills: scenario.skills,
      score: r.score,
      verdict: String(r.verdict),
      systemId: scenario.systemId,
      rotation: scenario.rotation,
      role: roleKey(config),
      errorTags: r.errorTags,
    });
    setDone((d) => [...d, { title: scenario.title, category: CATEGORY_INFO[scenario.category].name, result: r, points: pts }]);
    if (idx + 1 >= config.items.length) {
      if (config.mode === 'lesson' && config.lessonId) patchProgress((p) => ({ ...p, lessonsDone: [...new Set([...p.lessonsDone, config.lessonId!])] }));
      if (config.mode === 'iq') {
        const total = points + (pts ?? 0);
        patchProgress((p) => ({ ...p, iqBest: Math.max(p.iqBest, total) }));
      }
    }
    setIdx((i) => i + 1);
  };

  const finished = idx >= config.items.length;
  const header = (
    <ScreenHeader
      title={config.title}
      subtitle={finished ? 'Session complete' : `${idx + 1} of ${config.items.length}${config.items[idx]?.label ? ' · ' + config.items[idx].label : ''}`}
      onBack={back}
      right={config.mode === 'iq' && !finished ? <Pill tone="amber">⚡ {points} pts · streak {streak}</Pill> : undefined}
    />
  );

  if (finished) {
    const avg = done.length ? Math.round(done.reduce((s, d) => s + d.result.score, 0) / done.length) : 0;
    const errs = new Map<string, number>();
    for (const d of done) for (const t of d.result.errorTags) errs.set(t, (errs.get(t) ?? 0) + 1);
    return (
      <div className="mx-auto max-w-3xl pb-16">
        {header}
        <div className="space-y-4 px-4 sm:px-6">
          <Card className="p-6 text-center">
            <Icon name="trophy" className="mx-auto mb-2 h-10 w-10 text-amber-300" />
            <h2 className="font-display text-2xl font-bold text-white">{avg >= 85 ? 'Excellent court awareness!' : avg >= 65 ? 'Solid work — keep sharpening.' : 'Good practice — the explanations are where the learning is.'}</h2>
            <p className="mt-1 text-slate-400">Average score {avg} / 100{config.mode === 'iq' ? ` · ${points} IQ points (best ${Math.max(progress.iqBest, points)})` : ''}</p>
            <Bar value={avg} className="mx-auto mt-4 max-w-sm" tone={avg >= 70 ? 'emerald' : 'amber'} />
          </Card>
          <Card className="p-4">
            <h3 className="font-display mb-2 font-bold text-white">Round by round</h3>
            <ul className="divide-y divide-white/5">
              {done.map((d, i) => (
                <li key={i} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-6 text-slate-500">{i + 1}</span>
                  <span className="flex-1 text-slate-200">
                    {d.title} <span className="text-xs text-slate-500">· {d.category}</span>
                  </span>
                  <VerdictPill v={String(d.result.verdict)} />
                  <span className="w-10 text-right font-semibold text-white">{d.result.score}</span>
                  {d.points !== undefined && <span className="w-14 text-right text-xs text-amber-300">+{d.points}</span>}
                </li>
              ))}
            </ul>
          </Card>
          {errs.size > 0 && (
            <Card className="p-4">
              <h3 className="font-display mb-2 font-bold text-white">What to work on</h3>
              <div className="flex flex-wrap gap-2">
                {[...errs.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
                  <Pill key={t} tone="amber">{ERROR_LABEL[t] ?? t} ×{n}</Pill>
                ))}
              </div>
            </Card>
          )}
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="primary" icon="refresh" onClick={() => go({ name: 'session', config, key: Date.now() })}>
              Practice again
            </Button>
            {config.mode === 'lesson' && config.lessonId && <Button icon="book" onClick={() => go({ name: 'learn' })}>Curriculum</Button>}
            {config.mode === 'first' && <Button icon="court" onClick={() => go({ name: 'explorer' })}>Explore the court</Button>}
            <Button icon="chart" onClick={() => go({ name: 'progress' })}>Progress</Button>
            <Button variant="ghost" onClick={() => go({ name: 'home' })}>Home</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl pb-16">
      {header}
      <div className="px-4 sm:px-6">
        <div className="mb-3 flex gap-1">
          {config.items.map((_, i) => (
            <div key={i} className={`h-1 flex-1 rounded-full ${i < idx ? (done[i]?.result.score >= 70 ? 'bg-emerald-400' : 'bg-amber-400') : i === idx ? 'bg-white/60' : 'bg-white/10'}`} />
          ))}
        </div>
        {config.subtitle && idx === 0 && <p className="mb-3 rounded-xl bg-white/5 p-3 text-sm text-slate-300 ring-1 ring-white/8">{config.subtitle}</p>}
        {scenario ? (
          <ScenarioPlayer key={scenario.id} scenario={scenario} onComplete={complete} difficulty={config.items[idx].difficulty} nextLabel={idx + 1 >= config.items.length ? 'Finish' : 'Next scenario'} />
        ) : (
          <Card className="p-6 text-center text-slate-300">
            This situation could not be generated consistently for your current lineup, so it was skipped.
            <div className="mt-3">
              <Button onClick={() => setIdx((i) => i + 1)}>Continue</Button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

export function VerdictPill({ v }: { v: string }) {
  const map: Record<string, [string, 'emerald' | 'sky' | 'amber' | 'rose']> = {
    recommended: ['Recommended', 'emerald'],
    best: ['Best', 'emerald'],
    acceptable: ['Acceptable', 'sky'],
    ok: ['Defensible', 'sky'],
    weak: ['Weak', 'amber'],
    wrong: ['Missed', 'amber'],
    illegal: ['Illegal', 'rose'],
  };
  const [label, tone] = map[v] ?? [v, 'amber'];
  return <Pill tone={tone}>{label}</Pill>;
}
