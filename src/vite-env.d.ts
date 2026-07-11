/// <reference types="vite/client" />

interface ThreeGameDiagnostics {
  frame: number;
  elapsed: number;
  score: number;
  targetScore: number;
  complete: boolean;
  phase: string;
  cycle: number;
  level: number;
  round: number;
  roundsWon: number;
  seals: number;
  energy: number;
  streak: number;
  seed: number;
  player: {
    position: { x: number; y: number; z: number };
    speed: number;
  };
  renderer: {
    calls: number;
    triangles: number;
    geometries: number;
    textures: number;
  };
  canvas: {
    clientWidth: number;
    clientHeight: number;
    width: number;
    height: number;
    dpr: number;
  };
}

interface ThreeGameTestHooks {
  seed(value: number): void;
  start(seed: number, cycleIndex?: number): void;
  setState(name: string): void;
  setEnergy(value: number): void;
  setStreak(value: number): void;
  setLane(lane: 0 | 1 | 2): void;
  advanceSimulation(milliseconds: number): void;
  advanceToCycle(index: number): void;
  advanceToLevel(index: number): void;
  completeCurrentRound(): void;
  completeLevel(): void;
  advanceTransition(): void;
  triggerHazard(lane: 0 | 1 | 2): void;
  setBeatOffset(milliseconds: number): void;
  getSnapshot(): unknown;
  restartSameSeed(): void;
  setPausedForScreenshot(paused: boolean): void;
  setReducedMotion(enabled: boolean): void;
  hideDebugUi(hidden: boolean): void;
}

interface Window {
  __THREE_GAME_DIAGNOSTICS__?: ThreeGameDiagnostics;
  __THREE_GAME_TEST_HOOKS__?: ThreeGameTestHooks;
}
