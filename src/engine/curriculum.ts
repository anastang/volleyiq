import type { Category } from './scenarios';
import type { DefenseSystemId, Role, SystemId } from './types';

/** Moments of a rally a lesson can show on the court (mirrors the UI demo phases). */
export type ScenePhase =
  | 'rotational'
  | 'receive'
  | 'release'
  | 'firstGood'
  | 'firstOff'
  | 'attackLeft'
  | 'attackMiddle'
  | 'attackRight'
  | 'attackPipe'
  | 'servePre'
  | 'base'
  | 'defRight'
  | 'defLeft'
  | 'defMiddle'
  | 'tip'
  | 'free';

export interface LessonScene {
  /** Moments to cycle through on the demo court. */
  phases: ScenePhase[];
  rotation?: number;
  /** Step through all six rotations. */
  rotate?: boolean;
  zones?: boolean;
  highlightFront?: boolean;
  feet?: boolean;
  defense?: DefenseSystemId;
  system?: SystemId;
}

/** Older demo shorthand, still accepted. */
export type DemoKind = 'zones' | 'rows' | 'rotate' | 'roles' | 'systems' | 'overlap' | 'release' | 'coverage' | 'defense' | 'transition' | 'reading' | 'scrimmage';

export interface LessonCard {
  title: string;
  /** Short intro line. */
  body?: string;
  /** What you do / what it is. */
  what?: string;
  /** Why it matters. */
  why?: string;
  /** When it applies (and when it changes). */
  when?: string;
  /** One practical cue to remember. */
  cue?: string;
  scene?: LessonScene;
  demo?: DemoKind;
}

export interface Lesson {
  id: string;
  title: string;
  summary: string;
  cards: LessonCard[];
  practice: { category: Category; count: number };
}

export interface Level {
  n: number;
  title: string;
  goal: string;
  lessons: Lesson[];
}

