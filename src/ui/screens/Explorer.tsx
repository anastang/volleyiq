import { useEffect, useMemo, useState } from 'react';
import type { Side, Vec, Zone } from '../../engine/geometry';
import { onCourt } from '../../engine/rotation';
import { checkServiceFormation } from '../../engine/rules';
import { describeRotation, playerById, roleWord } from '../../engine/systems';
import { ROLE_INFO, type DefenseSystemId, type SystemId } from '../../engine/types';
import { SYSTEM_LABEL } from '../../engine/scenarios';
import { DemoCourt, useDemoScene } from '../components/DemoCourt';
import { playerInfo, PlayerPanel, ZonePanel } from '../components/InfoPanel';
import { Button, Card, Collapsible, Icon, Pill, ScreenHeader, Segmented, Toggle } from '../components/ui';
import { CourtLegend } from '../components/YouCard';
import { DEMO_PHASES, type DemoPhase } from '../demo';
import { useStore } from '../store';
import { SystemPicker } from './Modes';

const COMPARISONS: { label: string; a: DemoPhase; b: DemoPhase }[] = [
  { label: 'Before serve → After serve', a: 'receive', b: 'release' },
  { label: 'Defence → Attack', a: 'defRight', b: 'firstGood' },
  { label: 'Attack → Defence', a: 'attackLeft', b: 'base' },
  { label: 'Rotational → Receive', a: 'rotational', b: 'receive' },
];

