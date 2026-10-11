# VolleyIQ

Interactive volleyball rotation, positioning and game-awareness trainer. React + TypeScript + Tailwind (Vite), SVG court, with a separate, tested simulation engine.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine test suite (vitest)
npm run build    # production build in dist/
```

## Playing it

- **Game Simulator** (the big card on Home): play a match as one player. The rally flows on its own, teammates call the ball ("Mine!", "Help!", "Free!"), and at each of your moments you move yourself and get a one-line coach reaction.
- **Learn / Practise my position / Rotations**: guided training with full explanations.
- Every player shows their **role in words** (Setter, Outside, Middle…) plus a small **position number** (1–6). You are always marked with a gold **YOU** tag. Both can be changed in Settings.

## Architecture

| Layer | File(s) | Responsibility |
|---|---|---|
| Geometry | `src/engine/geometry.ts` | Court dimensions, zones, local↔world frames, feet model |
| Rotation engine | `src/engine/rotation.ts` | Lineups, clockwise rotation, server, libero auto-replacement, side-out logic |
| Systems | `src/engine/systems.ts` | 5–1 / 6–2 / 4–2 / Custom (5–2), active setter, serve-receive formations, specialty slots, attack options |
| Rules engine | `src/engine/rules.ts`, `rulesets.ts` | Overlap (feet-based), server order, back-row attack/block, libero, contacts, substitutions |
| Tactical engine | `src/engine/tactics.ts` | Target regions + reasoning per player for every rally situation; defensive systems; block shadow |
| Evaluation | `src/engine/evaluate.ts` | Legality first, then tactics across multiple valid variants; six scoring dimensions |
| Scenario engine | `src/engine/scenarios.ts` | Reusable builders + generators for 16 categories (place / choice / tap-zone) |
| Rally engine | `src/engine/rally.ts` | Full rally state machine, light opponent AI, scrimmage scoring |
| Training | `src/engine/curriculum.ts`, `progress.ts` | 10-level curriculum, mistakes library, progress, mastery, recommendations |
| Animation | `src/ui/anim.ts` | Tweens display toward the authoritative state; ball flight with height |
| UI | `src/ui/**` | Court, gameplay loop (`ScenarioPlayer`), all modes and screens |

## Rules source

The rules engine follows the **FIVB Official Volleyball Rules 2025–2028** (checked against the official PDF):

- **7.4** — at the service hit both teams must be within their own court (except the server); only the **receiving** team must be in rotational order. The serving team may occupy any position.
- **7.4.3.1** — a back-row player must be **level with**, or have part of one foot further from the centre line than, the *front* foot of the corresponding front-row player (Diagram 4A).
- **7.4.3.2** — a right (left) player must be level with, or have part of one foot closer to the right (left) sideline than, the foot furthest from that sideline of **each other player in the row** (Diagram 4B).
- **1.3.2** — lines belong to the court; **12.5** — the serving team must not screen.
- **13.2 / 13.3** — attack restrictions (back-row take-off, attacking the serve, libero overhand set in the front zone); **14** — blocking (back-row and libero, no blocking the serve); **15.6** — substitution limits; **19.3** — libero actions and replacements.

A "Classic overlap (both teams)" ruleset is kept in Settings for leagues that still judge the serving team's order.

## Conventions (common team practice, not rules)

1. **Rotation numbering:** "Rotation 1" = setter in zone 1, then the order the team rotates (R2 = setter in zone 6, R3 = zone 5…). The setter's zone is always shown too.
2. **5–1 lineup:** S, OH1, MB1, OPP, OH2, MB2 from zone 1; the libero replaces whichever middle is in the back row and comes off while that middle serves.
3. **Serve receive:** one standard three-passer formation per setter zone. Coach Mode also accepts other legal formations, scored on coverage and legality.
4. **Emergency setter:** when the setter plays the first ball, the libero sets (right-front if no libero).
5. **Defensive systems** (perimeter, rotational, middle-up, read) are coaching choices; defence scenarios accept the other systems as alternatives.
6. **5–2:** user-defined setter plan with presets labelled as interpretations.

## Remaining open points

1. **"Within its own court" (7.4):** the rulebook doesn't define this by feet. The app counts a player as inside if at least one foot touches the court or its lines.
2. **Stance:** players stand with feet 34 cm apart. The rules engine supports a staggered stance, but the app has no control for it yet.
3. **Angled 3D view** is view-only (dragging is off while it's on).
4. **Timers:** only a 20-second prep timer in Rally/Scrimmage at Competitive difficulty; the IQ Challenge has no countdown.
5. **Fonts** load from Google Fonts and fall back to system fonts offline.
