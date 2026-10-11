import { useMemo, useRef, useState } from 'react';
import { advanceRally, newScrimmage, recordRally, startRally, type RallyRun, type RallyScript, type Scrimmage } from '../../engine/rally';
import { makeRng, type Rng } from '../../engine/rng';
import { onCourt, rotationLabel } from '../../engine/rotation';
import { buildTeam, playerById, setterZone, SYSTEMS } from '../../engine/systems';
import { ROLE_INFO } from '../../engine/types';
import { ScenarioPlayer, type StepResult } from '../components/ScenarioPlayer';
import { Bar, Button, Card, Icon, Pill, ScreenHeader, Segmented, Toggle } from '../components/ui';
import { focusFromRole, useStore, type RoleChoice } from '../store';
import { RolePicker } from './Modes';
import { VerdictPill } from './Session';

const SCRIPT: RallyScript = { serveTo: 'libero', passQuality: ['good'], forceLane: 'left', attackOutcomes: ['blocked', 'kill'] };

function useRally() {
  const rngRef = useRef<Rng>(makeRng());
  const [run, setRun] = useState<RallyRun | null>(null);
  const [results, setResults] = useState<{ title: string; r: StepResult }[]>([]);
  return {
    run,
    results,
    start: (r: RallyRun) => {
      setResults([]);
      setRun(r);
    },
    rng: rngRef.current,
    step: (res: StepResult) => {
      if (!run) return;
      const st = run.steps[run.steps.length - 1];
      setResults((x) => [...x, { title: st.scenario.title, r: res }]);
      advanceRally(run, res.verdict === 'illegal' ? 0 : res.score, rngRef.current);
      setRun({ ...run });
    },
    clear: () => setRun(null),
  };
}

function RallyStage({ run, onStep, timer }: { run: RallyRun; onStep: (r: StepResult) => void; timer?: number }) {
  const st = run.steps[run.steps.length - 1];
  return (
    <ScenarioPlayer
      scenario={st.scenario}
      onComplete={onStep}
      timerSec={timer}
      chained
      nextLabel="Continue rally"
      header={
        st.narration ? (
          <div className="vq-pop flex items-start gap-2 rounded-2xl bg-gradient-to-r from-sky-500/20 to-transparent p-3 text-sm text-sky-50 ring-1 ring-sky-300/20">
            <Icon name="ball" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{st.narration}</span>
          </div>
        ) : undefined
      }
    />
  );
}

