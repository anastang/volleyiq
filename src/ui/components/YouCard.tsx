import { isFrontZone, ZONE_INFO } from '../../engine/geometry';
import { onCourt } from '../../engine/rotation';
import type { SideScene } from '../../engine/scenarios';
import { playerById, roleWord } from '../../engine/systems';
import { ROLE_INFO } from '../../engine/types';

/** Big, unmissable "this is you" card. */
export function YouCard({ scene, id, compact }: { scene: SideScene; id?: string; compact?: boolean }) {
  if (!id) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3 ring-1 ring-white/10">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-white/10 text-lg">📋</span>
        <div className="text-sm">
          <div className="font-bold text-white">You’re the coach</div>
          <div className="text-xs text-slate-400">Move all six of your players.</div>
        </div>
      </div>
    );
  }
  const p = playerById(scene.team, id);
  const o = onCourt(scene.team, scene.rotation, scene.serving).find((x) => x.playerId === id);
  const color = ROLE_INFO[p.role].color;
  return (
    <div className="flex items-center gap-3 rounded-xl bg-amber-300/10 p-3 ring-2 ring-amber-300/60">
      <span className="font-display relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-base font-extrabold text-slate-950 ring-4 ring-amber-300" style={{ background: color }}>
        {p.number}
        {o && <span className="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-white text-[10px] font-extrabold text-slate-950 ring-1 ring-slate-900">{o.zone}</span>}
      </span>
      <div className="min-w-0 text-sm">
        <div className="font-bold text-white">
          You are <span className="text-amber-200">{roleWord(scene.team, scene.rotation, id)}</span> · #{p.number} {p.name}
        </div>
        {!compact && o && (
          <div className="text-xs text-slate-300">
            Position {o.zone} ({ZONE_INFO[o.zone].name.toLowerCase()}) · {isFrontZone(o.zone) ? 'front row' : 'back row'}
          </div>
        )}
      </div>
    </div>
  );
}

const LEGEND: { role: keyof typeof ROLE_INFO; word: string }[] = [
  { role: 'S', word: 'Setter' },
  { role: 'OH', word: 'Outside' },
  { role: 'MB', word: 'Middle' },
  { role: 'OPP', word: 'Opposite' },
  { role: 'L', word: 'Libero' },
];

/** One-line key so it's always clear who is who. */
export function CourtLegend() {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
      <span className="inline-flex items-center gap-1 font-semibold text-amber-200">
        <span className="rounded bg-amber-300 px-1 text-[9px] font-extrabold text-slate-950">YOU</span> you
      </span>
      {LEGEND.map((l) => (
        <span key={l.role} className="inline-flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: ROLE_INFO[l.role].color }} />
          {l.word}
        </span>
      ))}
      <span className="inline-flex items-center gap-1">
        <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-white text-[8px] font-bold text-slate-900">1</span> position
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="h-2.5 w-2.5 rounded-full bg-slate-200/80" /> opponents
      </span>
    </div>
  );
}
