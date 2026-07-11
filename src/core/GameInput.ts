export interface InputFrame {
  laneDelta: number;
  chantHeld: boolean;
  start: boolean;
  restart: boolean;
  newSeed: boolean;
  pause: boolean;
  mute: boolean;
}

export class GameInput {
  private laneDelta = 0;
  private chantHeld = false;
  private startRequested = false;
  private restartRequested = false;
  private newSeedRequested = false;
  private pauseRequested = false;
  private muteRequested = false;
  private swipePointer: number | null = null;
  private swipeStartX = 0;

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (['Space', 'ArrowLeft', 'ArrowRight'].includes(event.code)) event.preventDefault();
    if (event.repeat) return;
    if (event.code === 'KeyA' || event.code === 'ArrowLeft') this.laneDelta -= 1;
    if (event.code === 'KeyD' || event.code === 'ArrowRight') this.laneDelta += 1;
    if (event.code === 'Space') {
      this.chantHeld = true;
      this.onChant();
    }
    if (event.code === 'Enter') this.startRequested = true;
    if (event.code === 'KeyR') this.restartRequested = true;
    if (event.code === 'KeyN') this.newSeedRequested = true;
    if (event.code === 'Escape' || event.code === 'KeyP') this.pauseRequested = true;
    if (event.code === 'KeyM') this.muteRequested = true;
  };

  private readonly onKeyUp = (event: KeyboardEvent) => {
    if (event.code === 'Space') this.chantHeld = false;
  };

  private readonly onBlur = () => {
    this.chantHeld = false;
    this.swipePointer = null;
  };

  private readonly onCanvasDown = (event: PointerEvent) => {
    if (event.target instanceof HTMLElement && event.target.closest('button')) return;
    this.swipePointer = event.pointerId;
    this.swipeStartX = event.clientX;
  };

  private readonly onCanvasUp = (event: PointerEvent) => {
    if (event.pointerId !== this.swipePointer) return;
    const dx = event.clientX - this.swipeStartX;
    if (Math.abs(dx) >= 42) this.laneDelta += dx > 0 ? 1 : -1;
    this.swipePointer = null;
  };

  private readonly onChantDown = (event: PointerEvent) => {
    event.preventDefault();
    this.chantHeld = true;
    this.onChant();
    try {
      this.chantButton.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events may not own a pointer.
    }
  };

  private readonly onChantUp = (event: PointerEvent) => {
    event.preventDefault();
    this.chantHeld = false;
  };

  private readonly onLeft = (event: PointerEvent) => {
    event.preventDefault();
    this.laneDelta -= 1;
  };

  private readonly onRight = (event: PointerEvent) => {
    event.preventDefault();
    this.laneDelta += 1;
  };

  private readonly onStart = (event: Event) => {
    event.preventDefault();
    this.startRequested = true;
  };

  private readonly onRestart = (event: Event) => {
    event.preventDefault();
    this.restartRequested = true;
  };

  private readonly onNewSeed = (event: Event) => {
    event.preventDefault();
    this.newSeedRequested = true;
  };

  private readonly onPause = (event: Event) => {
    event.preventDefault();
    this.pauseRequested = true;
  };

  private readonly onMute = (event: Event) => {
    event.preventDefault();
    this.muteRequested = true;
  };

  private readonly chantButton = this.getElement<HTMLButtonElement>('#chant-button');
  private readonly leftButton = this.getElement<HTMLButtonElement>('#lane-left');
  private readonly rightButton = this.getElement<HTMLButtonElement>('#lane-right');
  private readonly startButton = this.getElement<HTMLButtonElement>('#start-button');
  private readonly resumeButton = this.getElement<HTMLButtonElement>('#resume-button');
  private readonly restartButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-restart]'));
  private readonly newSeedButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('[data-new-seed]'));
  private readonly pauseButton = this.getElement<HTMLButtonElement>('#pause-button');
  private readonly muteButton = this.getElement<HTMLButtonElement>('#mute-button');

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onChant: () => void,
  ) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    canvas.addEventListener('pointerdown', this.onCanvasDown);
    canvas.addEventListener('pointerup', this.onCanvasUp);
    canvas.addEventListener('pointercancel', this.onCanvasUp);
    this.chantButton.addEventListener('pointerdown', this.onChantDown);
    this.chantButton.addEventListener('pointerup', this.onChantUp);
    this.chantButton.addEventListener('pointercancel', this.onChantUp);
    this.chantButton.addEventListener('lostpointercapture', this.onChantUp);
    this.leftButton.addEventListener('pointerdown', this.onLeft);
    this.rightButton.addEventListener('pointerdown', this.onRight);
    this.startButton.addEventListener('click', this.onStart);
    this.resumeButton.addEventListener('click', this.onPause);
    for (const button of this.restartButtons) button.addEventListener('click', this.onRestart);
    for (const button of this.newSeedButtons) button.addEventListener('click', this.onNewSeed);
    this.pauseButton.addEventListener('click', this.onPause);
    this.muteButton.addEventListener('click', this.onMute);
  }

  read(): InputFrame {
    const frame: InputFrame = {
      laneDelta: Math.sign(this.laneDelta),
      chantHeld: this.chantHeld,
      start: this.startRequested,
      restart: this.restartRequested,
      newSeed: this.newSeedRequested,
      pause: this.pauseRequested,
      mute: this.muteRequested,
    };
    this.laneDelta = 0;
    this.startRequested = false;
    this.restartRequested = false;
    this.newSeedRequested = false;
    this.pauseRequested = false;
    this.muteRequested = false;
    return frame;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.canvas.removeEventListener('pointerdown', this.onCanvasDown);
    this.canvas.removeEventListener('pointerup', this.onCanvasUp);
    this.canvas.removeEventListener('pointercancel', this.onCanvasUp);
    this.chantButton.removeEventListener('pointerdown', this.onChantDown);
    this.chantButton.removeEventListener('pointerup', this.onChantUp);
    this.chantButton.removeEventListener('pointercancel', this.onChantUp);
    this.chantButton.removeEventListener('lostpointercapture', this.onChantUp);
    this.leftButton.removeEventListener('pointerdown', this.onLeft);
    this.rightButton.removeEventListener('pointerdown', this.onRight);
    this.startButton.removeEventListener('click', this.onStart);
    this.resumeButton.removeEventListener('click', this.onPause);
    for (const button of this.restartButtons) button.removeEventListener('click', this.onRestart);
    for (const button of this.newSeedButtons) button.removeEventListener('click', this.onNewSeed);
    this.pauseButton.removeEventListener('click', this.onPause);
    this.muteButton.removeEventListener('click', this.onMute);
  }

  private getElement<T extends HTMLElement>(selector: string): T {
    const element = document.querySelector<T>(selector);
    if (!element) throw new Error(`Missing input element: ${selector}`);
    return element;
  }
}
