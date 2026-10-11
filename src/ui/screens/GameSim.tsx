import { useEffect, useMemo, useRef, useState } from 'react';
import { evaluatePlacement, type Evaluation } from '../../engine/evaluate';
import { dist, type Vec } from '../../engine/geometry';
import { advanceRally, newScrimmage, recordRally, startRally, type RallyRun, type RallyStep, type Scrimmage } from '../../engine/rally';
import { makeRng } from '../../engine/rng';
import { onCourt } from '../../engine/rotation';
import { rotationalSpot, type PlaceScenario } from '../../engine/scenarios';
import { activeSetterId, playerById, roleWord } from '../../engine/systems';
import { Court, courtStyle, type CourtOverlays } from '../components/Court';
import { usePhone } from '../hooks';
import { Button, Card, Icon, ScreenHeader, Segmented, Toggle } from '../components/ui';
import { CourtLegend, YouCard } from '../components/YouCard';
import { ROLE_CHOICES, useStore, type RoleChoice } from '../store';
import { ROLE_INFO } from '../../engine/types';

type Stage = 'watch' | 'move' | 'result' | 'after' | 'point';

/** Short, spoken-style prompt for each moment. */
function callFor(sc: PlaceScenario): string {
  switch (sc.category) {
    case 'serveReceive':
      return 'They’re about to serve. Get to your spot.';
    case 'release':
      return 'Serve’s in the air — go!';
    case 'someoneElse':
    case 'receiveYou':
    case 'transition':
      return 'Ball’s up! Where do you go now?';
    case 'attacking':
      return 'We’re attacking — cover the hitter!';
    case 'blocking':
    case 'spikeDefense':
      return 'They’re attacking — set up your defence!';
    case 'tip':
      return 'Tip! Move!';
    case 'freeBall':
      return 'Free ball coming over!';
    case 'serving':
      return sc.scene.phase === 'serving' && sc.scene.ball.length ? 'We served — get to base!' : 'We’re serving. Where do you start?';
    default:
      return sc.prompt;
  }
}

/** Teammates’ calls, as speech bubbles. Never on the user (that would give away the answer). */
function bubblesFor(step: RallyStep, meId: string): { id: string; text: string }[] {
  const sc = step.scenario as PlaceScenario;
  const t = sc.objective.variants[0].targets;
  const out: { id: string; text: string }[] = [];
  const team = sc.scene.home.team;
  const setter = activeSetterId(team, sc.scene.home.rotation);
  const n = step.node;
  if (n.k === 'release') out.push({ id: n.passer, text: 'Mine!' });
  if (n.k === 'first') {
    out.push({ id: n.contact, text: n.contact === setter ? 'Help!' : 'Mine!' });
    const second = Object.keys(t).find((id) => /second ball|Emergency/.test(t[id].duty));
    if (second && second !== n.contact) out.push({ id: second, text: /Emergency/.test(t[second].duty) ? 'I’ve got it!' : 'Got it!' });
  }
  if (n.k === 'attack') out.push({ id: n.attacker, text: 'Here!' });
  if (n.k === 'defend') {
    const b = Object.keys(t).find((id) => /Outside blocker|lead the block|Read-block/.test(t[id].duty));
    if (b) out.push({ id: b, text: 'Block!' });
  }
  if (n.k === 'tip') {
    const r = Object.keys(t).find((id) => t[id].duty.startsWith('Tip is yours'));
    if (r) out.push({ id: r, text: 'Tip!' });
  }
  if (n.k === 'free') {
    const any = Object.keys(t).find((id) => /Free-ball passer/.test(t[id].duty));
    if (any) out.push({ id: any, text: 'Free!' });
  }
  return out.filter((b) => b.id !== meId);
}

const PRAISE = ['Great read!', 'Perfect spot.', 'Exactly right.', 'That’s the one.', 'Nice — smart move.'];

