import { useState } from 'react';
import { rotationMastery } from '../../engine/progress';
import { CATEGORY_INFO, DRILL_CATEGORIES, type Category } from '../../engine/scenarios';
import { buildTeam, describeRotation, SYSTEMS, SYSTEM_ORDER } from '../../engine/systems';
import { ROLE_INFO, type SystemId } from '../../engine/types';
import { DemoCourt } from '../components/DemoCourt';
import { Button, Card, Icon, Pill, ScreenHeader, Segmented, Toggle } from '../components/ui';
import { focusFromRole, ROLE_CHOICES, useStore, type RoleChoice } from '../store';
import { COACH_CATEGORIES, coachConfig, drillConfig, iqConfig, masteryConfig, mixedDrillConfig, rotationTrainerConfig } from './sessions';

function RolePicker({ value, onChange, allowAll = true }: { value: RoleChoice; onChange: (r: RoleChoice) => void; allowAll?: boolean }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLE_CHOICES.filter((r) => allowAll || r.id !== 'ALL').map((r) => (
        <button
          key={r.id}
          onClick={() => onChange(r.id)}
          className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ring-1 transition ${value === r.id ? 'bg-white text-slate-900 ring-white' : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/10'}`}
        >
          {r.id !== 'ALL' && <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_INFO[r.id].color }} />}
          {r.id === 'ALL' ? 'All / Coach' : r.label}
        </button>
      ))}
    </div>
  );
}

function SystemPicker({ value, onChange }: { value: SystemId; onChange: (s: SystemId) => void }) {
  return <Segmented value={value} onChange={onChange} options={SYSTEM_ORDER.map((s) => ({ value: s, label: SYSTEMS[s].name }))} />;
}

export function RotationTrainerScreen() {
  const { settings, go, back, progress } = useStore();
  const [sys, setSys] = useState<SystemId>(settings.systemId);
  const [role, setRole] = useState<RoleChoice>(settings.role);
  const [mode, setMode] = useState<'all' | 'one' | 'random'>('all');
  const [rot, setRot] = useState(0);
  const [serving, setServing] = useState(false);
  const team = buildTeam(sys, 'home', settings.roster, settings.customSetters);
  const mastery = rotationMastery(progress, sys, role);
  const start = () => {
    const rots = mode === 'all' ? [0, 1, 2, 3, 4, 5] : mode === 'one' ? [rot] : [0, 1, 2, 3, 4, 5].sort(() => Math.random() - 0.5).slice(0, 3);
    go({ name: 'session', config: rotationTrainerConfig(sys, focusFromRole(role), rots, serving), key: Date.now() });
  };
  return (
    <div className="mx-auto max-w-6xl pb-16">
      <ScreenHeader title="Rotation Trainer" subtitle="Identify · arrange · service contact · release · respond · review" onBack={back} />
      <div className="grid gap-6 px-4 sm:px-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          <Section title="Offensive system"><SystemPicker value={sys} onChange={setSys} /></Section>
          <Section title="Who are you training?">
            <RolePicker value={role} onChange={setRole} />
            <p className="mt-2 text-xs text-slate-400">{role === 'ALL' ? 'Coach style: you arrange all six players in every rotation.' : 'You place your player; teammates are positioned for you.'}</p>
          </Section>
          <Section title="Rotations">
            <Segmented value={mode} onChange={setMode} options={[{ value: 'all', label: 'All six in order' }, { value: 'one', label: 'One rotation' }, { value: 'random', label: 'Random challenge' }]} />
            {mode === 'one' && (
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[0, 1, 2, 3, 4, 5].map((r) => (
                  <button key={r} onClick={() => setRot(r)} className={`rounded-xl p-2 text-center ring-1 ${rot === r ? 'bg-amber-400/20 ring-amber-300/60' : 'bg-white/5 ring-white/10'}`}>
                    <div className="font-display font-bold text-white">R{r + 1}</div>
                    <div className="text-[10px] text-slate-400">{mastery[r]}</div>
                  </button>
                ))}
              </div>
            )}
          </Section>
          <Section title="Options">
            <Toggle checked={serving} onChange={setServing} label="Also practise the serving-team rep in each rotation" />
          </Section>
          <Button variant="primary" size="lg" icon="play" onClick={start}>
            Start training
          </Button>
        </div>
        <Card className="p-4">
          <div className="mb-2 text-sm font-semibold text-white">{describeRotation(team, mode === 'one' ? rot : 0)}</div>
          <DemoCourt className="mx-auto aspect-[15/24.8] w-full max-w-[300px]" systemId={sys} rotation={mode === 'one' ? rot : 0} phase="receive" zones compact />
          <p className="mt-2 text-xs text-slate-400">Each rotation: identify the setter’s zone, arrange a legal formation, freeze at service contact, release, and respond to the first contact.</p>
        </Card>
      </div>
    </div>
  );
}

