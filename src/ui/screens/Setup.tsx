import { useState } from 'react';
import { SYSTEMS } from '../../engine/systems';
import type { Difficulty, SystemId } from '../../engine/types';
import { Button, Icon } from '../components/ui';
import { ROLE_CHOICES, useStore, type RoleChoice } from '../store';
import { firstLessonConfig } from './sessions';

const LEVELS: { id: Difficulty; label: string; blurb: string }[] = [
  { id: 'beginner', label: 'Beginner', blurb: 'I know the basics; rotations are new or fuzzy.' },
  { id: 'intermediate', label: 'Intermediate', blurb: 'I play regularly and know my position.' },
  { id: 'competitive', label: 'Competitive', blurb: 'Club / competitive; I want to sharpen reads.' },
];

const RECOMMEND: Record<Difficulty, { sys: SystemId; why: string }> = {
  beginner: { sys: '4-2', why: 'A 4–2 keeps the setter at the net with the shortest releases, so you can focus on rotations, overlap and switching. Move to the 5–1 once those feel automatic.' },
  intermediate: { sys: '6-2', why: 'A 6–2 always has three front-row hitters and the setter always releases from the back row — a great bridge to competitive systems.' },
  competitive: { sys: '5-1', why: 'The 5–1 is the standard competitive system: one setter in all six rotations, including the demanding front-row and long-release rotations.' },
};

export function Setup() {
  const { update, go } = useStore();
  const [step, setStep] = useState(0);
  const [level, setLevel] = useState<Difficulty | null>(null);
  const [role, setRole] = useState<RoleChoice | null>(null);
  const [sys, setSys] = useState<SystemId | 'unsure' | null>(null);

  const finish = () => {
    const systemId = sys === 'unsure' || !sys ? RECOMMEND[level ?? 'beginner'].sys : sys;
    update({ level: level ?? 'beginner', role: role ?? 'ALL', systemId, onboarded: true, showZones: 'auto' });
    go({ name: 'home' });
    go({ name: 'session', config: firstLessonConfig(role ?? 'ALL', systemId), key: Date.now() });
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col px-5 py-8">
      <div className="mb-8 flex items-center gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className={`h-1.5 flex-1 rounded-full transition ${i <= step ? 'bg-amber-400' : 'bg-white/10'}`} />
        ))}
      </div>
      {step === 0 && (
        <Question n={1} title="What is your current level?">
          {LEVELS.map((l) => (
            <Option key={l.id} active={level === l.id} title={l.label} blurb={l.blurb} onClick={() => { setLevel(l.id); setStep(1); }} />
          ))}
        </Question>
      )}
      {step === 1 && (
        <Question n={2} title="What position do you play?">
          <div className="grid gap-2 sm:grid-cols-2">
            {ROLE_CHOICES.map((r) => (
              <Option key={r.id} active={role === r.id} title={r.label} blurb={r.blurb} onClick={() => { setRole(r.id); setStep(2); }} />
            ))}
          </div>
        </Question>
      )}
      {step === 2 && (
        <Question n={3} title="Which offensive system do you want to learn?">
          {(['5-1', '6-2', '4-2'] as SystemId[]).map((s) => (
            <Option key={s} active={sys === s} title={SYSTEMS[s].name} blurb={SYSTEMS[s].tagline + ' — ' + SYSTEMS[s].difficultyNote} onClick={() => setSys(s)} />
          ))}
          <Option active={sys === 'unsure'} title="Not sure — recommend one" blurb="We’ll suggest a starting system for your level." onClick={() => setSys('unsure')} />
          {sys === 'unsure' && (
            <div className="vq-pop rounded-2xl bg-sky-400/10 p-4 text-sm text-sky-50 ring-1 ring-sky-300/20">
              <p className="font-semibold">We recommend the {SYSTEMS[RECOMMEND[level ?? 'beginner'].sys].name}.</p>
              <p className="mt-1 text-sky-100/80">{RECOMMEND[level ?? 'beginner'].why}</p>
            </div>
          )}
        </Question>
      )}
      <div className="mt-auto flex items-center justify-between pt-8">
        <Button variant="ghost" icon="back" onClick={() => (step ? setStep(step - 1) : go({ name: 'welcome' }))}>
          Back
        </Button>
        {step === 2 && (
          <Button variant="primary" size="lg" icon="play" disabled={!sys} onClick={finish}>
            Start my first lesson
          </Button>
        )}
      </div>
    </div>
  );
}

function Question({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="vq-pop space-y-3">
      <p className="text-sm font-semibold text-amber-300">Question {n} of 3</p>
      <h2 className="font-display mb-4 text-2xl font-bold text-white sm:text-3xl">{title}</h2>
      {children}
    </div>
  );
}

function Option({ title, blurb, onClick, active }: { title: string; blurb: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-3 rounded-2xl p-4 text-left ring-1 transition ${active ? 'bg-amber-400/15 ring-amber-300/60' : 'bg-white/5 ring-white/10 hover:bg-white/10'}`}>
      <div className="flex-1">
        <div className="font-display font-bold text-white">{title}</div>
        <div className="text-sm text-slate-400">{blurb}</div>
      </div>
      <Icon name={active ? 'check' : 'right'} className={`h-5 w-5 ${active ? 'text-amber-300' : 'text-slate-500'}`} />
    </button>
  );
}
