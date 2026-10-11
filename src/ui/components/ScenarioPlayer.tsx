import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DIMENSION_LABEL, evaluatePlacement, type Dimension, type Evaluation, type Verdict } from '../../engine/evaluate';
import { dist, type Side, type Vec, type Zone } from '../../engine/geometry';
import { onCourt } from '../../engine/rotation';
import type { ChoiceOption, Scenario } from '../../engine/scenarios';
import { playerById } from '../../engine/systems';
import { blockShadow } from '../../engine/tactics';
import { ROLE_INFO, type Difficulty } from '../../engine/types';
import { useStore, zonesVisible } from '../store';
import { Court, courtStyle, type Arrow, type CourtOverlays, type Ghost, type RegionMark } from './Court';
import { playerInfo, PlayerPanel, TooltipCard, ZonePanel } from './InfoPanel';
import { Bar, Button, Collapsible, Icon, Pill, Segmented, VerdictBadge } from './ui';
import { CourtLegend, YouCard } from './YouCard';
import { usePhone } from '../hooks';

export interface StepResult {
  score: number;
  verdict: Verdict | ChoiceOption['verdict'];
  errorTags: string[];
  dims?: Evaluation['dims'];
}

type Stage = 'intro' | 'act' | 'freeze' | 'checked' | 'after';

interface Props {
  scenario: Scenario;
  onComplete: (r: StepResult) => void;
  nextLabel?: string;
  timerSec?: number;
  header?: ReactNode;
  difficulty?: Difficulty;
  /** Part of a continuous rally: the next step animates the play, so skip the separate "what happens next" preview (it would contradict the next step's start). */
  chained?: boolean;
  /** Called as soon as the user checks/answers (before Next). */
  onChecked?: (r: StepResult) => void;
}

const CHOICE_SCORE: Record<ChoiceOption['verdict'], number> = { best: 100, ok: 70, wrong: 15, illegal: 0 };

