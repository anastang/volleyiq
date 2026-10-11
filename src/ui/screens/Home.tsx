import { useState } from 'react';
import { recommendations, skillPercent } from '../../engine/progress';
import { SKILL_LABEL, type SkillKey } from '../../engine/scenarios';
import { SYSTEMS } from '../../engine/systems';
import { ROLE_INFO } from '../../engine/types';
import { Bar, Card, Icon } from '../components/ui';
import { useStore, focusFromRole } from '../store';
import { drillConfig } from './sessions';

export function Home() {
  const { go, settings, progress } = useStore();
  const [more, setMore] = useState(false);
  const recs = recommendations(progress);
  const role = settings.role === 'ALL' ? 'All positions' : ROLE_INFO[settings.role].name;
  const focus = focusFromRole(settings.role);

  const main = [
    { id: 'learn', title: 'Learn', blurb: 'Step-by-step lessons', icon: 'book', onClick: () => go({ name: 'learn' }) },
    { id: 'mastery', title: 'Practise my position', blurb: `Situations for your ${settings.role === 'ALL' ? 'team' : role.toLowerCase()}`, icon: 'target', onClick: () => go({ name: 'mastery' }) },
    { id: 'rotation', title: 'Rotations', blurb: 'Walk through all six', icon: 'rotate', onClick: () => go({ name: 'rotation' }) },
  ];
  const others = [
    { title: 'Explore the court', blurb: 'Move anyone, nothing graded', icon: 'court', go: () => go({ name: 'explorer' }) },
    { title: 'Situational drills', blurb: 'Pick a topic, 5–20 scenarios', icon: 'list', go: () => go({ name: 'drills' }) },
    { title: 'Full rally (guided)', blurb: 'Slow, step-by-step rally', icon: 'ball', go: () => go({ name: 'rally', key: Date.now() }) },
    { title: 'Volleyball IQ', blurb: 'Quick-fire quiz rounds', icon: 'zap', go: () => go({ name: 'iq' }) },
    { title: 'Coach mode', blurb: 'Place all six players', icon: 'users', go: () => go({ name: 'coach' }) },
    { title: 'Scrimmage (detailed)', blurb: 'Full feedback every pause', icon: 'trophy', go: () => go({ name: 'scrimmage', key: Date.now() }) },
    { title: 'Defensive systems', blurb: 'Perimeter, rotational, rover', icon: 'shield', go: () => go({ name: 'defense' }) },
    { title: 'Compare systems', blurb: '5–1 vs 6–2 vs 4–2', icon: 'compare', go: () => go({ name: 'compare' }) },
    { title: 'Common mistakes', blurb: 'Quick fixes', icon: 'alert', go: () => go({ name: 'mistakes' }) },
  ];
  const skills: SkillKey[] = ['rotation', 'serveReceive', 'defense', 'transition'];

  return (
    <div className="mx-auto max-w-3xl px-4 pt-5 pb-16 sm:px-6">
      <header className="mb-6 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-lg shadow-orange-500/30">
          <Icon name="ball" className="h-6 w-6" />
        </span>
        <div className="flex-1">
          <div className="font-display text-xl font-extrabold text-white">VolleyIQ</div>
          <div className="text-xs text-slate-400">
            {role} · {SYSTEMS[settings.systemId].name}
          </div>
        </div>
        <button onClick={() => go({ name: 'progress' })} className="grid h-10 w-10 place-items-center rounded-xl bg-white/6 ring-1 ring-white/10 hover:bg-white/12" aria-label="Progress">
          <Icon name="chart" />
        </button>
        <button onClick={() => go({ name: 'settings' })} className="grid h-10 w-10 place-items-center rounded-xl bg-white/6 ring-1 ring-white/10 hover:bg-white/12" aria-label="Settings">
          <Icon name="settings" />
        </button>
      </header>

      <Card onClick={() => go({ name: 'game', key: Date.now() })} className="relative mb-4 w-full overflow-hidden bg-gradient-to-br from-amber-400/25 via-orange-500/10 to-slate-900/70 p-6">
        <Icon name="trophy" className="absolute -right-4 -bottom-4 h-32 w-32 text-white/5" />
        <div className="text-xs font-bold tracking-wider text-amber-300 uppercase">Play</div>
        <div className="font-display mt-1 text-2xl font-extrabold text-white">Game Simulator</div>
        <div className="mt-1 max-w-sm text-sm text-slate-300">Play a match as your {settings.role === 'ALL' ? 'chosen player' : role.toLowerCase()}. The rally flows; you make the moves.</div>
        <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2 text-sm font-bold text-slate-950">
          <Icon name="play" className="h-4 w-4" /> Play now
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {main.map((m) => (
          <Card key={m.id} onClick={m.onClick} className="p-4">
            <Icon name={m.icon} className="mb-3 h-6 w-6 text-amber-300" />
            <div className="font-display text-sm font-bold text-white sm:text-base">{m.title}</div>
            <div className="mt-0.5 hidden text-xs text-slate-400 sm:block">{m.blurb}</div>
          </Card>
        ))}
      </div>

      {recs[0] && (
        <Card onClick={() => go({ name: 'session', config: drillConfig(recs[0].category, 5, focus), key: Date.now() })} className="mt-4 flex w-full items-center gap-3 p-4">
          <Icon name="spark" className="h-6 w-6 shrink-0 text-amber-300" />
          <div className="flex-1">
            <div className="text-sm font-semibold text-white">Suggested: {recs[0].title}</div>
            <div className="text-xs text-slate-400">{recs[0].reason}</div>
          </div>
          <Icon name="right" className="h-5 w-5 text-slate-500" />
        </Card>
      )}

      <button onClick={() => setMore((x) => !x)} className="mt-5 flex w-full items-center justify-between rounded-xl px-1 py-2 text-sm font-semibold text-slate-300 hover:text-white">
        More ways to train
        <Icon name="right" className={`h-4 w-4 transition ${more ? 'rotate-90' : ''}`} />
      </button>
      {more && (
        <div className="vq-pop grid gap-2 sm:grid-cols-2">
          {others.map((o) => (
            <button key={o.title} onClick={o.go} className="flex items-center gap-3 rounded-xl bg-white/4 p-3 text-left ring-1 ring-white/8 hover:bg-white/8">
              <Icon name={o.icon} className="h-5 w-5 shrink-0 text-slate-400" />
              <span>
                <span className="block text-sm font-semibold text-white">{o.title}</span>
                <span className="block text-xs text-slate-500">{o.blurb}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      {progress.attempts.length > 0 && (
        <button onClick={() => go({ name: 'progress' })} className="mt-5 block w-full rounded-2xl bg-slate-900/70 p-4 text-left ring-1 ring-white/8 hover:ring-white/20">
          <div className="mb-3 text-xs font-bold tracking-wider text-slate-500 uppercase">Your progress</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {skills.map((s) => {
              const v = skillPercent(progress, s);
              return (
                <div key={s}>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <span className="truncate text-slate-400">{SKILL_LABEL[s].replace(' Positioning', '').replace(' Knowledge', '')}</span>
                    <span className="font-semibold text-white">{v ? `${v.pct}%` : '—'}</span>
                  </div>
                  <Bar value={v?.pct ?? 0} tone={v && v.pct >= 80 ? 'emerald' : 'amber'} />
                </div>
              );
            })}
          </div>
        </button>
      )}
    </div>
  );
}
