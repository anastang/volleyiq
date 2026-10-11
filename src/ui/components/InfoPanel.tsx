import { useState } from 'react';
import { isFrontZone, ZONE_INFO, type Side, type Vec, type Zone } from '../../engine/geometry';
import { onCourt } from '../../engine/rotation';
import type { SideScene } from '../../engine/scenarios';
import { activeSetterId, playerById, SLOT_NAME, specialtySlots } from '../../engine/systems';
import { tacticalLocationName, type Target } from '../../engine/tactics';
import { PHASE_LABEL, ROLE_INFO, type Phase, type Role } from '../../engine/types';
import { Icon } from './ui';

type PhaseGroup = 'pre' | 'offense' | 'defense' | 'serving';
const groupOf = (p: Phase): PhaseGroup =>
  p === 'preServe' || p === 'serviceContact' ? 'pre' : p === 'serving' ? 'serving' : p === 'defense' || p === 'tip' || p === 'freeBall' ? 'defense' : 'offense';

const RESP: Record<Role, Record<PhaseGroup, { now: string; next: string; why: string }>> = {
  S: {
    pre: { now: 'Hold a legal spot relative to your neighbours, out of the passing lanes, as close to the target as the rules allow.', next: 'Release to the setting target the instant the serve is contacted.', why: 'An efficient release lets your team run its offence without compromising serve-receive coverage.' },
    offense: { now: 'Get under the second ball early and square to your target.', next: 'Cover your hitter after the set.', why: 'The setter turns any pass into the best available attack.' },
    defense: { now: 'Block if front row; defend right-back if back row — while watching for a chance to release.', next: 'Release to the target once a teammate digs.', why: 'Setters who release late make every transition out of system.' },
    serving: { now: 'Use the serving team’s positional freedom to start near your setting/defensive spot.', next: 'Base defence, then release on the dig.', why: 'Pre-positioning saves steps every rally your team serves.' },
  },
  OH: {
    pre: { now: 'Pass in your lane; split the court with the other passers.', next: 'After the pass, open up to your left-side approach.', why: 'The outside hitter is usually both a primary passer and the most-set attacker.' },
    offense: { now: 'Wide and deep approach start; be available for a high ball when the pass is off.', next: 'Attack — or cover if the set goes elsewhere.', why: 'Out of system, the outside is the safety valve.' },
    defense: { now: 'Front row: block the opponent’s right side or drop off the net. Back row: defend middle-back/left-back.', next: 'Transition to your approach after the dig.', why: 'Outsides play all the way around; their transition decides the counter-attack.' },
    serving: { now: 'Start near your specialty spot (left-front or back-row middle).', next: 'Base defence.', why: 'Saves the switch after contact.' },
  },
  OPP: {
    pre: { now: 'Hide out of the passing lanes while staying legal.', next: 'Switch to the right side after contact.', why: 'Opposites usually don’t pass so the passers have clear lanes.' },
    offense: { now: 'Right-side approach start; the setter’s back-set option.', next: 'Attack or cover.', why: 'A live right side stops the block from cheating left.' },
    defense: { now: 'Front row: block the opponent’s outside hitter. Back row: right-back defence.', next: 'Transition to the right pin or D-ball.', why: 'The right-side blocker faces the opponent’s most-used attacker.' },
    serving: { now: 'Start near right-front / right-back.', next: 'Base defence.', why: 'Saves the switch after contact.' },
  },
  MB: {
    pre: { now: 'Hide near the net, legal relative to your neighbours.', next: 'Get off the net to your quick-attack approach.', why: 'The middle needs a running start to hit a quick in rhythm with the setter.' },
    offense: { now: 'Approach close to the setter for the quick; on a bad pass, hold and cover.', next: 'Cover the pin hitter.', why: 'A threatening quick freezes the opposing middle blocker.' },
    defense: { now: 'Read the setter, then close the block to the attacker.', next: 'Land, turn, get off the net to attack in transition.', why: 'The middle anchors the block on every attack.' },
    serving: { now: 'Middle-front at the net.', next: 'Base block.', why: 'The middle is the team’s primary blocker.' },
  },
  L: {
    pre: { now: 'Primary passer: take the biggest share of the court.', next: 'After the pass, move behind the hitters for coverage.', why: 'The libero is usually the best passer on the team.' },
    offense: { now: 'Get low behind the hitter for coverage; be ready to take the second ball if the setter digs.', next: 'Emergency set from behind the 3 m line or underhand.', why: 'A libero overhand set from in front of the 3 m line cannot be attacked above the net.' },
    defense: { now: 'Middle-back or left-back defence, reading the hitter.', next: 'Dig high to the middle.', why: 'The libero handles the most defensive contacts.' },
    serving: { now: 'Not serving — the libero comes back in when the middle is back row and not serving.', next: 'Back-row defence.', why: 'Under FIVB the libero may not serve.' },
  },
  DS: {
    pre: { now: 'Pass in your lane alongside the libero.', next: 'Coverage or back-row transition.', why: 'A DS strengthens passing and defence in the back row.' },
    offense: { now: 'Coverage behind the hitter.', next: 'Back to defensive base.', why: 'Coverage keeps blocked balls alive.' },
    defense: { now: 'Back-row defence in your area.', next: 'Dig and transition.', why: 'Defensive specialists replace weaker back-row defenders.' },
    serving: { now: 'Often serves — then defends back row.', next: 'Base defence.', why: 'A DS is an ordinary substitute who may serve.' },
  },
};