export function ScenarioPlayer({ scenario, onComplete, nextLabel = 'Next', timerSec, header, difficulty, onChecked, chained }: Props) {
  const { settings, reduced, update } = useStore();
  const level = difficulty ?? settings.level;
  const sc = scenario;
  const home = sc.scene.home;
  const initialPos = sc.kind === 'place' ? { ...home.positions, ...sc.start } : home.positions;

  const [stage, setStage] = useState<Stage>('intro');
  const [positions, setPositions] = useState<Record<string, Vec>>(initialPos);
  const [awayPos, setAwayPos] = useState(sc.scene.away.positions);
  const [animKey, setAnimKey] = useState(0);
  const [ballKey, setBallKey] = useState(0);
  const [ballPath, setBallPath] = useState(sc.scene.ball);
  const [homeFrom, setHomeFrom] = useState<Record<string, Vec> | undefined>(undefined);
  const [ev, setEv] = useState<Evaluation | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [tapped, setTapped] = useState<Zone | null>(null);
  const [hint, setHint] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [inspect, setInspect] = useState<{ kind: 'player'; side: Side; id: string } | { kind: 'zone'; side: Side; zone: Zone } | null>(null);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(settings.speed);
  const phone = usePhone();
  const [view, setView] = useState<'full' | 'half'>(phone ? 'half' : settings.view);
  const [tilt, setTilt] = useState(false);
  const [showZones, setShowZones] = useState(zonesVisible(settings));
  const [showCoverage, setShowCoverage] = useState(false);
  const [showingRec, setShowingRec] = useState(false);
  const [userSnapshot, setUserSnapshot] = useState<Record<string, Vec> | null>(null);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(timerSec ?? null);
  const [phaseCaption, setPhaseCaption] = useState(sc.scene.caption);
  const checkedRef = useRef(false);

  // Reset on new scenario.
  useEffect(() => {
    setStage(sc.scene.ball.length ? 'intro' : 'act');
    setPositions(sc.kind === 'place' ? { ...sc.scene.home.positions, ...sc.start } : sc.scene.home.positions);
    setAwayPos(sc.scene.away.positions);
    setBallPath(sc.scene.ball);
    setBallKey((k) => k + 1);
    setAnimKey((k) => k + 1);
    setHomeFrom(undefined);
    setEv(null);
    setPicked(null);
    setTapped(null);
    setHint(0);
    setSelected(sc.kind === 'place' && sc.objective.controlled.length === 1 ? sc.objective.controlled[0] : null);
    setInspect(null);
    setShowingRec(false);
    setUserSnapshot(null);
    setTimeLeft(timerSec ?? null);
    setPhaseCaption(sc.scene.caption);
    checkedRef.current = false;
  }, [sc.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const playback = { speed, paused, reduced };
  const controlled = sc.kind === 'place' ? sc.objective.controlled : [];
  const draggable = sc.kind === 'place' && (stage === 'act' || stage === 'intro') ? controlled : [];
  const primary = sc.kind === 'place' ? sc.objective.variants[0] : null;
  const matched = ev?.matchedVariant ?? primary;
  const revealed = stage === 'checked' || stage === 'after' || level === 'beginner' && hint >= 3;
  const maxHints = level === 'competitive' ? 1 : 3;

  // Prep timer (competitive difficulty in rallies).
  useEffect(() => {
    if (timeLeft === null || stage !== 'act' || paused) return;
    if (timeLeft <= 0) {
      if (sc.kind === 'place') doCheck();
      return;
    }
    const t = setTimeout(() => setTimeLeft((x) => (x === null ? null : x - 1)), 1000);
    return () => clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  function doCheck() {
    if (sc.kind !== 'place' || checkedRef.current) return;
    checkedRef.current = true;
    const e = evaluatePlacement({ team: home.team, rotation: home.rotation, serving: home.serving, ruleset: sc.ruleset, positions, objective: sc.objective });
    setEv(e);
    setSelected(null);
    const finish = () => {
      setStage('checked');
      if (e.legalityNote || e.violations.length) setPhaseCaption(e.violations.length ? 'Service contact — positional fault!' : 'Service contact — legal ✓');
      onChecked?.({ score: e.verdict === 'illegal' ? 0 : e.score, verdict: e.verdict, errorTags: e.errorTags, dims: e.dims });
    };
    if (sc.objective.legality === 'receivingFormation' || sc.objective.legality === 'servingFormation') {
      setStage('freeze');
      setPhaseCaption('Service contact — freeze! Checking every player’s feet…');
      setTimeout(finish, reduced ? 50 : 1100);
    } else finish();
  }

  function answer(opt: ChoiceOption) {
    if (picked) return;
    setPicked(opt.id);
    setStage('checked');
    onChecked?.({ score: CHOICE_SCORE[opt.verdict], verdict: opt.verdict, errorTags: opt.verdict === 'illegal' ? ['illegalChoice'] : opt.verdict === 'wrong' ? ['wrongChoice'] : [] });
  }

  function tap(side: Side, z: Zone) {
    if (sc.kind === 'tapZone') {
      if (tapped || side !== 'home') return;
      setTapped(z);
      setStage('checked');
      const ok = sc.correct.includes(z);
      onChecked?.({ score: ok ? 100 : 0, verdict: ok ? 'best' : 'wrong', errorTags: ok ? [] : ['wrongChoice'] });
      return;
    }
    setInspect({ kind: 'zone', side, zone: z });
  }

  function showRecommended() {
    if (!matched) return;
    if (!showingRec) {
      setUserSnapshot(positions);
      const next = { ...positions };
      for (const id of controlled) if (matched.targets[id]) next[id] = matched.targets[id].pos;
      setPositions(next);
      setShowingRec(true);
    } else if (userSnapshot) {
      setPositions(userSnapshot);
      setShowingRec(false);
    }
  }

  function playAfter() {
    if (!sc.after) return;
    setHomeFrom(showingRec ? undefined : { ...positions });
    setUserSnapshot((u) => u ?? positions);
    setPositions({ ...positions, ...sc.after.home });
    setAwayPos(sc.after.away);
    setBallPath(sc.after.ball);
    setBallKey((k) => k + 1);
    setStage('after');
    setPhaseCaption(sc.after.caption);
  }

  function replay() {
    if (stage === 'after' && sc.after) {
      setHomeFrom(userSnapshot ?? undefined);
      setAnimKey((k) => k + 1);
      setBallKey((k) => k + 1);
    } else {
      setBallPath(sc.scene.ball);
      setBallKey((k) => k + 1);
    }
  }

  function finish() {
    const r: StepResult =
      sc.kind === 'place'
        ? { score: ev ? (ev.verdict === 'illegal' ? 0 : ev.score) : 0, verdict: ev?.verdict ?? 'weak', errorTags: ev?.errorTags ?? [], dims: ev?.dims }
        : sc.kind === 'choice'
          ? (() => {
              const o = sc.options.find((x) => x.id === picked)!;
              return { score: CHOICE_SCORE[o.verdict], verdict: o.verdict, errorTags: o.verdict === 'illegal' ? ['illegalChoice'] : o.verdict === 'wrong' ? ['wrongChoice'] : [] };
            })()
          : { score: tapped && sc.correct.includes(tapped) ? 100 : 0, verdict: tapped && sc.correct.includes(tapped) ? 'best' : 'wrong', errorTags: [] };
    onComplete(r);
  }

  // ---------------- overlays ----------------
  const overlays: CourtOverlays = useMemo(() => {
    const o: CourtOverlays = { zones: showZones || sc.kind === 'tapZone', zoneNumbers: sc.kind !== 'tapZone' || stage === 'checked' };
    if (sc.kind === 'tapZone' && tapped) o.zoneHighlight = [...sc.correct, tapped];
    if (sc.scene.overlays?.passTarget && level !== 'competitive') o.passTarget = sc.scene.overlays.passTarget;
    if (sc.scene.overlays?.tipAt) o.tipAt = sc.scene.overlays.tipAt;
    if (sc.scene.overlays?.hitter) {
      o.hitter = sc.scene.overlays.hitter;
      o.attackRays = level === 'beginner' || stage === 'checked' || stage === 'after';
    }
    if (sc.kind !== 'place' || !primary) return o;
    const legality = sc.objective.legality;
    if (legality === 'receivingFormation' || legality === 'servingFormation') o.feet = stage === 'freeze' || stage === 'checked' || level === 'beginner';
    const ghosts: Ghost[] = [];
    const regions: RegionMark[] = [];
    const arrows: Arrow[] = [];
    const tgt = matched!;
    const num = (id: string) => String(playerById(home.team, id).number);
    const col = (id: string) => ROLE_INFO[playerById(home.team, id).role].color;
    if (stage === 'act' || stage === 'intro') {
      if (hint >= 2) for (const id of controlled) if (primary.targets[id] && !primary.targets[id].locked) regions.push({ c: primary.targets[id].pos, r: primary.targets[id].radius + 1.5, tone: 'hint' });
      if (hint >= 3) for (const id of controlled) if (primary.targets[id]) ghosts.push({ id, pos: primary.targets[id].pos, label: num(id), color: col(id), tone: 'rec' });
    }
    if (stage === 'checked' || stage === 'after') {
      for (const id of controlled) {
        const t = tgt.targets[id];
        if (!t || t.locked) continue;
        if (stage === 'checked') {
          regions.push({ c: t.pos, r: t.radius, tone: 'target' });
          for (const a of t.alt ?? []) regions.push({ c: a.pos, r: a.radius, tone: 'alt', label: a.label });
        }
        const userP = (showingRec ? userSnapshot?.[id] : positions[id]) ?? positions[id];
        if (dist(userP, t.pos) > t.radius && stage === 'checked') {
          ghosts.push({ id, pos: t.pos, label: num(id), color: col(id), tone: 'rec' });
          arrows.push({ from: userP, to: t.pos, tone: 'rec' });
        }
        if (showingRec && userSnapshot) ghosts.push({ id, pos: userSnapshot[id], label: num(id), color: '#f8fafc', tone: 'user' });
        if (t.next && stage === 'checked' && level !== 'competitive') arrows.push({ from: t.pos, to: t.next, tone: 'next' });
      }
      if (ev?.violations.length) o.violations = ev.violations.map((v) => v.players);
      if (stage === 'after' && userSnapshot) for (const id of controlled) if (sc.after?.home[id]) arrows.push({ from: userSnapshot[id], to: sc.after.home[id], tone: 'trail' });
      if (sc.scene.overlays?.hitter && sc.objective.blockSpots?.length) {
        const blockers = Object.keys(tgt.targets).filter((id) => tgt.targets[id].pos.y < 0.8);
        const bpos = blockers.map((id) => (controlled.includes(id) ? positions[id] : tgt.targets[id].pos)).filter((p) => p.y < 1.2);
        o.blockShadow = blockShadow(sc.scene.overlays.hitter, bpos);
      }
    }
    if (showCoverage && sc.objective.coverage) {
      const ex = sc.objective.coverage.exclude ?? [];
      o.coverage = Object.entries(positions).filter(([id]) => !ex.includes(id) && onCourt(home.team, home.rotation, home.serving).some((x) => x.playerId === id)).map(([, p]) => ({ c: p, r: sc.objective.coverage!.reach }));
    }
    o.ghosts = ghosts;
    o.regions = regions;
    o.arrows = arrows;
    return o;
  }, [sc, stage, hint, positions, ev, showZones, showCoverage, showingRec, userSnapshot, tapped, level, selected]); // eslint-disable-line react-hooks/exhaustive-deps

  const curPhase = stage === 'after' && sc.after ? sc.after.phase : sc.scene.phase;
  const tooltip = (side: Side, id: string) => {
    const s = side === 'home' ? { ...home, positions } : { ...sc.scene.away, positions: awayPos };
    const t = side === 'home' && revealed ? matched?.targets[id] : undefined;
    return <TooltipCard info={playerInfo(s, id, curPhase, t, s.positions[id])} />;
  };

  const cStyle = courtStyle(view, phone, 78);
  const meId = sc.focusIds.length === 1 ? sc.focusIds[0] : undefined;
  const homeScene = { ...home, positions };

  const mobileVerdict =
    sc.kind === 'place' && ev
      ? `${ev.verdict === 'recommended' ? '✓ Great spot' : ev.verdict === 'acceptable' ? '✓ Good enough' : ev.verdict === 'weak' ? '~ Not quite' : '✗ Illegal'} · ${ev.verdict === 'illegal' ? 0 : ev.score}`
      : sc.kind === 'choice' && picked
        ? (() => { const v = sc.options.find((o) => o.id === picked)!.verdict; return v === 'best' ? '✓ Correct' : v === 'ok' ? '✓ Defensible' : v === 'illegal' ? '✗ Illegal' : '✗ Not quite'; })()
        : sc.kind === 'tapZone' && tapped
          ? sc.correct.includes(tapped) ? '✓ Correct' : '✗ Not quite'
          : '';
  const panelRef = useRef<HTMLDivElement>(null);
  const mobileBar =
    sc.kind === 'place' && (stage === 'act' || stage === 'intro') ? (
      <>
        <Button variant="primary" className="flex-1" icon="check" onClick={doCheck}>Check</Button>
        <Button icon="hint" onClick={() => { setHint((h) => Math.min(maxHints, h + 1)); panelRef.current?.scrollIntoView({ behavior: 'smooth' }); }} disabled={hint >= maxHints}>Hint</Button>
      </>
    ) : stage === 'checked' || stage === 'after' ? (
      <>
        <button className="min-w-0 flex-1 truncate rounded-xl bg-white/8 px-3 text-left text-sm font-semibold text-white ring-1 ring-white/10" onClick={() => panelRef.current?.scrollIntoView({ behavior: 'smooth' })}>
          {mobileVerdict}
        </button>
        {sc.after && !chained && stage === 'checked' && <Button icon="play" className="whitespace-nowrap px-3" onClick={playAfter} aria-label="Watch what happens" />}
        <Button variant="primary" icon="right" className="whitespace-nowrap" onClick={finish}>Next</Button>
      </>
    ) : null;

  const guide = level === 'competitive' ? null : level === 'beginner' ? sc.three.now : sc.three.watch;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4 pb-24 lg:grid-cols-[minmax(0,1fr)_380px] lg:pb-0">
      {mobileBar && <div className="fixed inset-x-0 bottom-0 z-30 flex gap-2 border-t border-white/10 bg-slate-950/95 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:hidden">{mobileBar}</div>}
      {/* Court column */}
      <div className="min-w-0">
        <div className="mb-2 space-y-2 lg:hidden">
          {meId && <YouCard scene={homeScene} id={meId} compact />}
          <p className="text-[15px] leading-snug font-semibold text-white">{sc.kind === 'place' ? sc.prompt : sc.question}</p>
        </div>
        <div className="mb-2 flex items-center gap-2">
          <Pill tone={stage === 'freeze' ? 'rose' : 'sky'} className="min-w-0">
            <Icon name={stage === 'freeze' ? 'whistle' : 'ball'} className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{phaseCaption}</span>
          </Pill>
          {timeLeft !== null && stage === 'act' && <Pill tone={timeLeft <= 5 ? 'rose' : 'amber'}>⏱ {timeLeft}s</Pill>}
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <IconBtn icon="replay" label="Replay animation" onClick={replay} />
            <IconBtn icon="settings" label="View options" onClick={() => setShowOptions((s) => !s)} />
          </div>
        </div>
        {showOptions && (
          <div className="vq-pop mb-2 flex flex-wrap items-center gap-2 rounded-xl bg-white/5 p-2 ring-1 ring-white/10">
            <IconBtn icon={paused ? 'play' : 'pause'} label={paused ? 'Play' : 'Pause'} onClick={() => setPaused((p) => !p)} />
            <IconBtn icon="skip" label="Skip animation" onClick={() => { setBallKey((k) => k + 1); setBallPath([]); if (stage === 'intro') setStage('act'); }} />
            <select aria-label="Animation speed" value={speed} onChange={(e) => { setSpeed(+e.target.value); update({ speed: +e.target.value }); }} className="h-8 rounded-lg bg-white/8 px-1.5 text-xs text-slate-200 ring-1 ring-white/10">
              {[0.25, 0.5, 1, 1.5, 2].map((s) => (
                <option key={s} value={s} className="bg-slate-900">{s}× speed</option>
              ))}
            </select>
            <Segmented size="sm" value={view} onChange={(v) => { setView(v); update({ view: v }); }} options={[{ value: 'full', label: 'Full court' }, { value: 'half', label: 'Our side' }]} />
            <ToggleChip on={showZones} onClick={() => setShowZones((z) => !z)} icon="court" label="Zones" />
            {sc.kind === 'place' && sc.objective.coverage && <ToggleChip on={showCoverage} onClick={() => setShowCoverage((z) => !z)} icon="shield" label="Coverage" />}
            <ToggleChip on={tilt} onClick={() => setTilt((t) => !t)} icon="tilt" label="Angled" />
            <ToggleChip on={pauseOpen} onClick={() => { setPauseOpen((p) => !p); setPaused(true); }} icon="eye" label="Tactical pause" />
          </div>
        )}
        <div className="relative mx-auto w-full" style={cStyle}>
          <Court
            className="h-full w-full"
            home={homeScene}
            away={{ ...sc.scene.away, positions: awayPos }}
            animKey={animKey}
            homeFrom={homeFrom}
            ballPath={ballPath}
            ballKey={ballKey}
            ballRest={sc.scene.ballRest}
            onBallDone={() => setStage((s) => (s === 'intro' ? 'act' : s))}
            draggable={draggable}
            onMove={(id, p) => setPositions((pos) => ({ ...pos, [id]: p }))}
            selectedId={selected}
            onSelect={(id) => setSelected(id && controlled.includes(id) ? id : null)}
            onInspect={(side, id) => (side === 'home' && controlled.includes(id) && (stage === 'act' || stage === 'intro') ? undefined : setInspect({ kind: 'player', side, id }))}
            onZoneTap={tap}
            overlays={overlays}
            view={view}
            tilt={tilt}
            playback={playback}
            focusIds={meId ? [] : sc.focusIds}
            meId={meId}
            labels={settings.labels}
            zoneBadges={settings.zoneBadges}
            tooltip={tooltip}
          />
          {stage === 'freeze' && <div className="vq-flash pointer-events-none absolute inset-0 rounded-2xl ring-4 ring-rose-400/60" />}
        </div>
        <CourtLegend />
        {tilt && <p className="mt-1 text-center text-[11px] text-slate-500">Angled view is for watching — switch back to top-down to move players.</p>}
      </div>

      {/* Panel column */}
      <aside className="space-y-3" ref={panelRef}>
        {header}
        <div className="space-y-3 rounded-2xl bg-slate-900/70 p-4 ring-1 ring-white/8">
          <div className="hidden lg:block">
            <YouCard scene={homeScene} id={meId} />
          </div>
          {sc.focusNote && <p className="rounded-lg bg-sky-400/10 p-2 text-xs text-sky-100">{sc.focusNote}</p>}
          <div className="hidden lg:block">
            <div className="text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{sc.title}</div>
            <p className="mt-1 text-[15px] leading-snug font-medium text-white">{sc.kind === 'place' ? sc.prompt : sc.question}</p>
          </div>
          {guide && stage !== 'checked' && stage !== 'after' && (
            <p className="flex gap-2 rounded-lg bg-white/4 p-2 text-xs text-slate-300">
              <Icon name="hint" className="h-4 w-4 shrink-0 text-amber-300" />
              {guide}
            </p>
          )}

          {sc.kind === 'place' && (stage === 'act' || stage === 'intro' || stage === 'freeze') && (
            <div className="space-y-2">
              <p className="text-xs text-slate-500">{meId ? 'Drag yourself (the YOU marker) — or tap the spot you want to go.' : 'Drag players, or tap a player and then tap where they should go.'}</p>
              <div className="flex gap-2">
                <Button variant="primary" className="flex-1" icon="check" onClick={doCheck} disabled={stage === 'freeze'}>
                  Check
                </Button>
                <Button icon="hint" onClick={() => setHint((h) => Math.min(maxHints, h + 1))} disabled={hint >= maxHints} title="Hint">
                  {hint ? `Hint ${hint}/${maxHints}` : 'Hint'}
                </Button>
                <IconBtn icon="refresh" label="Reset positions" onClick={() => setPositions(sc.kind === 'place' ? { ...sc.scene.home.positions, ...sc.start } : positions)} />
              </div>
              {hint > 0 && (
                <div className="vq-pop space-y-1.5 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-50 ring-1 ring-amber-300/20">
                  <p>{sc.hints[0]}</p>
                  {hint >= 2 && <p>{sc.hints[1] ?? 'Look at the highlighted area.'} (highlighted on court)</p>}
                  {hint >= 3 && <p>The faded markers show one good answer. Try to see why before you copy it.</p>}
                </div>
              )}
            </div>
          )}

          {sc.kind === 'choice' && (
            <div className="space-y-2">
              {sc.options.map((o) => {
                const show = !!picked;
                const tone = !show ? 'bg-white/6 ring-white/10 hover:bg-white/12' : o.verdict === 'best' ? 'bg-emerald-400/15 ring-emerald-300/50' : o.verdict === 'ok' ? 'bg-sky-400/10 ring-sky-300/30' : o.id === picked ? (o.verdict === 'illegal' ? 'bg-rose-500/20 ring-rose-400/60' : 'bg-amber-400/15 ring-amber-300/50') : 'bg-white/4 ring-white/8 opacity-50';
                return (
                  <button key={o.id} onClick={() => answer(o)} disabled={!!picked} className={`block w-full rounded-xl p-3 text-left text-sm ring-1 transition ${tone}`}>
                    <div className="flex items-start gap-2">
                      <span className="flex-1 text-slate-100">{o.text}</span>
                      {show && <ChoiceTag v={o.verdict} />}
                    </div>
                    {show && (o.id === picked || o.verdict === 'best') && <p className="mt-1.5 text-xs text-slate-300">{o.why}</p>}
                  </button>
                );
              })}
              {!picked && sc.hints[0] && hint === 0 && (
                <Button variant="ghost" size="sm" icon="hint" onClick={() => setHint(1)}>Hint</Button>
              )}
              {!picked && hint > 0 && <p className="rounded-xl bg-amber-400/10 p-3 text-xs text-amber-50">{sc.hints[0]}</p>}
            </div>
          )}

          {sc.kind === 'tapZone' && (
            <div className="text-sm text-slate-300">
              {!tapped ? <p className="text-amber-200">Tap a zone on your side of the court.</p> : (
                <div className={`vq-pop rounded-xl p-3 ring-1 ${sc.correct.includes(tapped) ? 'bg-emerald-400/15 ring-emerald-300/40' : 'bg-rose-500/15 ring-rose-400/40'}`}>
                  <p className="font-semibold text-white">{sc.correct.includes(tapped) ? 'Correct!' : `Not quite: you tapped ${tapped}, the answer is ${sc.correct.join(' / ')}.`}</p>
                  <p className="mt-1 text-xs">{sc.why}</p>
                </div>
              )}
            </div>
          )}

          {sc.kind === 'place' && ev && (stage === 'checked' || stage === 'after') && <Feedback ev={ev} explanation={sc.explanation} whenChanges={sc.whenChanges} />}
          {sc.kind === 'choice' && picked && sc.whenChanges && <Collapsible title="When would this change?">{sc.whenChanges}</Collapsible>}

          {(stage === 'checked' || stage === 'after') && (
            <div className="flex flex-wrap gap-2">
              {sc.kind === 'place' && stage === 'checked' && ev?.verdict !== 'recommended' && (
                <Button size="sm" icon="eye" onClick={showRecommended}>
                  {showingRec ? 'Back to mine' : 'Show the answer'}
                </Button>
              )}
              {sc.after && !chained && stage === 'checked' && (
                <Button size="sm" icon="play" onClick={playAfter}>
                  Watch what happens
                </Button>
              )}
              {stage === 'after' && (
                <Button size="sm" icon="replay" onClick={replay}>
                  Replay
                </Button>
              )}
              <Button variant="primary" size="sm" className="ml-auto" icon="right" onClick={finish}>
                {nextLabel}
              </Button>
            </div>
          )}
        </div>

        {pauseOpen && <TacticalPause sc={sc} positions={positions} revealed={revealed} onClose={() => { setPauseOpen(false); setPaused(false); }} onPick={(id) => setInspect({ kind: 'player', side: 'home', id })} />}

        {inspect && (
          <div className="fixed inset-x-2 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 max-h-[55vh] overflow-auto rounded-2xl bg-slate-950 shadow-2xl ring-1 ring-white/15 lg:static lg:bg-transparent lg:ring-0 lg:max-h-none lg:overflow-visible lg:shadow-none">
        {inspect?.kind === 'player' && (
          <PlayerPanel
            info={playerInfo(
              inspect.side === 'home' ? homeScene : { ...sc.scene.away, positions: awayPos },
              inspect.id,
              curPhase,
              inspect.side === 'home' && revealed ? matched?.targets[inspect.id] : undefined,
            )}
            revealed={revealed || !controlled.includes(inspect.id)}
            onClose={() => setInspect(null)}
          />
        )}
        {inspect?.kind === 'zone' && <ZonePanel side={inspect.side} zone={inspect.zone} onClose={() => setInspect(null)} />}
          </div>
        )}
      </aside>
    </div>
  );
}

function Feedback({ ev, explanation, whenChanges }: { ev: Evaluation; explanation: string; whenChanges?: string }) {
  const dims = (Object.keys(ev.dims) as Dimension[]).filter((d) => ev.dims[d] !== undefined);
  const key = ev.messages.slice(0, ev.violations.length ? Math.min(2, ev.violations.length) : 1);
  const rest = ev.messages.slice(key.length);
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <VerdictBadge verdict={ev.verdict} />
        </div>
        <span className="font-display text-2xl font-extrabold text-white">{ev.verdict === 'illegal' ? 0 : ev.score}</span>
      </div>
      {key.map((m, i) => (
        <p key={i} className={`rounded-lg p-2 text-sm ${ev.violations.length ? 'bg-rose-500/12 text-rose-100' : 'bg-white/4 text-slate-200'}`}>
          {m}
        </p>
      ))}
      {explanation && (
        <Collapsible title="Why?">
          <div className="whitespace-pre-line">{explanation}</div>
        </Collapsible>
      )}
      <Collapsible title="Score breakdown">
        <div className="space-y-1.5">
          {dims.map((d) => (
            <div key={d} className="grid grid-cols-[120px_1fr_28px] items-center gap-2 text-xs">
              <span className="text-slate-400">{DIMENSION_LABEL[d]}</span>
              <Bar value={ev.dims[d]!} tone={d === 'rules' ? (ev.dims[d]! < 100 ? 'rose' : 'emerald') : 'amber'} />
              <span className="text-right text-slate-300">{ev.dims[d]}</span>
            </div>
          ))}
          {rest.map((m, i) => (
            <p key={i} className="rounded-lg bg-white/4 p-2 text-xs text-slate-300">
              {m}
            </p>
          ))}
        </div>
      </Collapsible>
      {whenChanges && <Collapsible title="When would the answer change?">{whenChanges}</Collapsible>}
    </div>
  );
}

function ChoiceTag({ v }: { v: ChoiceOption['verdict'] }) {
  const m = { best: ['Best', 'emerald'], ok: ['Defensible', 'sky'], wrong: ['Weak', 'amber'], illegal: ['Illegal', 'rose'] } as const;
  return <Pill tone={m[v][1]}>{m[v][0]}</Pill>;
}

function IconBtn({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="grid h-8 w-8 place-items-center rounded-lg bg-white/8 text-slate-200 ring-1 ring-white/10 hover:bg-white/14">
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

function ToggleChip({ on, onClick, icon, label }: { on: boolean; onClick: () => void; icon: string; label: string }) {
  return (
    <button onClick={onClick} aria-pressed={on} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ring-1 transition ${on ? 'bg-amber-400/20 text-amber-100 ring-amber-300/40' : 'bg-white/6 text-slate-300 ring-white/10 hover:bg-white/10'}`}>
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function TacticalPause({ sc, positions, revealed, onClose, onPick }: { sc: Scenario; positions: Record<string, Vec>; revealed: boolean; onClose: () => void; onPick: (id: string) => void }) {
  const home = sc.scene.home;
  const oc = onCourt(home.team, home.rotation, home.serving);
  const variant = sc.kind === 'place' ? sc.objective.variants[0] : null;
  return (
    <div className="vq-pop rounded-2xl bg-indigo-950/70 p-4 ring-1 ring-indigo-300/20">
      <div className="mb-2 flex items-center gap-2">
        <Icon name="eye" className="h-4 w-4 text-indigo-200" />
        <h3 className="font-display flex-1 text-sm font-bold text-white">Tactical pause</h3>
        <button onClick={onClose} className="text-xs text-indigo-200 hover:underline">Resume</button>
      </div>
      <p className="mb-2 text-xs text-indigo-100">What should happen next? Inspect each player before you decide.</p>
      <ul className="space-y-1">
        {oc.map((o) => {
          const p = playerById(home.team, o.playerId);
          const t = variant?.targets[o.playerId];
          return (
            <li key={o.playerId}>
              <button onClick={() => onPick(o.playerId)} className="flex w-full items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-left text-xs hover:bg-white/10">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_INFO[p.role].color }} />
                <span className="w-24 shrink-0 font-semibold text-slate-100">#{p.number} {p.role}</span>
                <span className="w-12 shrink-0 text-slate-400">Pos {o.zone}</span>
                <span className="flex-1 truncate text-slate-300">{revealed && t ? t.duty : positions[o.playerId] ? (o.zone >= 2 && o.zone <= 4 ? 'Front row' : 'Back row') : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
