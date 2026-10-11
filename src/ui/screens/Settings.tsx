import { isFrontZone } from '../../engine/geometry';
import { zoneOfPlayer } from '../../engine/rotation';
import { RULESETS } from '../../engine/rulesets';
import { SYSTEM_LABEL } from '../../engine/scenarios';
import { buildTeam, lineupKeys, SYSTEMS, SYSTEM_ORDER } from '../../engine/systems';
import { ROLE_INFO, type DefenseSystemId, type Difficulty } from '../../engine/types';
import { Button, Card, ScreenHeader, Segmented } from '../components/ui';
import { ROLE_CHOICES, useStore } from '../store';

const PRESETS: { label: string; desc: string; plan: string[] }[] = [
  { label: 'Back-row setter sets (6–2 pattern)', desc: 'S sets while back row, S2 while S is front row.', plan: ['S', 'S', 'S', 'S2', 'S2', 'S2'] },
  { label: 'Front-row setter sets (4–2 pattern)', desc: 'S sets while front row, S2 otherwise.', plan: ['S2', 'S2', 'S2', 'S', 'S', 'S'] },
  { label: '“5–2” variant A: primary sets 5 rotations', desc: 'One interpretation: S sets everywhere except when in zone 4 (the longest front-row release), where S2 takes over.', plan: ['S', 'S', 'S', 'S2', 'S', 'S'] },
  { label: '“5–2” variant B: primary sets 4 rotations', desc: 'Another interpretation: S2 covers both of S’s hardest rotations (S in zones 5 and 4).', plan: ['S', 'S', 'S2', 'S2', 'S', 'S'] },
];

