import * as THREE from 'three';
import { GameInput, type InputFrame } from '../core/GameInput';
import { Loop } from '../core/Loop';
import { createRenderer, resizeRenderer } from '../core/Renderer';
import { StadiumWorld } from '../render/StadiumWorld';
import { Soundscape } from '../systems/Soundscape';
import { LevelHud } from '../ui/LevelHud';
import {
  CUE_LEAD,
  EARLY_BUFFER_WINDOW,
  FINALE_DURATION,
  GOOD_WINDOW,
  LEVELS,
  LANE_X,
  PERFECT_WINDOW,
  buildRoundCues,
  type Cue,
  type CueInputState,
  type GamePhase,
  type Judgement,
  type Lane,
  type RunSnapshot,
  multiplierFor,
} from './LevelModel';

const RALLY_PULSES = [0.9, 1.8, 2.7] as const;
const FINALE_PULSES = [1.5, 3.35, 5.2, 7.05, 8.9, 10.75, 12.6, 14.45, 16.3, 18.15, 20, 21.85] as const;
const FINALE_LANES: readonly Lane[] = [1, 0, 2, 1, 2, 0, 1, 0, 2, 1, 2, 1];

export class LevelGame {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(49, 1, 0.1, 90);
  private readonly input: GameInput;
  private readonly world: StadiumWorld;
  private readonly hud = new LevelHud();
  private readonly audio = new Soundscape();
  private readonly loop = new Loop(
    (delta) => this.update(delta),
    () => this.renderer.render(this.scene, this.camera),
  );