export function MasteryScreen() {
  const { settings, go, back, progress } = useStore();
  const [role, setRole] = useState<RoleChoice>(settings.role);
  const mastery = rotationMastery(progress, settings.systemId, role);
  const learn: Record<RoleChoice, string[]> = {
    S: ['Where to start in each rotation', 'Legal stacking and releasing', 'Playing the second ball — and the first', 'Out-of-system decisions', 'Blocking when front row', 'When dumps are legal'],
    OH: ['Passing lanes and seams', 'Transition from pass to approach', 'Attack coverage', 'Blocking the right side', 'Back-row defence and the pipe'],
    OPP: ['Hiding in serve receive', 'Switching to the right', 'Blocking their outside', 'Right-back defence', 'Emergency setting'],
    MB: ['Hiding at the net', 'Getting off the net for the quick', 'Read vs commit blocking', 'Transition after blocking', 'Covering on bad passes'],
    L: ['Serve-receive leadership', 'Middle-back and left-back defence', 'Seams and tips', 'Emergency setting from behind the 3 m line', 'Libero restrictions'],
    DS: ['Back-row passing', 'Defensive reading', 'Tip coverage', 'Substitution rules (not a libero)'],
    ALL: ['Every role in every phase', 'How responsibilities fit together'],
  };
  return (
    <div className="mx-auto max-w-5xl pb-16">
      <ScreenHeader title="Role Mastery" subtitle="Follow one player through realistic situations" onBack={back} />
      <div className="space-y-5 px-4 sm:px-6">
        <Section title="Choose a role"><RolePicker value={role} onChange={setRole} /></Section>
        <Card className="p-5">
          <h3 className="font-display font-bold text-white">{role === 'ALL' ? 'All positions' : ROLE_INFO[role].name}</h3>
          {role !== 'ALL' && <p className="mt-1 text-sm text-slate-400">{ROLE_INFO[role].summary}</p>}
          <ul className="mt-3 grid gap-1.5 text-sm text-slate-300 sm:grid-cols-2">
            {learn[role].map((l) => (
              <li key={l} className="flex items-center gap-2"><Icon name="check" className="h-4 w-4 text-emerald-300" />{l}</li>
            ))}
          </ul>
          <div className="mt-4">
            <div className="mb-1 text-xs font-semibold text-slate-400">{SYSTEMS[settings.systemId].name} — rotation mastery</div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {mastery.map((m, i) => (
                <div key={i} className="rounded-lg bg-white/5 p-2 text-center">
                  <div className="text-xs font-bold text-white">R{i + 1}</div>
                  <div className={`text-[10px] ${m === 'Mastered' ? 'text-emerald-300' : m === 'Learning' ? 'text-sky-300' : m === 'Needs Practice' ? 'text-amber-300' : 'text-slate-500'}`}>{m}</div>
                </div>
              ))}
            </div>
          </div>
          <Button className="mt-5" variant="primary" size="lg" icon="play" onClick={() => go({ name: 'session', config: masteryConfig(role), key: Date.now() })}>
            Start {role === 'ALL' ? '' : ROLE_INFO[role].name} mastery
          </Button>
        </Card>
      </div>
    </div>
  );
}

