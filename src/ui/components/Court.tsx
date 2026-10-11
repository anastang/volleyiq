import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { clamp, feetOf, toLocal, toWorld, zoneAt, ZONES, ZONE_INFO, type Side, type Vec, type Zone } from '../../engine/geometry';
import { onCourt } from '../../engine/rotation';
import type { BallSeg, SideScene } from '../../engine/scenarios';
import { playerById, roleTag, roleWord } from '../../engine/systems';
import { ROLE_INFO } from '../../engine/types';
import { useBallPath, useTweenPositions, type Playback } from '../anim';

export interface Ghost {
  id: string;
  pos: Vec; // home local
  label: string;
  color: string;
  tone: 'rec' | 'user' | 'alt';
}

export interface Arrow {
  from: Vec; // home local
  to: Vec;
  tone: 'rec' | 'next' | 'user' | 'warn' | 'trail';
  label?: string;
}

export interface RegionMark {
  c: Vec;
  r: number;
  tone: 'hint' | 'target' | 'alt';
  label?: string;
}

export interface CourtOverlays {
  zones?: boolean;
  zoneNumbers?: boolean;
  awayZones?: boolean;
  feet?: boolean;
  ghosts?: Ghost[];
  arrows?: Arrow[];
  regions?: RegionMark[];
  violations?: string[][];
  highlight?: string[];
  blockShadow?: Vec[] | null;
  hitter?: Vec;
  attackRays?: boolean;
  coverage?: { c: Vec; r: number }[];
  passTarget?: Vec;
  tipAt?: Vec;
  zoneHighlight?: Zone[];
  zonePulse?: Zone | null;
}

export interface CourtProps {
  home: SideScene;
  away: SideScene;
  animKey: string | number;
  homeFrom?: Record<string, Vec>;
  ballPath?: BallSeg[];
  ballKey?: string | number;
  ballRest?: { p: Vec; h: number };
  onBallDone?: () => void;
  draggable?: string[];
  onMove?: (id: string, p: Vec) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  onInspect?: (side: Side, id: string) => void;
  onZoneTap?: (side: Side, zone: Zone) => void;
  overlays?: CourtOverlays;
  view?: 'full' | 'half';
  tilt?: boolean;
  playback: Playback;
  focusIds?: string[];
  tooltip?: (side: Side, id: string) => ReactNode;
  className?: string;
  compact?: boolean;
  ariaLabel?: string;
  /** The player the user is playing as — gets an unmistakable "YOU" marker. */
  meId?: string;
  /** Label style under each of your players. */
  labels?: 'words' | 'short';
  /** Show each player's rotational position number on their marker. */
  zoneBadges?: boolean;
  /** Short speech bubbles (e.g. "Mine!") above players. */
  bubbles?: { id: string; text: string; side?: Side }[];
}

const VB_FULL = { x: -3, y: -3.4, w: 15, h: 24.8 };
const VB_HALF = { x: -3, y: 7.2, w: 15, h: 14.2 };

function useAnimatedBox(target: typeof VB_FULL, reduced: boolean) {
  const [box, setBox] = useState(target);
  const ref = useRef(box);
  ref.current = box;
  useEffect(() => {
    if (reduced) {
      setBox(target);
      return;
    }
    const from = ref.current;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 450);
      const e = 1 - Math.pow(1 - t, 3);
      setBox({ x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, w: from.w + (target.w - from.w) * e, h: from.h + (target.h - from.h) * e });
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.y, target.h, reduced]);
  return box;
}

const TONE: Record<Arrow['tone'], string> = {
  rec: '#fde047',
  next: '#67e8f9',
  user: '#f8fafc',
  warn: '#f87171',
  trail: '#a5b4fc',
};

function curvePath(a: Vec, b: Vec, bend = 0.18) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const cx = mx - dy * bend;
  const cy = my + dx * bend;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

