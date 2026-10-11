import type { Category } from './scenarios';
import type { Role } from './types';

export type DemoKind = 'zones' | 'rows' | 'rotate' | 'roles' | 'systems' | 'overlap' | 'release' | 'coverage' | 'defense' | 'transition' | 'reading' | 'scrimmage';

export interface LessonCard {
  title: string;
  body: string;
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
  {
    n: 1,
    title: 'Court Fundamentals',
    goal: 'Know the six zones, front vs back row, and how rotation works.',
    lessons: [
      {
        id: 'l1-zones',
        title: 'The six zones',
        summary: 'Every rotation is described with six numbered positions.',
        cards: [
          { title: 'Numbered positions', body: 'Position 1 is right-back — where the server stands. Numbers run anticlockwise: 2 right-front, 3 middle-front, 4 left-front, 5 left-back, 6 middle-back. The orientation never changes: you always look at your own court facing the net.', demo: 'zones' },
          { title: 'Front row and back row', body: 'Positions 2, 3 and 4 are the front row; 1, 5 and 6 are the back row. Row status comes from your ROTATIONAL position — not from where you happen to be standing during the rally.', demo: 'rows' },
        ],
        practice: { category: 'fundamentals', count: 5 },
      },
      {
        id: 'l1-rotate',
        title: 'Clockwise rotation & service order',
        summary: 'When you win the serve back, everyone moves one place clockwise.',
        cards: [
          { title: 'When do we rotate?', body: 'A receiving team that wins the rally gains the serve and rotates one place clockwise: 2→1, 1→6, 6→5, 5→4, 4→3, 3→2. A team that wins a rally while already serving does NOT rotate — the same server serves again.', demo: 'rotate' },
          { title: 'Service order', body: 'The player who rotates into Position 1 is the server. Serving out of order is a rotational fault: the rally is lost and the order is corrected.' },
        ],
        practice: { category: 'rules', count: 5 },
      },
    ],
  },
  {
    n: 2,
    title: 'Player Roles',
    goal: 'Separate a player’s ROLE from their rotational POSITION.',
    lessons: [
      {
        id: 'l2-roles',
        title: 'Roles vs positions',
        summary: 'A setter is still a setter in every zone.',
        cards: [
          { title: 'Three different ideas', body: 'Rotational position: your official place in the order (1–6). Role: your specialty (setter, outside, middle, opposite, libero, DS). Tactical position: where you move during the rally to do your job. A setter in Position 1 runs to the net to set — but is still a back-row player.', demo: 'roles' },
          { title: 'The libero and DS', body: 'The libero wears a different jersey, replaces back-row players (usually the middles) without using a substitution, and may not serve (FIVB), block, or attack a ball entirely above the net. A defensive specialist is an ordinary substitute who follows normal substitution limits.' },
        ],
        practice: { category: 'rules', count: 4 },
      },
    ],
  },
  {
    n: 3,
    title: 'Rotation Systems',
    goal: 'Recognise 4–2, 5–1 and 6–2 in every rotation.',
    lessons: [
      {
        id: 'l3-systems',
        title: '4–2, 5–1 and 6–2',
        summary: 'Who sets — and how many hitters are in the front row.',
        cards: [
          { title: '5–1', body: 'One setter sets all six rotations. Setter back row → three front-row hitters. Setter front row → two hitters plus the setter’s legal dump.', demo: 'systems' },
          { title: '6–2 and 4–2', body: 'Both use two setters standing opposite each other. In a 6–2 the BACK-row setter sets (three hitters always). In a 4–2 the FRONT-row setter sets (two hitters always, very short releases).' },
        ],
        practice: { category: 'fundamentals', count: 4 },
      },
    ],
  },
  {
    n: 4,
    title: 'Legal Starting Positions',
    goal: 'Master overlap rules, stacking and pre-serve alignment.',
    lessons: [
      {
        id: 'l4-overlap',
        title: 'Overlap: neighbours only',
        summary: 'Only neighbouring pairs matter — judged on the feet.',
        cards: [
          { title: 'Front/back pairs', body: 'At service contact, 5 must not be in front of 4, 6 not in front of 3, and 1 not in front of 2. Officially (FIVB 7.4.3.1): each back-row player must be LEVEL WITH or have at least part of one foot further from the net than the FRONT foot of the front-row player. Being exactly level is legal.', demo: 'overlap' },
          { title: 'Same-row order', body: 'Within each row the order is left–centre–right: 4·3·2 in front and 5·6·1 behind. Officially (FIVB 7.4.3.2): each side player must be level with, or have part of one foot closer to their sideline than, the foot of each other player in the row that is furthest from that sideline. Players in different rows who are not front/back partners (for example 4 and 6, or 2 and 6) have no relationship — that freedom is what allows stacking.' },
          { title: 'Which team is judged?', body: 'Under FIVB 2025–2028 (Rule 7.4) only the RECEIVING team must be in rotational order at the service hit; the serving team may occupy any position. Both teams — except the server — must still be within their own court, and the serving team must not screen the server (Rule 12.5). Some leagues still judge both teams for order — check your competition.' },
        ],
        practice: { category: 'serveReceive', count: 6 },
      },
    ],
  },
  {
    n: 5,
    title: 'Serve-Receive Transitions',
    goal: 'Know where to go the instant the serve is contacted.',
    lessons: [
      {
        id: 'l5-release',
        title: 'Release and switch',
        summary: 'After contact, the overlap rule ends and everyone moves.',
        cards: [
          { title: 'Setter release', body: 'The setter leaves at service contact and must beat the pass to the target without cutting across a passer. Long releases (zones 5 and 4) are why the setter hides close to the net.', demo: 'release' },
          { title: 'Non-passers', body: 'Hitters hiding at the net move off it to their approach starts; back-row non-passers move out of the lanes. Nobody stands still.' },
        ],
        practice: { category: 'release', count: 5 },
      },
      {
        id: 'l5-firstball',
        title: 'Your ball / not your ball',
        summary: 'Passing — and what you do when someone else passes.',
        cards: [
          { title: 'After you pass', body: 'If you are an attacking option, open up and get back to your approach. If not, follow toward coverage.' },
          { title: 'When a teammate passes', body: 'Read the pass early: a good pass keeps all hitters live; an off pass means a high ball to a pin — and the middle becomes a coverage player.' },
        ],
        practice: { category: 'someoneElse', count: 5 },
      },
    ],
  },
  {
    n: 6,
    title: 'Offensive Positioning',
    goal: 'Approach preparation and attack coverage.',
    lessons: [
      {
        id: 'l6-coverage',
        title: 'Covering your hitter',
        summary: 'The coverage cup: three close, two deep.',
        cards: [
          { title: 'Why cover?', body: 'A stuff block drops steeply right behind the hitter. Three players low and close plus two deeper keep blocked balls alive — and give the team a second swing.', demo: 'coverage' },
          { title: 'Approach preparation', body: 'Outside hitters start wide and behind the 3 m line; middles stay close to the setter; back-row hitters must take off from behind the attack line to hit above the net.' },
        ],
        practice: { category: 'attacking', count: 6 },
      },
    ],
  },
  {
    n: 7,
    title: 'Defensive Positioning',
    goal: 'Blocking, back-court defence, tips and defensive systems.',
    lessons: [
      {
        id: 'l7-block',
        title: 'Block and defend around it',
        summary: 'Blockers take away court; defenders cover what is left.',
        cards: [
          { title: 'Blockers', body: 'Only front-row players may block. The outside blocker sets the block on the hitter; the middle closes. The off-blocker drops to the attack line.', demo: 'defense' },
          { title: 'Defenders', body: 'Back-row defenders stand outside the block’s shadow: cross-court, line, and deep. These are coaching systems (perimeter, rotational, middle-up) — not rules.' },
        ],
        practice: { category: 'blocking', count: 6 },
      },
      {
        id: 'l7-tips',
        title: 'Tip coverage',
        summary: 'Recognise the tip and move forward early.',
        cards: [
          { title: 'Who takes the tip?', body: 'It depends on the system and the block. In perimeter, the line digger or off-blocker; in rotational, the line-side defender who rotated up; in middle-up, the rover. No single player covers every tip.' },
        ],
        practice: { category: 'tip', count: 5 },
      },
    ],
  },
  {
    n: 8,
    title: 'Transitions & Broken Plays',
    goal: 'Change responsibilities when the rally goes wrong.',
    lessons: [
      {
        id: 'l8-transition',
        title: 'Defence to offence',
        summary: 'After the dig, recover, find the setter, attack.',
        cards: [
          { title: 'Recover', body: 'Diggers get up and into an approach or coverage. Blockers land, turn, and get off the net.', demo: 'transition' },
          { title: 'When the setter digs', body: 'A pre-assigned emergency setter (often the libero or right-front) takes the second ball and sets high to a pin.' },
        ],
        practice: { category: 'brokenPlay', count: 6 },
      },
    ],
  },
  {
    n: 9,
    title: 'Game Awareness',
    goal: 'Read the opponent’s pass, setter and hitters.',
    lessons: [
      {
        id: 'l9-read',
        title: 'Reading the opponent',
        summary: 'Anticipate instead of reacting.',
        cards: [
          { title: 'Pass quality first', body: 'Off the net → high ball to a pin. On target → watch the quick. Tight → watch the setter (front row can dump).', demo: 'reading' },
          { title: 'Then the hitter', body: 'Approach angle, shoulder and arm speed tell you cross, line or tip.' },
        ],
        practice: { category: 'reading', count: 6 },
      },
    ],
  },
  {
    n: 10,
    title: 'Competitive Scrimmage',
    goal: 'Combine everything with reduced guidance.',
    lessons: [
      {
        id: 'l10-scrim',
        title: 'Put it together',
        summary: 'Full rallies and scrimmage with less guidance.',
        cards: [{ title: 'Everything at once', body: 'Before the serve, after contact, on offence and defence — keep asking: where should I be now, what am I watching, and where do I go next?', demo: 'scrimmage' }],
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
