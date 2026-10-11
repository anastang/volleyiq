import { useEffect, useState } from 'react';
import { DemoCourt } from '../components/DemoCourt';
import { Button, Icon } from '../components/ui';
import { useStore } from '../store';
import type { DemoPhase } from '../demo';

const CYCLE: DemoPhase[] = ['receive', 'release', 'firstGood', 'attackLeft', 'base', 'defRight', 'free'];

export function Welcome() {
  const { go, update, reduced } = useStore();
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduced) return;
    const t = setInterval(() => setI((x) => (x + 1) % CYCLE.length), 2600);
    return () => clearInterval(t);
  }, [reduced]);
  return (
    <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-8 px-5 py-10 lg:grid-cols-[1.1fr_1fr]">
      <div className="order-2 lg:order-1">
        <div className="mb-6 flex items-center gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-300 to-orange-500 text-slate-950 shadow-lg shadow-orange-500/30">
            <Icon name="ball" className="h-6 w-6" />
          </span>
          <span className="font-display text-xl font-extrabold tracking-tight text-white">VolleyIQ</span>
        </div>
        <h1 className="font-display text-4xl leading-[1.05] font-extrabold tracking-tight text-white sm:text-5xl">
          Master the court.
          <br />
          <span className="bg-gradient-to-r from-amber-200 via-orange-300 to-rose-300 bg-clip-text text-transparent">Understand every rotation.</span>
          <br />
          Know where to move.
        </h1>
        <p className="mt-5 max-w-lg text-lg text-slate-300">Learn volleyball rotations, positioning, and game awareness through interactive practice.</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" icon="play" onClick={() => go({ name: 'setup' })}>
            Start Training
          </Button>
          <Button size="lg" icon="court" onClick={() => { update({ onboarded: true }); go({ name: 'explorer' }); }}>
            Explore the Court
          </Button>
        </div>
        <div className="mt-10 grid max-w-lg grid-cols-3 gap-3 text-xs text-slate-400">
          {[
            ['whistle', 'FIVB 2025–2028 rules engine'],
            ['users', '5–1 · 6–2 · 4–2 systems'],
            ['target', 'Pause → position → check → explain'],
          ].map(([ic, t]) => (
            <div key={t} className="rounded-xl bg-white/4 p-3 ring-1 ring-white/8">
              <Icon name={ic} className="mb-1.5 h-5 w-5 text-amber-300" />
              {t}
            </div>
          ))}
        </div>
      </div>
      <div className="order-1 lg:order-2">
        <div className="vq-float relative mx-auto max-w-[380px]">
          <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-br from-sky-500/20 via-indigo-500/10 to-amber-400/20 blur-2xl" />
          <DemoCourt className="relative mx-auto aspect-[15/24.8] w-full rounded-2xl" rotation={0} systemId="5-1" phase={CYCLE[i]} trails compact showMe={false} />
        </div>
      </div>
    </div>
  );
}
