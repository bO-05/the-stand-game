import type { GamePhase, Judgement } from '../game/LevelModel';

export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private crowd: GainNode | null = null;
  private crowdSource: AudioBufferSourceNode | null = null;
  private muted = false;

  async unlock(): Promise<void> {
    if (this.context) {
      if (this.context.state !== 'running') await this.context.resume();
      return;
    }
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    this.context = new AudioContextClass();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : 0.72;
    this.master.connect(this.context.destination);
    this.createCrowdBed();
    await this.context.resume();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.72, this.context.currentTime, 0.03);
    }
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  update(energy: number, streak: number, phase: GamePhase): void {
    if (!this.context || !this.crowd) return;
    const active = phase === 'playing' || phase === 'recovery' || phase === 'finale' || phase === 'rally';
    const target = active ? 0.012 + energy * 0.00022 + Math.min(streak, 35) * 0.00025 : 0.005;
    this.crowd.gain.setTargetAtTime(target, this.context.currentTime, 0.18);
  }

  beat(accent: boolean): void {
    this.tone(accent ? 96 : 76, 0.045, accent ? 0.055 : 0.025, 'sine', accent ? 0 : -12);
  }

  judgement(grade: Judgement, streak: number): void {
    if (grade === 'perfect') {
      this.tone(420 + Math.min(streak, 30) * 5, 0.13, 0.085, 'triangle', 280);
      this.noise(0.045, 0.022, 1700);
    } else if (grade === 'good') {
      this.tone(310, 0.1, 0.06, 'triangle', 120);
    } else if (grade === 'miss') {
      this.tone(92, 0.18, 0.065, 'sawtooth', -38);
    }
  }

  hazard(): void {
    this.noise(0.22, 0.11, 480);
    this.tone(61, 0.25, 0.07, 'square', -18);
  }

  cycleClear(): void {
    [0, 0.11, 0.22, 0.36].forEach((delay, index) => this.tone(220 * Math.pow(1.25, index), 0.22, 0.075, 'triangle', 140, delay));
  }

  rally(): void {
    this.tone(144, 0.5, 0.1, 'sawtooth', 110);
  }

  finish(): void {
    [0, 0.14, 0.28, 0.48, 0.7].forEach((delay, index) => this.tone(196 * Math.pow(1.19, index), 0.45, 0.08, 'triangle', 180, delay));
    this.noise(1.2, 0.055, 900, 0.12);
  }

  dispose(): void {
    this.crowdSource?.stop();
    void this.context?.close();
    this.context = null;
    this.master = null;
    this.crowd = null;
  }

  private createCrowdBed(): void {
    if (!this.context || !this.master) return;
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = last * 0.985 + white * 0.015;
      data[i] = last * 0.65 + white * 0.035;
    }
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    source.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 520;
    filter.Q.value = 0.55;
    gain.gain.value = 0.008;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.crowdSource = source;
    this.crowd = gain;
  }

  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType,
    frequencyDelta: number,
    delay = 0,
  ): void {
    if (!this.context || !this.master || this.muted) return;
    const now = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, frequency + frequencyDelta), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(volume, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  private noise(duration: number, volume: number, cutoff: number, delay = 0): void {
    if (!this.context || !this.master || this.muted) return;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const now = this.context.currentTime + delay;
    source.buffer = buffer;
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now);
  }
}