function CourtBase({ zones, zoneNumbers = true, awayZones, zoneHighlight, zonePulse, compact }: { zones?: boolean; zoneNumbers?: boolean; awayZones?: boolean; zoneHighlight?: Zone[]; zonePulse?: Zone | null; compact?: boolean }) {
  const dashes = [];
  for (let x = -1.75; x < 0; x += 0.35) dashes.push(x);
  return (
    <g>
      <defs>
        <linearGradient id="vq-court" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2f78bd" />
          <stop offset="0.5" stopColor="#2b6cab" />
          <stop offset="1" stopColor="#2f78bd" />
        </linearGradient>
        <linearGradient id="vq-free" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#14324f" />
          <stop offset="1" stopColor="#0f2740" />
        </linearGradient>
        <pattern id="vq-wood" width="0.6" height="18" patternUnits="userSpaceOnUse">
          <rect width="0.6" height="18" fill="transparent" />
          <line x1="0.3" y1="0" x2="0.3" y2="18" stroke="#ffffff" strokeOpacity="0.025" strokeWidth="0.02" />
        </pattern>
        <radialGradient id="vq-ball" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fffbe6" />
          <stop offset="0.55" stopColor="#facc15" />
          <stop offset="1" stopColor="#d97706" />
        </radialGradient>
        <clipPath id="vq-courtclip">
          <rect x={0} y={0} width={9} height={18} />
        </clipPath>
        <filter id="vq-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="0.08" stdDeviation="0.09" floodColor="#020617" floodOpacity="0.55" />
        </filter>
        <filter id="vq-glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="0.14" />
        </filter>
        <marker id="vq-arrow-rec" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={TONE.rec} />
        </marker>
        <marker id="vq-arrow-next" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={TONE.next} />
        </marker>
        <marker id="vq-arrow-user" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={TONE.user} />
        </marker>
        <marker id="vq-arrow-warn" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={TONE.warn} />
        </marker>
        <marker id="vq-arrow-trail" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill={TONE.trail} />
        </marker>
      </defs>
      <rect x={-3} y={-3.4} width={15} height={24.8} rx={0.6} fill="url(#vq-free)" />
      <rect x={0} y={0} width={9} height={18} fill="url(#vq-court)" />
      <rect x={0} y={0} width={9} height={18} fill="url(#vq-wood)" />
      {/* subtle light from the centre */}
      <ellipse cx={4.5} cy={9} rx={4.4} ry={8.8} fill="#ffffff" opacity={0.035} />
      {zones && (
        <g>
          {ZONES.map((z) => {
            const r = ZONE_INFO[z].rect;
            const w0 = toWorld('home', { x: r.x0, y: r.y0 });
            const hl = zoneHighlight?.includes(z);
            return (
              <g key={z}>
                <rect x={w0.x} y={w0.y} width={3} height={r.y1 - r.y0} fill={hl ? '#fde047' : ZONE_INFO[z].row === 'front' ? '#60a5fa' : '#1e3a8a'} opacity={hl ? 0.22 : 0.13} stroke="#ffffff" strokeOpacity={0.12} strokeWidth={0.02} className={zonePulse === z ? 'vq-pulse' : undefined} />
                {zoneNumbers && <text x={w0.x + 1.5} y={w0.y + (r.y1 - r.y0) / 2 + 0.55} textAnchor="middle" fontSize={compact ? 1.3 : 1.6} fontWeight={800} fill="#ffffff" opacity={0.13} fontFamily="Sora, Inter, sans-serif">
                  {z}
                </text>}
              </g>
            );
          })}
        </g>
      )}
      {awayZones && (
        <g>
          {ZONES.map((z) => {
            const c = toWorld('away', ZONE_INFO[z].center);
            return (
              <text key={z} x={c.x} y={c.y + 0.35} textAnchor="middle" fontSize={1.0} fontWeight={800} fill="#ffffff" opacity={0.08} fontFamily="Sora, Inter, sans-serif">
                {z}
              </text>
            );
          })}
        </g>
      )}
      {/* lines (5 cm) */}
      <g stroke="#f8fafc" strokeWidth={0.05} fill="none" opacity={0.95}>
        <rect x={0} y={0} width={9} height={18} />
        <line x1={0} y1={9} x2={9} y2={9} />
        <line x1={0} y1={6} x2={9} y2={6} />
        <line x1={0} y1={12} x2={9} y2={12} />
      </g>
      {/* attack-line extensions (broken lines) */}
      <g stroke="#f8fafc" strokeWidth={0.05} opacity={0.6}>
        {dashes.map((x) => (
          <g key={x}>
            <line x1={x} y1={6} x2={x + 0.15} y2={6} />
            <line x1={x} y1={12} x2={x + 0.15} y2={12} />
            <line x1={9 - x - 0.15} y1={6} x2={9 - x} y2={6} />
            <line x1={9 - x - 0.15} y1={12} x2={9 - x} y2={12} />
          </g>
        ))}
        {/* service-zone marks */}
        <line x1={0} y1={18.2} x2={0} y2={18.35} />
        <line x1={9} y1={18.2} x2={9} y2={18.35} />
        <line x1={0} y1={-0.2} x2={0} y2={-0.35} />
        <line x1={9} y1={-0.2} x2={9} y2={-0.35} />
      </g>
      {/* net */}
      <g>
        <rect x={-0.6} y={8.9} width={10.2} height={0.2} fill="#0b1220" opacity={0.45} />
        <line x1={-0.6} y1={9} x2={9.6} y2={9} stroke="#e2e8f0" strokeWidth={0.07} />
        <line x1={-0.6} y1={9} x2={9.6} y2={9} stroke="#0f172a" strokeWidth={0.03} strokeDasharray="0.08 0.08" />
        {[0, 9].map((x) => (
          <g key={x}>
            <rect x={x - 0.04} y={8.82} width={0.08} height={0.36} fill="#ffffff" />
            <rect x={x - 0.04} y={8.88} width={0.08} height={0.08} fill="#ef4444" />
            <rect x={x - 0.04} y={9.04} width={0.08} height={0.08} fill="#ef4444" />
          </g>
        ))}
        <circle cx={-0.7} cy={9} r={0.14} fill="#cbd5e1" />
        <circle cx={9.7} cy={9} r={0.14} fill="#cbd5e1" />
      </g>
      {!compact && (
        <g fontFamily="Inter, sans-serif" fontSize={0.36} fill="#94a3b8" opacity={0.75}>
          <text x={4.5} y={21.1} textAnchor="middle">YOUR SIDE</text>
          <text x={4.5} y={-2.75} textAnchor="middle">OPPONENT</text>
          <text x={-0.25} y={6 - 0.15} textAnchor="end" fontSize={0.26}>3 m</text>
          <text x={-0.25} y={12 - 0.15} textAnchor="end" fontSize={0.26}>3 m</text>
        </g>
      )}
    </g>
  );
}