  private frame = 0;
  private seed = this.seedFromUrl();
  private phase: GamePhase = 'title';
  private phaseBeforePause: GamePhase = 'playing';
  private phaseElapsed = 0;
  private totalElapsed = 0;
  private levelIndex = 0;
  private roundIndex = 0;
  private roundsWon = 0;
  private seals = 0;
  private roundElapsed = 0;
  private cues: Cue[] = [];
  private cueIndex = 0;
  private roundHits = 0;
  private isRecovery = false;
  private encore = false;
  private lastRoundPassed = true;
  private score = 0;
  private energy = 72;
  private streak = 0;
  private bestStreak = 0;
  private lane: Lane = 1;
  private targetLane: Lane = 1;
  private judgement: Judgement = 'idle';
  private pulsePhase = 0;
  private inputBuffered = false;
  private rallyAvailable = true;
  private rallyHits = 0;
  private rallyCueIndex = 0;
  private finaleCueIndex = 0;
  private finaleHits = 0;
  private finaleHold = 0;
  private finaleHoldComplete = false;
  private countdownMark = 4;
  private screenshotPaused = false;
  private reducedMotion = false;
  private muted = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMappingExposure = 1.08;
    this.input = new GameInput(canvas, () => this.handleChant());
    this.world = new StadiumWorld(this.scene);
    this.prepareRound(false, false);
    resizeRenderer(this.renderer, this.camera, 1.75);
    this.installTestHooks();
    this.publishDiagnostics();
    this.hud.update(this.snapshot(), 0);
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.input.dispose();
    this.audio.dispose();
    this.renderer.dispose();
    window.__THREE_GAME_DIAGNOSTICS__ = undefined;
    window.__THREE_GAME_TEST_HOOKS__ = undefined;
  }

  private update(realDelta: number): void {
    this.frame += 1;
    const frame = this.input.read();
    this.handleGlobalInput(frame);
    const delta = this.screenshotPaused || this.phase === 'paused' ? 0 : realDelta;
    const motionDelta = this.reducedMotion || this.screenshotPaused ? 0 : realDelta;
    resizeRenderer(this.renderer, this.camera, 1.75);

    if (delta > 0) {
      if (this.phase === 'countdown') this.updateCountdown(delta);
      else if (this.phase === 'playing' || this.phase === 'recovery') this.updateRound(delta, frame);
      else if (this.phase === 'cycleClear') this.updateRoundClear(delta);
      else if (this.phase === 'levelClear') this.updateLevelClear(delta);
      else if (this.phase === 'rally') this.updateRally(delta, frame);
      else if (this.phase === 'finale') this.updateFinale(delta, frame);
    }

    const snapshot = this.snapshot();
    this.world.update(snapshot, motionDelta);
    this.updateCamera(snapshot, realDelta);
    this.audio.update(this.energy, this.streak, this.phase);
    this.hud.update(snapshot, realDelta);
    this.publishDiagnostics();
  }

  private handleGlobalInput(frame: InputFrame): void {
    if (frame.mute) {
      this.muted = this.audio.toggleMute();
      this.hud.setMuted(this.muted);
    }
    if (frame.pause && ['playing', 'recovery', 'rally', 'finale', 'countdown'].includes(this.phase)) {
      this.phaseBeforePause = this.phase;
      this.phase = 'paused';
      return;
    }
    if (frame.pause && this.phase === 'paused') {
      this.phase = this.phaseBeforePause;
      return;
    }
    if (this.phase === 'title' && frame.start) {
      void this.audio.unlock();
      this.beginRun(false);
      return;
    }
    if (this.phase === 'failed' || this.phase === 'results') {
      if (frame.newSeed) {
        this.seed = (Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0;
        this.syncSeedUrl();
        this.beginRun(false);
      } else if (frame.restart || frame.start) {
        this.beginRun(false);
      }
    }
  }

  private handleChant(): void {
    if (this.phase === 'title') {
      void this.audio.unlock();
      this.beginRun(false);
      return;
    }
    if (this.phase === 'failed' || this.phase === 'results') {
      this.beginRun(false);
      return;
    }
    if (this.phase === 'playing' || this.phase === 'recovery') this.resolveRoundChant();
    else if (this.phase === 'rally') this.resolveRallyChant();
    else if (this.phase === 'finale' && this.phaseElapsed < 24) this.resolveFinaleChant();
  }

  private beginRun(skipCountdown: boolean): void {
    this.score = 0;
    this.energy = 72;
    this.streak = 0;
    this.bestStreak = 0;
    this.levelIndex = 0;
    this.roundIndex = 0;
    this.roundsWon = 0;
    this.seals = 0;
    this.totalElapsed = 0;
    this.phaseElapsed = 0;
    this.lane = 1;
    this.targetLane = 1;
    this.judgement = 'idle';
    this.rallyAvailable = true;
    this.rallyHits = 0;
    this.finaleHits = 0;
    this.finaleHold = 0;
    this.finaleHoldComplete = false;
    this.encore = false;
    this.prepareRound(false, false);
    this.phase = skipCountdown ? 'playing' : 'countdown';
    this.countdownMark = 4;
    void this.audio.unlock();
  }

  private updateCountdown(delta: number): void {
    this.phaseElapsed += delta;
    const mark = Math.max(1, 3 - Math.floor(this.phaseElapsed));
    if (mark !== this.countdownMark) {
      this.countdownMark = mark;
      this.audio.beat(mark === 1);
    }
    if (this.phaseElapsed >= 3) {
      this.phaseElapsed = 0;
      this.roundElapsed = 0;
      this.phase = this.isRecovery ? 'recovery' : 'playing';
    }
  }

  private prepareRound(recovery: boolean, setPhase = true): void {
    this.isRecovery = recovery;
    this.roundElapsed = 0;
    this.phaseElapsed = 0;
    this.cueIndex = 0;
    this.roundHits = 0;
    this.inputBuffered = false;
    this.lastRoundPassed = true;
    this.cues = buildRoundCues(this.levelIndex, this.roundIndex, this.seed, recovery);
    const pattern = LEVELS[this.levelIndex].rounds[this.roundIndex].pattern;
    const previewDelay = recovery ? 0 : pattern === 'response' ? 3.2 : pattern === 'relay' ? 1.4 : 0;
    if (previewDelay > 0) this.cues = this.cues.map((cue) => ({ ...cue, due: cue.due + previewDelay }));
    this.targetLane = this.cues[0]?.lane ?? 1;
    this.pulsePhase = 0;
    if (setPhase) this.phase = recovery ? 'recovery' : 'playing';
  }

  private updateRound(delta: number, frame: InputFrame): void {
    this.phaseElapsed += delta;
    this.roundElapsed += delta;
    this.totalElapsed += delta;
    this.applyLaneInput(frame.laneDelta);

    const pattern = LEVELS[this.levelIndex].rounds[this.roundIndex].pattern;
    const previewDuration = this.isRecovery ? 0 : pattern === 'response' ? 3.05 : pattern === 'relay' ? 1.25 : 0;
    if (this.roundElapsed < previewDuration) {
      const previewIndex = Math.floor(this.roundElapsed / 0.55) % Math.min(6, this.cues.length);
      this.targetLane = this.cues[previewIndex]?.lane ?? 1;
      this.pulsePhase = 0.22;
      return;
    }

    while (this.cueIndex < this.cues.length && this.roundElapsed > this.cues[this.cueIndex].due + GOOD_WINDOW) {
      this.resolveCue('miss');
    }

    const cue = this.cues[this.cueIndex];
    if (cue) {
      const cueDelta = cue.due - this.roundElapsed;
      this.targetLane = cue.lane;
      this.pulsePhase = THREE.MathUtils.clamp(1 - cueDelta / CUE_LEAD, 0, 1);
      if (this.inputBuffered && cueDelta <= GOOD_WINDOW) {
        this.resolveCue('good');
        return;
      }
    } else {
      this.pulsePhase = 1;
      const lastDue = this.cues.at(-1)?.due ?? CUE_LEAD;
      if (this.roundElapsed > lastDue + 0.8) this.finishRound();
    }
  }

  private resolveRoundChant(): void {
    const cue = this.cues[this.cueIndex];
    if (!cue) return;
    const cueDelta = cue.due - this.roundElapsed;

    if (this.lane !== cue.lane) {
      this.hud.showHint(`MOVE ${['LEFT', 'CENTER', 'RIGHT'][cue.lane]}`);
      return;
    }

    if (cueDelta > EARLY_BUFFER_WINDOW) {
      this.hud.showHint('WAIT FOR READY');
      return;
    }

    if (cueDelta > GOOD_WINDOW) {
      this.inputBuffered = true;
      this.hud.showHint('QUEUED');
      return;
    }

    if (cueDelta < -GOOD_WINDOW) return;
    const grade: Judgement = Math.abs(cueDelta) <= PERFECT_WINDOW ? 'perfect' : 'good';
    this.resolveCue(grade);
  }

  private resolveCue(grade: Judgement): void {
    const cue = this.cues[this.cueIndex];
    if (!cue) return;
    const streakBeforeImpact = this.streak;
    if (grade === 'perfect' || grade === 'good') {
      this.roundHits += 1;
      this.streak += 1;
      this.bestStreak = Math.max(this.bestStreak, this.streak);
      const multiplier = multiplierFor(this.streak);
      this.score += (grade === 'perfect' ? 120 : 75) * multiplier;
      if (cue.hazard) this.score += 260 * multiplier;
      this.energy = Math.min(100, this.energy + (grade === 'perfect' ? 4 : 2));
    } else {
      this.streak = 0;
      this.energy = Math.max(0, this.energy - (cue.hazard ? 5 : 3));
    }
    this.inputBuffered = false;
    this.cueIndex += 1;
    this.emitJudgement(grade);
    this.checkEnergy(streakBeforeImpact);
  }

  private finishRound(): void {
    if (this.phase === 'cycleClear') return;
    const normalTarget = LEVELS[this.levelIndex].rounds[this.roundIndex].passHits;
    const target = this.isRecovery ? 4 : normalTarget;
    this.lastRoundPassed = this.roundHits >= target;
    if (this.lastRoundPassed) {
      this.roundsWon += 1;
      this.score += (this.isRecovery ? 420 : 650) * (this.levelIndex + 1);
      this.energy = Math.min(100, this.energy + (this.isRecovery ? 9 : 7));
      this.audio.cycleClear();
      this.world.cycleBurst();
    } else if (this.isRecovery) {
      this.energy = Math.max(0, this.energy - 8);
      if (this.energy <= 0) {
        this.checkEnergy(this.streak);
        if (this.phase === 'rally' || this.phase === 'failed') return;
      }
    }
    this.phase = 'cycleClear';
    this.phaseElapsed = 0;
  }

  private updateRoundClear(delta: number): void {
    this.phaseElapsed += delta;
    if (this.phaseElapsed < 2.35) return;

    if (!this.lastRoundPassed && !this.isRecovery) {
      this.prepareRound(true);
      return;
    }
    if (!this.lastRoundPassed && this.isRecovery) {
      this.prepareRound(true);
      return;
    }

    if (this.encore) {
      if (this.roundsWon >= LEVELS[this.levelIndex].requiredWins) this.finishLevel();
      else this.prepareRound(true);
      return;
    }

    if (this.roundIndex < LEVELS[this.levelIndex].rounds.length - 1) {
      this.roundIndex += 1;
      this.prepareRound(false);
      return;
    }

    if (this.roundsWon >= LEVELS[this.levelIndex].requiredWins) this.finishLevel();
    else {
      this.encore = true;
      this.prepareRound(true);
    }
  }

  private finishLevel(): void {
    this.seals += 1;
    this.score += 1100 * (this.levelIndex + 1);
    this.energy = Math.min(100, this.energy + 18);
    this.phase = 'levelClear';
    this.phaseElapsed = 0;
    this.audio.cycleClear();
    this.world.cycleBurst();
  }

  private updateLevelClear(delta: number): void {
    this.phaseElapsed += delta;
    if (this.phaseElapsed < 3.25) return;
    if (this.levelIndex < LEVELS.length - 1) {
      this.levelIndex += 1;
      this.roundIndex = 0;
      this.roundsWon = 0;
      this.encore = false;
      this.prepareRound(false, false);
      this.phase = 'countdown';
      this.phaseElapsed = 0;
      this.countdownMark = 4;
    } else {
      this.enterFinale();
    }
  }

  private checkEnergy(streakAtImpact: number): void {
    if (this.energy > 0 || this.phase === 'rally' || this.phase === 'finale') return;
    if (this.rallyAvailable && (streakAtImpact >= 8 || this.seals > 0)) {
      this.rallyAvailable = false;
      this.phase = 'rally';
      this.phaseElapsed = 0;
      this.rallyHits = 0;
      this.rallyCueIndex = 0;
      this.targetLane = 1;
      this.audio.rally();
    } else {
      this.phase = 'failed';
      this.phaseElapsed = 0;
    }
  }

  private updateRally(delta: number, frame: InputFrame): void {
    this.phaseElapsed += delta;
    this.totalElapsed += delta;
    this.applyLaneInput(frame.laneDelta);
    this.targetLane = 1;
    const next = Math.min(this.rallyCueIndex, RALLY_PULSES.length - 1);
    const previous = next === 0 ? 0 : RALLY_PULSES[next - 1];
    this.pulsePhase = THREE.MathUtils.clamp((this.phaseElapsed - previous) / (RALLY_PULSES[next] - previous), 0, 1);
    while (this.rallyCueIndex < RALLY_PULSES.length && this.phaseElapsed > RALLY_PULSES[this.rallyCueIndex] + 0.44) {
      this.rallyCueIndex += 1;
      this.emitJudgement('miss');
    }
    if (this.rallyHits >= 2) {
      this.energy = 35;
      this.prepareRound(true);
    } else if (this.phaseElapsed >= 3.8) {
      this.phase = 'failed';
      this.phaseElapsed = 0;
    }
  }

  private resolveRallyChant(): void {
    let nearest = -1;
    let offset = Infinity;
    RALLY_PULSES.forEach((time, index) => {
      if (index < this.rallyCueIndex) return;
      const distance = Math.abs(this.phaseElapsed - time);
      if (distance < offset) {
        offset = distance;
        nearest = index;
      }
    });
    if (this.lane !== 1) {
      this.hud.showHint('MOVE CENTER');
      return;
    }
    if (nearest >= 0 && offset <= 0.44) {
      const grade: Judgement = offset <= 0.18 ? 'perfect' : 'good';
      this.rallyCueIndex = nearest + 1;
      this.rallyHits += 1;
      this.score += grade === 'perfect' ? 180 : 110;
      this.emitJudgement(grade);
    } else this.hud.showHint('WAIT FOR READY');
  }

  private enterFinale(): void {
    this.phase = 'finale';
    this.phaseElapsed = 0;
    this.finaleCueIndex = 0;
    this.finaleHits = 0;
    this.finaleHold = 0;
    this.finaleHoldComplete = false;
    this.targetLane = FINALE_LANES[0];
    this.energy = Math.max(42, this.energy);
    this.world.cycleBurst();
  }

  private updateFinale(delta: number, frame: InputFrame): void {
    this.phaseElapsed += delta;
    this.totalElapsed += delta;
    this.applyLaneInput(frame.laneDelta);
    if (this.phaseElapsed < 24) {
      const next = Math.min(this.finaleCueIndex, FINALE_PULSES.length - 1);
      const previous = next === 0 ? 0 : FINALE_PULSES[next - 1];
      this.targetLane = FINALE_LANES[next];
      this.pulsePhase = THREE.MathUtils.clamp((this.phaseElapsed - previous) / (FINALE_PULSES[next] - previous), 0, 1);
      while (this.finaleCueIndex < FINALE_PULSES.length && this.phaseElapsed > FINALE_PULSES[this.finaleCueIndex] + 0.46) {
        this.finaleCueIndex += 1;
        this.energy = Math.max(1, this.energy - 3);
        this.streak = 0;
        this.emitJudgement('miss');
      }
    } else {
      this.targetLane = 1;
      this.pulsePhase = THREE.MathUtils.clamp((this.phaseElapsed - 24) / 1.65, 0, 1);
      if (frame.chantHeld && this.lane === 1) this.finaleHold += delta;
      else this.finaleHold = Math.max(0, this.finaleHold - delta * 1.4);
      if (!this.finaleHoldComplete && this.finaleHold >= 1.65) {
        this.finaleHoldComplete = true;
        this.finaleHits += 1;
        this.score += 1500 * multiplierFor(this.streak);
        this.emitJudgement('perfect');
      }
    }
    if (this.phaseElapsed >= FINALE_DURATION) this.completeRun();
  }

  private resolveFinaleChant(): void {
    const index = this.finaleCueIndex;
    const due = FINALE_PULSES[index];
    if (due === undefined) return;
    const cueDelta = due - this.phaseElapsed;
    const targetLane = FINALE_LANES[index];
    if (this.lane !== targetLane) {
      this.hud.showHint(`MOVE ${['LEFT', 'CENTER', 'RIGHT'][targetLane]}`);
      return;
    }
    if (cueDelta > EARLY_BUFFER_WINDOW) {
      this.hud.showHint('WAIT FOR READY');
      return;
    }
    if (cueDelta < -0.46) return;
    const grade: Judgement = Math.abs(cueDelta) <= 0.18 ? 'perfect' : 'good';
    this.finaleCueIndex += 1;
    this.finaleHits += 1;
    this.streak += 1;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    this.score += (grade === 'perfect' ? 300 : 190) * multiplierFor(this.streak);
    this.energy = Math.min(100, this.energy + 3);
    this.emitJudgement(grade);
  }

  private completeRun(): void {
    if (this.phase === 'results') return;
    this.score += 3000 + this.energy * 80 + this.finaleHits * 190 + this.seals * 500;
    this.phase = 'results';
    this.phaseElapsed = 0;
    this.audio.finish();
    this.world.cycleBurst();
  }

  private emitJudgement(grade: Judgement): void {
    this.judgement = grade;
    if (grade !== 'idle') {
      this.hud.showJudgement(grade);
      this.audio.judgement(grade, this.streak);
      this.world.hitFeedback(grade);
    }
  }

  private applyLaneInput(delta: number): void {
    if (delta !== 0) this.lane = Math.max(0, Math.min(2, this.lane + delta)) as Lane;
  }

  private updateCamera(snapshot: RunSnapshot, delta: number): void {
    const portrait = this.camera.aspect < 0.78;
    const finale = snapshot.phase === 'finale' || snapshot.phase === 'results';
    const targetPosition = new THREE.Vector3(
      portrait ? snapshot.lane * 0.4 - 0.4 : (snapshot.lane - 1) * 0.25,
      portrait ? 7.7 : finale ? 7.25 : 6.55,
      portrait ? 21.5 : finale ? 17.1 : 15.3,
    ).add(this.world.getCameraShake(this.totalElapsed));
    const cameraTarget = new THREE.Vector3(0, finale ? 3.65 : 2.25, finale ? -5 : -2.8);
    this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, targetPosition.x, 6, delta);
    this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, targetPosition.y, 6, delta);
    this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, targetPosition.z, 6, delta);
    const fov = portrait ? 59 : finale ? 54 : 49;
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, fov, 5, delta);
      this.camera.updateProjectionMatrix();
    }
    this.camera.lookAt(cameraTarget);
  }

  private currentCueDelta(cue: Cue | undefined): number {
    if (this.phase === 'finale' && this.phaseElapsed < 24) {
      const due = FINALE_PULSES[this.finaleCueIndex];
      return due === undefined ? Number.POSITIVE_INFINITY : due - this.phaseElapsed;
    }
    if (this.phase === 'rally') {
      const due = RALLY_PULSES[this.rallyCueIndex];
      return due === undefined ? Number.POSITIVE_INFINITY : due - this.phaseElapsed;
    }
    return cue ? cue.due - this.roundElapsed : Number.POSITIVE_INFINITY;
  }

  private cueInputState(cue: Cue | undefined): CueInputState {
    const pattern = LEVELS[this.levelIndex].rounds[this.roundIndex].pattern;
    if (!this.isRecovery && pattern === 'response' && this.roundElapsed < 3.05 && this.phase !== 'finale') return 'preview';
    const cueDelta = this.currentCueDelta(cue);
    if (!Number.isFinite(cueDelta)) return 'between';
    if (this.inputBuffered && (this.phase === 'playing' || this.phase === 'recovery')) return 'buffered';
    if (cueDelta > EARLY_BUFFER_WINDOW) return 'move';
    if (cueDelta > GOOD_WINDOW) return 'ready';
    if (cueDelta >= -PERFECT_WINDOW) return 'active';
    if (cueDelta >= -GOOD_WINDOW) return 'grace';
    return 'between';
  }

  private snapshot(): RunSnapshot {
    const level = LEVELS[Math.min(this.levelIndex, LEVELS.length - 1)];
    const round = level.rounds[Math.min(this.roundIndex, level.rounds.length - 1)];
    const cue = this.cues[this.cueIndex];
    return {
      phase: this.phase,
      phaseBeforePause: this.phaseBeforePause,
      seed: this.seed,
      levelIndex: this.levelIndex,
      roundIndex: this.roundIndex,
      roundsWon: this.roundsWon,
      seals: this.seals,
      roundElapsed: this.roundElapsed,
      phaseElapsed: this.phaseElapsed,
      totalElapsed: this.totalElapsed,
      score: this.score,
      energy: this.energy,
      streak: this.streak,
      bestStreak: this.bestStreak,
      multiplier: multiplierFor(this.streak),
      lane: this.lane,
      targetLane: this.targetLane,
      judgement: this.judgement,
      cueIndex: this.cueIndex,
      cueCount: this.cues.length,
      roundHits: this.roundHits,
      roundTarget: this.isRecovery ? 4 : round.passHits,
      cueHazard: Boolean(cue?.hazard),
      cueDelta: Number.isFinite(this.currentCueDelta(cue)) ? this.currentCueDelta(cue) : 0,
      inputState: this.cueInputState(cue),
      inputBuffered: this.inputBuffered,
      pulsePhase: this.pulsePhase,
      isRecovery: this.isRecovery,
      lastRoundPassed: this.lastRoundPassed,
      rallyAvailable: this.rallyAvailable,
      rallyHits: this.rallyHits,
      finaleHits: this.finaleHits,
      finaleHold: this.finaleHold,
      finaleHoldComplete: this.finaleHoldComplete,
      objective: this.encore ? 'Encore: win one more recovery round to seal the level.' : this.isRecovery ? 'Recovery round: land 4 of 7 forgiving calls.' : round.task,
      roundName: this.encore ? 'ENCORE' : this.isRecovery ? 'RECOVERY ROUND' : round.name,
    };
  }

  private publishDiagnostics(): void {
    const info = this.renderer.info;
    window.__THREE_GAME_DIAGNOSTICS__ = {
      frame: this.frame,
      elapsed: this.totalElapsed,
      score: this.score,
      targetScore: 5,
      complete: this.phase === 'results',
      phase: this.phase,
      cycle: this.levelIndex,
      level: this.levelIndex,
      round: this.roundIndex,
      roundsWon: this.roundsWon,
      seals: this.seals,
      energy: this.energy,
      streak: this.streak,
      seed: this.seed,
      player: { position: { x: LANE_X[this.lane], y: 0, z: 3.25 }, speed: 0 },
      renderer: {
        calls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      canvas: {
        clientWidth: this.canvas.clientWidth,
        clientHeight: this.canvas.clientHeight,
        width: this.canvas.width,
        height: this.canvas.height,
        dpr: Math.min(window.devicePixelRatio || 1, 1.75),
      },
    };
  }

  private installTestHooks(): void {
    window.__THREE_GAME_TEST_HOOKS__ = {
      seed: (value: number) => {
        this.seed = value >>> 0;
        this.syncSeedUrl();
      },
      start: (seed: number, levelIndex = 0) => {
        this.seed = seed >>> 0;
        this.beginRun(true);
        this.advanceToLevel(levelIndex);
      },
      setState: (name: string) => {
        if (name === 'active-play') {
          this.beginRun(true);
          this.advanceToLevel(2);
          this.energy = 82;
          this.streak = 14;
        } else if (name === 'recovery') {
          this.beginRun(true);
          this.advanceToLevel(1);
          this.prepareRound(true);
        } else if (name === 'fail') {
          this.beginRun(true);
          this.energy = 0;
          this.phase = 'failed';
        } else if (name === 'finale') {
          this.beginRun(true);
          this.levelIndex = 4;
          this.seals = 5;
          this.enterFinale();
          this.phaseElapsed = 8.5;
          this.energy = 84;
          this.streak = 24;
        } else if (name === 'results' || name === 'complete') {
          this.beginRun(true);
          this.levelIndex = 4;
          this.seals = 5;
          this.energy = 76;
          this.streak = 32;
          this.bestStreak = 32;
          this.score = 32450;
          this.finaleHits = 12;
          this.finaleHoldComplete = true;
          this.completeRun();
        } else if (name === 'stress') {
          this.beginRun(true);
          this.advanceToLevel(4);
          this.energy = 22;
          this.streak = 35;
          this.cueIndex = Math.min(5, this.cues.length - 1);
          this.roundElapsed = this.cues[this.cueIndex].due - 0.2;
        }
      },
      setEnergy: (value: number) => {
        this.energy = Math.max(0, Math.min(100, value));
      },
      setStreak: (value: number) => {
        this.streak = Math.max(0, Math.floor(value));
        this.bestStreak = Math.max(this.bestStreak, this.streak);
      },
      setLane: (lane: Lane) => {
        this.lane = Math.max(0, Math.min(2, lane)) as Lane;
      },
      advanceSimulation: (milliseconds: number) => {
        const delta = Math.max(0, milliseconds) / 1000;
        if (this.phase === 'playing' || this.phase === 'recovery') this.updateRound(delta, this.input.read());
        else if (this.phase === 'rally') this.updateRally(delta, this.input.read());
        else if (this.phase === 'finale') this.updateFinale(delta, this.input.read());
      },
      advanceToCycle: (index: number) => this.advanceToLevel(index),
      advanceToLevel: (index: number) => this.advanceToLevel(index),
      completeCurrentRound: () => {
        this.roundHits = this.isRecovery ? 4 : LEVELS[this.levelIndex].rounds[this.roundIndex].passHits;
        this.finishRound();
      },
      completeLevel: () => {
        this.roundsWon = LEVELS[this.levelIndex].requiredWins;
        this.finishLevel();
      },
      advanceTransition: () => {
        if (this.phase === 'cycleClear') this.updateRoundClear(10);
        else if (this.phase === 'levelClear') this.updateLevelClear(10);
      },
      triggerHazard: (lane: Lane) => {
        const cue = this.cues[this.cueIndex];
        if (cue) {
          cue.lane = Math.max(0, Math.min(2, lane)) as Lane;
          cue.hazard = true;
          this.targetLane = cue.lane;
        }
      },
      setBeatOffset: (milliseconds: number) => {
        const cue = this.cues[this.cueIndex];
        if (cue) {
          this.roundElapsed = cue.due + milliseconds / 1000;
          this.targetLane = cue.lane;
          this.lane = cue.lane;
        }
      },
      getSnapshot: () => this.snapshot(),
      restartSameSeed: () => this.beginRun(false),
      setPausedForScreenshot: (paused: boolean) => {
        this.screenshotPaused = paused;
      },
      setReducedMotion: (enabled: boolean) => {
        this.reducedMotion = enabled;
      },
      hideDebugUi: () => undefined,
    };
  }

  private advanceToLevel(index: number): void {
    this.levelIndex = Math.max(0, Math.min(4, Math.floor(index)));
    this.roundIndex = 0;
    this.roundsWon = 0;
    this.encore = false;
    this.prepareRound(false);
  }

  private seedFromUrl(): number {
    const raw = new URLSearchParams(window.location.search).get('seed');
    const parsed = raw ? Number(raw) : NaN;
    return Number.isFinite(parsed) ? parsed >>> 0 : 260711;
  }

  private syncSeedUrl(): void {
    const url = new URL(window.location.href);
    url.searchParams.set('seed', String(this.seed));
    window.history.replaceState({}, '', url);
  }
}