function coachLine(ev: Evaluation): { tone: 'good' | 'ok' | 'bad' | 'foul'; title: string; text: string } {
  const me = ev.perPlayer[0];
  const firstSentence = (s: string) => s.split(/(?<=\.)\s/)[0];
  if (ev.verdict === 'illegal') return { tone: 'foul', title: 'Whistle! Positional fault.', text: ev.violations[0]?.message ?? '' };
  if (!me) return { tone: 'good', title: 'Good.', text: '' };
  if (ev.verdict === 'recommended') return { tone: 'good', title: PRAISE[Math.floor(Math.random() * PRAISE.length)], text: `${me.target.duty}.` };
  if (ev.verdict === 'acceptable') return { tone: 'ok', title: 'Good — close enough.', text: `${me.target.duty}. ${firstSentence(me.target.why)}` };
  const dir = /is (too [^.]*?|out of position)\./.exec(me.messages[0])?.[1];
  return { tone: 'bad', title: dir ? `Not quite — you’re ${dir}.` : 'Not quite.', text: `${me.target.duty}: ${firstSentence(me.target.why)}` };
}

export function GameSimScreen() {
  const { settings, genOptions, back, record, patchProgress, reduced, ruleset, update } = useStore();
  const [role, setRole] = useState<RoleChoice>(settings.role === 'ALL' ? 'S' : settings.role);
  const [target, setTarget] = useState(15);
  /** Optional shot clock — off unless the player turns it on. */
  const [shotClock, setShotClock] = useState(false);
  const [speed, setSpeed] = useState(settings.speed > 1 ? 1 : settings.speed);
  /** Where everyone stood when this moment started (for "Try again"). */
  const momentStart = useRef<Record<string, Vec>>({});
  /** Only the first attempt at each moment counts toward progress. */
  const recordedMoment = useRef('');
  const [scrim, setScrim] = useState<Scrimmage | null>(null);
  const [run, setRun] = useState<RallyRun | null>(null);
  const [stepNo, setStepNo] = useState(0);
  const [stage, setStage] = useState<Stage>('watch');
  const [positions, setPositions] = useState<Record<string, Vec>>({});
  const [awayPos, setAwayPos] = useState<Record<string, Vec>>({});
  const [ballPath, setBallPath] = useState<RallyStep['scenario']['scene']['ball']>([]);
  const [ballKey, setBallKey] = useState(0);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [why, setWhy] = useState(false);
  const [hint, setHint] = useState(false);
  const [feed, setFeed] = useState<{ t: string; icon: string }[]>([]);
  const [bubbles, setBubbles] = useState<{ id: string; text: string }[]>([]);
  const [decisions, setDecisions] = useState<number[]>([]);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const rng = useRef(makeRng());
  /** Positions on screen when the current moment began (replay starts from here). */
  const stepFrom = useRef<Record<string, Vec>>({});
  const posRef = useRef<Record<string, Vec>>({});
  const [replayN, setReplayN] = useState(0);
  const [replayFrom, setReplayFrom] = useState<Record<string, Vec> | undefined>(undefined);
  const [slow, setSlow] = useState(false);
  const [paused, setPaused] = useState(false);
  const phone = usePhone();
  const view = phone ? 'half' : 'full';

  const step = run ? run.steps[run.steps.length - 1] : null;
  const sc = step?.scenario as PlaceScenario | undefined;
  const meId = run?.focusIds[0];
  posRef.current = positions;
  const say = (t: string, icon = 'ball') => setFeed((f) => [{ t, icon }, ...f].slice(0, 7));

  const startRallyFor = (s: Scrimmage) => {
    const r = startRally({
      opts: genOptions({ rng: rng.current }),
      focus: { kind: 'role', role: role === 'ALL' ? 'S' : role },
      homeServing: s.match.serving === 'home',
      homeRotation: s.match.rotation.home,
      awayRotation: s.match.rotation.away,
      stepCap: 7,
    });
    setRun(r);
    setStepNo((n) => n + 1);
  };

  // Load each new step.
  useEffect(() => {
    if (!step || !sc || !meId) return;
    const start = { ...sc.scene.home.positions, ...sc.start };
    const n = step.node;
    const firstOfRally = n.k === 'receive' || n.k === 'serve';
    const prevMe = posRef.current[meId];
    if (!firstOfRally && prevMe && !(n.k === 'first' && n.contact === meId)) {
      // Keep the user where they put themselves — the play continues from there.
      start[meId] = prevMe;
    } else if (start[meId] && (start[meId].x > 9.4 || start[meId].x < -0.4)) {
      const z = onCourt(sc.scene.home.team, sc.scene.home.rotation, sc.scene.home.serving).find((o) => o.playerId === meId)?.zone;
      if (z) start[meId] = rotationalSpot(z);
    }
    stepFrom.current = firstOfRally ? start : { ...start, ...posRef.current, [meId]: posRef.current[meId] ?? start[meId] };
    setReplayFrom(undefined);
    setSlow(false);
    momentStart.current = start;
    setPositions(start);
    setAwayPos(sc.scene.away.positions);
    setBallPath(sc.scene.ball);
    setBallKey((k) => k + 1);
    setEv(null);
    setWhy(false);
    setHint(false);
    setBubbles(bubblesFor(step, meId));
    if (step.narration) say(step.narration);
    setStage(sc.scene.ball.length ? 'watch' : 'move');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.steps.length, stepNo]);

  // Bubbles fade.
  useEffect(() => {
    if (!bubbles.length) return;
    const t = setTimeout(() => setBubbles([]), 2600);
    return () => clearTimeout(t);
  }, [bubbles]);

  // Prep timer at competitive level.
  useEffect(() => {
    if (stage !== 'move') return setTimeLeft(null);
    if (!shotClock) return setTimeLeft(null);
    setTimeLeft(12);
  }, [stage, shotClock]);
  useEffect(() => {
    if (timeLeft === null || stage !== 'move') return;
    if (timeLeft <= 0) return lockIn();
    const t = setTimeout(() => setTimeLeft((x) => (x === null ? null : x - 1)), 1000);
    return () => clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function lockIn() {
    if (!sc || !meId || stage !== 'move') return;
    const e = evaluatePlacement({ team: sc.scene.home.team, rotation: sc.scene.home.rotation, serving: sc.scene.home.serving, ruleset, positions, objective: sc.objective });
    setEv(e);
    setStage('result');
    const score = e.verdict === 'illegal' ? 0 : e.score;
    const key = `${stepNo}-${run?.steps.length}`;
    if (recordedMoment.current !== key) {
      recordedMoment.current = key;
      setDecisions((d) => [...d, score]);
      record({ t: Date.now(), category: sc.category, skills: sc.skills, score, verdict: e.verdict, systemId: sc.systemId, rotation: sc.rotation, role, errorTags: e.errorTags });
    }
  }

  /** Redo this moment: put everyone back and let the player move again. */
  function tryAgain() {
    setEv(null);
    setWhy(false);
    setHint(false);
    setSlow(false);
    setPositions({ ...momentStart.current });
    setStage('move');
  }

  function continueAfter() {
    if (!sc || !run) return;
    setWhy(false);
    finishStep();
  }

  /** Re-run the current moment (teammates' movement + ball) in slow motion. */
  function replay() {
    if (!step || !meId) return;
    setReplayFrom({ ...stepFrom.current });
    setReplayN((x) => x + 1);
    setBallKey((k) => k + 1);
    setSlow(true);
    setPaused(false);
    setBubbles(bubblesFor(step, meId));
  }

  function finishStep() {
    if (!run || !scrim) return;
    advanceRally(run, ev ? (ev.verdict === 'illegal' ? 0 : ev.score) : 50, rng.current);
    if (run.result) {
      const ns = recordRally(scrim, run.result);
      setScrim(ns);
      say(run.result.reason, run.result.winner === 'home' ? 'trophy' : 'alert');
      setStage('point');
      setRun({ ...run });
      patchProgress((p) => ({ ...p, rallies: { played: p.rallies.played + 1, won: p.rallies.won + (run.result!.winner === 'home' ? 1 : 0) } }));
      if (ns.over) {
        const won = ns.match.score.home > ns.match.score.away;
        patchProgress((p) => ({ ...p, scrimmage: { won: p.scrimmage.won + (won ? 1 : 0), lost: p.scrimmage.lost + (won ? 0 : 1) } }));
      }
    } else {
      setRun({ ...run });
    }
  }


  const onBallDone = () => {
    setSlow(false);
    if (stage === 'watch') setStage('move');
  };

  const overlays: CourtOverlays = useMemo(() => {
    const o: CourtOverlays = { zones: settings.level === 'beginner' };
    if (!sc || !meId) return o;
    const t = (ev?.matchedVariant ?? sc.objective.variants[0]).targets[meId];
    if (sc.scene.overlays?.tipAt) o.tipAt = sc.scene.overlays.tipAt;
    if (stage === 'move' && hint && t) o.regions = [{ c: t.pos, r: t.radius + 1.5, tone: 'hint' }];
    if (stage === 'result' && t && ev) {
      o.regions = [{ c: t.pos, r: t.radius, tone: 'target' }];
      if (dist(positions[meId], t.pos) > t.radius) {
        o.ghosts = [{ id: meId, pos: t.pos, label: String(playerById(sc.scene.home.team, meId).number), color: ROLE_INFO[playerById(sc.scene.home.team, meId).role].color, tone: 'rec' }];
        o.arrows = [{ from: positions[meId], to: t.pos, tone: 'rec' }];
      }
      if (ev.violations.length) o.violations = ev.violations.map((v) => v.players);
      if (sc.objective.legality === 'receivingFormation') o.feet = true;
    }
    return o;
  }, [sc, meId, stage, hint, ev, positions, settings.level]);

  // ---------------- Setup ----------------
  if (!scrim) {
    return (
      <div className="mx-auto max-w-2xl pb-16">
        <ScreenHeader title="Game Simulator" subtitle="Play a real match as one player" onBack={back} />
        <div className="space-y-5 px-4 sm:px-6">
          <Card className="p-5">
            <p className="text-slate-300">The rally plays out on its own. Whenever it’s your moment — before the serve, when the ball is passed, when a teammate attacks, when they attack — the game pauses for a second and you move <strong className="text-amber-200">yourself</strong>. Your teammates do the rest.</p>
          </Card>
          <div>
            <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Who do you play?</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {ROLE_CHOICES.filter((r) => r.id !== 'ALL').map((r) => (
                <button key={r.id} onClick={() => setRole(r.id)} className={`flex items-center gap-2 rounded-xl p-3 text-left text-sm font-semibold ring-1 ${role === r.id ? 'bg-amber-300/15 text-white ring-amber-300/60' : 'bg-white/5 text-slate-300 ring-white/10'}`}>
                  <span className="h-3 w-3 rounded-full" style={{ background: ROLE_INFO[r.id as keyof typeof ROLE_INFO].color }} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">Match length</div>
            <Segmented value={target} onChange={setTarget} options={[{ value: 7, label: 'Quick (to 7)' }, { value: 15, label: 'To 15' }, { value: 25, label: 'Full set (25)' }]} />
          </div>
          <Card className="p-4">
            <Toggle checked={shotClock} onChange={setShotClock} label={<span><strong className="text-white">Shot clock</strong> <span className="text-slate-400">— 12 seconds per move, then it locks in for you. Off = take as long as you like.</span></span>} />
          </Card>
          <Button
            variant="primary"
            size="lg"
            icon="play"
            onClick={() => {
              const s = newScrimmage(target, Math.random() < 0.5);
              setScrim(s);
              setFeed([]);
              setDecisions([]);
              startRallyFor(s);
            }}
          >
            Play
          </Button>
        </div>
      </div>
    );
  }

  const m = scrim.match;
  const avg = decisions.length ? Math.round(decisions.reduce((a, b) => a + b, 0) / decisions.length) : 0;
  const line = ev ? coachLine(ev) : null;
  const homeScene = sc ? { ...sc.scene.home, positions } : null;
  const meZone = sc && meId ? onCourt(sc.scene.home.team, sc.scene.home.rotation, sc.scene.home.serving).find((o) => o.playerId === meId)?.zone : undefined;

  return (
    <div className="mx-auto max-w-6xl pb-56 lg:pb-16">
      <ScreenHeader title="Game Simulator" onBack={back} />
      <div className="px-4 sm:px-6">
        {/* Scoreboard */}
        <div className="mb-3 flex items-center justify-center gap-4 rounded-2xl bg-slate-900/70 p-2 ring-1 ring-white/8 sm:p-3">
          <div className="text-right">
            <div className="text-xs text-slate-400">Your team {m.serving === 'home' && <span className="text-amber-300">● serve</span>}</div>
            <div className="font-display text-2xl font-extrabold text-white tabular-nums sm:text-3xl">{m.score.home}</div>
          </div>
          <div className="text-slate-600">–</div>
          <div>
            <div className="text-xs text-slate-400">{m.serving === 'away' && <span className="text-amber-300">serve ● </span>}Opponent</div>
            <div className="font-display text-2xl font-extrabold text-white tabular-nums sm:text-3xl">{m.score.away}</div>
          </div>
        </div>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            {sc && homeScene && meId && (
              <div className="mx-auto mb-2 flex max-w-full flex-wrap items-center justify-center gap-2">
                <button
                  onClick={() => setPaused((p) => !p)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/8 px-3 text-xs font-bold text-white ring-1 ring-white/10 hover:bg-white/14"
                  aria-label={paused ? 'Resume the play' : 'Pause the play'}
                >
                  <Icon name={paused ? 'play' : 'pause'} className="h-4 w-4" /> {paused ? 'Resume' : 'Pause'}
                </button>
                <span className="text-[11px] font-semibold text-slate-400">Speed</span>
                <Segmented size="sm" value={speed} onChange={(v) => { setSpeed(v); update({ speed: v }); }} options={[{ value: 0.25, label: '¼×' }, { value: 0.5, label: '½×' }, { value: 1, label: '1×' }, { value: 1.5, label: '1½×' }]} />
              </div>
            )}
            {sc && homeScene && meId && (
              <div className="relative mx-auto w-full" style={courtStyle(view, phone, 76)}>
                <Court
                  className="h-full w-full"
                  home={homeScene}
                  away={{ ...sc.scene.away, positions: awayPos }}
                  animKey={`${stepNo}-${run?.steps.length}-${replayN}`}
                  homeFrom={replayFrom}
                  ballPath={ballPath}
                  ballKey={`gs-${ballKey}`}
                  ballRest={sc.scene.ballRest}
                  onBallDone={onBallDone}
                  draggable={stage === 'move' ? [meId] : []}
                  selectedId={stage === 'move' ? meId : null}
                  onMove={(id, p) => setPositions((x) => ({ ...x, [id]: p }))}
                  overlays={overlays}
                  playback={{ speed: slow ? speed * 0.5 : speed, paused: why || paused, reduced }}
                  meId={meId}
                  labels={settings.labels}
                  zoneBadges={settings.zoneBadges}
                  bubbles={bubbles}
                  view={view}
                />
                {(stage === 'move' || stage === 'result') && sc.scene.ball.length > 0 && (
                  <button
                    onClick={replay}
                    className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 rounded-full bg-slate-950/85 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-white/20 backdrop-blur hover:bg-slate-900"
                    aria-label="Replay this play in slow motion"
                  >
                    <Icon name="replay" className="h-4 w-4" /> Replay
                  </button>
                )}
                {slow && (
                  <div className="pointer-events-none absolute top-2 left-2 z-10 rounded-full bg-sky-400/90 px-2.5 py-1 text-[11px] font-bold text-slate-950">Slow-mo</div>
                )}
                {stage === 'move' && (
                  <div className="vq-pop pointer-events-none absolute inset-x-0 top-2 flex justify-center">
                    <div className="rounded-full bg-amber-300 px-4 py-1.5 text-sm font-extrabold text-slate-950 shadow-lg">
                      Your move{timeLeft !== null ? ` · ${timeLeft}s` : ''}
                    </div>
                  </div>
                )}
                {stage === 'point' && run?.result && (
                  <div className="vq-pop absolute inset-0 grid place-items-center rounded-2xl bg-slate-950/60 p-6 backdrop-blur-[2px]">
                    <div className="max-w-xs text-center">
                      <div className={`font-display text-3xl font-extrabold ${run.result.winner === 'home' ? 'text-emerald-300' : 'text-rose-300'}`}>{run.result.winner === 'home' ? 'Our point!' : 'Their point'}</div>
                      <p className="mt-2 text-sm text-slate-200">{run.result.reason}</p>
                      {m.lastRotated === 'home' && meId && (
                        <p className="mt-3 rounded-xl bg-amber-300/15 p-2 text-sm text-amber-100">
                          Side-out — we rotate! {(() => {
                            const team = run.world.home.team;
                            const z = onCourt(team, m.rotation.home, true).find((o) => o.baseId === meId || o.playerId === meId)?.zone;
                            return z ? `You move to Position ${z}.` : 'You come off for the libero/server.';
                          })()}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <CourtLegend />
          </div>

          <div className="space-y-3">
            {homeScene && meId && <YouCard scene={homeScene} id={meId} />}

            <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 lg:static lg:inset-auto">
            {scrim.over ? (
              <Card className="p-5 text-center">
                <Icon name="trophy" className="mx-auto mb-2 h-9 w-9 text-amber-300" />
                <div className="font-display text-2xl font-bold text-white">{m.score.home > m.score.away ? 'You won!' : 'They won this one.'}</div>
                <p className="mt-1 text-sm text-slate-400">{m.score.home}–{m.score.away} · your decisions averaged {avg}/100</p>
                <div className="mt-4 flex justify-center gap-2">
                  <Button variant="primary" icon="refresh" onClick={() => { const s = newScrimmage(scrim.target, Math.random() < 0.5); setScrim(s); setDecisions([]); setFeed([]); startRallyFor(s); }}>Play again</Button>
                  <Button onClick={() => setScrim(null)}>Change role</Button>
                </div>
              </Card>
            ) : stage === 'point' ? (
              <Button variant="primary" size="lg" className="w-full" icon="play" onClick={() => startRallyFor(scrim)}>
                Next rally
              </Button>
            ) : stage === 'move' && sc ? (
              <Card className="space-y-2 p-3 shadow-2xl lg:space-y-3 lg:p-4">
                <p className="font-display text-base font-bold text-white lg:text-lg">{callFor(sc)}</p>
                <p className="hidden text-xs text-slate-400 lg:block">Drag the <span className="font-bold text-amber-200">YOU</span> marker, or tap where you want to be.</p>
                <div className="flex gap-2">
                  <Button variant="primary" className="flex-1" icon="check" onClick={lockIn}>Lock it in</Button>
                  {settings.level !== 'competitive' && <Button icon="hint" onClick={() => setHint(true)} disabled={hint}>Hint</Button>}
                </div>
                {hint && sc.hints[0] && <p className="rounded-lg bg-amber-400/10 p-2 text-xs text-amber-50">{sc.hints[0]}</p>}
              </Card>
            ) : stage === 'result' && line ? (
              <Card className={`vq-pop space-y-2 p-3 shadow-2xl ring-2 lg:p-4 ${line.tone === 'good' ? 'ring-emerald-300/50' : line.tone === 'ok' ? 'ring-sky-300/50' : line.tone === 'bad' ? 'ring-amber-300/50' : 'ring-rose-400/60'}`}>
                <p className={`font-display text-lg font-bold ${line.tone === 'good' ? 'text-emerald-200' : line.tone === 'ok' ? 'text-sky-200' : line.tone === 'bad' ? 'text-amber-200' : 'text-rose-200'}`}>{line.title}</p>
                {line.text && <p className="text-sm text-slate-200">{line.text}</p>}
                {why && sc && <p className="rounded-lg bg-white/5 p-2 text-xs whitespace-pre-line text-slate-300">{sc.explanation}</p>}
                <div className="flex flex-wrap gap-2">
                  {!why && <Button size="sm" variant="ghost" icon="info" onClick={() => setWhy(true)}>Why?</Button>}
                  {sc && sc.scene.ball.length > 0 && <Button size="sm" variant="ghost" icon="replay" onClick={replay}>Watch again</Button>}
                  <Button size="sm" variant="ghost" icon="refresh" onClick={tryAgain}>Try again</Button>
                  <Button size="sm" variant="primary" className="ml-auto" icon="right" onClick={continueAfter}>Keep playing</Button>
                </div>
              </Card>
            ) : (
              <Card className="p-4 text-sm text-slate-400">
                <span className="inline-flex items-center gap-2"><Icon name="ball" className="h-4 w-4 text-sky-300" /> Watch the play…</span>
              </Card>
            )}
            </div>

            <Card className="p-4">
              <div className="mb-2 text-[11px] font-bold tracking-wider text-slate-500 uppercase">Play-by-play</div>
              <ul className="space-y-1.5">
                {feed.map((f, i) => (
                  <li key={feed.length - i} className={`flex gap-2 text-sm ${i === 0 ? 'text-white' : 'text-slate-400'}`}>
                    <Icon name={f.icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    {f.t}
                  </li>
                ))}
              </ul>
              {meZone && sc && meId && <p className="mt-3 text-[11px] text-slate-500">You: {roleWord(sc.scene.home.team, sc.scene.home.rotation, meId)}, Position {meZone}. Decisions so far: {avg || '—'}/100</p>}
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