const MemoBase = memo(CourtBase);

type LabelSlot = 'below' | 'above' | 'left' | 'right';
const labelOffset = (k: LabelSlot, w: number) =>
  k === 'below' ? { x: 0, y: 0.74 } : k === 'above' ? { x: 0, y: -0.7 } : { x: (k === 'right' ? 1 : -1) * (0.5 + w / 2), y: 0.1 };

function labelSlots(points: { id: string; p: Vec; w: number; noAbove?: boolean }[]): Record<string, LabelSlot> {
  const out: Record<string, LabelSlot> = {};
  const placed: { x: number; y: number }[] = [];
  for (const { id, p, w, noAbove } of points) {
    let best: LabelSlot = 'below';
    let bestScore = Infinity;
    const offs = { below: labelOffset('below', w), above: labelOffset('above', w), right: labelOffset('right', w), left: labelOffset('left', w) };
    for (const k of (Object.keys(offs) as LabelSlot[]).filter((k) => !(noAbove && k === 'above'))) {
      const l = { x: p.x + offs[k].x, y: p.y + offs[k].y };
      let s = k === 'below' ? 0 : 0.3;
      for (const q of points) if (q.id !== id) s += Math.max(0, 0.9 - Math.hypot(q.p.x - l.x, q.p.y - l.y)) * 3;
      for (const q of placed) s += Math.max(0, 0.8 - Math.hypot(q.x - l.x, q.y - l.y)) * 2;
      if (s < bestScore) {
        bestScore = s;
        best = k;
      }
    }
    out[id] = best;
    placed.push({ x: p.x + offs[best].x, y: p.y + offs[best].y });
  }
  return out;
}

