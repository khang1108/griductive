import type { VerdictStatus } from "../types";

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const win = window as Window &
    typeof globalThis & { webkitAudioContext?: AudioContextConstructor };
  return win.AudioContext ?? win.webkitAudioContext ?? null;
}

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Pure Web Audio API procedural foley & ambient rain synthesizer.
 * AudioContext is lazily initialized strictly after a user gesture and
 * automatically suspends on tab hide, game pause, or mute.
 */
class MidnightSoundEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private userGestureObserved = false;

  private muted = false;
  private paused = false;
  private sfxVolume = 0.75;
  private ambientEnabled = false;
  private ambientVolume = 0.35;

  private rainSource: AudioBufferSourceNode | null = null;
  private rainGain: GainNode | null = null;
  private listenersAttached = false;

  constructor() {
    this.attachEnvironmentListeners();
  }

  private attachEnvironmentListeners(): void {
    if (this.listenersAttached || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }
    this.listenersAttached = true;

    const handleGesture = () => {
      this.userGestureObserved = true;
      if (this.shouldPlayAmbient()) {
        this.ensureRainNodes();
        this.resumeContextIfNeeded();
      }
      window.removeEventListener("pointerdown", handleGesture, true);
      window.removeEventListener("keydown", handleGesture, true);
    };

    window.addEventListener("pointerdown", handleGesture, { capture: true, passive: true });
    window.addEventListener("keydown", handleGesture, { capture: true, passive: true });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        void this.suspendAll();
      } else if (this.shouldPlayAmbient()) {
        this.ensureRainNodes();
        this.resumeContextIfNeeded();
        this.updateRainGain();
      }
    });
  }

  private isDocumentHidden(): boolean {
    return typeof document !== "undefined" && document.hidden;
  }

  private canEmitAudio(): boolean {
    return !this.muted && !this.paused && !this.isDocumentHidden();
  }

  private shouldPlayAmbient(): boolean {
    return (
      this.userGestureObserved &&
      this.ambientEnabled &&
      this.ambientVolume > 0 &&
      this.canEmitAudio()
    );
  }

  private ensureContext(fromUserAction: boolean): AudioContext | null {
    if (fromUserAction) {
      this.userGestureObserved = true;
    }
    if (!this.userGestureObserved) {
      return null;
    }
    if (!this.ctx) {
      const Ctor = getAudioContextConstructor();
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended" && this.canEmitAudio()) {
      void this.ctx.resume().catch(() => {
        // Ignore resume rejection if browser requires another gesture
      });
    }
    return this.ctx;
  }

  private resumeContextIfNeeded(): void {
    if (this.ctx && this.ctx.state === "suspended" && this.canEmitAudio()) {
      void this.ctx.resume().catch(() => {
        // Safe no-op
      });
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const durationSec = 2;
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    // Soft pink-ish filtered noise for realistic paper & rain textures
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.1848) * 0.18));
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private ensureRainNodes(): void {
    const ctx = this.ensureContext(false);
    if (!ctx) return;

    if (!this.rainGain) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.connect(ctx.destination);
      this.rainGain = gain;
    }

    if (!this.rainSource) {
      const source = ctx.createBufferSource();
      source.buffer = this.getNoiseBuffer(ctx);
      source.loop = true;

      const highpass = ctx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(220, ctx.currentTime);

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(1050, ctx.currentTime);

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(this.rainGain);
      source.start(0);
      this.rainSource = source;
    }
  }

  private updateRainGain(): void {
    if (!this.ctx || !this.rainGain) return;
    const target = this.shouldPlayAmbient()
      ? clampVolume(this.ambientVolume) * 0.16
      : 0;
    this.rainGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.08);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      void this.suspendAll();
    } else if (this.shouldPlayAmbient()) {
      this.ensureRainNodes();
      this.resumeContextIfNeeded();
      this.updateRainGain();
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    if (paused) {
      void this.suspendAll();
    } else if (this.shouldPlayAmbient()) {
      this.ensureRainNodes();
      this.resumeContextIfNeeded();
      this.updateRainGain();
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = clampVolume(volume);
  }

  syncAmbientRain(enabled: boolean, volume: number): void {
    this.ambientEnabled = enabled;
    this.ambientVolume = clampVolume(volume);

    if (!enabled || this.ambientVolume <= 0 || !this.canEmitAudio()) {
      this.updateRainGain();
      return;
    }

    if (this.userGestureObserved) {
      this.ensureRainNodes();
      this.resumeContextIfNeeded();
      this.updateRainGain();
    }
  }

  async suspendAll(): Promise<void> {
    if (!this.ctx) return;
    try {
      if (this.rainGain) {
        this.rainGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02);
      }
      if (this.ctx.state === "running") {
        await this.ctx.suspend();
      }
    } catch {
      // Safe fallback when AudioContext cannot suspend
    }
  }

  private prepareSfxContext(): { ctx: AudioContext; vol: number; now: number } | null {
    if (!this.canEmitAudio() || this.sfxVolume <= 0) return null;
    const ctx = this.ensureContext(true);
    if (!ctx) return null;
    return { ctx, vol: this.sfxVolume, now: ctx.currentTime };
  }

  /** Crisp dossier card rustle + light desk contact. */
  playPaperSelect(): void {
    const ready = this.prepareSfxContext();
    if (!ready) return;
    const { ctx, vol, now } = ready;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(1900, now);
    filter.frequency.exponentialRampToValueAtTime(950, now + 0.055);
    filter.Q.setValueAtTime(1.1, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.16 * vol, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now, Math.random() * 0.5, 0.075);

    const tap = ctx.createOscillator();
    tap.type = "triangle";
    tap.frequency.setValueAtTime(150, now);
    tap.frequency.exponentialRampToValueAtTime(75, now + 0.032);
    const tapGain = ctx.createGain();
    tapGain.gain.setValueAtTime(0.08 * vol, now);
    tapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    tap.connect(tapGain);
    tapGain.connect(ctx.destination);
    tap.start(now);
    tap.stop(now + 0.04);
  }

  /** Heavy rubber-ink stamp slam onto archival paper. */
  playStamp(status: VerdictStatus): void {
    const ready = this.prepareSfxContext();
    if (!ready) return;
    const { ctx, vol, now } = ready;

    // Desk thud
    const thud = ctx.createOscillator();
    thud.type = "sine";
    thud.frequency.setValueAtTime(status === "CRIMINAL" ? 128 : 148, now);
    thud.frequency.exponentialRampToValueAtTime(46, now + 0.11);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.32 * vol, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.125);
    thud.connect(thudGain);
    thudGain.connect(ctx.destination);
    thud.start(now);
    thud.stop(now + 0.13);

    // Ink pad snap
    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(820, now);
    filter.Q.setValueAtTime(0.9, now);
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.2 * vol, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now, Math.random() * 0.4, 0.065);

    // Subtle tonal seal cue
    const seal = ctx.createOscillator();
    seal.type = "triangle";
    const startFreq = status === "INNOCENT" ? 392 : 233.08;
    const endFreq = status === "INNOCENT" ? 523.25 : 220;
    seal.frequency.setValueAtTime(startFreq, now + 0.02);
    seal.frequency.exponentialRampToValueAtTime(endFreq, now + 0.16);
    const sealGain = ctx.createGain();
    sealGain.gain.setValueAtTime(0.001, now + 0.02);
    sealGain.gain.linearRampToValueAtTime(0.08 * vol, now + 0.04);
    sealGain.gain.exponentialRampToValueAtTime(0.001, now + 0.21);
    seal.connect(sealGain);
    sealGain.connect(ctx.destination);
    seal.start(now + 0.02);
    seal.stop(now + 0.22);
  }

  /** Fresh evidence slip appearing in notebook. */
  playClueReveal(): void {
    const ready = this.prepareSfxContext();
    if (!ready) return;
    const { ctx, vol, now } = ready;

    // Paper slide
    const slide = ctx.createBufferSource();
    slide.buffer = this.getNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.setValueAtTime(2100, now);
    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0.001, now);
    slideGain.gain.linearRampToValueAtTime(0.11 * vol, now + 0.015);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);
    slide.connect(hp);
    hp.connect(slideGain);
    slideGain.connect(ctx.destination);
    slide.start(now, Math.random() * 0.5, 0.085);

    // Warm two-note amber chime
    const notes = [523.25, 659.25];
    notes.forEach((freq, idx) => {
      const start = now + 0.03 + idx * 0.065;
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.085 * vol, start + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.21);
    });
  }

  /** Dry graphite pencil tick for hypothesis / pin toggles. */
  playPencilTick(): void {
    const ready = this.prepareSfxContext();
    if (!ready) return;
    const { ctx, vol, now } = ready;

    const noise = ctx.createBufferSource();
    noise.buffer = this.getNoiseBuffer(ctx);
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(3600, now);
    filter.Q.setValueAtTime(1.8, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.13 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now, Math.random() * 0.5, 0.035);
  }

  /** Muted wooden desk knock when a claim is NOT_PROVABLE or CONTRADICTED. */
  playReject(): void {
    const ready = this.prepareSfxContext();
    if (!ready) return;
    const { ctx, vol, now } = ready;

    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(165, now);
    osc.frequency.exponentialRampToValueAtTime(92, now + 0.11);

    const osc2 = ctx.createOscillator();
    osc2.type = "sine";
    osc2.frequency.setValueAtTime(116, now);
    osc2.frequency.exponentialRampToValueAtTime(78, now + 0.12);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.15 * vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.135);

    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc2.start(now);
    osc.stop(now + 0.14);
    osc2.stop(now + 0.14);
  }

  /** Warm noir brass-and-wood case closed chord. */
  playCaseClosed(): void {
    const ready = this.prepareSfxContext();
    if (!ready) return;
    const { ctx, vol, now } = ready;

    // Folder latch click
    const latch = ctx.createOscillator();
    latch.type = "triangle";
    latch.frequency.setValueAtTime(220, now);
    latch.frequency.exponentialRampToValueAtTime(90, now + 0.06);
    const latchGain = ctx.createGain();
    latchGain.gain.setValueAtTime(0.14 * vol, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    latch.connect(latchGain);
    latchGain.connect(ctx.destination);
    latch.start(now);
    latch.stop(now + 0.08);

    // Warm resolved triad (D minor-major archive warmth -> Fmaj7)
    const freqs = [293.66, 349.23, 440.0, 523.25];
    freqs.forEach((freq, i) => {
      const start = now + 0.05 + i * 0.075;
      const osc = ctx.createOscillator();
      osc.type = i === 0 ? "triangle" : "sine";
      osc.frequency.setValueAtTime(freq, start);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.085 * vol, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.72);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.75);
    });
  }
}

export const soundEngine = new MidnightSoundEngine();

export const playPaperSelect = () => soundEngine.playPaperSelect();
export const playStamp = (status: VerdictStatus) => soundEngine.playStamp(status);
export const playClueReveal = () => soundEngine.playClueReveal();
export const playPencilTick = () => soundEngine.playPencilTick();
export const playReject = () => soundEngine.playReject();
export const playCaseClosed = () => soundEngine.playCaseClosed();
export const syncAmbientRain = (enabled: boolean, volume: number) =>
  soundEngine.syncAmbientRain(enabled, volume);
export const suspendAll = () => soundEngine.suspendAll();
export const setSoundMuted = (muted: boolean) => soundEngine.setMuted(muted);
export const setSoundPaused = (paused: boolean) => soundEngine.setPaused(paused);
export const setSfxVolume = (volume: number) => soundEngine.setSfxVolume(volume);
