import { useEffect, useRef, useState } from 'react';
import type { Vec } from '../engine/geometry';
import type { BallSeg } from '../engine/scenarios';

/**
 * Animation engine. The simulation state (targets) is always authoritative;
 * these hooks only interpolate the DISPLAY toward it, so the picture can never
 * contradict the game state once an animation settles.
 */

export interface Playback {
  speed: number;
  paused: boolean;
  reduced: boolean;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

interface TweenState {
  from: Record<string, Vec>;
  to: Record<string, Vec>;
  elapsed: number;
  duration: number;
}

export function useTweenPositions(
  targets: Record<string, Vec>,
  animKey: string | number,
  playback: Playback,
  opts: { instant?: Set<string>; duration?: number; from?: Record<string, Vec> } = {},
): { pos: Record<string, Vec>; moving: boolean } {
  const [display, setDisplay] = useState<Record<string, Vec>>(() => ({ ...(opts.from ?? targets) }));
  const displayRef = useRef(display);
  displayRef.current = display;
  const st = useRef<TweenState | null>(null);
  const pb = useRef(playback);
  pb.current = playback;
  const lastKey = useRef(animKey);

  // Start a tween whenever targets change.
  const sig = JSON.stringify(targets);
  useEffect(() => {
    const keyChanged = lastKey.current !== animKey;
    lastKey.current = animKey;
    const cur = displayRef.current;
    const from: Record<string, Vec> = {};
    for (const id of Object.keys(targets)) {
      from[id] = (keyChanged && opts.from?.[id]) || cur[id] || targets[id];
      if (opts.instant?.has(id)) from[id] = targets[id];
    }
    let maxD = 0;
    for (const id of Object.keys(targets)) maxD = Math.max(maxD, Math.hypot(targets[id].x - from[id].x, targets[id].y - from[id].y));
    if (pb.current.reduced || maxD < 0.01) {
      st.current = null;
      setDisplay({ ...targets });
      return;
    }
    st.current = { from, to: targets, elapsed: 0, duration: opts.duration ?? Math.min(1500, 450 + maxD * 120) };
    setDisplay(from);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, animKey]);

  const [moving, setMoving] = useState(false);
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const s = st.current;
      if (s) {
        if (!pb.current.paused) s.elapsed += dt * pb.current.speed;
        const t = Math.min(1, s.elapsed / s.duration);
        const e = ease(t);
        const next: Record<string, Vec> = {};
        for (const id of Object.keys(s.to)) {
          const a = s.from[id] ?? s.to[id];
          const b = s.to[id];
          next[id] = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
        }
        setDisplay(next);
        if (t >= 1) st.current = null;
        setMoving(t < 1);
      } else setMoving(false);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return { pos: display, moving };
}

export interface BallState {
  p: Vec;
  h: number;
  seg: number;
  label?: string;
  done: boolean;
  trail: Vec[];
}

/** Animates a ball along a path of segments (world coords) with parabolic height. */
export function useBallPath(path: BallSeg[], key: string | number, playback: Playback, rest?: { p: Vec; h: number }, onDone?: () => void): BallState | null {
  const end = (): BallState | null =>
    path.length ? { p: path[path.length - 1].to, h: path[path.length - 1].h1, seg: path.length - 1, done: true, trail: [], label: path[path.length - 1].label } : rest ? { ...rest, seg: 0, done: true, trail: [] } : null;
  const [state, setState] = useState<BallState | null>(() => (path.length ? { p: path[0].from, h: path[0].h0, seg: 0, done: false, trail: [] } : end()));
  const pb = useRef(playback);
  pb.current = playback;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  useEffect(() => {
    if (!path.length || playback.reduced) {
      setState(end());
      const t = setTimeout(() => doneRef.current?.(), 30);
      return () => clearTimeout(t);
    }
    let raf = 0;
    let last = performance.now();
    let seg = 0;
    let el = 0;
    const trail: Vec[] = [];
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (!pb.current.paused) el += dt * pb.current.speed;
      const s = path[seg];
      const t = Math.min(1, el / s.ms);
      const p = { x: s.from.x + (s.to.x - s.from.x) * t, y: s.from.y + (s.to.y - s.from.y) * t };
      const h = s.h0 + (s.h1 - s.h0) * t + 4 * s.peak * t * (1 - t);
      trail.push(p);
      if (trail.length > 18) trail.shift();
      setState({ p, h, seg, label: s.label, done: false, trail: [...trail] });
      if (t >= 1) {
        if (seg < path.length - 1) {
          seg++;
          el = 0;
        } else {
          setState({ p: s.to, h: s.h1, seg, label: s.label, done: true, trail: [] });
          doneRef.current?.();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, playback.reduced]);

  return state;
}