export function DrillsScreen() {
  const { settings, go, back } = useStore();
  const [count, setCount] = useState(5);
  const [role, setRole] = useState<RoleChoice>(settings.role);
  const focus = focusFromRole(role);
  return (
    <div className="mx-auto max-w-6xl pb-16">
      <ScreenHeader title="Situational Drills" subtitle="Pick a category and a session length" onBack={back} />
      <div className="space-y-5 px-4 sm:px-6">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented value={count} onChange={setCount} options={[5, 10, 20].map((n) => ({ value: n, label: `${n} scenarios` }))} />
          <RolePicker value={role} onChange={setRole} />
        </div>
        <Card onClick={() => go({ name: 'session', config: mixedDrillConfig(DRILL_CATEGORIES, count, focus), key: Date.now() })} className="flex w-full items-center gap-3 bg-gradient-to-r from-violet-500/20 to-transparent p-4">
          <Icon name="spark" className="h-7 w-7 text-violet-200" />
          <div className="flex-1">
            <div className="font-display font-bold text-white">Practice Randomizer</div>
            <div className="text-sm text-slate-400">Unexpected situations drawn from real rally patterns — like a match.</div>
          </div>
          <Icon name="right" className="text-slate-400" />
        </Card>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {DRILL_CATEGORIES.map((c) => (
            <Card key={c} onClick={() => go({ name: 'session', config: drillConfig(c, count, focus), key: Date.now() })} className="p-4">
              <div className="font-display font-bold text-white">{CATEGORY_INFO[c].name}</div>
              <div className="mt-1 text-xs text-slate-400">{CATEGORY_INFO[c].blurb}</div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

export function IQScreen() {
  const { settings, go, back, progress } = useStore();
  return (
    <div className="mx-auto max-w-3xl pb-16">
      <ScreenHeader title="Volleyball IQ Challenge" onBack={back} />
      <div className="px-4 sm:px-6">
        <Card className="p-6">
          <Icon name="zap" className="mb-3 h-10 w-10 text-amber-300" />
          <h2 className="font-display text-2xl font-bold text-white">12 rounds. Rising difficulty.</h2>
          <p className="mt-2 text-slate-300">Mixed situations — reading, rules, positioning and transitions. Points reward correct decisions, scaled by difficulty and your streak. There is no countdown: think it through.</p>
          <ul className="mt-4 space-y-1 text-sm text-slate-400">
            <li>Rounds 1–4: beginner guidance</li>
            <li>Rounds 5–8: intermediate — fewer cues</li>
            <li>Rounds 9–12: competitive — minimal guidance, ×1.5 points</li>
          </ul>
          <div className="mt-5 flex items-center gap-3">
            <Button variant="primary" size="lg" icon="play" onClick={() => go({ name: 'session', config: iqConfig(focusFromRole(settings.role)), key: Date.now() })}>
              Start challenge
            </Button>
            {progress.iqBest > 0 && <Pill tone="amber">Best: {progress.iqBest} pts</Pill>}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function CoachScreen() {
  const { go, back } = useStore();
  const [cat, setCat] = useState<Category | 'mixed'>('serveReceive');
  const [count, setCount] = useState(5);
  const [rot, setRot] = useState<number | undefined>(undefined);
  return (
    <div className="mx-auto max-w-5xl pb-16">
      <ScreenHeader title="Coach Mode" subtitle="You control all six players" onBack={back} />
      <div className="space-y-5 px-4 sm:px-6">
        <p className="text-sm text-slate-300">Arrange complete serve-receive, serving, free-ball, defensive and coverage formations. You’re graded on legality, court coverage, role responsibilities and transition readiness — alternative legal formations are judged on how well they cover the court, not on matching one diagram.</p>
        <Section title="Situation">
          <div className="flex flex-wrap gap-2">
            {[...COACH_CATEGORIES, 'mixed' as const].map((c) => (
              <button key={c} onClick={() => setCat(c)} className={`rounded-xl px-3 py-2 text-sm font-semibold ring-1 ${cat === c ? 'bg-white text-slate-900' : 'bg-white/5 text-slate-200 ring-white/10'}`}>
                {c === 'mixed' ? 'Mixed' : CATEGORY_INFO[c].name}
              </button>
            ))}
          </div>
        </Section>
        <Section title="Rotation">
          <Segmented value={rot ?? -1} onChange={(v) => setRot(v < 0 ? undefined : v)} options={[{ value: -1, label: 'Any' }, ...[0, 1, 2, 3, 4, 5].map((r) => ({ value: r, label: `R${r + 1}` }))]} />
        </Section>
        <Section title="Length">
          <Segmented value={count} onChange={setCount} options={[3, 5, 10].map((n) => ({ value: n, label: String(n) }))} />
        </Section>
        <Button variant="primary" size="lg" icon="play" onClick={() => go({ name: 'session', config: coachConfig(cat, count, rot), key: Date.now() })}>
          Start coaching
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-xs font-bold tracking-wider text-slate-400 uppercase">{title}</div>
      {children}
    </div>
  );
}

export { Section, RolePicker, SystemPicker };
