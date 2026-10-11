import { useEffect, useMemo, useRef, useState } from 'react';
import type { Side, Vec, Zone } from '../../engine/geometry';
import type { DefenseSystemId, SystemId } from '../../engine/types';
import { demoScene, type DemoPhase } from '../demo';
import { resolveFocus } from '../../engine/scenarios';
import { useStore } from '../store';
import { Court, type Arrow, type CourtOverlays } from './Court';
import { playerInfo, TooltipCard } from './InfoPanel';

export interface DemoCourtProps {
  systemId?: SystemId;
  rotation: number;
  phase: DemoPhase;
  defenseSystem?: DefenseSystemId;
  trails?: boolean;
  zones?: boolean;
  compact?: boolean;
  view?: 'full' | 'half';
  className?: string;
  style?: React.CSSProperties;
  onInspect?: (side: Side, id: string) => void;
  onZoneTap?: (side: Side, z: Zone) => void;
  extraOverlays?: CourtOverlays;
  /** Freely draggable (sandbox) — positions override. */
  positions?: Record<string, Vec>;
  onMove?: (id: string, p: Vec) => void;
  draggable?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  tooltips?: boolean;
  /** Mark the player matching the user's role with the YOU marker (default true). */
  showMe?: boolean;
}

export function DemoCourt(p: DemoCourtProps) {
  const { settings, ruleset, reduced } = useStore();
  const scene = useMemo(
    () =>
      demoScene(
        {
          systemId: p.systemId ?? settings.systemId,
          rotation: p.rotation,
          ruleset,
          defenseSystem: p.defenseSystem ?? settings.defenseSystem,
          roster: settings.roster,
          customSetters: settings.customSetters,
        },
        p.phase,
      ),
    [p.systemId, p.rotation, p.phase, p.defenseSystem, settings.systemId, settings.defenseSystem, settings.roster, settings.customSetters, ruleset],
  );
  const prev = useRef<{ home: Record<string, Vec>; key: string } | null>(null);
  const [trailFrom, setTrailFrom] = useState<Record<string, Vec> | null>(null);
  const key = `${p.systemId}-${p.rotation}-${p.phase}`;
  useEffect(() => {
    if (prev.current && prev.current.key !== key) setTrailFrom(prev.current.home);
    prev.current = { home: p.positions ?? scene.home, key };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const homePos = p.positions ?? scene.home;
  const arrows: Arrow[] = [];
  if (p.trails && trailFrom) {
    for (const id of Object.keys(homePos)) {
      const a = trailFrom[id];
      const b = homePos[id];
      if (a && b && Math.hypot(a.x - b.x, a.y - b.y) > 0.6) arrows.push({ from: a, to: b, tone: 'trail' });
    }
  }
  const overlays: CourtOverlays = {
    zones: p.zones,
    arrows,
    hitter: scene.hitter,
    attackRays: !!scene.hitter,
    blockShadow: scene.shadow,
    passTarget: scene.passTarget,
    ...p.extraOverlays,
  };
  const homeScene = { ...scene.world.home, serving: scene.serving, positions: homePos };
  const meId = p.showMe !== false && settings.role !== 'ALL' && settings.role !== 'DS' ? resolveFocus(scene.world, { kind: 'role', role: settings.role }).ids[0] : undefined;
  const awayScene = { ...scene.world.away, serving: !scene.serving, positions: scene.away };
  return (
    <div className={p.className} style={p.style}>
      <Court
        className="h-full w-full"
        home={homeScene}
        away={awayScene}
        animKey={0}
        overlays={overlays}
        playback={{ speed: settings.speed, paused: false, reduced }}
        compact={p.compact}
        view={p.view}
        onInspect={p.onInspect}
        onZoneTap={p.onZoneTap}
        draggable={p.draggable ? Object.keys(homePos) : []}
        onMove={p.onMove}
        selectedId={p.selectedId}
        onSelect={p.onSelect}
        ballRest={scene.ball}
        meId={meId}
        labels={settings.labels}
        zoneBadges={settings.zoneBadges}
        tooltip={p.tooltips === false ? undefined : (side, id) => <TooltipCard compact={p.compact} info={playerInfo(side === 'home' ? homeScene : awayScene, id, scene.phase, side === 'home' ? scene.plan?.targets[id] : undefined)} />}
      />
    </div>
  );
}

export function useDemoScene(systemId: SystemId, rotation: number, phase: DemoPhase, defenseSystem?: DefenseSystemId) {
  const { settings, ruleset } = useStore();
  return useMemo(
    () => demoScene({ systemId, rotation, ruleset, defenseSystem: defenseSystem ?? settings.defenseSystem, roster: settings.roster, customSetters: settings.customSetters }, phase),
    [systemId, rotation, phase, defenseSystem, settings.defenseSystem, settings.roster, settings.customSetters, ruleset],
  );
}
