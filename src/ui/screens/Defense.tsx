import { useState } from 'react';
import { SYSTEM_DESC, SYSTEM_LABEL } from '../../engine/scenarios';
import type { DefenseSystemId } from '../../engine/types';
import { DemoCourt, useDemoScene } from '../components/DemoCourt';
import { Button, Card, ScreenHeader, Segmented, Toggle } from '../components/ui';
import type { DemoPhase } from '../demo';
import { focusFromRole, useStore } from '../store';
import { drillConfig } from './sessions';

const OBJECTIVE: Record<DefenseSystemId, string> = {
  perimeter: 'Keep defenders on the edges and deep so hard-driven balls are dug in front of them. Tips are handled by the line digger or the off-blocker.',
  rotation: 'Take away the tip and short line by rotating the line-side back defender up behind the block, with middle-back rotating to the deep line.',
  middleUp: 'Put the middle-back player (rover) right behind the block to kill tips and soft shots, trusting the wing defenders to cover deep corners.',
  read: 'Start from base and adjust to the setter, the block and the hitter. Positions are less fixed — reading skill matters most.',
};

export function DefenseScreen() {
  const { back, go, settings, update } = useStore();
  const [sys, setSys] = useState<DefenseSystemId>(settings.defenseSystem);
  const [from, setFrom] = useState<DemoPhase>('defRight');
  const [rot, setRot] = useState(0);
  const [coverage, setCoverage] = useState(true);
  const scene = useDemoScene(settings.systemId, rot, from, sys);
  const cov = coverage && scene.plan ? Object.entries(scene.plan.targets).filter(([id]) => !scene.plan!.blockers.includes(id)).map(([, t]) => ({ c: t.pos, r: 1.8 })) : undefined;
  return (
    <div className="mx-auto max-w-7xl pb-16">
      <ScreenHeader title="Defensive Systems" subtitle="Coaching strategies — not official rules. Different teams use different systems." onBack={back} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Segmented value={sys} onChange={setSys} options={(['perimeter', 'rotation', 'middleUp', 'read'] as DefenseSystemId[]).map((s) => ({ value: s, label: SYSTEM_LABEL[s] }))} />
          </div>
          <div className="mb-3 flex flex-wrap gap-2">
            <Segmented size="sm" value={from} onChange={setFrom} options={[{ value: 'defRight', label: 'vs their outside' }, { value: 'defLeft', label: 'vs their right side' }, { value: 'defMiddle', label: 'vs their middle' }, { value: 'tip', label: 'Tip' }, { value: 'base', label: 'Base' }]} />
            <Segmented size="sm" value={rot} onChange={setRot} options={[0, 1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r + 1}` }))} />
          </div>
          <DemoCourt className="mx-auto aspect-[15/14.2] w-full max-w-[640px]" rotation={rot} phase={from} defenseSystem={sys} view="half" trails extraOverlays={{ coverage: cov }} />
          <div className="mt-2 flex justify-center">
            <Toggle checked={coverage} onChange={setCoverage} label="Show defender coverage regions" />
          </div>
        </div>
        <div className="space-y-3">
          <Card className="p-4">
            <h3 className="font-display text-lg font-bold text-white">{SYSTEM_LABEL[sys]}</h3>
            <p className="mt-1 text-sm text-slate-300">{SYSTEM_DESC[sys]}</p>
            <div className="mt-3 text-[10px] font-bold tracking-wider text-amber-300 uppercase">Objective</div>
            <p className="text-sm text-slate-300">{OBJECTIVE[sys]}</p>
            {scene.plan?.notes.map((n) => (
              <p key={n} className="mt-2 rounded-lg bg-white/5 p-2 text-xs text-slate-300">{n}</p>
            ))}
          </Card>
          <Card className="p-4">
            <div className="text-[10px] font-bold tracking-wider text-slate-400 uppercase">What you’re seeing</div>
            <ul className="mt-1 space-y-1 text-xs text-slate-300">
              <li>Dark wedge: court shadowed by the block (conceptual, not a physics prediction).</li>
              <li>Red dashed lines: the hitter’s line and cross-court angles.</li>
              <li>Green circles: each defender’s general area of responsibility.</li>
              <li>Purple trails: how players moved from the previous view.</li>
            </ul>
          </Card>
          <Card className="space-y-2 p-4">
            <Button variant="primary" icon="play" className="w-full" onClick={() => { update({ defenseSystem: sys }); go({ name: 'session', config: { ...drillConfig('spikeDefense', 5, focusFromRole(settings.role)), title: `${SYSTEM_LABEL[sys]} defence`, items: Array.from({ length: 5 }, (_, i) => ({ category: i % 2 ? 'blocking' : 'spikeDefense', focus: focusFromRole(settings.role), defenseSystem: sys })) }, key: Date.now() }); }}>
              Practise this system
            </Button>
            <Button className="w-full" icon="users" onClick={() => go({ name: 'session', config: { title: `${SYSTEM_LABEL[sys]} — Coach mode`, mode: 'coach', focus: { kind: 'all' }, items: Array.from({ length: 4 }, () => ({ category: 'spikeDefense' as const, focus: { kind: 'all' as const }, defenseSystem: sys })) }, key: Date.now() })}>
              Arrange all six (Coach)
            </Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
