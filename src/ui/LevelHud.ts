import { LEVELS, type RunSnapshot } from '../game/LevelModel';

export class LevelHud {
  private readonly root = document.body;
  private readonly score = this.get('#score-value');
  private readonly energyFill = this.get('#energy-fill');
  private readonly energyValue = this.get('#energy-value');
  private readonly streak = this.get('#streak-value');
  private readonly multiplier = this.get('#multiplier-value');
  private readonly levelValue = this.get('#cycle-value');
  private readonly levelName = this.get('#cycle-name');
  private readonly roundValue = this.get('#round-value');
  private readonly timer = this.get('#timer-value');
  private readonly judgement = this.get('#judgement');
  private readonly prompt = this.get('#game-prompt');
  private readonly objective = this.get('#objective-status');
  private readonly roundProgress = this.get('#round-progress');
  private readonly hazard = this.get('#hazard-warning');
  private readonly rallyHits = this.get('#rally-hits');
  private readonly countdown = this.get('#countdown-value');
  private readonly countdownLevel = this.get('#countdown-level');
  private readonly countdownTask = this.get('#countdown-task');
  private readonly bannerOverline = this.get('#cycle-banner-overline');
  private readonly bannerTitle = this.get('#cycle-banner-title');
  private readonly bannerCopy = this.get('#cycle-banner-copy');
  private readonly resultScore = this.get('#result-score');
  private readonly resultStreak = this.get('#result-streak');
  private readonly resultSeed = this.get('#result-seed');
  private readonly resultGrade = this.get('#result-grade');
  private readonly resultSeals = this.get('#result-seals');
  private readonly failScore = this.get('#fail-score');
  private readonly seedLabels = Array.from(document.querySelectorAll<HTMLElement>('[data-seed-label]'));
  private readonly laneIndicators = Array.from(document.querySelectorAll<HTMLElement>('.lane-indicator'));
  private readonly holdFill = this.get('#hold-fill');
  private readonly muteButton = this.get('#mute-button');
  private judgementTimer = 0;
  private lastJudgement = 'idle';
  private lastBannerKey = '';

