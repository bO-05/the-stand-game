export type GamePhase =
  | 'title'
  | 'countdown'
  | 'playing'
  | 'recovery'
  | 'cycleClear'
  | 'levelClear'
  | 'rally'
  | 'finale'
  | 'failed'
  | 'results'
  | 'paused';

export type Lane = 0 | 1 | 2;
export type Judgement = 'perfect' | 'good' | 'miss' | 'idle';
export type CueInputState = 'preview' | 'move' | 'ready' | 'active' | 'grace' | 'buffered' | 'between';
export type RoundPattern = 'foundation' | 'response' | 'surge' | 'route' | 'relay';

export interface RoundSpec {
  name: string;
  task: string;
  cueCount: number;
  passHits: number;
  spacingBeats: number;
  pattern: RoundPattern;
  hazardEvery: number;
}

export interface LevelSpec {
  name: string;
  subtitle: string;
  goal: string;
  bpm: number;
  requiredWins: number;
  color: string;
  rivalColor: string;
  rounds: readonly [RoundSpec, RoundSpec, RoundSpec, RoundSpec];
}

export interface Cue {
  lane: Lane;
  due: number;
  hazard: boolean;
}

const round = (
  name: string,
  task: string,
  cueCount: number,
  passHits: number,
  spacingBeats: number,
  pattern: RoundPattern,
  hazardEvery = 0,
): RoundSpec => ({ name, task, cueCount, passHits, spacingBeats, pattern, hazardEvery });

export const LEVELS: readonly LevelSpec[] = [
  {
    name: 'FIRST VOICE',
    subtitle: 'Build the home rhythm',
    goal: 'Win 3 of 4 rounds by landing the called pulses.',
    bpm: 84,
    requiredWins: 3,
    color: '#f0b23d',
    rivalColor: '#315e78',
    rounds: [
      round('FIND THE HEARTBEAT', 'Hold center and land 4 of 6 calls.', 6, 4, 2.3, 'foundation'),
      round('OPEN THE WINGS', 'Move left and right; land 5 of 7.', 7, 5, 2.3, 'foundation'),
      round('THREE SECTIONS', 'Carry the chant through every lane; land 5 of 8.', 8, 5, 2.25, 'foundation'),
      round('FIRST CHORUS', 'Complete the full phrase; land 6 of 9.', 9, 6, 2.25, 'foundation'),
    ],
  },
  {
    name: 'CALL & RESPONSE',
    subtitle: 'Listen, remember, answer',
    goal: 'Watch each lane phrase, then mirror it back.',
    bpm: 90,
    requiredWins: 3,
    color: '#ef9e32',
    rivalColor: '#3e6b92',
    rounds: [
      round('THE LEFT ANSWERS', 'Memorize the preview and return 5 of 8 calls.', 8, 5, 2.25, 'response'),
      round('THE RIGHT ANSWERS', 'Read the next phrase; return 5 of 8 calls.', 8, 5, 2.2, 'response'),
      round('ACROSS THE STAND', 'Mirror a longer phrase; return 6 of 9 calls.', 9, 6, 2.2, 'response'),
      round('ONE ECHO', 'Complete the response chain; return 6 of 9 calls.', 9, 6, 2.15, 'response'),
    ],
  },
  {
    name: 'BREAK THE SURGE',
    subtitle: 'Answer rival noise with rhythm',
    goal: 'Land the phrase and neutralize the purple surge calls.',
    bpm: 96,
    requiredWins: 3,
    color: '#ef6f3c',
    rivalColor: '#5569bc',
    rounds: [
      round('FIRST SURGE', 'Land 5 of 8, including a marked rival call.', 8, 5, 2.15, 'surge', 4),
      round('TWO FRONTS', 'Shift with the surges; land 6 of 9.', 9, 6, 2.1, 'surge', 4),
      round('NOISE WALL', 'Break each marked response; land 6 of 9.', 9, 6, 2.05, 'surge', 3),
      round('TAKE THE AIR BACK', 'Win the full exchange; land 7 of 10.', 10, 7, 2, 'surge', 3),
    ],
  },
  {
    name: 'SHUTTER RUN',
    subtitle: 'Read the gate, choose the route',
    goal: 'Follow the safe opening as the shutters reverse and pinch.',
    bpm: 102,
    requiredWins: 3,
    color: '#e84342',
    rivalColor: '#5c55a6',
    rounds: [
      round('SINGLE GATE', 'Follow the lit opening; land 6 of 9.', 9, 6, 2.05, 'route'),
      round('REVERSE', 'The gate changes direction; land 6 of 9.', 9, 6, 2, 'route'),
      round('THE PINCH', 'Thread ten safe openings; land 7.', 10, 7, 1.95, 'route'),
      round('DERBY CORRIDOR', 'Complete the shutter route; land 7 of 10.', 10, 7, 1.9, 'route'),
    ],
  },
  {
    name: 'THE WHOLE STAND',
    subtitle: 'Relay one anthem through every section',
    goal: 'Combine memory, surges, and moving gates across four verses.',
    bpm: 108,
    requiredWins: 3,
    color: '#df294b',
    rivalColor: '#6247b5',
    rounds: [
      round('VERSE ONE', 'Relay the anthem; land 7 of 10.', 10, 7, 1.9, 'relay', 5),
      round('VERSE TWO', 'Keep the relay moving; land 7 of 10.', 10, 7, 1.86, 'relay', 5),
      round('THE BRIDGE', 'Survive the longer bridge; land 8 of 11.', 11, 8, 1.82, 'relay', 4),
      round('ALL TOGETHER', 'Complete the final verse; land 8 of 12.', 12, 8, 1.78, 'relay', 4),
    ],
  },
] as const;

