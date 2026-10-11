import { useEffect, useState } from 'react';
import { CURRICULUM, MISTAKES, type DemoKind, type LessonScene } from '../../engine/curriculum';
import { DemoCourt } from '../components/DemoCourt';
import { ZonePanel } from '../components/InfoPanel';
import { Button, Card, Icon, Pill, ScreenHeader } from '../components/ui';
import { DEMO_PHASES, type DemoPhase } from '../demo';
import { courtStyle } from '../components/Court';
import { usePhone } from '../hooks';
import { focusFromRole, useStore } from '../store';
import { lessonConfig, mistakeConfig } from './sessions';
import type { Zone } from '../../engine/geometry';

export function LearnScreen() {
  const { back, go, progress } = useStore();
  return (
    <div className="mx-auto max-w-5xl pb-16">
      <ScreenHeader title="Learn" subtitle="Ten levels — jump to any lesson" onBack={back} right={<Button size="sm" icon="alert" onClick={() => go({ name: 'mistakes' })}>Common mistakes</Button>} />
      <div className="space-y-3 px-4 sm:px-6">
        {CURRICULUM.map((lvl) => {
          const done = lvl.lessons.filter((l) => progress.lessonsDone.includes(l.id)).length;
          return (
            <Card key={lvl.n} className="p-4">
              <div className="flex items-center gap-3">
                <span className={`font-display grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg font-extrabold ${done === lvl.lessons.length ? 'bg-emerald-400 text-slate-950' : 'bg-white/8 text-white'}`}>{lvl.n}</span>
                <div className="flex-1">
                  <div className="font-display font-bold text-white">{lvl.title}</div>
                  <div className="text-xs text-slate-400">{lvl.goal}</div>
                </div>
                <Pill tone={done === lvl.lessons.length ? 'emerald' : 'slate'}>{done}/{lvl.lessons.length}</Pill>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {lvl.lessons.map((l) => (
                  <button key={l.id} onClick={() => go({ name: 'lesson', id: l.id })} className="flex items-center gap-3 rounded-xl bg-white/4 p-3 text-left ring-1 ring-white/8 hover:bg-white/8">
                    <Icon name={progress.lessonsDone.includes(l.id) ? 'check' : 'book'} className={`h-5 w-5 ${progress.lessonsDone.includes(l.id) ? 'text-emerald-300' : 'text-amber-300'}`} />
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-white">{l.title}</div>
                      <div className="text-xs text-slate-400">{l.summary}</div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

const DEMO_CYCLES: Record<DemoKind, LessonScene> = {
  zones: { phases: ['rotational'], zones: true },
  rows: { phases: ['rotational'], zones: true, highlightFront: true },
  rotate: { phases: ['rotational'], rotate: true, zones: true },
  roles: { phases: ['receive', 'release'] },
  systems: { phases: ['receive'], rotate: true },
  overlap: { phases: ['rotational', 'receive'], zones: true, feet: true },
  release: { phases: ['receive', 'release'] },
  coverage: { phases: ['firstGood', 'attackLeft'] },
  defense: { phases: ['base', 'defRight'] },
  transition: { phases: ['defRight', 'firstOff', 'attackLeft'] },
  reading: { phases: ['base', 'defRight', 'defMiddle'] },
  scrimmage: { phases: ['receive', 'release', 'firstGood', 'attackLeft', 'base', 'defRight', 'free'] },
};

const phaseLabel = (p: string) => DEMO_PHASES.find((d) => d.id === p)?.label ?? p;

function LessonDemo({ scene, onZone }: { scene: LessonScene; onZone: (z: Zone) => void }) {
  const { reduced } = useStore();
  const phone = usePhone();
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const cycles = scene.phases.length > 1 || scene.rotate;
  useEffect(() => {
    if (paused || reduced || !cycles) return;
    const t = setInterval(() => setI((x) => x + 1), 2600);
    return () => clearInterval(t);
  }, [paused, reduced, cycles]);
  const phase = scene.phases[i % scene.phases.length] as DemoPhase;
  const rot = scene.rotate ? i % 6 : scene.rotation ?? 0;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-center gap-1.5">
        {scene.rotate || scene.rotation !== undefined ? <Pill>Rotation {rot + 1}</Pill> : null}
        {scene.system && <Pill tone="violet">{scene.system}</Pill>}
        <Pill tone="sky">{phaseLabel(phase)}</Pill>
      </div>
      <DemoCourt
        className="mx-auto w-full max-w-[480px]"
        style={courtStyle('half', phone, 60)}
        view="half"
        rotation={rot}
        phase={phase}
        systemId={scene.system}
        defenseSystem={scene.defense}
        zones={scene.zones}
        trails
        extraOverlays={{ zoneHighlight: scene.highlightFront ? [2, 3, 4] : undefined, feet: scene.feet }}
        onZoneTap={(side, z) => side === 'home' && onZone(z)}
      />
      {cycles && (
        <div className="mt-2 flex justify-center gap-2">
          <Button size="sm" icon={paused ? 'play' : 'pause'} onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</Button>
          <Button size="sm" icon="skip" onClick={() => { setPaused(true); setI((x) => x + 1); }}>Step</Button>
        </div>
      )}
    </div>
  );
}

function TheoryBlock({ label, text, tone }: { label: string; text: string; tone: 'amber' | 'sky' | 'emerald' }) {
  const c = { amber: 'border-amber-300 text-amber-300', sky: 'border-sky-300 text-sky-300', emerald: 'border-emerald-300 text-emerald-300' }[tone];
  return (
    <div className={`border-l-2 pl-3 ${c.split(' ')[0]}`}>
      <div className={`text-[11px] font-bold tracking-wider uppercase ${c.split(' ')[1]}`}>{label}</div>
      <p className="mt-0.5 text-[15px] leading-relaxed text-slate-200">{text}</p>
    </div>
  );
}

export function LessonScreen({ id }: { id: string }) {
  const { back, go, settings } = useStore();
  const level = CURRICULUM.find((l) => l.lessons.some((x) => x.id === id))!;
  const lesson = level.lessons.find((l) => l.id === id)!;
  const [card, setCard] = useState(0);
  const [zone, setZone] = useState<Zone | null>(null);
  const c = lesson.cards[card];
  const scene = c.scene ?? (c.demo ? DEMO_CYCLES[c.demo] : { phases: ['receive'] as LessonScene['phases'] });
  const nav = (
    <div className="flex gap-2">
      <Button variant="ghost" icon="back" disabled={card === 0} onClick={() => setCard((x) => x - 1)}>Back</Button>
      {card < lesson.cards.length - 1 ? (
        <Button variant="primary" className="ml-auto" icon="right" onClick={() => setCard((x) => x + 1)}>Next</Button>
      ) : (
        <Button variant="primary" className="ml-auto" icon="play" onClick={() => go({ name: 'session', config: lessonConfig(lesson.id, focusFromRole(settings.role)), key: Date.now() })}>
          Practise it ({lesson.practice.count})
        </Button>
      )}
    </div>
  );
  return (
    <div className="mx-auto max-w-6xl pb-24 lg:pb-16">
      <ScreenHeader title={lesson.title} subtitle={`Level ${level.n} · ${level.title} · ${card + 1}/${lesson.cards.length}`} onBack={back} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="p-3 sm:p-4">
          <LessonDemo key={`${id}-${card}`} scene={scene} onZone={setZone} />
        </Card>
        <div className="space-y-3">
          <Card className="space-y-4 p-5">
            <div className="flex gap-1">
              {lesson.cards.map((_, i) => (
                <button key={i} onClick={() => setCard(i)} aria-label={`Card ${i + 1}`} className={`h-1.5 flex-1 rounded-full ${i <= card ? 'bg-amber-400' : 'bg-white/10'}`} />
              ))}
            </div>
            <h2 className="font-display text-xl font-bold text-white">{c.title}</h2>
            {c.body && <p className="leading-relaxed text-slate-300">{c.body}</p>}
            {c.what && <TheoryBlock label="What" text={c.what} tone="amber" />}
            {c.why && <TheoryBlock label="Why" text={c.why} tone="sky" />}
            {c.when && <TheoryBlock label="When" text={c.when} tone="emerald" />}
            {c.cue && (
              <div className="flex items-center gap-2 rounded-xl bg-amber-300/10 p-3 text-sm font-semibold text-amber-100">
                <Icon name="spark" className="h-4 w-4 shrink-0 text-amber-300" /> {c.cue}
              </div>
            )}
            <div className="hidden lg:block">{nav}</div>
          </Card>
          {zone && <ZonePanel side="home" zone={zone} onClose={() => setZone(null)} />}
        </div>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-slate-950/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">{nav}</div>
    </div>
  );
}

export function MistakesScreen() {
  const { back, go, settings, progress } = useStore();
  const counts = new Map<string, number>();
  for (const a of progress.attempts) for (const t of a.errorTags) counts.set(t, (counts.get(t) ?? 0) + 1);
  return (
    <div className="mx-auto max-w-5xl pb-16">
      <ScreenHeader title="Common Mistakes" subtitle="Short, interactive fixes for frequent errors" onBack={back} />
      <div className="grid gap-3 px-4 sm:grid-cols-2 sm:px-6">
        {MISTAKES.map((m) => (
          <Card key={m.id} className="flex flex-col p-4">
            <div className="flex items-start gap-2">
              <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <h3 className="font-display flex-1 font-bold text-white">{m.title}</h3>
              {m.tag && counts.get(m.tag) ? <Pill tone="rose">You: {counts.get(m.tag)}×</Pill> : null}
            </div>
            <p className="mt-2 text-sm text-slate-300">{m.description}</p>
            <p className="mt-2 rounded-lg bg-emerald-400/10 p-2 text-xs text-emerald-100"><strong>Fix:</strong> {m.fix}</p>
            <Button className="mt-3 self-start" size="sm" icon="play" onClick={() => go({ name: 'session', config: mistakeConfig(m.id, focusFromRole(settings.role)), key: Date.now() })}>
              Practise (5)
            </Button>
          </Card>
        ))}
      </div>
    </div>
  );
}