  update(snapshot: RunSnapshot, delta: number): void {
    const level = LEVELS[Math.min(snapshot.levelIndex, 4)];
    const round = level.rounds[Math.min(snapshot.roundIndex, 3)];
    this.root.dataset.phase = snapshot.phase;
    this.root.dataset.inputState = snapshot.inputState;
    this.score.textContent = Math.round(snapshot.score).toLocaleString('en-US');
    this.energyFill.style.width = `${snapshot.energy}%`;
    this.energyValue.textContent = String(Math.round(snapshot.energy));
    this.energyFill.dataset.level = snapshot.energy < 25 ? 'danger' : snapshot.energy < 55 ? 'warn' : 'strong';
    this.streak.textContent = String(snapshot.streak);
    this.multiplier.textContent = `×${snapshot.multiplier}`;
    this.levelValue.textContent = snapshot.phase === 'finale' || snapshot.phase === 'results' ? 'FINAL' : `${snapshot.levelIndex + 1}/5`;
    this.levelName.textContent = snapshot.phase === 'finale' ? 'ONE STAND, ONE VOICE' : level.name;
    this.roundValue.textContent = snapshot.phase === 'finale' ? 'ANTHEM' : snapshot.isRecovery ? 'RECOVERY' : `${snapshot.roundIndex + 1}/4`;
    this.timer.textContent = this.formatTime(snapshot.totalElapsed);
    this.prompt.textContent = this.promptFor(snapshot);
    this.objective.textContent = snapshot.phase === 'finale' ? 'Complete the final calls, then hold the anthem.' : snapshot.objective;
    this.roundProgress.textContent = snapshot.phase === 'finale'
      ? `CALLS ${snapshot.finaleHits}/12 · SEALS ${snapshot.seals}/5`
      : `HITS ${snapshot.roundHits}/${snapshot.roundTarget} · ROUNDS WON ${snapshot.roundsWon}/${level.requiredWins}`;
    this.hazard.classList.toggle('visible', snapshot.cueHazard && snapshot.pulsePhase > 0.4);
    this.hazard.textContent = snapshot.cueHazard ? `RIVAL SURGE · ANSWER ${['LEFT', 'CENTER', 'RIGHT'][snapshot.targetLane]}` : '';
    this.rallyHits.textContent = `${snapshot.rallyHits}/2`;
    this.holdFill.style.width = `${snapshot.finaleHoldComplete ? 100 : Math.min(100, snapshot.finaleHold / 1.65 * 100)}%`;

    this.laneIndicators.forEach((indicator, lane) => {
      indicator.classList.toggle('player', lane === snapshot.lane);
      indicator.classList.toggle('target', lane === snapshot.targetLane);
      indicator.classList.toggle('hazard', snapshot.cueHazard && lane === snapshot.targetLane);
      indicator.classList.toggle('ready', lane === snapshot.targetLane && snapshot.inputState === 'ready');
      indicator.classList.toggle('active', lane === snapshot.targetLane && ['active', 'grace'].includes(snapshot.inputState));
      indicator.classList.toggle('buffered', lane === snapshot.targetLane && snapshot.inputBuffered);
    });

    if (snapshot.phase === 'countdown') {
      this.countdown.textContent = String(Math.max(1, 3 - Math.floor(snapshot.phaseElapsed)));
      this.countdownLevel.textContent = `LEVEL ${snapshot.levelIndex + 1} · ${level.name}`;
      this.countdownTask.textContent = `${round.name} — ${round.task}`;
    }

    const bannerKey = `${snapshot.phase}-${snapshot.levelIndex}-${snapshot.roundIndex}-${snapshot.lastRoundPassed}-${snapshot.isRecovery}`;
    if (bannerKey !== this.lastBannerKey && (snapshot.phase === 'cycleClear' || snapshot.phase === 'levelClear')) {
      this.lastBannerKey = bannerKey;
      if (snapshot.phase === 'levelClear') {
        this.bannerOverline.textContent = 'LEVEL SEALED';
        this.bannerTitle.textContent = `${level.name} COMPLETE`;
        this.bannerCopy.textContent = snapshot.levelIndex >= 4 ? 'The whole stand is ready for the final anthem.' : `Energy restored · Next level: ${LEVELS[snapshot.levelIndex + 1].name}`;
      } else if (snapshot.lastRoundPassed) {
        this.bannerOverline.textContent = snapshot.isRecovery ? 'THE CHANT RETURNS' : 'ROUND WON';
        this.bannerTitle.textContent = snapshot.isRecovery ? 'RECOVERED' : round.name;
        this.bannerCopy.textContent = `${snapshot.roundHits}/${snapshot.roundTarget} calls landed · ${snapshot.roundsWon}/${level.requiredWins} rounds secured`;
      } else {
        this.bannerOverline.textContent = 'THE CROWD ANSWERS BACK';
        this.bannerTitle.textContent = 'RECOVERY ROUND';
        this.bannerCopy.textContent = `${snapshot.roundHits}/${snapshot.roundTarget} calls · Land 4 of 7 slower calls to continue`;
      }
    }

    if (snapshot.phase === 'failed') this.failScore.textContent = Math.round(snapshot.score).toLocaleString('en-US');
    if (snapshot.phase === 'results') {
      this.resultScore.textContent = Math.round(snapshot.score).toLocaleString('en-US');
      this.resultStreak.textContent = String(snapshot.bestStreak);
      this.resultSeed.textContent = String(snapshot.seed);
      this.resultSeals.textContent = `${snapshot.seals}/5`;
      this.resultGrade.textContent = this.gradeFor(snapshot.score, snapshot.seals);
    }
    for (const label of this.seedLabels) label.textContent = String(snapshot.seed);

    if (snapshot.judgement !== this.lastJudgement && snapshot.judgement !== 'idle') {
      this.showJudgement(snapshot.judgement);
      this.lastJudgement = snapshot.judgement;
    }
    this.judgementTimer = Math.max(0, this.judgementTimer - delta);
    this.judgement.classList.toggle('visible', this.judgementTimer > 0);
  }

