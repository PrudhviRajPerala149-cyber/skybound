import { assetUrl } from "./assets";

const STORAGE_KEY = "skybound:muted";
const VOLUME = 0.35;

/** How far the music drops while an arrival chime rings, and for how long. */
const DUCK_VOLUME = 0.1;
const DUCK_RELEASE_MS = 1400;

/**
 * An ascending arrival figure — the root, its fifth, and the octave above.
 * Each entry is [frequency, delay in seconds].
 */
const ARRIVAL_NOTES: Array<[number, number]> = [
  [587.33, 0],
  [880.0, 0.1],
  [1174.66, 0.2],
];

/**
 * Background music. Browsers block autoplay, so playback is deliberately
 * deferred to the start screen's click — a genuine user gesture.
 */
export class Ambience {
  private readonly element: HTMLAudioElement;
  private muted: boolean;
  private context?: AudioContext;
  private duckTimer?: number;

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
    // Build the audio graph here, inside the start-screen click. Browsers only
    // reliably let an AudioContext begin from a real user gesture, and creating
    // it lazily at the first discovery instead left it suspended on stricter
    // browsers — the chime would schedule and never be heard.
    this.ensureContext();

    // A rejected play() is not worth surfacing: the visitor can still fly.
    void this.element.play().catch(() => {});
  }

  private ensureContext(): AudioContext | null {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === "suspended") void this.context.resume();
      return this.context;
    } catch {
      return null;
    }
  }

  /**
   * Dips the music under the chime so it is heard rather than buried, then
   * fades it back. Stepped on a timer because the music is a plain audio
   * element, not a node in the graph.
   */
  private duckMusic(): void {
    window.clearInterval(this.duckTimer);
    this.element.volume = DUCK_VOLUME;

    const steps = 24;
    let step = 0;
    this.duckTimer = window.setInterval(() => {
      step += 1;
      const t = step / steps;
      this.element.volume = DUCK_VOLUME + (VOLUME - DUCK_VOLUME) * t * t;
      if (step >= steps) {
        window.clearInterval(this.duckTimer);
        this.element.volume = VOLUME;
      }
    }, DUCK_RELEASE_MS / steps);
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
   * The arrival chime: a rising three-note figure, each note a pair of
   * slightly detuned oscillators so it rings like struck metal rather than a
   * bare test tone. Synthesised rather than loaded, so it costs no download
   * and is always in tune with itself.
   */
  playDiscoveryCue(): void {
    if (this.muted) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // One bus for the whole chime, so its level is set in a single place.
      const bus = ctx.createGain();
      bus.gain.value = 0.55;
      bus.connect(ctx.destination);

      for (const [frequency, delay] of ARRIVAL_NOTES) {
        const at = now + delay;

        // A touch of detune between the pair gives the note a slow shimmer.
        for (const [type, cents, level] of [
          ["sine", 0, 1],
          ["triangle", 6, 0.35],
        ] as Array<[OscillatorType, number, number]>) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = type;
          osc.frequency.value = frequency;
          osc.detune.value = cents;

          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(level, at + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.5);

          osc.connect(gain).connect(bus);
          osc.start(at);
          osc.stop(at + 1.6);
        }
      }

      this.duckMusic();
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
