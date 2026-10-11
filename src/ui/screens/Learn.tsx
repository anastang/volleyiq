import { useEffect, useState } from 'react';
import { CURRICULUM, MISTAKES, type DemoKind } from '../../engine/curriculum';
import { DemoCourt } from '../components/DemoCourt';
import { ZonePanel } from '../components/InfoPanel';
import { Button, Card, Icon, Pill, ScreenHeader } from '../components/ui';
import type { DemoPhase } from '../demo';
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

const DEMO_CYCLES: Record<DemoKind, { phases: DemoPhase[]; rotate?: boolean; zones?: boolean; highlightFront?: boolean; feet?: boolean }> = {
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

function LessonDemo({ kind, onZone }: { kind: DemoKind; onZone: (z: Zone) => void }) {
  const { reduced } = useStore();
  const c = DEMO_CYCLES[kind];
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || reduced) return;
    const t = setInterval(() => setI((x) => x + 1), 2400);
    return () => clearInterval(t);
  }, [paused, reduced]);
  const phase = c.phases[i % c.phases.length];
  const rot = c.rotate ? i % 6 : 0;
  return (
    <div>
      <DemoCourt className="mx-auto aspect-[15/14.2] w-full max-w-[480px]" view="half" rotation={rot} phase={phase} zones={c.zones} trails extraOverlays={{ zoneHighlight: c.highlightFront ? [2, 3, 4] : undefined, feet: c.feet }} onZoneTap={(side, z) => side === 'home' && onZone(z)} />
      <div className="mt-2 flex justify-center gap-2">
        <Button size="sm" icon={paused ? 'play' : 'pause'} onClick={() => setPaused((p) => !p)}>{paused ? 'Play' : 'Pause'}</Button>
        <Button size="sm" icon="skip" onClick={() => setI((x) => x + 1)}>Step</Button>
        {c.rotate && <Pill>Rotation {rot + 1}</Pill>}
      </div>
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
  return (
    <div className="mx-auto max-w-6xl pb-16">
      <ScreenHeader title={lesson.title} subtitle={`Level ${level.n} · ${level.title}`} onBack={back} />
      <div className="grid gap-5 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="p-4">{c.demo ? <LessonDemo key={c.demo} kind={c.demo} onZone={setZone} /> : <DemoCourt className="mx-auto aspect-[15/14.2] w-full max-w-[480px]" view="half" rotation={0} phase="receive" />}</Card>
        <div className="space-y-3">
          <Card className="p-5">
            <div className="mb-2 flex gap-1">
              {lesson.cards.map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full ${i <= card ? 'bg-amber-400' : 'bg-white/10'}`} />
              ))}
            </div>
            <h2 className="font-display text-xl font-bold text-white">{c.title}</h2>
            <p className="mt-2 leading-relaxed text-slate-300">{c.body}</p>
            <p className="mt-3 text-xs text-slate-500">Tip: hover or tap any player on the court for their position, role and rules. Tap an empty zone to learn about it.</p>
            <div className="mt-4 flex gap-2">
              <Button variant="ghost" icon="back" disabled={card === 0} onClick={() => setCard((x) => x - 1)}>Back</Button>
              {card < lesson.cards.length - 1 ? (
                <Button variant="primary" className="ml-auto" icon="right" onClick={() => setCard((x) => x + 1)}>Next</Button>
              ) : (
                <Button variant="primary" className="ml-auto" icon="play" onClick={() => go({ name: 'session', config: lessonConfig(lesson.id, focusFromRole(settings.role)), key: Date.now() })}>
                  Practice ({lesson.practice.count})
                </Button>
              )}
            </div>
          </Card>
          {zone && <ZonePanel side="home" zone={zone} onClose={() => setZone(null)} />}
        </div>
      </div>
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