function RallySummary({ run, results }: { run: RallyRun; results: { title: string; r: StepResult }[] }) {
  const avg = results.length ? Math.round(results.reduce((s, x) => s + (x.r.verdict === 'illegal' ? 0 : x.r.score), 0) / results.length) : 0;
  const won = run.result?.winner === 'home';
  return (
    <Card className="p-5">
      <div className={`mb-3 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-bold ${won ? 'bg-emerald-400/20 text-emerald-100' : 'bg-rose-500/20 text-rose-100'}`}>
        <Icon name={won ? 'trophy' : 'alert'} className="h-4 w-4" />
        {won ? 'Rally won' : 'Rally lost'}
      </div>
      <p className="text-white">{run.result?.reason}</p>
      <div className="mt-4 text-xs font-bold tracking-wider text-slate-400 uppercase">Your decisions</div>
      <ul className="mt-1 divide-y divide-white/5">
        {results.map((x, i) => (
          <li key={i} className="flex items-center gap-2 py-2 text-sm">
            <span className="w-5 text-slate-500">{i + 1}</span>
            <span className="flex-1 text-slate-200">{x.title}</span>
            <VerdictPill v={String(x.r.verdict)} />
            <span className="w-8 text-right text-white">{x.r.verdict === 'illegal' ? 0 : x.r.score}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <span className="text-sm text-slate-400">Rally score</span>
        <Bar value={avg} className="flex-1" tone={avg >= 70 ? 'emerald' : 'amber'} />
        <span className="font-display text-xl font-bold text-white">{avg}</span>
      </div>
      <p className="mt-3 text-xs text-slate-500">Better positioning improves your team’s odds at each event — but, like real volleyball, a great swing can still beat a good defence.</p>
      <details className="mt-3 text-xs text-slate-400">
        <summary className="cursor-pointer text-slate-300">Rally log</summary>
        <ol className="mt-2 list-decimal space-y-0.5 pl-5">
          {run.log.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ol>
      </details>
    </Card>
  );
}

export function RallyScreen({ scripted }: { scripted?: boolean }) {
  const { settings, genOptions, back, record, patchProgress } = useStore();
  const [role, setRole] = useState<RoleChoice>(settings.role);
  const [serving, setServing] = useState<'away' | 'home'>('away');
  const [rot, setRot] = useState(2);
  const [useScript, setUseScript] = useState(!!scripted);
  const R = useRally();
  const recorded = useRef(false);

  const begin = () => {
    recorded.current = false;
    const sys = useScript ? '5-1' : settings.systemId;
    R.start(
      startRally({
        opts: genOptions({ systemId: sys }),
        focus: focusFromRole(role),
        homeServing: useScript ? false : serving === 'home',
        homeRotation: useScript ? 2 : rot,
        awayRotation: Math.floor(Math.random() * 6),
        script: useScript ? structuredClone(SCRIPT) : undefined,
      }),
    );
  };

  const onStep = (r: StepResult) => {
    const run = R.run!;
    const sc = run.steps[run.steps.length - 1].scenario;
    record({ t: Date.now(), category: sc.category, skills: sc.skills, score: r.verdict === 'illegal' ? 0 : r.score, verdict: String(r.verdict), systemId: sc.systemId, rotation: sc.rotation, role: role === 'ALL' ? 'ALL' : role, errorTags: r.errorTags });
    R.step(r);
  };

  if (R.run?.result && !recorded.current) {
    recorded.current = true;
    const won = R.run.result.winner === 'home';
    queueMicrotask(() => patchProgress((p) => ({ ...p, rallies: { played: p.rallies.played + 1, won: p.rallies.won + (won ? 1 : 0) } })));
  }

  if (!R.run) {
    return (
      <div className="mx-auto max-w-4xl pb-16">
        <ScreenHeader title="Full Rally" subtitle="Decisions at the moments that matter" onBack={back} />
        <div className="space-y-5 px-4 sm:px-6">
          <Card className="p-5">
            <Toggle checked={useScript} onChange={setUseScript} label={<span><strong className="text-white">Guided example rally</strong> — 5–1, Rotation 3, opponent serving; the libero passes, a high ball to the outside is blocked, you recover and transition.</span>} />
          </Card>
          <div>
            <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Follow which player?</div>
            <RolePicker value={role} onChange={setRole} />
          </div>
          {!useScript && (
            <>
              <div>
                <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Who serves?</div>
                <Segmented value={serving} onChange={setServing} options={[{ value: 'away', label: 'Opponent serves' }, { value: 'home', label: 'Your team serves' }]} />
              </div>
              <div>
                <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Rotation ({SYSTEMS[settings.systemId].name})</div>
                <Segmented value={rot} onChange={setRot} options={[0, 1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r + 1}` }))} />
              </div>
            </>
          )}
          <p className="text-sm text-slate-400">
            The rally pauses at each meaningful moment. Position your player, check, read the explanation, then watch the next event unfold. {settings.level === 'competitive' ? 'Competitive difficulty: you have 20 seconds to prepare at each pause.' : ''}
          </p>
          <Button variant="primary" size="lg" icon="play" onClick={begin}>
            Start rally
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl pb-16">
      <ScreenHeader
        title="Full Rally"
        subtitle={`Step ${R.run.steps.length} · ${rotationLabel(R.run.world.home.rotation)} · ${R.run.world.home.serving ? 'your team serving' : 'opponent serving'}`}
        onBack={() => (R.run?.result ? R.clear() : back())}
      />
      <div className="px-4 sm:px-6">
        {R.run.result ? (
          <div className="mx-auto max-w-2xl space-y-3">
            <RallySummary run={R.run} results={R.results} />
            <div className="flex gap-2">
              <Button variant="primary" icon="refresh" onClick={begin}>Play another rally</Button>
              <Button onClick={R.clear}>Change setup</Button>
            </div>
          </div>
        ) : (
          <RallyStage run={R.run} onStep={onStep} timer={settings.level === 'competitive' ? 20 : undefined} />
        )}
      </div>
    </div>
  );
}

export function ScrimmageScreen() {
  const { settings, genOptions, back, record, patchProgress } = useStore();
  const [role, setRole] = useState<RoleChoice>(settings.role);
  const [target, setTarget] = useState(15);
  const [scrim, setScrim] = useState<Scrimmage | null>(null);
  const [showResult, setShowResult] = useState(false);
  const R = useRally();
  const team = useMemo(() => buildTeam(settings.systemId, 'home', settings.roster, settings.customSetters), [settings.systemId, settings.roster, settings.customSetters]);

  const nextRally = (s: Scrimmage) => {
    setShowResult(false);
    R.start(
      startRally({
        opts: genOptions(),
        focus: focusFromRole(role),
        homeServing: s.match.serving === 'home',
        homeRotation: s.match.rotation.home,
        awayRotation: s.match.rotation.away,
        stepCap: 6,
      }),
    );
  };

  const onStep = (r: StepResult) => {
    const run = R.run!;
    const sc = run.steps[run.steps.length - 1].scenario;
    record({ t: Date.now(), category: sc.category, skills: sc.skills, score: r.verdict === 'illegal' ? 0 : r.score, verdict: String(r.verdict), systemId: sc.systemId, rotation: sc.rotation, role: role === 'ALL' ? 'ALL' : role, errorTags: r.errorTags });
    R.step(r);
    if (run.result) {
      const ns = recordRally(scrim!, run.result);
      setScrim(ns);
      setShowResult(true);
      if (ns.over) {
        const won = ns.match.score.home > ns.match.score.away;
        patchProgress((p) => ({ ...p, scrimmage: { won: p.scrimmage.won + (won ? 1 : 0), lost: p.scrimmage.lost + (won ? 0 : 1) } }));
      }
    }
  };

  if (!scrim) {
    return (
      <div className="mx-auto max-w-4xl pb-16">
        <ScreenHeader title="Full Scrimmage" subtitle="Score, serve, rotation and assignments — all tracked" onBack={back} />
        <div className="space-y-5 px-4 sm:px-6">
          <div>
            <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Follow which player?</div>
            <RolePicker value={role} onChange={setRole} />
          </div>
          <div>
            <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Play to</div>
            <Segmented value={target} onChange={setTarget} options={[{ value: 7, label: '7 (quick)' }, { value: 15, label: '15' }, { value: 25, label: '25' }]} />
          </div>
          <p className="text-sm text-slate-400">Rotation updates only when the receiving team wins the rally. Your positioning decisions shift the odds of each rally event.</p>
          <Button
            variant="primary"
            size="lg"
            icon="play"
            onClick={() => {
              const s = newScrimmage(target, Math.random() < 0.5);
              setScrim(s);
              nextRally(s);
            }}
          >
            Start match
          </Button>
        </div>
      </div>
    );
  }

  const m = scrim.match;
  const server = playerById(team, onCourt(team, m.rotation.home, true).find((o) => o.zone === 1)!.baseId);
  return (
    <div className="mx-auto max-w-7xl pb-16">
      <ScreenHeader title="Full Scrimmage" subtitle={`First to ${scrim.target}, win by 2`} onBack={back} />
      <div className="px-4 sm:px-6">
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <ScoreCard label="Your team" score={m.score.home} serving={m.serving === 'home'} detail={`${rotationLabel(m.rotation.home)} · setter zone ${setterZone(team, m.rotation.home)}${m.serving === 'home' ? ` · #${server.number} ${server.name} serving` : ''}`} />
          <div className="hidden items-center text-slate-500 sm:flex">vs</div>
          <ScoreCard label="Opponent" score={m.score.away} serving={m.serving === 'away'} detail={rotationLabel(m.rotation.away)} />
        </div>
        {scrim.over ? (
          <Card className="mx-auto max-w-xl p-6 text-center">
            <Icon name="trophy" className="mx-auto mb-2 h-10 w-10 text-amber-300" />
            <h2 className="font-display text-2xl font-bold text-white">{m.score.home > m.score.away ? 'You won the set!' : 'Set lost — run it back.'}</h2>
            <p className="mt-1 text-slate-400">{m.score.home}–{m.score.away} · {scrim.rallies.length} rallies</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button variant="primary" icon="refresh" onClick={() => { const s = newScrimmage(scrim.target, Math.random() < 0.5); setScrim(s); nextRally(s); }}>New match</Button>
              <Button onClick={back}>Done</Button>
            </div>
          </Card>
        ) : showResult && R.run?.result ? (
          <div className="mx-auto max-w-2xl space-y-3">
            <RallySummary run={R.run} results={R.results} />
            {m.lastRotated === 'home' && <p className="rounded-xl bg-amber-400/10 p-3 text-sm text-amber-100">Side-out! Your team won the serve back and rotated clockwise into {rotationLabel(m.rotation.home)}. #{server.number} {server.name} ({ROLE_INFO[server.role].abbr}) now serves.</p>}
            {m.lastRotated === 'away' && <p className="rounded-xl bg-white/5 p-3 text-sm text-slate-300">The opponent sided out and rotated. Your rotation stays the same — you are receiving.</p>}
            <Button variant="primary" icon="play" onClick={() => nextRally(scrim)}>Next rally</Button>
          </div>
        ) : R.run ? (
          <RallyStage run={R.run} onStep={onStep} timer={settings.level === 'competitive' ? 20 : undefined} />
        ) : null}
      </div>
    </div>
  );
}

function ScoreCard({ label, score, serving, detail }: { label: string; score: number; serving: boolean; detail: string }) {
  return (
    <Card className={`flex items-center gap-4 p-4 ${serving ? 'ring-amber-300/40' : ''}`}>
      <div className="font-display text-4xl font-extrabold text-white tabular-nums">{score}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 font-semibold text-white">
          {label} {serving && <Pill tone="amber">● serving</Pill>}
        </div>
        <div className="truncate text-xs text-slate-400">{detail}</div>
      </div>
    </Card>
  );
}
