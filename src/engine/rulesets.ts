/**
 * Rulesets are data, so the simulation can support other competitions
 * without changing the engines that consult them.
 */
export interface Ruleset {
  id: string;
  name: string;
  description: string;
  /** Receiving team must be in rotational order at service contact. */
  receivingTeamPositionalFault: boolean;
  /** Serving team must be in rotational order at service contact. */
  servingTeamPositionalFault: boolean;
  liberoMayServe: boolean;
  maxSubstitutionsPerSet: number;
  /** Rally between two libero replacements is required. */
  completedRallyBetweenLiberoReplacements: boolean;
  setPoints: number;
  decidingSetPoints: number;
}

export const FIVB_2025: Ruleset = {
  id: 'fivb-2025',
  name: 'FIVB Official Rules 2025–2028',
  description:
    'At service contact only the receiving team is judged for positional faults; the serving team may stand anywhere on its own court (the server must still be the correct player, serving from the service zone).',
  receivingTeamPositionalFault: true,
  servingTeamPositionalFault: false,
  liberoMayServe: false,
  maxSubstitutionsPerSet: 6,
  completedRallyBetweenLiberoReplacements: true,
  setPoints: 25,
  decidingSetPoints: 15,
};

export const CLASSIC_OVERLAP: Ruleset = {
  id: 'classic',
  name: 'Classic overlap (both teams)',
  description:
    'Older FIVB editions and many school / club leagues: BOTH teams must be in rotational order at service contact. Libero serving and substitution limits vary by league — check your competition.',
  receivingTeamPositionalFault: true,
  servingTeamPositionalFault: true,
  liberoMayServe: false,
  maxSubstitutionsPerSet: 6,
  completedRallyBetweenLiberoReplacements: true,
  setPoints: 25,
  decidingSetPoints: 15,
};

export const RULESETS: Ruleset[] = [FIVB_2025, CLASSIC_OVERLAP];

export const getRuleset = (id: string) => RULESETS.find((r) => r.id === id) ?? FIVB_2025;
