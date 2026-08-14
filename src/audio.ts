import { assetUrl } from "./assets";

const STORAGE_KEY = "skybound:muted";
const VOLUME = 0.35;

/**
 * Background music. Browsers block autoplay, so playback is deliberately
 * deferred to the start screen's click — a genuine user gesture.
 */
export class Ambience {
  private readonly element: HTMLAudioElement;
  private muted: boolean;
  private context?: AudioContext;

  constructor(private readonly onChange: (muted: boolean) => void) {
    this.element = new Audio(assetUrl("assets/music/adventure-documentary.mp3"));
    this.element.loop = true;
    this.element.volume = VOLUME;
    this.element.preload = "auto";

    this.muted = localStorage.getItem(STORAGE_KEY) === "true";
    this.element.muted = this.muted;
    this.onChange(this.muted);
  }

  start(): void {
    // A rejected play() is not worth surfacing: the visitor can still fly.
    void this.element.play().catch(() => {});
  }

  toggle(): void {
    this.muted = !this.muted;
    this.element.muted = this.muted;
    localStorage.setItem(STORAGE_KEY, String(this.muted));
    this.onChange(this.muted);
  }

  get isMuted(): boolean {
    return this.muted;
  }

  /**
   * A short two-note chime for landmark discoveries, synthesised rather than
   * loaded so it costs nothing and always sits in tune with itself. Follows
   * the mute toggle, and the context is created lazily because it can only be
   * started from a user gesture.
   */
  playDiscoveryCue(): void {
    if (this.muted) return;

    try {
      this.context ??= new AudioContext();
      const ctx = this.context;
      if (ctx.state === "suspended") void ctx.resume();

      // A perfect fifth, the second note arriving just behind the first.
      for (const [frequency, delay] of [
        [784, 0],
        [1175, 0.11],
      ]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = ctx.currentTime + delay;

        osc.type = "sine";
        osc.frequency.value = frequency;

        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.22, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.1);

        osc.connect(gain).connect(ctx.destination);
        osc.start(at);
        osc.stop(at + 1.2);
      }
    } catch {
      /* audio is a nicety; never let it break the flight */
    }
  }

  /** Playback state, for debugging from the console. */
  get state(): { paused: boolean; muted: boolean; time: number } {
    return {
      paused: this.element.paused,
      muted: this.element.muted,
      time: this.element.currentTime,
    };
  }
}
