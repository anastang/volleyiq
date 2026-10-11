import { isFrontZone, ZONES, type Side, type Zone } from './geometry';
import type { OnCourt, Team } from './types';

/**
 * Rotation engine. `rotation` counts how many clockwise rotations the team
 * has made since its starting lineup (0..5). The player at lineup index i is
 * in zone ZONES[(i - rotation) mod 6]. A rotation moves everyone clockwise:
 * 2→1, 1→6, 6→5, 5→4, 4→3, 3→2.
 */
const mod6 = (n: number) => ((n % 6) + 6) % 6;

export function zoneOfIndex(index: number, rotation: number): Zone {
  return ZONES[mod6(index - rotation)];
}

export function indexInZone(zone: Zone, rotation: number): number {
  return mod6(ZONES.indexOf(zone) + rotation);
}

export function baseIdInZone(team: Team, rotation: number, zone: Zone): string {
  return team.lineup[indexInZone(zone, rotation)];
}

export function zoneOfPlayer(team: Team, rotation: number, playerId: string): Zone | null {
  const i = team.lineup.indexOf(playerId);
  if (i >= 0) return zoneOfIndex(i, rotation);
  return null;
}

export const nextRotation = (rotation: number) => mod6(rotation + 1);

/** The zone each player moves to on the next rotation. */
export const CLOCKWISE_NEXT: Record<Zone, Zone> = { 1: 6, 6: 5, 5: 4, 4: 3, 3: 2, 2: 1 };

export function serverBaseId(team: Team, rotation: number): string {
  return baseIdInZone(team, rotation, 1);
}

/**
 * Who is physically on court in each zone, applying automatic libero
 * replacements: the libero replaces a designated player whenever that player
 * is in the back row, except when that player is the server (the libero may
 * not serve under FIVB rules).
 */
export function onCourt(team: Team, rotation: number, serving: boolean, liberoMayServe = false): OnCourt[] {
  const result: OnCourt[] = ZONES.map((zone) => {
    const baseId = baseIdInZone(team, rotation, zone);
    return { zone, baseId, playerId: baseId, liberoIn: false };
  });
  if (team.liberoId) {
    const candidates = result.filter(
      (o) =>
        team.liberoReplaces.includes(o.baseId) &&
        !isFrontZone(o.zone) &&
        !(o.zone === 1 && serving && !liberoMayServe),
    );
    // Only one libero on court at a time. Prefer the back-row middle that is not serving.
    const pick = candidates[0];
    if (pick) {
      pick.playerId = team.liberoId;
      pick.liberoIn = true;
    }
  }
  return result;
}

export function onCourtIds(team: Team, rotation: number, serving: boolean): string[] {
  return onCourt(team, rotation, serving).map((o) => o.playerId);
}

/** Zone of a player who is physically on court (handles the libero). */
export function courtZoneOf(team: Team, rotation: number, serving: boolean, playerId: string): Zone | null {
  return onCourt(team, rotation, serving).find((o) => o.playerId === playerId)?.zone ?? null;
}

export function isFrontRowPlayer(team: Team, rotation: number, serving: boolean, playerId: string): boolean {
  const z = courtZoneOf(team, rotation, serving, playerId);
  return z !== null && isFrontZone(z);
}

export interface MatchState {
  serving: Side;
  rotation: Record<Side, number>;
  score: Record<Side, number>;
  /** Did each side just side out (used for "won serve" explanations). */
  lastRotated: Side | null;
}

export function initialMatch(serving: Side): MatchState {
  return { serving, rotation: { home: 0, away: 0 }, score: { home: 0, away: 0 }, lastRotated: null };
}

/**
 * Apply a rally result. The winner scores. If the winner was receiving it
 * gains the serve and rotates one place clockwise. If the winner was already
 * serving, nobody rotates.
 */
export function applyRallyResult(state: MatchState, winner: Side): MatchState {
  const score = { ...state.score, [winner]: state.score[winner] + 1 };
  if (winner === state.serving) {
    return { ...state, score, lastRotated: null };
  }
  return {
    serving: winner,
    score,
    rotation: { ...state.rotation, [winner]: nextRotation(state.rotation[winner]) },
    lastRotated: winner,
  };
}

/** Human-facing rotation number (1..6) for a 0-based rotation counter. */
export const rotationLabel = (rotation: number) => `Rotation ${rotation + 1}`;