  showJudgement(grade: 'perfect' | 'good' | 'miss'): void {
    this.judgement.textContent = grade.toUpperCase();
    this.judgement.dataset.grade = grade;
    this.judgementTimer = grade === 'miss' ? 0.48 : 0.42;
    this.judgement.getAnimations().forEach((animation) => animation.cancel());
    this.judgement.animate(
      [
        { transform: 'translate(-50%, -50%) scale(.72)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.48 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ],
      { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
  }

  showHint(message: string): void {
    this.judgement.textContent = message;
    this.judgement.dataset.grade = 'hint';
    this.judgementTimer = 0.55;
    this.judgement.getAnimations().forEach((animation) => animation.cancel());
    this.judgement.animate(
      [
        { transform: 'translate(-50%, -42%) scale(.92)', opacity: 0 },
        { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      ],
      { duration: 180, easing: 'ease-out' },
    );
  }

  setMuted(muted: boolean): void {
    this.muteButton.textContent = muted ? 'SOUND OFF' : 'SOUND ON';
    this.muteButton.setAttribute('aria-pressed', String(muted));
  }

  private promptFor(snapshot: RunSnapshot): string {
    const level = LEVELS[Math.min(snapshot.levelIndex, 4)];
    const pattern = level.rounds[Math.min(snapshot.roundIndex, 3)].pattern;
    if (snapshot.phase === 'title') return 'Choose a lane. Strike only when the call reaches you.';
    if (snapshot.phase === 'countdown') return 'Read the round objective';
    if (snapshot.phase === 'rally') return snapshot.inputState === 'active' || snapshot.inputState === 'grace' ? 'RALLY · CHANT NOW · CENTER' : 'RALLY SAVE · GET READY IN CENTER';
    if (snapshot.phase === 'finale') {
      if (snapshot.phaseElapsed >= 24) return 'HOLD THE FINAL NOTE';
      const finalLane = ['LEFT', 'CENTER', 'RIGHT'][snapshot.targetLane];
      const finalCall = Math.min(snapshot.finaleHits + 1, 12);
      if (snapshot.inputState === 'move') return `FINAL CALL ${finalCall}/12 · MOVE ${finalLane}`;
      if (snapshot.inputState === 'ready') return `FINAL CALL ${finalCall}/12 · READY ${finalLane}`;
      if (snapshot.inputState === 'active' || snapshot.inputState === 'grace') return `FINAL CALL ${finalCall}/12 · CHANT NOW · ${finalLane}`;
      return `FINAL CALL ${finalCall}/12 · ${finalLane}`;
    }
    if (snapshot.phase === 'cycleClear') return snapshot.lastRoundPassed ? 'Round secured' : 'A slower recovery phrase is coming';
    if (snapshot.phase === 'levelClear') return 'Level sealed';
    if (snapshot.phase === 'failed') return 'The rival stand broke the chant';
    if (snapshot.phase === 'results') return 'Five levels carried by one voice';
    if (snapshot.phase === 'paused') return 'Match paused';
    const lane = ['LEFT', 'CENTER', 'RIGHT'][snapshot.targetLane];
    const call = `${snapshot.cueIndex + 1}/${snapshot.cueCount}`;
    if (pattern === 'response' && snapshot.roundElapsed < 3.05 && !snapshot.isRecovery) return `WATCH THE PHRASE · ${lane}`;
    if (snapshot.inputState === 'buffered') return `QUEUED ${lane} · IT WILL LAND AUTOMATICALLY`;
    if (snapshot.inputState === 'move') return `${snapshot.cueHazard ? 'SURGE INCOMING' : 'MOVE'} ${lane} · CALL ${call}`;
    if (snapshot.inputState === 'ready') return `READY ${lane} · TAP NOW OR HOLD YOUR NERVE`;
    if (snapshot.inputState === 'active') return `CHANT NOW · ${lane} · CALL ${call}`;
    if (snapshot.inputState === 'grace') return `STILL OPEN · ${lane} · TAP NOW`;
    return `NEXT CALL ${call} · ${lane}`;
  }

  private gradeFor(score: number, seals: number): string {
    if (seals >= 5 && score >= 50000) return 'LEGENDARY CAPO';
    if (seals >= 5 && score >= 30000) return 'ONE VOICE';
    if (seals >= 5) return 'TRUE BELIEVER';
    return 'STILL SINGING';
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const wholeSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${wholeSeconds}`;
  }

  private get(selector: string): HTMLElement {
    const element = document.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Missing HUD element: ${selector}`);
    return element;
  }
}