export function Court(props: CourtProps) {
  const { home, away, playback, overlays = {}, view = 'full', draggable = [], focusIds = [] } = props;
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [hover, setHover] = useState<{ side: Side; id: string } | null>(null);
  const dragSet = useMemo(() => new Set(dragId ? [dragId] : []), [dragId]);
  const box = useAnimatedBox(view === 'half' ? VB_HALF : VB_FULL, playback.reduced);

  const homeOC = onCourt(home.team, home.rotation, home.serving);
  const awayOC = onCourt(away.team, away.rotation, away.serving);
  const homeT = useTweenPositions(home.positions, props.animKey, playback, { instant: dragSet, from: props.homeFrom });
  const awayT = useTweenPositions(away.positions, props.animKey, playback);
  const ball = useBallPath(props.ballPath ?? [], props.ballKey ?? props.animKey, playback, props.ballRest, props.onBallDone);

  const toSvg = (e: { clientX: number; clientY: number }): Vec | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const m = svg.getScreenCTM();
    if (!m) return null;
    const w = pt.matrixTransform(m.inverse());
    return { x: w.x, y: w.y };
  };

  const clampHome = (p: Vec): Vec => ({ x: clamp(p.x, -2.4, 11.4), y: clamp(p.y, 0.12, 11.8) });
  const interactive = !props.tilt;

  const onPointerDownPlayer = (e: React.PointerEvent, side: Side, id: string) => {
    e.stopPropagation();
    if (!interactive) return;
    if (side === 'home' && draggable.includes(id)) {
      (e.target as Element).setPointerCapture?.(e.pointerId);
      setDragId(id);
      props.onSelect?.(id);
    }
    props.onInspect?.(side, id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragId) return;
    const w = toSvg(e);
    if (!w) return;
    props.onMove?.(dragId, clampHome(toLocal('home', w)));
  };
  const endDrag = () => setDragId(null);

  const onBackground = (e: React.MouseEvent) => {
    if (!interactive) return;
    const w = toSvg(e);
    if (!w) return;
    if (props.selectedId && draggable.includes(props.selectedId) && w.y > 9) {
      props.onMove?.(props.selectedId, clampHome(toLocal('home', w)));
      return;
    }
    const side: Side = w.y > 9 ? 'home' : 'away';
    const z = zoneAt(toLocal(side, w));
    if (z) props.onZoneTap?.(side, z);
    props.onSelect?.(null);
  };

  const H = (p: Vec) => toWorld('home', p);

  const homePts = homeOC.map((o) => ({ id: o.playerId, p: H(homeT.pos[o.playerId] ?? home.positions[o.playerId] ?? { x: 4.5, y: 4.5 }) }));
  const labelText = (id: string) => (props.labels === 'short' ? roleTag(home.team, home.rotation, id) : roleWord(home.team, home.rotation, id));
  const labelW = (id: string) => Math.max(0.72, labelText(id).length * 0.13 + 0.28);
  const slots = labelSlots(homePts.map((x) => ({ ...x, w: labelW(x.id), noAbove: x.id === props.meId })));
  const violIds = new Set((overlays.violations ?? []).flat());

  const tipPos = hover ? (hover.side === 'home' ? homePts.find((x) => x.id === hover.id)?.p : (() => {
    const lp = awayT.pos[hover.id];
    return lp ? toWorld('away', lp) : undefined;
  })()) : undefined;

  return (
    <div className={`relative select-none ${props.className ?? ''}`} style={{ perspective: props.tilt ? '1400px' : undefined }}>
      <div style={{ transform: props.tilt ? 'rotateX(34deg) scale(0.92)' : undefined, transformOrigin: '50% 60%', transition: playback.reduced ? undefined : 'transform 500ms cubic-bezier(.2,.8,.2,1)' }}>
        <svg
          ref={svgRef}
          viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
          className="block h-full w-full touch-none"
          role="img"
          aria-label={props.ariaLabel ?? 'Volleyball court'}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onBackground}
          style={{ maxHeight: 'inherit' }}
        >
          <MemoBase zones={overlays.zones} zoneNumbers={overlays.zoneNumbers} awayZones={overlays.awayZones} zoneHighlight={overlays.zoneHighlight} zonePulse={overlays.zonePulse} compact={props.compact} />

          {/* target regions */}
          {overlays.regions?.map((r, i) => {
            const c = H(r.c);
            return (
              <g key={i} pointerEvents="none">
                <circle cx={c.x} cy={c.y} r={r.r} fill={r.tone === 'hint' ? '#fde047' : r.tone === 'alt' ? '#67e8f9' : '#86efac'} opacity={r.tone === 'hint' ? 0.12 : 0.1} />
                <circle cx={c.x} cy={c.y} r={r.r} fill="none" stroke={r.tone === 'hint' ? '#fde047' : r.tone === 'alt' ? '#67e8f9' : '#86efac'} strokeWidth={0.04} strokeDasharray="0.18 0.12" opacity={0.75} className="vq-dash" />
                {r.label && (
                  <text x={c.x} y={c.y - r.r - 0.12} textAnchor="middle" fontSize={0.3} fill="#e2e8f0" opacity={0.85}>
                    {r.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* block shadow + attack rays */}
          {overlays.hitter && overlays.attackRays && (
            <g pointerEvents="none" opacity={0.5}>
              {[H({ x: 0, y: 9 }), H({ x: 9, y: 9 }), H({ x: overlays.hitter.x > 4.5 ? 9 : 0, y: 9 })].map((p, i) => (
                <line key={i} x1={H(overlays.hitter!).x} y1={H(overlays.hitter!).y} x2={p.x} y2={p.y} stroke="#fca5a5" strokeWidth={0.03} strokeDasharray="0.15 0.15" />
              ))}
            </g>
          )}
          {overlays.blockShadow && (
            <polygon points={overlays.blockShadow.map((p) => `${H(p).x},${H(p).y}`).join(' ')} fill="#0f172a" opacity={0.38} pointerEvents="none" clipPath="url(#vq-courtclip)" />
          )}
          {overlays.coverage?.map((c, i) => (
            <circle key={i} cx={H(c.c).x} cy={H(c.c).y} r={c.r} fill="#34d399" opacity={0.1} stroke="#34d399" strokeOpacity={0.4} strokeWidth={0.03} pointerEvents="none" />
          ))}
          {overlays.passTarget && (
            <g pointerEvents="none">
              <circle cx={H(overlays.passTarget).x} cy={H(overlays.passTarget).y} r={0.55} fill="none" stroke="#fde68a" strokeWidth={0.04} strokeDasharray="0.1 0.1" opacity={0.7} />
              <text x={H(overlays.passTarget).x} y={H(overlays.passTarget).y + 0.95} textAnchor="middle" fontSize={0.26} fill="#fde68a" opacity={0.8}>
                target
              </text>
            </g>
          )}
          {overlays.tipAt && (
            <g pointerEvents="none">
              <circle cx={H(overlays.tipAt).x} cy={H(overlays.tipAt).y} r={0.35} fill="#f472b6" opacity={0.25} className="vq-pulse" />
            </g>
          )}

          {/* arrows */}
          {overlays.arrows?.map((a, i) => (
            <path
              key={i}
              d={curvePath(H(a.from), H(a.to))}
              fill="none"
              stroke={TONE[a.tone]}
              strokeWidth={a.tone === 'trail' ? 0.05 : 0.07}
              strokeLinecap="round"
              strokeDasharray={a.tone === 'rec' || a.tone === 'next' ? '0.25 0.15' : undefined}
              markerEnd={`url(#vq-arrow-${a.tone})`}
              opacity={a.tone === 'trail' ? 0.55 : 0.9}
              className={a.tone === 'rec' || a.tone === 'next' ? 'vq-dash' : undefined}
              pointerEvents="none"
            />
          ))}

          {/* violation links */}
          {(overlays.violations ?? []).map((pair, i) =>
            pair.length === 2 ? (
              <line key={i} x1={homePts.find((x) => x.id === pair[0])?.p.x} y1={homePts.find((x) => x.id === pair[0])?.p.y} x2={homePts.find((x) => x.id === pair[1])?.p.x} y2={homePts.find((x) => x.id === pair[1])?.p.y} stroke="#f87171" strokeWidth={0.07} strokeDasharray="0.12 0.1" pointerEvents="none" />
            ) : null,
          )}

          {/* ghosts */}
          {overlays.ghosts?.map((g) => {
            const p = H(g.pos);
            return (
              <g key={g.id + g.tone} pointerEvents="none" opacity={g.tone === 'user' ? 0.5 : 0.75}>
                <circle cx={p.x} cy={p.y} r={0.42} fill={g.color} opacity={0.22} stroke={g.color} strokeWidth={0.05} strokeDasharray={g.tone === 'user' ? '0.08 0.08' : undefined} />
                <text x={p.x} y={p.y + 0.12} textAnchor="middle" fontSize={0.32} fontWeight={700} fill="#ffffff">
                  {g.label}
                </text>
              </g>
            );
          })}

          {/* feet */}
          {overlays.feet &&
            homeOC.map((o) => {
              const lp = homeT.pos[o.playerId];
              if (!lp) return null;
              const f = feetOf(lp);
              const bad = violIds.has(o.playerId);
              return (
                <g key={o.playerId + '-feet'} pointerEvents="none">
                  {[f.left, f.right].map((ft, i) => (
                    <ellipse key={i} cx={H(ft).x} cy={H(ft).y} rx={0.07} ry={0.12} fill={bad ? '#f87171' : '#e2e8f0'} opacity={0.85} />
                  ))}
                </g>
              );
            })}

          {/* away players */}
          {awayOC.map((o) => {
            const lp = awayT.pos[o.playerId];
            if (!lp) return null;
            const p = toWorld('away', lp);
            const pl = playerById(away.team, o.playerId);
            return (
              <g
                key={o.playerId}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => onPointerDownPlayer(e, 'away', o.playerId)}
                onPointerEnter={() => setHover({ side: 'away', id: o.playerId })}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: 'pointer' }}
              >
                <circle r={0.36} fill={pl.role === 'L' ? '#e2e8f0' : '#f1f5f9'} opacity={0.88} stroke="#0f172a" strokeOpacity={0.45} strokeWidth={0.04} filter="url(#vq-shadow)" />
                <text y={0.11} textAnchor="middle" fontSize={0.3} fontWeight={700} fill="#0f172a">
                  {pl.number}
                </text>
                {!props.compact && (
                  <text y={-0.5} textAnchor="middle" fontSize={0.22} fill="#cbd5e1" opacity={0.8}>
                    {pl.role}
                  </text>
                )}
              </g>
            );
          })}

          {/* home players */}
          {homeOC.map((o) => {
            const lp = homeT.pos[o.playerId] ?? home.positions[o.playerId];
            if (!lp) return null;
            const p = H(lp);
            const pl = playerById(home.team, o.playerId);
            const color = ROLE_INFO[pl.role].color;
            const sel = props.selectedId === o.playerId;
            const focus = focusIds.includes(o.playerId);
            const drag = draggable.includes(o.playerId);
            const bad = violIds.has(o.playerId);
            const hl = overlays.highlight?.includes(o.playerId);
            const slot = slots[o.playerId];
            const tag = labelText(o.playerId);
            const tw = labelW(o.playerId);
            const lo = labelOffset(slot, tw);
            const me = props.meId === o.playerId;
            return (
              <g
                key={o.playerId}
                transform={`translate(${p.x} ${p.y})`}
                onPointerDown={(e) => onPointerDownPlayer(e, 'home', o.playerId)}
                onPointerEnter={() => setHover({ side: 'home', id: o.playerId })}
                onPointerLeave={() => setHover(null)}
                onClick={(e) => e.stopPropagation()}
                style={{ cursor: drag ? (dragId === o.playerId ? 'grabbing' : 'grab') : 'pointer' }}
                role="button"
                aria-label={`#${pl.number} ${pl.name}, ${ROLE_INFO[pl.role].name}, position ${o.zone}`}
              >
                {me && <circle r={0.72} fill="none" stroke="#fde047" strokeWidth={0.1} className={playback.reduced ? undefined : 'vq-pulse'} />}
                {(focus || sel) && <circle r={0.66} fill={sel ? '#fde047' : color} opacity={0.35} filter="url(#vq-glow)" className={playback.reduced ? undefined : 'vq-breathe'} />}
                {bad && <circle r={0.6} fill="none" stroke="#f87171" strokeWidth={0.08} className="vq-pulse" />}
                {hl && <circle r={0.6} fill="none" stroke="#fde047" strokeWidth={0.06} />}
                {drag && !sel && <circle r={0.52} fill="none" stroke="#ffffff" strokeOpacity={0.5} strokeWidth={0.03} strokeDasharray="0.1 0.08" className="vq-spin" />}
                <circle r={0.44} fill={color} stroke={sel ? '#fde047' : '#0b1220'} strokeWidth={sel ? 0.09 : 0.05} filter="url(#vq-shadow)" />
                <ellipse cx={-0.12} cy={-0.16} rx={0.2} ry={0.12} fill="#ffffff" opacity={0.28} />
                {pl.role === 'L' && <circle r={0.34} fill="none" stroke="#0b1220" strokeOpacity={0.5} strokeWidth={0.04} />}
                <text y={0.13} textAnchor="middle" fontSize={0.38} fontWeight={800} fill="#0b1220" fontFamily="Sora, Inter, sans-serif">
                  {pl.number}
                </text>
                {props.zoneBadges !== false && (
                  <g transform="translate(0.36 -0.34)">
                    <circle r={0.18} fill="#f8fafc" stroke="#0b1220" strokeWidth={0.03} />
                    <text y={0.07} textAnchor="middle" fontSize={0.2} fontWeight={800} fill="#0b1220">
                      {o.zone}
                    </text>
                  </g>
                )}
                <g transform={`translate(${lo.x} ${lo.y})`}>
                  <rect x={-tw / 2} y={-0.17} width={tw} height={0.32} rx={0.16} fill={me ? '#fde047' : '#0b1220'} opacity={me ? 1 : 0.85} />
                  <text y={0.07} textAnchor="middle" fontSize={0.2} fontWeight={700} fill={me ? '#0b1220' : color} letterSpacing={0.01}>
                    {tag}
                  </text>
                </g>
                {me && (
                  <g transform="translate(0 -1.02)" pointerEvents="none">
                    <rect x={-0.42} y={-0.2} width={0.84} height={0.38} rx={0.12} fill="#fde047" filter="url(#vq-shadow)" />
                    <path d="M -0.1 0.17 L 0 0.3 L 0.1 0.17 z" fill="#fde047" />
                    <text y={0.08} textAnchor="middle" fontSize={0.24} fontWeight={800} fill="#0b1220" fontFamily="Sora, Inter, sans-serif">
                      YOU
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* speech bubbles */}
          {props.bubbles?.map((b, i) => {
            const lp = (b.side ?? 'home') === 'home' ? homeT.pos[b.id] : awayT.pos[b.id];
            if (!lp) return null;
            const p = toWorld(b.side ?? 'home', lp);
            const w = Math.max(0.9, b.text.length * 0.15 + 0.35);
            const up = (b.side ?? 'home') === 'home' && b.id === props.meId ? 1.75 : 1.05;
            return (
              <g key={b.id + i} transform={`translate(${p.x} ${p.y - up})`} pointerEvents="none" className="vq-pop">
                <rect x={-w / 2} y={-0.24} width={w} height={0.44} rx={0.2} fill="#ffffff" filter="url(#vq-shadow)" />
                <path d="M -0.08 0.19 L 0 0.34 L 0.08 0.19 z" fill="#ffffff" />
                <text y={0.08} textAnchor="middle" fontSize={0.24} fontWeight={800} fill="#0b1220">
                  {b.text}
                </text>
              </g>
            );
          })}

          {/* ball */}
          {ball && (
            <g pointerEvents="none">
              {ball.trail.map((t, i) => (
                <circle key={i} cx={t.x} cy={t.y} r={0.05} fill="#fde68a" opacity={(i / ball.trail.length) * 0.35} />
              ))}
              <ellipse cx={ball.p.x} cy={ball.p.y} rx={0.2 + ball.h * 0.02} ry={0.12 + ball.h * 0.012} fill="#020617" opacity={Math.max(0.12, 0.45 - ball.h * 0.05)} />
              <g transform={`translate(${ball.p.x + ball.h * 0.06} ${ball.p.y - ball.h * 0.22})`}>
                <circle r={0.2 + ball.h * 0.018} fill="url(#vq-ball)" stroke="#78350f" strokeWidth={0.02} />
                <path d="M -0.18 -0.04 Q 0 0.1 0.18 -0.06 M -0.05 -0.19 Q 0.06 0 -0.02 0.2" stroke="#1d4ed8" strokeWidth={0.035} fill="none" opacity={0.7} />
              </g>
              {ball.label && !ball.done && (
                <text x={ball.p.x} y={ball.p.y - ball.h * 0.22 - 0.45} textAnchor="middle" fontSize={0.3} fontWeight={700} fill="#fef3c7">
                  {ball.label}
                </text>
              )}
            </g>
          )}
        </svg>
      </div>
      {hover && tipPos && props.tooltip && !dragId && !props.tilt && (
        <div
          className="pointer-events-none absolute z-20 hidden w-64 md:block"
          style={{ left: `${((tipPos.x - box.x) / box.w) * 100}%`, top: `${((tipPos.y - box.y) / box.h) * 100}%`, transform: `translate(-50%, ${tipPos.y > box.y + box.h * 0.6 ? 'calc(-100% - 28px)' : '28px'})` }}
        >
          {props.tooltip(hover.side, hover.id)}
        </div>
      )}
    </div>
  );
}
