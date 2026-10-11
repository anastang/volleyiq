import { useMemo, useState } from 'react';
import { dist, isFrontZone } from '../../engine/geometry';
import { zoneOfPlayer } from '../../engine/rotation';
import { activeSetterId, buildTeam, frontRowAttackerCount, receiveFormation, setTarget, SYSTEMS, SYSTEM_ORDER } from '../../engine/systems';
import type { SystemId } from '../../engine/types';
import { DemoCourt } from '../components/DemoCourt';
import { Card, ScreenHeader, Segmented } from '../components/ui';
import type { DemoPhase } from '../demo';
import { useStore } from '../store';

function metrics(systemId: SystemId, customSetters: string[]) {
  const team = buildTeam(systemId, 'home', {}, customSetters);
  const rots = [0, 1, 2, 3, 4, 5];
  const attackers = rots.map((r) => frontRowAttackerCount(team, r));
  const setterZones = rots.map((r) => zoneOfPlayer(team, r, activeSetterId(team, r))!);
  const releases = rots.map((r) => {
    const f = receiveFormation(team, r);
    return dist(f.positions[activeSetterId(team, r)], setTarget(systemId));
  });
  const passers = rots.map((r) => receiveFormation(team, r).passers.length);
  const dumps = setterZones.filter((z) => isFrontZone(z)).length;
  return { team, attackers, setterZones, releases, passers, dumps };
}

export function CompareScreen() {
  const { back, settings } = useStore();
  const [a, setA] = useState<SystemId>('5-1');
  const [b, setB] = useState<SystemId>('6-2');
  const [rot, setRot] = useState(3);
  const [phase, setPhase] = useState<DemoPhase>('receive');
  const ma = useMemo(() => metrics(a, settings.customSetters), [a, settings.customSetters]);
  const mb = useMemo(() => metrics(b, settings.customSetters), [b, settings.customSetters]);
  const avg = (xs: number[]) => (xs.reduce((s, x) => s + x, 0) / xs.length).toFixed(1);

  const rows: [string, (m: typeof ma, id: SystemId) => string][] = [
    ['Setters', (_m, id) => String(SYSTEMS[id].setters)],
    ['Front-row attackers by rotation', (m) => m.attackers.join(' · ')],
    ['Setter zone by rotation', (m) => m.setterZones.join(' · ')],
    ['Rotations with a legal setter dump', (m) => `${m.dumps} of 6`],
    ['Avg. setter release in receive', (m) => `${avg(m.releases)} m`],
    ['Longest release', (m) => `${Math.max(...m.releases).toFixed(1)} m`],
    ['Passers in receive', (m) => `${Math.min(...m.passers)}–${Math.max(...m.passers)}`],
    ['Relative difficulty', (_m, id) => '●'.repeat(SYSTEMS[id].difficulty) + '○'.repeat(3 - SYSTEMS[id].difficulty)],
  ];

  return (
    <div className="mx-auto max-w-7xl pb-16">
      <ScreenHeader title="Compare Systems" subtitle="What changes if your team switches systems?" onBack={back} />
      <div className="space-y-4 px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={a} onChange={setA} options={SYSTEM_ORDER.map((s) => ({ value: s, label: SYSTEMS[s].name }))} />
          <span className="text-slate-500">vs</span>
          <Segmented value={b} onChange={setB} options={SYSTEM_ORDER.map((s) => ({ value: s, label: SYSTEMS[s].name }))} />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Segmented size="sm" value={rot} onChange={setRot} options={[0, 1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r + 1}` }))} />
          <Segmented size="sm" value={phase} onChange={setPhase} options={[{ value: 'receive', label: 'Serve receive' }, { value: 'release', label: 'After contact' }, { value: 'firstGood', label: 'Attack options' }, { value: 'defRight', label: 'Defence' }]} />
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {[a, b].map((s, i) => {
            const m = i === 0 ? ma : mb;
            return (
              <Card key={i} className="p-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <h3 className="font-display text-lg font-bold text-white">{SYSTEMS[s].name}</h3>
                  <span className="text-xs text-slate-400">R{rot + 1}: setter in zone {m.setterZones[rot]} · {m.attackers[rot]} front-row hitters</span>
                </div>
                <DemoCourt className="mx-auto aspect-[15/14.2] w-full max-w-[420px]" systemId={s} rotation={rot} phase={phase} view="half" trails compact zones />
                <p className="mt-2 text-xs text-slate-400">{SYSTEMS[s].description}</p>
              </Card>
            );
          })}
        </div>
        <Card className="overflow-x-auto p-4">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-400">
                <th className="py-2 pr-3 font-semibold"></th>
                <th className="py-2 pr-3 font-semibold text-white">{SYSTEMS[a].name}</th>
                <th className="py-2 font-semibold text-white">{SYSTEMS[b].name}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map(([k, f]) => (
                <tr key={k}>
                  <td className="py-2 pr-3 text-slate-400">{k}</td>
                  <td className="py-2 pr-3 text-slate-100">{f(ma, a)}</td>
                  <td className="py-2 text-slate-100">{f(mb, b)}</td>
                </tr>
              ))}
              <tr>
                <td className="py-2 pr-3 align-top text-slate-400">Advantages</td>
                {[a, b].map((s) => (
                  <td key={s} className="py-2 pr-3 align-top text-xs text-slate-300">
                    <ul className="list-disc space-y-0.5 pl-4">{SYSTEMS[s].advantages.map((x) => <li key={x}>{x}</li>)}</ul>
                  </td>
                ))}
              </tr>
              <tr>
                <td className="py-2 pr-3 align-top text-slate-400">Limitations</td>
                {[a, b].map((s) => (
                  <td key={s} className="py-2 pr-3 align-top text-xs text-slate-300">
                    <ul className="list-disc space-y-0.5 pl-4">{SYSTEMS[s].limitations.map((x) => <li key={x}>{x}</li>)}</ul>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
          <p className="mt-3 text-xs text-slate-500">All numbers are computed live by the rotation engine from each system’s lineup — switch rotations above to see the formations behind them.</p>
        </Card>
      </div>
    </div>
  );
}
