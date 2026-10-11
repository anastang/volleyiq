import { useState } from 'react';
import { errorSummary, recommendations, rotationMastery, skillPercent } from '../../engine/progress';
import { CATEGORY_INFO, SKILL_LABEL, type SkillKey } from '../../engine/scenarios';
import { SYSTEMS, SYSTEM_ORDER } from '../../engine/systems';
import type { SystemId } from '../../engine/types';
import { Bar, Button, Card, Pill, ScreenHeader, Segmented } from '../components/ui';
import { focusFromRole, ROLE_CHOICES, useStore, type RoleChoice } from '../store';
import { drillConfig } from './sessions';

export function ProgressScreen() {
  const { back, progress, settings, go, resetProgress } = useStore();
  const [sys, setSys] = useState<SystemId>(settings.systemId);
  const [confirm, setConfirm] = useState(false);
  const recs = recommendations(progress);
  const errs = errorSummary(progress);
  const total = progress.attempts.length;
  const avg = total ? Math.round(progress.attempts.reduce((s, a) => s + a.score, 0) / total) : 0;
  const roles: RoleChoice[] = ROLE_CHOICES.map((r) => r.id);
  const catCounts = new Map<string, number>();
  for (const a of progress.attempts) catCounts.set(a.category, (catCounts.get(a.category) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <ScreenHeader title="Progress" subtitle="Every number here comes from challenges you completed" onBack={back} />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="Challenges completed" value={total} />
          <Stat label="Average score" value={total ? `${avg}` : '—'} />
          <Stat label="Lessons completed" value={`${progress.lessonsDone.length}`} />
          <Stat label="Rallies won / played" value={`${progress.rallies.won} / ${progress.rallies.played}`} />
        </div>

        <Card className="p-5">
          <h2 className="font-display mb-3 font-bold text-white">Skills</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {(Object.keys(SKILL_LABEL) as SkillKey[]).map((s) => {
              const v = skillPercent(progress, s);
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-slate-300">{SKILL_LABEL[s]}</span>
                    <span className="font-semibold text-white">{v ? `${v.pct}%` : 'No data yet'}</span>
                  </div>
                  <Bar value={v?.pct ?? 0} tone={v && v.pct >= 80 ? 'emerald' : 'amber'} />
                  {v && <div className="mt-0.5 text-[10px] text-slate-500">last {v.n} attempts</div>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="font-display flex-1 font-bold text-white">Rotation mastery by role</h2>
            <Segmented size="sm" value={sys} onChange={setSys} options={SYSTEM_ORDER.map((s) => ({ value: s, label: SYSTEMS[s].name }))} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-xs">
              <thead>
                <tr className="text-slate-400">
                  <th className="py-1 text-left font-semibold">Role</th>
                  {[1, 2, 3, 4, 5, 6].map((r) => (
                    <th key={r} className="py-1 font-semibold">R{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((role) => {
                  const m = rotationMastery(progress, sys, role);
                  return (
                    <tr key={role} className="border-t border-white/5">
                      <td className="py-1.5 text-slate-300">{ROLE_CHOICES.find((r) => r.id === role)!.label}</td>
                      {m.map((x, i) => (
                        <td key={i} className="py-1.5 text-center">
                          <span className={`inline-block rounded-md px-1.5 py-0.5 ${x === 'Mastered' ? 'bg-emerald-400/20 text-emerald-200' : x === 'Learning' ? 'bg-sky-400/15 text-sky-200' : x === 'Needs Practice' ? 'bg-amber-400/15 text-amber-200' : 'text-slate-600'}`}>{x === 'Not started' ? '·' : x}</span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="p-5">
            <h2 className="font-display mb-2 font-bold text-white">Most frequent positioning errors</h2>
            {errs.length ? (
              <ul className="space-y-2">
                {errs.slice(0, 6).map((e) => (
                  <li key={e.tag} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 text-slate-300">{e.label}</span>
                    <Pill tone="amber">{e.count}×</Pill>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">No recurring errors yet — keep training.</p>
            )}
          </Card>
          <Card className="p-5">
            <h2 className="font-display mb-2 font-bold text-white">Recommended practice</h2>
            {recs.length ? (
              <ul className="space-y-2">
                {recs.map((r) => (
                  <li key={r.title} className="rounded-xl bg-white/4 p-3">
                    <div className="text-sm font-semibold text-white">{r.title}</div>
                    <div className="text-xs text-slate-400">{r.reason}</div>
                    <Button size="sm" className="mt-2" icon="play" onClick={() => go({ name: 'session', config: drillConfig(r.category, 5, focusFromRole(settings.role)), key: Date.now() })}>
                      5 × {CATEGORY_INFO[r.category].name}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-400">Complete a few challenges and recommendations will appear here.</p>
            )}
          </Card>
        </div>

        <Card className="p-5">
          <h2 className="font-display mb-2 font-bold text-white">Practice by category</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORY_INFO).map(([k, v]) => (
              <Pill key={k} tone={catCounts.get(k) ? 'sky' : 'slate'}>{v.name}: {catCounts.get(k) ?? 0}</Pill>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">IQ Challenge best: {progress.iqBest} · Scrimmage sets: {progress.scrimmage.won} won, {progress.scrimmage.lost} lost</p>
        </Card>

        <div className="flex justify-end">
          {confirm ? (
            <div className="flex items-center gap-2 text-sm text-rose-200">
              Reset all training progress?
              <Button variant="danger" size="sm" onClick={() => { resetProgress(); setConfirm(false); }}>Yes, reset</Button>
              <Button size="sm" onClick={() => setConfirm(false)}>Cancel</Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => setConfirm(true)}>Reset progress</Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card className="p-4">
      <div className="font-display text-2xl font-extrabold text-white">{value}</div>
      <div className="text-xs text-slate-400">{label}</div>
    </Card>
  );
}