export function ExplorerScreen({ initialZone }: { initialZone?: Zone }) {
  const { settings, back, go, ruleset } = useStore();
  const [sys, setSys] = useState<SystemId>(settings.systemId);
  const [rot, setRot] = useState(0);
  const [phase, setPhase] = useState<DemoPhase>('receive');
  const [def, setDef] = useState<DefenseSystemId>(settings.defenseSystem);
  const [zones, setZones] = useState(true);
  const [trails, setTrails] = useState(true);
  const [view, setView] = useState<'full' | 'half'>('full');
  const [custom, setCustom] = useState<Record<string, Vec> | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ kind: 'player'; side: Side; id: string } | { kind: 'zone'; side: Side; zone: Zone } | null>(initialZone ? { kind: 'zone', side: 'home', zone: initialZone } : null);
  const scene = useDemoScene(sys, rot, phase, def);

  useEffect(() => setCustom(null), [sys, rot, phase, def]);

  const positions = custom ?? scene.home;
  const team = scene.world.home.team;
  const legal = useMemo(() => {
    if (phase !== 'receive' && phase !== 'rotational' && phase !== 'servePre') return null;
    return checkServiceFormation({ team, rotation: rot, positions, serving: scene.serving, ruleset });
  }, [phase, positions, team, rot, scene.serving, ruleset]);

  const playCompare = (a: DemoPhase, b: DemoPhase) => {
    setTrails(true);
    setPhase(a);
    setTimeout(() => setPhase(b), 1300);
  };

  const oc = onCourt(team, rot, scene.serving);
  const idx = DEMO_PHASES.findIndex((p) => p.id === phase);
  const step = (d: number) => setPhase(DEMO_PHASES[(idx + d + DEMO_PHASES.length) % DEMO_PHASES.length].id);

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <ScreenHeader title="Explore the court" subtitle="Move anyone, tap anyone — nothing is graded" onBack={back} />
      <div className="grid gap-4 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Pill tone="sky">
              <Icon name="ball" className="h-3.5 w-3.5" />
              {scene.caption}
            </Pill>
            {legal && (legal.legal ? <Pill tone="emerald">{legal.judged ? '✓ Legal at the serve' : '✓ Serving: any spot inside your court'}</Pill> : <Pill tone="rose">✗ {legal.violations.length} positional fault{legal.violations.length > 1 ? 's' : ''}</Pill>)}
            {custom && (
              <Button size="sm" variant="ghost" icon="refresh" onClick={() => setCustom(null)}>
                Reset
              </Button>
            )}
          </div>
          <DemoCourt
            className="mx-auto w-full"
            style={{ aspectRatio: view === 'half' ? '15 / 14.2' : '15 / 24.8', maxHeight: '78vh', maxWidth: `calc(78vh * ${view === 'half' ? 15 / 14.2 : 15 / 24.8})` }}
            systemId={sys}
            rotation={rot}
            phase={phase}
            defenseSystem={def}
            trails={trails}
            zones={zones}
            view={view}
            positions={positions}
            draggable
            onMove={(id, p) => setCustom({ ...positions, [id]: p })}
            selectedId={selected}
            onSelect={setSelected}
            onInspect={(side, id) => setInspect({ kind: 'player', side, id })}
            onZoneTap={(side, zone) => setInspect({ kind: 'zone', side, zone })}
            extraOverlays={{ feet: !!legal, violations: legal?.violations.map((v) => v.players) }}
          />
          <CourtLegend />
        </div>

        <div className="space-y-3">
          <Card className="space-y-4 p-4">
            <div>
              <div className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Rotation</div>
              <div className="flex items-center gap-2">
                <Button size="sm" icon="back" onClick={() => setRot((r) => (r + 5) % 6)} aria-label="Previous rotation" />
                <div className="flex-1 text-center">
                  <div className="font-display font-bold text-white">Rotation {rot + 1}</div>
                  <div className="text-[11px] text-slate-400">{describeRotation(team, rot).split('·')[1]}</div>
                </div>
                <Button size="sm" icon="rotate" onClick={() => setRot((r) => (r + 1) % 6)} title="Rotate clockwise" aria-label="Rotate clockwise" />
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Moment in the rally</div>
              <div className="flex items-center gap-2">
                <Button size="sm" icon="back" onClick={() => step(-1)} aria-label="Previous moment" />
                <select value={phase} onChange={(e) => setPhase(e.target.value as DemoPhase)} className="min-w-0 flex-1 rounded-lg bg-white/8 p-2 text-sm text-white ring-1 ring-white/10">
                  {['Rotation', 'Receiving', 'Offence', 'Serving', 'Defence', 'Transition'].map((g) => (
                    <optgroup key={g} label={g} className="bg-slate-900">
                      {DEMO_PHASES.filter((p) => p.group === g).map((p) => (
                        <option key={p.id} value={p.id} className="bg-slate-900">
                          {p.label}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <Button size="sm" icon="right" onClick={() => step(1)} aria-label="Next moment" />
              </div>
            </div>
          </Card>

          {inspect?.kind === 'player' && (
            <PlayerPanel
              info={playerInfo(inspect.side === 'home' ? { ...scene.world.home, serving: scene.serving, positions } : { ...scene.world.away, serving: !scene.serving, positions: scene.away }, inspect.id, scene.phase, inspect.side === 'home' && !custom ? scene.plan?.targets[inspect.id] : undefined)}
              onClose={() => setInspect(null)}
            />
          )}
          {inspect?.kind === 'zone' && <ZonePanel side={inspect.side} zone={inspect.zone} onClose={() => setInspect(null)} />}
          {!inspect && <p className="px-1 text-xs text-slate-500">Tap any player to see their job right now, or tap an empty zone to learn about it.</p>}
          {legal && !legal.legal && (
            <Card className="space-y-1.5 p-3">
              {legal.violations.map((v, i) => (
                <p key={i} className="rounded-lg bg-rose-500/12 p-2 text-xs text-rose-100">{v.message}</p>
              ))}
            </Card>
          )}

          <Collapsible title="Everyone’s job right now">
            <ul className="space-y-1">
              {oc.map((o) => {
                const p = playerById(team, o.playerId);
                const t = scene.plan?.targets[o.playerId];
                return (
                  <li key={o.playerId}>
                    <button onClick={() => setInspect({ kind: 'player', side: 'home', id: o.playerId })} className="flex w-full items-start gap-2 rounded-lg p-1.5 text-left hover:bg-white/6">
                      <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ROLE_INFO[p.role].color }} />
                      <span className="flex-1 text-xs">
                        <span className="font-semibold text-white">{roleWord(team, rot, o.playerId)}</span> <span className="text-slate-500">· #{p.number} · Position {o.zone}</span>
                        <span className="block text-slate-300">{t?.duty ?? 'Rotational spot'}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Collapsible>
          <Collapsible title="Watch a transition">
            <div className="flex flex-wrap gap-2">
              {COMPARISONS.map((c) => (
                <Button key={c.label} size="sm" icon="play" onClick={() => playCompare(c.a, c.b)}>
                  {c.label}
                </Button>
              ))}
            </div>
          </Collapsible>
          <Collapsible title="More options">
            <div className="space-y-3">
              <SystemPicker value={sys} onChange={setSys} />
              <Segmented size="sm" value={view} onChange={setView} options={[{ value: 'full', label: 'Full court' }, { value: 'half', label: 'Our side' }]} />
              <Toggle checked={zones} onChange={setZones} label="Zone numbers" />
              <Toggle checked={trails} onChange={setTrails} label="Movement trails" />
              <label className="block text-xs text-slate-400">
                Defensive system
                <select value={def} onChange={(e) => setDef(e.target.value as DefenseSystemId)} className="mt-1 w-full rounded-lg bg-white/8 p-2 text-sm text-white ring-1 ring-white/10">
                  {(['perimeter', 'rotation', 'middleUp', 'read'] as DefenseSystemId[]).map((d) => (
                    <option key={d} value={d} className="bg-slate-900">
                      {SYSTEM_LABEL[d]}
                    </option>
                  ))}
                </select>
              </label>
              <Button size="sm" icon="users" onClick={() => go({ name: 'coach' })}>
                Try Coach mode (graded)
              </Button>
            </div>
          </Collapsible>
          {scene.plan?.notes[0] && <p className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">{scene.plan.notes[0]}</p>}
        </div>
      </div>
    </div>
  );
}