export const CURRICULUM: Level[] = [
  // -------------------------------------------------------------------------
  {
    n: 1,
    title: 'Court Fundamentals',
    goal: 'Know the six zones, front vs back row, and how rotation works.',
    lessons: [
      {
        id: 'l1-zones',
        title: 'The court and the six zones',
        summary: 'Every rotation, assignment and rule is described with six numbered positions.',
        cards: [
          {
            title: 'The six numbered positions',
            what: 'Facing the net: Position 1 is right-back (where the server stands), 2 right-front, 3 middle-front, 4 left-front, 5 left-back, 6 middle-back. The numbers run anticlockwise from the server.',
            why: 'Coaches, referees and teammates describe every rotation and job with these numbers. “Setter in 1” instantly tells everyone the whole lineup.',
            when: 'Before every rally. Know which number you are in and who is next to you.',
            cue: 'Server = 1. Count anticlockwise.',
            scene: { phases: ['rotational'], zones: true },
          },
          {
            title: 'Front row and back row',
            what: 'Positions 2, 3 and 4 are the front row. Positions 1, 5 and 6 are the back row.',
            why: 'Your row decides what you are allowed to do: only front-row players may block, and back-row players may only attack a ball above the net if they take off behind the 3 m line.',
            when: 'Your row is fixed by the rotation for the whole rally. A back-row setter who runs to the net is still a back-row player.',
            cue: 'Row comes from the rotation, not from where you are standing.',
            scene: { phases: ['rotational', 'release'], zones: true, highlightFront: true },
          },
          {
            title: 'Lines and zones that matter',
            what: 'Each side is 9 × 9 m. The attack line (3 m from the net) separates the front zone from the back zone. Lines are part of the court — a ball touching the line is in.',
            why: 'The attack line controls back-row attacks and libero sets; the boundary lines decide in/out calls you make as a passer.',
            when: 'Every time a back-row player attacks, every time the libero sets overhand, and every time you decide to leave a serve that looks long.',
            cue: 'Line = in. Back-row hitters jump from behind the 3 m line.',
            scene: { phases: ['base'], zones: true },
          },
        ],
        practice: { category: 'fundamentals', count: 5 },
      },
      {
        id: 'l1-rotate',
        title: 'Rotation, side-outs and service order',
        summary: 'When you win the serve back, everyone moves one place clockwise.',
        cards: [
          {
            title: 'When does a team rotate?',
            what: 'When the receiving team wins a rally it gains the serve and every player moves one place clockwise: 2→1, 1→6, 6→5, 5→4, 4→3, 3→2.',
            why: 'Rotating shares serving and makes every player play front row and back row in turn.',
            when: 'Only after a side-out (winning a rally while receiving). A team that wins while serving does NOT rotate — the same player serves again.',
            cue: 'Win their serve → rotate. Win your serve → stay.',
            scene: { phases: ['rotational'], rotate: true, zones: true },
          },
          {
            title: 'Service order',
            what: 'The player who rotates into Position 1 serves, from anywhere behind the end line between the side-line extensions.',
            why: 'Serving out of order is a rotational fault: the opponent gets the point and the order is corrected.',
            when: 'Every side-out. Players should know who serves next before the rally even ends.',
            cue: 'Whoever is in 2 serves next.',
            scene: { phases: ['servePre'] },
          },
          {
            title: 'Think one rotation ahead',
            what: 'After each side-out, say the new rotation out loud: “setter in 6, three hitters, I’m in 4.”',
            why: 'Most receive mistakes happen in the first second after a rotation, when players walk to the wrong spot or overlap.',
            when: 'Every time your team wins the serve back.',
            cue: 'New rotation? Name it before you walk to it.',
            scene: { phases: ['rotational', 'receive'], rotate: true },
          },
        ],
        practice: { category: 'rules', count: 5 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 2,
    title: 'Player Roles',
    goal: 'Separate a player’s ROLE from their rotational POSITION — and know each role’s job.',
    lessons: [
      {
        id: 'l2-roles',
        title: 'Role, rotation position, tactical position',
        summary: 'Three different ideas — never mix them up.',
        cards: [
          {
            title: 'Three different ideas',
            what: 'Rotational position: your official place in the order (1–6). Role: your specialty (setter, outside, middle, opposite, libero, DS). Tactical position: where you move during the rally to do your job.',
            why: 'A setter in Position 1 runs to the net to set — but is still back row. Mixing these up causes illegal blocks, overlaps and players in the wrong place.',
            when: 'Before the serve, you are judged on your rotational position. After the serve, you play your role from your tactical position.',
            cue: 'Rotation = before the serve. Role = after the serve.',
            scene: { phases: ['receive', 'release'] },
          },
          {
            title: 'Libero and defensive specialist',
            what: 'The libero wears a different jersey and replaces back-row players (usually the middles) without using a substitution. A DS is a normal substitute who comes in for passing and defence.',
            why: 'Middles are usually the team’s weakest passers; the libero lets the team keep its best passer on court in the back row.',
            when: 'The libero comes in whenever their middle is back row and not serving, and must leave when that player rotates to the front row. Libero: no serving (FIVB), no blocking, no attacking above the net.',
            scene: { phases: ['receive', 'defRight'] },
          },
        ],
        practice: { category: 'rules', count: 4 },
      },
      {
        id: 'l2-jobs',
        title: 'What each role does',
        summary: 'Setter, outside, middle, opposite and libero — their job in every phase.',
        cards: [
          {
            title: 'Setter',
            what: 'Takes the second contact and delivers hittable sets. Hides in serve receive, releases to the target (right of centre, about 1 m off the net) at service contact, and covers the hitter after setting.',
            why: 'Consistent second contacts are what turn passes into points. A setter who arrives late makes every set rushed.',
            when: 'Every rally your team receives or digs. If the setter takes the first ball, they call “help!” and someone else sets.',
            cue: 'Beat the pass to the target.',
            scene: { phases: ['receive', 'release', 'firstGood'] },
          },
          {
            title: 'Outside hitter',
            what: 'A primary passer and the left-side attacker. After passing, opens up wide and behind the 3 m line for the approach. In the back row, plays middle-back and often hits the pipe.',
            why: 'When a pass is off, the high ball almost always goes to the outside — they are the team’s safety valve.',
            when: 'Every rotation: outsides play all the way around.',
            cue: 'Pass, then get wide.',
            scene: { phases: ['receive', 'firstGood', 'attackLeft'] },
          },
          {
            title: 'Middle blocker',
            what: 'Front-row blocking anchor and quick attacker. Reads the opposing setter and closes the block to whichever side they set. On offence, approaches close to the setter for the quick.',
            why: 'A threatening quick attack freezes the opposing middle and opens the outside. A good middle blocker affects every opponent attack.',
            when: 'Front row only — the libero usually replaces the middle in the back row.',
            cue: 'Land, turn, get off the net.',
            scene: { phases: ['release', 'firstGood', 'defMiddle'] },
          },
          {
            title: 'Opposite (right side)',
            what: 'Attacks and blocks on the right. Usually does not pass serve. Blocks the opponent’s outside hitter and plays right-back defence when back row.',
            why: 'The opponent’s most-used attacker is their outside — and the right-side blocker faces them.',
            when: 'Front row: right-side attack and block. Back row: right-back defence and the D-ball (back-row right attack).',
            cue: 'Hide, switch right, block their best hitter.',
            scene: { phases: ['release', 'attackRight', 'defRight'] },
          },
          {
            title: 'Libero',
            what: 'The team’s best passer and defender. Takes the biggest share of serve receive and plays left-back or middle-back on defence.',
            why: 'Putting the best ball-control player in the back row for every rotation stabilises passing and defence.',
            when: 'Whenever a middle is back row. Emergency setter when the setter takes the first ball — from behind the 3 m line, or with a bump set.',
            cue: 'Own the court in front of you.',
            scene: { phases: ['receive', 'defRight'] },
          },
        ],
        practice: { category: 'someoneElse', count: 5 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 3,
    title: 'Rotation Systems',
    goal: 'Recognise 4–2, 5–1 and 6–2 and read any rotation at a glance.',
    lessons: [
      {
        id: 'l3-systems',
        title: '4–2, 5–1 and 6–2',
        summary: 'Who sets — and how many hitters are in the front row.',
        cards: [
          {
            title: '5–1: one setter',
            what: 'One setter sets all six rotations; five players hit.',
            why: 'One set of hands means consistent tempo and timing with every hitter.',
            when: 'Setter back row → three front-row hitters. Setter front row → two hitters plus a legal setter dump. Standard in competitive play.',
            scene: { phases: ['receive'], rotate: true, system: '5-1' },
          },
          {
            title: '6–2: back-row setter sets',
            what: 'Two setters stand opposite each other. Whoever is in the back row sets; the front-row setter becomes a right-side hitter.',
            why: 'You always have three front-row attackers and the setter always releases from the back row.',
            when: 'Common in high school and club. The trade-off: no setter dump, and two setting styles to adjust to.',
            scene: { phases: ['receive'], rotate: true, system: '6-2' },
          },
          {
            title: '4–2: front-row setter sets',
            what: 'Two setters opposite each other; whoever is in the FRONT row sets, usually from middle or right front.',
            why: 'The setter starts at the net, so releases are tiny — the simplest system to learn rotations with.',
            when: 'Newer teams. Limitation: only two front-row attackers in every rotation.',
            scene: { phases: ['receive'], rotate: true, system: '4-2' },
          },
        ],
        practice: { category: 'fundamentals', count: 4 },
      },
      {
        id: 'l3-tour',
        title: 'The 5–1, rotation by rotation',
        summary: 'Where the setter hides, who passes and who switches in all six rotations.',
        cards: [
          {
            title: 'How to read any rotation',
            what: 'Find three things: (1) which zone the setter is in, (2) how many front-row hitters you have, (3) who the three passers are.',
            why: 'Those three facts decide the receive formation, the setter’s release path and the attack options.',
            when: 'Before every serve receive. Good teams say it out loud: “setter in 5, three up, Jordan–Jamie–Taylor passing.”',
            cue: 'Setter · hitters · passers.',
            scene: { phases: ['rotational', 'receive'], rotation: 0, zones: true },
          },
          {
            title: 'Setter in 1 (Rotation 1)',
            what: 'The setter hides behind the right-side passer and releases straight up the right side. The opposite starts at left-front, tucked at the net, and switches to the right after contact.',
            why: 'It is the shortest legal path to the target without crossing a passer. Three front-row hitters are available.',
            when: 'Usually the easiest receive rotation: the setter is already on the right.',
            scene: { phases: ['receive', 'release'], rotation: 0 },
          },
          {
            title: 'Setter in 6 (Rotation 2)',
            what: 'The setter stacks directly behind the middle-front player, one step from the target.',
            why: 'The setter must stay behind the Position 3 player and between Positions 5 and 1 — standing right behind the middle satisfies both and keeps the release short.',
            when: 'Passers spread across the court in front of the stack.',
            scene: { phases: ['receive', 'release'], rotation: 1 },
          },
          {
            title: 'Setter in 5 (Rotation 3)',
            what: 'The longest release: the setter hides at the net behind the left-front player and runs along the net to the target.',
            why: 'From deep left-back the run would be about 8 m; stacking at the net cuts it to about 5 m and keeps the setter out of the passing lanes.',
            when: 'Servers often aim at the seam the setter crosses. Passers keep their lanes clear, and some teams have the opposite take the second ball if the setter is late.',
            scene: { phases: ['receive', 'release'], rotation: 2 },
          },
          {
            title: 'Setter in 4 (Rotation 4)',
            what: 'The setter is front row at left-front. They push as far right as the rules allow — just left of the middle — and slide right after contact.',
            why: 'Front-row setter = only two front-row hitters, but the setter can legally attack or dump a tight second ball.',
            when: 'Watch for tight passes: the dump is a real weapon in front-row rotations.',
            scene: { phases: ['receive', 'release'], rotation: 3 },
          },
          {
            title: 'Setter in 3 and 2 (Rotations 5–6)',
            what: 'The setter starts at the net almost on target. The back-row opposite hides out of the passing lanes, and three passers spread across the court.',
            why: 'Releases are tiny, so passers can focus purely on passing.',
            when: 'Both are front-row setter rotations: two hitters plus the dump.',
            scene: { phases: ['receive', 'release'], rotation: 4 },
          },
        ],
        practice: { category: 'serveReceive', count: 6 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 4,
    title: 'Legal Starting Positions',
    goal: 'Master overlap rules, stacking and switching.',
    lessons: [
      {
        id: 'l4-overlap',
        title: 'Overlap: who must stay where',
        summary: 'Only certain pairs of players matter — judged on the feet.',
        cards: [
          {
            title: 'Front/back pairs',
            what: 'At the moment of the serve, the back-row player must not be in front of their front-row partner: 5 behind 4, 6 behind 3, 1 behind 2. Officially (FIVB 7.4.3.1), part of one of the back player’s feet must be level with or further from the net than the front player’s front foot.',
            why: 'This keeps the rotational order recognisable at the moment play starts.',
            when: 'Only at the instant the server contacts the ball, and only for the receiving team (FIVB 2025–2028). One frame later, everyone is free.',
            cue: 'Exactly level is legal.',
            scene: { phases: ['receive'], zones: true, feet: true },
          },
          {
            title: 'Same-row order',
            what: 'Within each row the order is left–centre–right: 4·3·2 in front and 5·6·1 behind. Each side player must be level with, or have a foot closer to their side line than, every other player in that row.',
            why: 'Together with the front/back rule, this is all the rulebook asks for.',
            when: 'At service contact. Players in different rows who are not front/back partners (4 and 6, 2 and 6, 4 and 1) have no relationship at all.',
            cue: 'Only partners and row-mates matter.',
            scene: { phases: ['rotational', 'receive'], zones: true, feet: true },
          },
          {
            title: 'Which team is judged?',
            what: 'Under FIVB 2025–2028 only the RECEIVING team must be in rotational order. The serving team may stand anywhere on its own court; both teams must be inside their court (except the server).',
            why: 'It lets the serving team start in its defensive spots — but the serving team still must not screen the server.',
            when: 'Every serve. Some leagues still judge both teams — check yours.',
            scene: { phases: ['servePre'] },
          },
        ],
        practice: { category: 'serveReceive', count: 6 },
      },
      {
        id: 'l4-stacking',
        title: 'Stacking, hiding and switching',
        summary: 'Why receive formations look strange — and why they work.',
        cards: [
          {
            title: 'What stacking is',
            what: 'Players stand far from the middle of their zone while keeping their legal relationships — for example, a setter in Position 5 standing at the net behind the left-front player.',
            why: 'It puts the best passers in the passing lanes, gets non-passers out of the way, and shortens the setter’s run.',
            when: 'Every serve-receive rotation. It is legal because only partners and row-mates are compared.',
            cue: 'Legal ≠ in the middle of your zone.',
            scene: { phases: ['rotational', 'receive'], rotation: 2, zones: true },
          },
          {
            title: 'Hiding non-passers',
            what: 'Middles and the opposite usually do not pass. They hide close to the net or in a corner, out of the passers’ way.',
            why: 'A non-passer in a lane blocks a passer’s view and movement, and two people going for one ball is how serve receive breaks.',
            when: 'Every receive. Front-row hiders also save steps, because they are near their attack approach.',
            scene: { phases: ['receive'], rotation: 0 },
          },
          {
            title: 'Switching after the serve',
            what: 'The instant the serve is contacted, everyone moves to their specialty spot: setter to the target, outside left, middle centre, opposite right; back row to their defensive areas.',
            why: 'Playing the same spot every rally means consistent attacking and blocking jobs.',
            when: 'Receiving: at service contact, never before (that is an overlap fault). Serving: under FIVB 2025–2028 you may already stand in your spot before the serve.',
            cue: 'Hold — contact — go.',
            scene: { phases: ['receive', 'release'], rotation: 3 },
          },
        ],
        practice: { category: 'release', count: 5 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 5,
    title: 'Serve Receive',
    goal: 'Pass well, own your lane, and know where to go next.',
    lessons: [
      {
        id: 'l5-passing',
        title: 'Passing lanes, seams and reading the serve',
        summary: 'Who takes which ball — and where to send it.',
        cards: [
          {
            title: 'Passing lanes',
            what: 'Three passers split the court into lanes. Stand deep enough (around 5–6 m from the net) that you move forward to most serves.',
            why: 'Moving forward to a ball is far easier than backing up, and clear lanes stop two people going for the same serve.',
            when: 'Every serve receive. Shift slightly toward the server’s side of the court and toward the weaker passer.',
            cue: 'Deep, balanced, forward.',
            scene: { phases: ['receive'], rotation: 1 },
          },
          {
            title: 'Seams',
            what: 'A seam is the gap between two passers. Teams agree who owns it — often the libero takes every seam ball they can reach, otherwise the inside or forward-moving passer.',
            why: 'Seams are where servers aim. Hesitation in the seam is the most common way receive breaks down.',
            when: 'Call it early: “Mine!” The other passer opens up and moves to their next job.',
            cue: 'Agree before the serve. Call it early.',
            scene: { phases: ['receive'], rotation: 0 },
          },
          {
            title: 'Reading the server',
            what: 'Watch the server’s position, shoulders and toss. A float serve moves late — stay behind it. A topspin serve dives — get low early. Short serves need a forward step; deep serves may go out.',
            why: 'The earlier you read the serve, the more time you have to get your platform behind the ball.',
            when: 'From the toss onwards. Call “out!” on serves you judge long — and let them land.',
            cue: 'Read the toss, move your feet, then your arms.',
            scene: { phases: ['receive', 'release'], rotation: 2 },
          },
          {
            title: 'Where to pass',
            what: 'Pass high to the target: right of centre, about 1 m off the net. Height buys your setter time.',
            why: 'On target, every attacker is live (including the middle quick). Off the net, options shrink to high balls to the pins.',
            when: 'Every first contact. A slightly off but high pass beats a perfect-looking low one.',
            cue: 'High to the target.',
            scene: { phases: ['firstGood', 'firstOff'], rotation: 0 },
          },
        ],
        practice: { category: 'serveReceive', count: 6 },
      },
      {
        id: 'l5-release',
        title: 'Release and switch',
        summary: 'After contact, the overlap rule ends and everyone moves.',
        cards: [
          {
            title: 'Setter release',
            what: 'The setter leaves at service contact and runs to the target without cutting across a passer.',
            why: 'If the setter is late, every set is rushed or the second ball goes to someone else.',
            when: 'Every receive rotation. The long releases (setter in 5 and 4) are why the setter hides close to the net.',
            cue: 'Go on contact, arrive before the pass.',
            scene: { phases: ['receive', 'release'], rotation: 2 },
          },
          {
            title: 'Non-passers never stand still',
            what: 'Hitters hiding at the net move off it to their approach start; back-row non-passers move out of the lanes toward their base.',
            why: 'An attacker who starts their approach from the net has no run-up and no power.',
            when: 'At service contact, while the serve is still in the air.',
            scene: { phases: ['receive', 'release'], rotation: 0 },
          },
        ],
        practice: { category: 'release', count: 5 },
      },
      {
        id: 'l5-firstball',
        title: 'Your ball / not your ball',
        summary: 'What to do after you pass — and when someone else passes.',
        cards: [
          {
            title: 'After you pass',
            what: 'If you are an attacking option, open up and get back to your approach start. If not, move toward the hitter to cover.',
            why: 'Passers who watch their own pass are late to attack, and the setter loses an option.',
            when: 'Immediately after your contact.',
            cue: 'Pass and go.',
            scene: { phases: ['receive', 'firstGood'], rotation: 0 },
          },
          {
            title: 'When a teammate passes',
            what: 'Read the pass. A good pass keeps all hitters live; an off pass means a high ball to a pin — the middle stops their quick and covers instead.',
            why: 'Everyone’s next job depends on the pass quality, so read it early.',
            when: 'While the pass is in the air.',
            scene: { phases: ['firstGood', 'firstOff'], rotation: 1 },
          },
        ],
        practice: { category: 'someoneElse', count: 5 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 6,
    title: 'Offence and Coverage',
    goal: 'Setting choices, approaches, shot selection and covering your hitter.',
    lessons: [
      {
        id: 'l6-offence',
        title: 'Setting, approaches and shot selection',
        summary: 'In system vs out of system, and what attackers do.',
        cards: [
          {
            title: 'In system vs out of system',
            what: 'In system: the setter gets to the ball near the target with time to choose any hitter. Out of system: the pass or dig is off, so the set is a high ball, usually to the outside.',
            why: 'Out of system, a fast or tricky set causes errors; a high, hittable set keeps the rally alive and gives your hitter a real swing.',
            when: 'Decide from the pass, not from what you wanted to run.',
            cue: 'Bad pass → high ball outside.',
            scene: { phases: ['firstGood', 'firstOff'], rotation: 0 },
          },
          {
            title: 'Approach starts',
            what: 'Outside: wide and behind the 3 m line. Middle: close to the setter for the quick. Opposite: wide right. Back-row hitters: behind the attack line.',
            why: 'A long, angled approach gives power and lets the hitter see the block; back-row hitters must take off behind the line to attack above the net.',
            when: 'Get to your start before the pass reaches the setter.',
            scene: { phases: ['release', 'firstGood'], rotation: 1 },
          },
          {
            title: 'Shot selection',
            what: 'Hard swing to open court, roll shot or tip over the block, or use the block (hit off the blockers’ hands out of bounds).',
            why: 'A smart shot beats a hard shot into a well-set block.',
            when: 'Read the block as you approach: big block → tool it or tip; small or late block → swing.',
            scene: { phases: ['attackLeft'], rotation: 0 },
          },
        ],
        practice: { category: 'setting', count: 6 },
      },
      {
        id: 'l6-coverage',
        title: 'Attack coverage',
        summary: 'Why, where and when to cover your hitter.',
        cards: [
          {
            title: 'Why cover?',
            what: 'Coverage means surrounding your own hitter, low, to play balls the block sends straight back.',
            why: 'A stuffed ball drops steeply within about 2–3 m of the hitter — far too fast to reach from across the court. Covered balls give your team a second swing.',
            when: 'On every attack by your team. Be in place as the hitter jumps — while the set is in the air.',
            cue: 'Low, close, eyes on the block.',
            scene: { phases: ['firstGood', 'attackLeft'], rotation: 0 },
          },
          {
            title: 'The cup: three close, two deep',
            what: 'Three players form a tight ring about 1.5–2 m around the hitter; two more cover deeper, about 4–5 m back, filling the gaps.',
            why: 'Most blocked balls land close; the second layer catches the ones that rebound deep.',
            when: 'The players nearest the hitter fill the close ring — usually the setter, the middle and the nearest back-row player.',
            cue: 'Closest players fill the close spots.',
            scene: { phases: ['attackLeft', 'attackRight'], rotation: 0 },
          },
          {
            title: 'Coverage by attack',
            what: 'Outside attack: setter, middle and left-back close; others deep. Right-side attack: mirror it. Middle quick: everyone tighter and faster. Pipe: a wide circle around the middle of the court.',
            why: 'Coverage moves with the hitter — the shape stays the same, its position changes.',
            when: 'Recognise the set early: you have less than a second on a quick, more on a high ball.',
            scene: { phases: ['attackLeft', 'attackMiddle', 'attackRight', 'attackPipe'], rotation: 0 },
          },
          {
            title: 'When coverage changes',
            what: 'Quick set: cover from where you are. High out-of-system ball: there is time for a full cup. Big opposing block: stay a little deeper and lower.',
            why: 'Coverage is about being in the landing zone of a blocked ball, which depends on set speed and block size.',
            when: 'After the cover, play the ball high to the middle of the court so the team can attack again — then reopen to your approach.',
            cue: 'Cover, dig it high, go again.',
            scene: { phases: ['firstOff', 'attackLeft'], rotation: 2 },
          },
        ],
        practice: { category: 'attacking', count: 6 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 7,
    title: 'Defence',
    goal: 'Base, blocking, digging around the block, tips and defensive systems.',
    lessons: [
      {
        id: 'l7-base',
        title: 'Base defence and reading',
        summary: 'Where to start — and the order to read the play.',
        cards: [
          {
            title: 'Base positions',
            what: 'Front row at the net, spread to block; back row in their areas, balanced and low.',
            why: 'Base lets you move to any attack. Committing early leaves holes.',
            when: 'After your team serves or sends the ball over, until you read where the attack is going.',
            scene: { phases: ['servePre', 'base'], rotation: 0 },
          },
          {
            title: 'The read sequence',
            what: 'Read in order: their pass → their setter → the set → the hitter’s approach and shoulder.',
            why: 'Each read narrows the options. A pass off the net rules out the quick; a front-row setter on a tight pass can dump.',
            when: 'Continuously, from the moment they pass. Move after each read, not all at once.',
            cue: 'Pass, setter, set, hitter.',
            scene: { phases: ['base', 'defRight'], rotation: 0 },
          },
        ],
        practice: { category: 'reading', count: 5 },
      },
      {
        id: 'l7-block',
        title: 'Blocking',
        summary: 'Who blocks whom, and the off-blocker’s job.',
        cards: [
          {
            title: 'Who blocks whom',
            what: 'Your right-front blocks their outside (their left side); your left-front blocks their opposite; the middle blocks their middle and closes to the outside blocker.',
            why: 'The outside blocker sets the block on the hitter’s hitting arm and seals the line; the middle closes the gap so there is no seam between the hands.',
            when: 'On every opponent attack. Only front-row players may block — never the libero or a back-row player.',
            cue: 'Outside blocker sets it, middle closes it.',
            scene: { phases: ['defRight', 'defLeft'], rotation: 0 },
          },
          {
            title: 'Read vs commit',
            what: 'Read blocking: watch the setter, then move to the set. Commit blocking: jump with their middle on the quick regardless.',
            why: 'Reading gets more blocks on high sets; committing stops a dominant quick attacker.',
            when: 'Read by default; commit against a strong middle or on a perfect pass.',
            scene: { phases: ['defMiddle', 'defRight'], rotation: 2 },
          },
          {
            title: 'The off-blocker',
            what: 'The front-row player not needed in the block drops off the net to about the attack line.',
            why: 'They cover the sharp cross-court shot and short tips — and are already in their approach for the counter-attack.',
            when: 'Whenever the attack is on the far side of the net from them.',
            cue: 'Not blocking? Drop off.',
            scene: { phases: ['defRight'], rotation: 1 },
          },
        ],
        practice: { category: 'blocking', count: 6 },
      },
      {
        id: 'l7-dig',
        title: 'Digging around the block',
        summary: 'Defenders cover what the block cannot.',
        cards: [
          {
            title: 'The block’s shadow',
            what: 'The block takes away a wedge of court behind it. Defenders stand outside that shadow: one on the line, one cross-court, one deep.',
            why: 'Standing in the shadow wastes a defender — the ball can’t easily go there.',
            when: 'Adjust as the block forms: if the block is late or small, the line opens.',
            cue: 'See the hands, stand beside them.',
            scene: { phases: ['defRight', 'defLeft'], rotation: 0 },
          },
          {
            title: 'Dig high to the middle',
            what: 'Keep the ball on your side, high, toward the middle of the court.',
            why: 'A high dig gives the setter (or anyone) time to set a hittable ball.',
            when: 'Every dig. Pressure and accuracy come second to height.',
            cue: 'High and middle.',
            scene: { phases: ['defRight', 'firstOff'], rotation: 0 },
          },
        ],
        practice: { category: 'spikeDefense', count: 6 },
      },
      {
        id: 'l7-systems',
        title: 'Defensive systems',
        summary: 'Perimeter, rotational and middle-up — coaching choices, not rules.',
        cards: [
          {
            title: 'Perimeter',
            what: 'Back-row defenders stay on the edges and deep; middle-back protects the deep court.',
            why: 'Strong against hard hitters — most hard swings go deep or to the edges.',
            when: 'Tips are taken by the line digger or the off-blocker.',
            scene: { phases: ['defRight'], rotation: 0, defense: 'perimeter' },
          },
          {
            title: 'Rotational',
            what: 'The line-side back defender rotates up behind the block for tips; middle-back rotates to the deep line.',
            why: 'Takes away tips and short line shots.',
            when: 'Against teams that tip and roll a lot.',
            scene: { phases: ['defRight'], rotation: 0, defense: 'rotation' },
          },
          {
            title: 'Middle-up (rover)',
            what: 'Middle-back plays up behind the block; the wing defenders cover the deep corners.',
            why: 'Kills tips and soft shots in the middle.',
            when: 'Against tipping teams or weaker hitters; vulnerable to deep shots.',
            scene: { phases: ['defRight'], rotation: 0, defense: 'middleUp' },
          },
        ],
        practice: { category: 'spikeDefense', count: 5 },
      },
      {
        id: 'l7-tips',
        title: 'Tip coverage',
        summary: 'Recognise the tip and move forward early.',
        cards: [
          {
            title: 'Spot the tip',
            what: 'The hitter’s arm slows down, the hand opens, or they jump late and under the ball.',
            why: 'Tips are slow — whoever reads them early gets there easily.',
            when: 'Watch the hitter’s arm, not just the ball.',
            cue: 'Slow arm → go forward.',
            scene: { phases: ['defRight', 'tip'], rotation: 0 },
          },
          {
            title: 'Who takes it?',
            what: 'It depends on the system and the block: in perimeter, the line digger or off-blocker; in rotational, the defender who rotated up; in middle-up, the rover.',
            why: 'No single player covers every tip. If everyone knows their zone, nobody freezes.',
            when: 'Closest defender goes; everyone else closes a step and gets ready to transition.',
            scene: { phases: ['tip'], rotation: 1 },
          },
        ],
        practice: { category: 'tip', count: 5 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 8,
    title: 'Transitions & Broken Plays',
    goal: 'Change jobs fast when the ball crosses the net — or when things go wrong.',
    lessons: [
      {
        id: 'l8-transition',
        title: 'Defence to offence',
        summary: 'After the dig: recover, find the setter, attack.',
        cards: [
          {
            title: 'Transition footwork',
            what: 'Blockers land, turn to find the ball, and back off the net to their approach. Diggers get up and become hitters or coverage.',
            why: 'Most points in a long rally are won by the team that transitions faster.',
            when: 'As soon as you know your team has the ball.',
            cue: 'Land, turn, open, approach.',
            scene: { phases: ['defRight', 'firstOff', 'attackLeft'], rotation: 0 },
          },
          {
            title: 'When the setter digs',
            what: 'The setter calls “help!”; the pre-assigned emergency setter (often the libero or right-front) takes the second ball and sets high to a pin.',
            why: 'A player may not touch the ball twice in a row — someone else must set.',
            when: 'Any time the setter plays the first ball. The libero sets from behind the 3 m line or bump-sets so the hitter can attack above the net.',
            scene: { phases: ['defRight', 'firstOff'], rotation: 2 },
          },
        ],
        practice: { category: 'transition', count: 5 },
      },
      {
        id: 'l8-free',
        title: 'Free balls and broken plays',
        summary: 'Switch to offence instantly when the opponent can’t attack.',
        cards: [
          {
            title: 'Free ball',
            what: 'An easy ball over the net with no attack. Call “free!”, the setter releases, hitters drop off the net to their approaches, back row passes.',
            why: 'A free ball is the best chance in the rally to run your full offence.',
            when: 'Recognise it early: no hitter approaching, ball passed or set over.',
            cue: '“Free!” → release and drop.',
            scene: { phases: ['base', 'free'], rotation: 0 },
          },
          {
            title: 'Down ball',
            what: 'A ball hit over standing, from deep. It is faster than a free ball but easy to dig.',
            why: 'Front-row players usually stay to block a down ball rather than dropping off.',
            when: 'If the opponent is about to swing from a standing position.',
            scene: { phases: ['base', 'defRight'], rotation: 1 },
          },
        ],
        practice: { category: 'brokenPlay', count: 6 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 9,
    title: 'Game Awareness',
    goal: 'Read the opponent, serve with purpose and communicate.',
    lessons: [
      {
        id: 'l9-read',
        title: 'Reading the opponent',
        summary: 'Anticipate instead of reacting.',
        cards: [
          {
            title: 'Pass quality first',
            what: 'Off the net → expect a high ball to a pin. On target → watch the quick. Tight to the net → watch the setter (a front-row setter can dump).',
            why: 'Knowing what is likely lets blockers and defenders start moving before the set.',
            when: 'From the moment the opponent passes.',
            scene: { phases: ['base', 'defRight'], rotation: 0 },
          },
          {
            title: 'Then the hitter',
            what: 'Approach angle, shoulder direction and arm speed tell you cross, line or tip.',
            why: 'Defenders who read the hitter dig balls that would otherwise be kills.',
            when: 'Final adjustment as the hitter jumps.',
            scene: { phases: ['defRight', 'defLeft'], rotation: 2 },
          },
        ],
        practice: { category: 'reading', count: 6 },
      },
      {
        id: 'l9-serve',
        title: 'Serving with purpose',
        summary: 'Where to serve, and why.',
        cards: [
          {
            title: 'Serve targets',
            what: 'Common targets: the seam between two passers, a passer who must then attack, the deep corners, or short to a front-row hitter.',
            why: 'Making a hitter pass, or forcing a seam decision, disrupts their offence before it starts.',
            when: 'Pick a target before every serve — but keep it in. A missed serve is a free point.',
            cue: 'Pick a target, then serve in.',
            scene: { phases: ['servePre', 'base'], rotation: 0 },
          },
        ],
        practice: { category: 'serving', count: 4 },
      },
      {
        id: 'l9-talk',
        title: 'Communication',
        summary: 'The calls that win rallies.',
        cards: [
          {
            title: 'The essential calls',
            what: '“Mine!” (I have it), “Help!” (setter can’t take the second ball), “Free!” (easy ball coming), “Out!” (let it go), “Tip!” (move forward), “Line/cross” (where the hitter is going).',
            why: 'Most collisions and dropped balls between two players are communication errors, not skill errors.',
            when: 'Early and loud — before the ball arrives, not as it lands.',
            cue: 'Early and loud.',
            scene: { phases: ['receive', 'free'], rotation: 0 },
          },
        ],
        practice: { category: 'brokenPlay', count: 4 },
      },
    ],
  },
  // -------------------------------------------------------------------------
  {
    n: 10,
    title: 'Competitive Scrimmage',
    goal: 'Combine everything with reduced guidance.',
    lessons: [
      {
        id: 'l10-scrim',
        title: 'Put it together',
        summary: 'Full rallies with less guidance.',
        cards: [
          {
            title: 'Three questions, every moment',
            what: 'Where should I be right now? What am I watching? Where do I go next?',
            why: 'Every lesson in this course answers one of these questions for a different moment of the rally.',
            when: 'Before the serve, after contact, on offence, on defence — all the time. Try the Game Simulator to practise it live.',
            scene: { phases: ['receive', 'release', 'firstGood', 'attackLeft', 'base', 'defRight', 'free'], rotation: 0 },
          },
        ],
        practice: { category: 'transition', count: 6 },
      },
    ],
  },
];

export interface Mistake {
  id: string;
  title: string;
  description: string;
  fix: string;
  practice: Category;
  role?: Role;
  tag?: string;
}

export const MISTAKES: Mistake[] = [
  { id: 'early', title: 'Leaving your starting position too early', description: 'Moving to your tactical spot before the serve is contacted creates an overlap fault on the receiving team.', fix: 'Keep your legal relationships until the server contacts the ball — then go.', practice: 'serveReceive', tag: 'overlap' },
  { id: 'rot-vs-att', title: 'Confusing rotational and attacking position', description: 'A back-row setter at the net is still back row; an outside in Position 2 still hits on the left after switching.', fix: 'Your row comes from the rotation. Your tactical spot comes from your role.', practice: 'rules' },
  { id: 'no-transition', title: 'Forgetting to transition after passing', description: 'Passers who watch their pass are late to their approach and the setter loses an option.', fix: 'Pass, then immediately open up to your approach or coverage spot.', practice: 'receiveYou', tag: 'noTransition' },
  { id: 'seam', title: 'Leaving an open seam', description: 'Two passers too far apart — or both hesitating — leave the seam to nobody.', fix: 'Agree on seam ownership and call the ball early.', practice: 'serveReceive', tag: 'coverageGap' },
  { id: 'too-deep', title: 'Standing too deep against an expected tip', description: 'Deep defenders who never move forward give away easy tips.', fix: 'Watch for the arm slowing down; the closest defender attacks the tip.', practice: 'tip', tag: 'tipMissed' },
  { id: 'no-cover', title: 'Failing to cover a teammate’s attack', description: 'Standing and watching the hitter means blocked balls hit the floor.', fix: 'Get low around the hitter: three close, two deeper.', practice: 'attacking', tag: 'noCoverage' },
  { id: 'setter-resp', title: 'Misunderstanding setter responsibilities', description: 'Setters who release late, or try to set after taking the first ball.', fix: 'Release at contact; if you dig, call “help!” and let the emergency setter take it.', practice: 'setting', role: 'S', tag: 'setterRelease' },
  { id: 'backrow-block', title: 'Trying to block as a back-row player', description: 'Back-row players (and the libero) may not complete a block — wherever they stand.', fix: 'Back-row players defend behind the block.', practice: 'blocking', tag: 'backRowBlock' },
  { id: 'freeball', title: 'Incorrect movement on a free ball', description: 'Staying at the net to block a free ball wastes the best chance to run your offence.', fix: 'Call “free!”, release the setter, drop the hitters to their approaches.', practice: 'freeBall' },
];

export const ERROR_LABEL: Record<string, string> = {
  overlap: 'Overlap / positional faults',
  tooDeep: 'Standing too deep',
  tooShallow: 'Too close to the net',
  noTransition: 'Late transition after contact',
  tipMissed: 'Not moving forward for tips',
  noCoverage: 'Missing attack coverage',
  setterRelease: 'Setter release / second-ball errors',
  backRowBlock: 'Back-row player blocking',
  liberoBlock: 'Libero blocking',
  coverageGap: 'Leaving court areas uncovered',
  wrongChoice: 'Decision errors',
  illegalChoice: 'Choosing an illegal action',
};