export const LANE_X: readonly [number, number, number] = [-4.25, 0, 4.25];
export const CUE_LEAD = 1.35;
export const FINALE_DURATION = 30;
export const PERFECT_WINDOW = 0.18;
export const GOOD_WINDOW = 0.44;
export const EARLY_BUFFER_WINDOW = 0.82;

export interface RunSnapshot {
  phase: GamePhase;
  phaseBeforePause: GamePhase;
  seed: number;
  levelIndex: number;
  roundIndex: number;
  roundsWon: number;
  seals: number;
  roundElapsed: number;
  phaseElapsed: number;
  totalElapsed: number;
  score: number;
  energy: number;
  streak: number;
  bestStreak: number;
  multiplier: number;
  lane: Lane;
  targetLane: Lane;
  judgement: Judgement;
  cueIndex: number;
  cueCount: number;
  roundHits: number;
  roundTarget: number;
  cueHazard: boolean;
  cueDelta: number;
  inputState: CueInputState;
  inputBuffered: boolean;
  pulsePhase: number;
  isRecovery: boolean;
  lastRoundPassed: boolean;
  rallyAvailable: boolean;
  rallyHits: number;
  finaleHits: number;
  finaleHold: number;
  finaleHoldComplete: boolean;
  objective: string;
  roundName: string;
}

export function multiplierFor(streak: number): number {
  if (streak >= 36) return 3;
  if (streak >= 22) return 2;
  if (streak >= 10) return 1.5;
  return 1;
}

export function hash01(value: number): number {
  const x = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function shutterOpenness(levelIndex: number, lane: Lane, time: number, seed: number): number {
  const phase = lane * 2.094 + hash01(seed + levelIndex * 71) * Math.PI;
  if (levelIndex === 0) return 0.72 + 0.26 * (0.5 + 0.5 * Math.sin(time * 0.52 + phase));
  if (levelIndex === 1) return 0.42 + 0.58 * Math.pow(Math.max(0, Math.sin(time * 0.72 + phase)), 0.5);
  if (levelIndex === 2) {
    const a = Math.sin(time * (0.82 + lane * 0.05) + phase);
    const b = Math.sin(time * 0.29 - phase * 1.4);
    return 0.25 + 0.75 * Math.max(0, a * 0.72 + b * 0.28);
  }
  if (levelIndex === 3) {
    const direction = Math.floor(time / 7) % 2 === 0 ? 1 : -1;
    return 0.2 + 0.8 * Math.pow(Math.abs(Math.sin(time * 0.95 * direction + phase)), 1.45);
  }
  return 0.18 + 0.82 * Math.pow(Math.abs(Math.sin(time * 1.08 + phase)), 1.8);
}

export function targetLaneFor(levelIndex: number, cueIndex: number, seed: number, time: number): Lane {
  const preferred = Math.floor(hash01(seed + levelIndex * 1009 + cueIndex * 37) * 3) as Lane;
  const openness = ([0, 1, 2] as Lane[]).map((lane) => shutterOpenness(levelIndex, lane, time, seed));
  if (openness[preferred] >= 0.42) return preferred;
  let best: Lane = 0;
  for (const lane of [1, 2] as Lane[]) if (openness[lane] > openness[best]) best = lane;
  return best;
}

export function buildRoundCues(
  levelIndex: number,
  roundIndex: number,
  seed: number,
  recovery = false,
): Cue[] {
  const level = LEVELS[levelIndex];
  const spec = level.rounds[roundIndex];
  const cueCount = recovery ? 7 : spec.cueCount;
  const rawSpacing = (60 / (recovery ? Math.max(76, level.bpm - 14) : level.bpm)) * (recovery ? 2.15 : spec.spacingBeats);
  const spacing = recovery ? Math.max(1.58, rawSpacing) : Math.max(1.38, rawSpacing);
  const cues: Cue[] = [];
  let previous: Lane = 1;

  for (let index = 0; index < cueCount; index += 1) {
    let lane: Lane;
    if (recovery) {
      lane = ([1, 0, 1, 2, 1, 0, 1] as Lane[])[index];
    } else if (spec.pattern === 'foundation') {
      const patterns: Lane[][] = [
        [1, 1, 1, 1, 1, 1],
        [0, 1, 2, 1, 0, 1, 2],
        [0, 0, 1, 1, 2, 2, 1, 1],
        [1, 0, 1, 2, 1, 0, 2, 1, 1],
      ];
      lane = patterns[roundIndex][index] ?? 1;
    } else if (spec.pattern === 'route') {
      lane = targetLaneFor(levelIndex, index + roundIndex * 17, seed, CUE_LEAD + index * spacing);
    } else if (spec.pattern === 'relay') {
      const relay = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 0, 2] as Lane[];
      lane = relay[(index + roundIndex * 2) % relay.length];
    } else {
      const roll = Math.floor(hash01(seed + levelIndex * 919 + roundIndex * 131 + index * 43) * 3) as Lane;
      lane = roll === previous && index % 3 !== 0 ? (((roll + 1 + roundIndex) % 3) as Lane) : roll;
    }
    previous = lane;
    cues.push({
      lane,
      due: CUE_LEAD + index * spacing,
      hazard: !recovery && spec.hazardEvery > 0 && (index + 1) % spec.hazardEvery === 0,
    });
  }
  return cues;
}