function ruleFor(role: Role, front: boolean, isSetter: boolean): string {
  if (role === 'L') return 'Libero: back row only. May not serve (FIVB), block or attempt to block, or attack a ball entirely above the net. An overhand set by the libero in the front zone cannot be attacked above net height.';
  if (front) return isSetter ? 'You are front row this rotation: you may block, and you may legally attack/dump the second ball.' : 'You are a front-row player this rotation: you may block and attack from anywhere on your side.';
  return isSetter
    ? 'You are a back-row player in this rotation: you may not block, and you may not attack (or dump) a ball entirely above the net from in front of the attack line.'
    : 'You are a back-row player in this rotation: you may not block. To attack above net height you must take off from behind the attack line.';
}

export interface PlayerInfo {
  title: string;
  color: string;
  rows: { k: string; v: string }[];
  responsibility: string;
  next: string;
  rule: string;
  why: string;
}

export function playerInfo(scene: SideScene, id: string, phase: Phase, target?: Target, livePos?: Vec): PlayerInfo {
  const team = scene.team;
  const p = playerById(team, id);
  const oc = onCourt(team, scene.rotation, scene.serving);
  const o = oc.find((x) => x.playerId === id);
  const zone = o?.zone;
  const front = zone ? isFrontZone(zone) : false;
  const setter = activeSetterId(team, scene.rotation);
  const slots = specialtySlots(team, scene.rotation, scene.serving);
  const g = groupOf(phase);
  const resp = RESP[p.role][g];
  const pos = livePos ?? scene.positions[id];
  const rows = [
    { k: 'Rotational position', v: zone ? `${zone} — ${ZONE_INFO[zone].name}` : 'Not on court' },
    { k: 'Role', v: ROLE_INFO[p.role].name + (p.role === 'S' && team.systemId !== '5-1' ? (id === setter ? ' (setting this rotation)' : ' (not setting this rotation)') : '') },
    { k: 'Current phase', v: PHASE_LABEL[phase] },
    { k: 'Row status', v: front ? 'Front row' : 'Back row' },
  ];
  if (pos) rows.push({ k: 'Tactical location', v: tacticalLocationName(team, pos) });
  if (slots[id]) rows.push({ k: 'Specialty spot', v: SLOT_NAME[slots[id]] });
  if (o?.liberoIn) rows.push({ k: 'Libero', v: `Replacing ${playerById(team, o.baseId).name} (#${playerById(team, o.baseId).number})` });
  return {
    title: `#${p.number} ${p.name} — ${ROLE_INFO[p.role].name}`,
    color: ROLE_INFO[p.role].color,
    rows,
    responsibility: target ? `${target.duty}. ${target.why}` : resp.now,
    next: target?.nextLabel ?? resp.next,
    rule: ruleFor(p.role, front, id === setter),
    why: resp.why,
  };
}

export function TooltipCard({ info, compact }: { info: PlayerInfo; compact?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-950/95 p-3 text-xs shadow-2xl ring-1 ring-white/15">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: info.color }} />
        <span className="font-display font-bold text-white">{info.title}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {info.rows.slice(0, compact ? 4 : 7).map((r) => (
          <div key={r.k} className="contents">
            <dt className="text-slate-500">{r.k}</dt>
            <dd className="text-slate-200">{r.v}</dd>
          </div>
        ))}
      </dl>
      {!compact && <p className="mt-2 text-slate-300">{info.responsibility}</p>}
    </div>
  );
}