export function SettingsScreen() {
  const { settings, update, back, go } = useStore();
  const keys = [...lineupKeys(settings.systemId), 'L', 'DS'];
  const team = buildTeam(settings.systemId, 'home', settings.roster, settings.customSetters);
  const customTeam = buildTeam('custom', 'home', settings.roster, settings.customSetters);
  return (
    <div className="mx-auto max-w-4xl pb-16">
      <ScreenHeader title="Settings" onBack={back} />
      <div className="space-y-4 px-4 sm:px-6">
        <Card className="space-y-4 p-5">
          <Row label="Difficulty" hint="Changes guidance (zones, arrows, hints, prep time) — never the rules.">
            <Segmented value={settings.level} onChange={(v: Difficulty) => update({ level: v })} options={[{ value: 'beginner', label: 'Beginner' }, { value: 'intermediate', label: 'Intermediate' }, { value: 'competitive', label: 'Competitive' }]} />
          </Row>
          <Row label="Your role">
            <select value={settings.role} onChange={(e) => update({ role: e.target.value as typeof settings.role })} className="rounded-lg bg-white/8 p-2 text-sm text-white ring-1 ring-white/10">
              {ROLE_CHOICES.map((r) => (
                <option key={r.id} value={r.id} className="bg-slate-900">{r.label}</option>
              ))}
            </select>
          </Row>
          <Row label="Offensive system">
            <Segmented value={settings.systemId} onChange={(v) => update({ systemId: v })} options={SYSTEM_ORDER.map((s) => ({ value: s, label: SYSTEMS[s].name }))} />
          </Row>
          <Row label="Default defensive system" hint="A coaching choice, not a rule.">
            <Segmented size="sm" value={settings.defenseSystem} onChange={(v: DefenseSystemId) => update({ defenseSystem: v })} options={(['perimeter', 'rotation', 'middleUp', 'read'] as DefenseSystemId[]).map((d) => ({ value: d, label: SYSTEM_LABEL[d] }))} />
          </Row>
          <Row label="Ruleset">
            <div className="space-y-2">
              {RULESETS.map((r) => (
                <button key={r.id} onClick={() => update({ rulesetId: r.id })} className={`block w-full rounded-xl p-3 text-left ring-1 ${settings.rulesetId === r.id ? 'bg-amber-400/15 ring-amber-300/50' : 'bg-white/4 ring-white/10'}`}>
                  <div className="text-sm font-semibold text-white">{r.name}</div>
                  <div className="text-xs text-slate-400">{r.description}</div>
                </button>
              ))}
            </div>
          </Row>
        </Card>

        <Card className="space-y-4 p-5">
          <Row label="Motion" hint="Reduced motion skips tweens and ball flights.">
            <Segmented value={settings.motion} onChange={(v) => update({ motion: v })} options={[{ value: 'system', label: 'Follow system' }, { value: 'full', label: 'Full' }, { value: 'reduced', label: 'Reduced' }]} />
          </Row>
          <Row label="Animation speed">
            <Segmented value={settings.speed} onChange={(v) => update({ speed: v })} options={[0.5, 1, 1.5, 2].map((s) => ({ value: s, label: `${s}×` }))} />
          </Row>
          <Row label="Player labels" hint="Words are easier for newer players.">
            <Segmented value={settings.labels} onChange={(v) => update({ labels: v })} options={[{ value: 'words', label: 'Words (Setter, Outside…)' }, { value: 'short', label: 'Short (S, OH…)' }]} />
          </Row>
          <Row label="Position numbers" hint="Small number on each player = their rotational position (1–6).">
            <Segmented value={settings.zoneBadges ? 'on' : 'off'} onChange={(v) => update({ zoneBadges: v === 'on' })} options={[{ value: 'on', label: 'Show' }, { value: 'off', label: 'Hide' }]} />
          </Row>
          <Row label="Zone overlay">
            <Segmented value={settings.showZones} onChange={(v) => update({ showZones: v })} options={[{ value: 'auto', label: 'By difficulty' }, { value: 'on', label: 'Always' }, { value: 'off', label: 'Never' }]} />
          </Row>
          <Row label="Default court view">
            <Segmented value={settings.view} onChange={(v) => update({ view: v })} options={[{ value: 'full', label: 'Full court' }, { value: 'half', label: 'Our side' }]} />
          </Row>
        </Card>

        <Card className="p-5">
          <h2 className="font-display mb-1 font-bold text-white">Your roster</h2>
          <p className="mb-3 text-xs text-slate-400">Names and jersey numbers for the {SYSTEMS[settings.systemId].name} lineup (in rotational order) plus libero and DS.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {keys.map((k) => {
              const p = team.players.find((x) => x.id === 'h-' + k)!;
              return (
                <div key={k} className="flex items-center gap-2 rounded-xl bg-white/4 p-2">
                  <span className="w-12 shrink-0 text-center text-xs font-bold" style={{ color: ROLE_INFO[p.role].color }}>{p.label ?? p.role}</span>
                  <input aria-label={`${k} number`} type="number" min={1} max={99} value={p.number} onChange={(e) => update({ roster: { ...settings.roster, [k]: { ...settings.roster[k], number: Math.max(1, Math.min(99, +e.target.value || 1)) } } })} className="w-14 rounded-lg bg-white/8 p-1.5 text-center text-sm text-white ring-1 ring-white/10" />
                  <input aria-label={`${k} name`} value={settings.roster[k]?.name ?? p.name} maxLength={14} onChange={(e) => update({ roster: { ...settings.roster, [k]: { ...settings.roster[k], name: e.target.value } } })} className="min-w-0 flex-1 rounded-lg bg-white/8 p-1.5 text-sm text-white ring-1 ring-white/10" />
                </div>
              );
            })}
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => update({ roster: {} })}>Restore default names</Button>
        </Card>

        <Card className="p-5">
          <h2 className="font-display mb-1 font-bold text-white">Custom / 5–2 setter plan</h2>
          <p className="mb-3 text-xs text-slate-400">“5–2” is defined differently by different coaching sources, so you choose who sets in each rotation. Used when the offensive system is set to Custom.</p>
          <div className="mb-3 grid gap-2 sm:grid-cols-2">
            {PRESETS.map((p) => (
              <button key={p.label} onClick={() => update({ customSetters: p.plan })} className={`rounded-xl p-3 text-left ring-1 ${JSON.stringify(settings.customSetters) === JSON.stringify(p.plan) ? 'bg-amber-400/15 ring-amber-300/50' : 'bg-white/4 ring-white/10'}`}>
                <div className="text-sm font-semibold text-white">{p.label}</div>
                <div className="text-xs text-slate-400">{p.desc}</div>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((r) => {
              const zS = zoneOfPlayer(customTeam, r, 'h-S')!;
              const zS2 = zoneOfPlayer(customTeam, r, 'h-S2')!;
              return (
                <div key={r} className="rounded-xl bg-white/4 p-2 text-center">
                  <div className="text-xs font-bold text-white">R{r + 1}</div>
                  {(['S', 'S2'] as const).map((s) => (
                    <button key={s} onClick={() => update({ customSetters: settings.customSetters.map((x, i) => (i === r ? s : x)) })} className={`mt-1 block w-full rounded-lg px-1 py-1 text-[11px] ${settings.customSetters[r] === s ? 'bg-amber-400 font-bold text-slate-950' : 'bg-white/6 text-slate-300'}`}>
                      {s} · z{s === 'S' ? zS : zS2} {isFrontZone(s === 'S' ? zS : zS2) ? 'F' : 'B'}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
          <Button size="sm" className="mt-3" onClick={() => update({ systemId: 'custom' })} disabled={settings.systemId === 'custom'}>
            Use Custom system
          </Button>
        </Card>

        <Card className="flex flex-wrap gap-2 p-5">
          <Button icon="refresh" onClick={() => { update({ onboarded: false }); go({ name: 'welcome' }); }}>Restart onboarding</Button>
          <Button icon="chart" onClick={() => go({ name: 'progress' })}>Progress & reset</Button>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2 sm:grid-cols-[200px_1fr] sm:items-start">
      <div>
        <div className="text-sm font-semibold text-white">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}