export function PlayerPanel({ info, onClose, revealed = true }: { info: PlayerInfo; onClose?: () => void; revealed?: boolean }) {
  const [more, setMore] = useState(false);
  return (
    <div className="vq-pop rounded-2xl bg-slate-950/80 p-4 ring-1 ring-white/12">
      <div className="mb-2 flex items-start gap-2">
        <span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: info.color }} />
        <h3 className="font-display flex-1 text-sm font-bold text-white">{info.title}</h3>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        {info.rows.map((r) => (
          <div key={r.k} className="contents">
            <dt className="text-slate-500">{r.k}</dt>
            <dd className="font-medium text-slate-200">{r.v}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 space-y-2 text-xs">
        <Section label="Current responsibility" text={revealed ? info.responsibility : 'Decide for yourself first — the full responsibility is revealed after you check.'} />
        {revealed && <Section label="Next movement" text={info.next} />}
        <Section label="Important rule" text={info.rule} tone="rose" />
        {more ? <Section label="Why this matters" text={info.why} tone="sky" /> : (
          <button className="text-amber-300 hover:underline" onClick={() => setMore(true)}>More detail…</button>
        )}
      </div>
    </div>
  );
}

function Section({ label, text, tone = 'amber' }: { label: string; text: string; tone?: 'amber' | 'rose' | 'sky' }) {
  const c = { amber: 'text-amber-300', rose: 'text-rose-300', sky: 'text-sky-300' }[tone];
  return (
    <div>
      <div className={`text-[10px] font-bold uppercase tracking-wider ${c}`}>{label}</div>
      <p className="text-slate-300">{text}</p>
    </div>
  );
}

export const ZONE_DETAILS: Record<Zone, { duties: string; defense: string; varies: string; rules: string }> = {
  1: {
    duties: 'Server’s position. In receive, often where the back-row setter or a passer starts. In defence, usually the setter or opposite plays right-back.',
    defense: 'Right-back digger: line shots against the opponent’s outside hitter; in rotational defence, rotates up for tips.',
    varies: 'Perimeter: stays deep on the line. Rotational: moves up behind the block for tips. Middle-up: deep line corner.',
    rules: 'Back-row position: no blocking; attacks above the net must take off from behind the attack line. The player here serves.',
  },
  2: {
    duties: 'Right-front: the setting side of the net. Usually the opposite or front-row setter plays here after switching.',
    defense: 'Blocks the opponent’s outside hitter (their left side) — sets the block on the line.',
    varies: 'Against a middle quick, may pinch off the net. Against their right side, becomes the off-blocker.',
    rules: 'Front-row position: may block and attack from anywhere.',
  },
  3: {
    duties: 'Middle-front: the middle blocker’s home. Quick attacks and the block in front of the opponent’s middle.',
    defense: 'Reads the setter and closes the block to whichever pin is set.',
    varies: 'Commit-blocks the quick against a strong middle; read-blocks otherwise.',
    rules: 'Front-row position: may block and attack from anywhere.',
  },
  4: {
    duties: 'Left-front: the outside hitter’s attacking spot after the switch.',
    defense: 'Blocks the opponent’s right side; becomes the off-blocker (drops to the 3 m line) against their outside.',
    varies: 'Off-blocker duties: sharp cross court and short tips.',
    rules: 'Front-row position: may block and attack from anywhere.',
  },
  5: {
    duties: 'Left-back: often the libero’s defensive home and a primary passing lane.',
    defense: 'Cross-court digger against the opponent’s outside; line digger against their right side.',
    varies: 'Middle-up: deep cross corner. Rotational: slides toward the deep middle.',
    rules: 'Back-row position: no blocking; back-row attack rules apply.',
  },
  6: {
    duties: 'Middle-back: the deep centre in perimeter defence; pipe attacker (usually the back-row outside) on offence.',
    defense: 'Perimeter: deep middle/seam. Middle-up (rover): plays up behind the block for tips. Rotational: rotates toward the line.',
    varies: 'This is the zone whose job changes most between defensive systems.',
    rules: 'Back-row position: may attack the pipe only with a take-off behind the attack line (if above the net).',
  },
};

export function ZonePanel({ side, zone, onClose }: { side: Side; zone: Zone; onClose?: () => void }) {
  const z = ZONE_INFO[zone];
  const d = ZONE_DETAILS[zone];
  const [more, setMore] = useState(false);
  return (
    <div className="vq-pop rounded-2xl bg-slate-950/80 p-4 ring-1 ring-white/12">
      <div className="mb-2 flex items-start gap-2">
        <span className="font-display grid h-8 w-8 place-items-center rounded-lg bg-amber-400 text-sm font-extrabold text-slate-950">{zone}</span>
        <div className="flex-1">
          <h3 className="font-display text-sm font-bold text-white">Position {zone} — {z.name}</h3>
          <p className="text-xs text-slate-400">{z.row === 'front' ? 'Front row' : 'Back row'} · {side === 'home' ? 'your court' : 'opponent court'}</p>
        </div>
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">
            <Icon name="x" className="h-4 w-4" />
          </button>
        )}
      </div>
      <div className="space-y-2 text-xs">
        <Section label="General responsibilities" text={d.duties} />
        <Section label="Common defensive assignment" text={d.defense} tone="sky" />
        {more && <Section label="How it varies by formation" text={d.varies} />}
        <Section label="Relevant rules" text={d.rules} tone="rose" />
        {!more && (
          <button className="text-amber-300 hover:underline" onClick={() => setMore(true)}>
            How it varies by formation…
          </button>
        )}
        <p className="text-[11px] text-slate-500">A court location is not a role: whoever rotates into Position {zone} takes these rotational relationships, but plays their own role after the serve.</p>
      </div>
    </div>
  );
}
