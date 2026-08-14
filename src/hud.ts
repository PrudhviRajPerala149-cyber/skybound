/** Compass ribbon geometry: how many pixels one degree of heading occupies. */
const PIXELS_PER_DEGREE = 3.2;
const CARDINALS: Record<number, string> = {
  0: "N",
  45: "NE",
  90: "E",
  135: "SE",
  180: "S",
  225: "SW",
  270: "W",
  315: "NW",
};

/** World units/sec → knots, and world units → feet. Flavour, not physics. */
const KNOTS_PER_UNIT = 1.94;
const FEET_PER_UNIT = 12;

/** Text updates run at ~10Hz; per-frame DOM writes are wasted layout work. */
const TEXT_INTERVAL = 0.1;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
}

export class Hud {
  private readonly root = el("hud");
  private readonly ribbon = el("compass-ribbon");
  private readonly heading = el("compass-heading");
  private readonly speed = el("readout-speed");
  private readonly altitude = el("readout-altitude");

  private textTimer = 0;

  constructor() {
    this.buildCompassTicks();
  }

  /**
   * Three full 360° spans laid end to end, so the ribbon can be scrolled
   * continuously without a visible seam at the wrap point.
   */
  private buildCompassTicks(): void {
    const fragment = document.createDocumentFragment();

    for (let span = -1; span <= 1; span++) {
      for (let deg = 0; deg < 360; deg += 15) {
        const label = CARDINALS[deg];
        const tick = document.createElement("div");
        tick.className = `compass__tick${label ? " compass__tick--major" : ""}`;
        tick.style.left = `${(deg + span * 360) * PIXELS_PER_DEGREE}px`;

        if (label) {
          const text = document.createElement("span");
          text.textContent = label;
          tick.appendChild(text);
        }

        fragment.appendChild(tick);
      }
    }

    this.ribbon.appendChild(fragment);
  }

  reveal(): void {
    this.root.classList.add("is-live");
    this.root.setAttribute("aria-hidden", "false");
  }

  update(dt: number, headingDeg: number, speedUnits: number, altitudeUnits: number): void {
    // The ribbon itself moves every frame — it is a transform, so it is cheap
    // and stutter would be obvious.
    const centre = this.ribbon.parentElement!.clientWidth / 2;
    this.ribbon.style.transform = `translateX(${centre - headingDeg * PIXELS_PER_DEGREE}px)`;

    this.textTimer += dt;
    if (this.textTimer < TEXT_INTERVAL) return;
    this.textTimer = 0;

    this.heading.textContent = `${Math.round(headingDeg).toString().padStart(3, "0")}°`;
    this.speed.textContent = Math.round(speedUnits * KNOTS_PER_UNIT).toString();
    this.altitude.textContent = Math.round(
      altitudeUnits * FEET_PER_UNIT,
    ).toLocaleString("en-US");
  }
}

/** Start screen: loading progress, then hand off to the flight. */
export class StartScreen {
  private readonly screen = el("start-screen");
  private readonly button = el<HTMLButtonElement>("start-button");
  private readonly fill = el("loading-fill");
  private readonly status = el("loading-status");
  private readonly loading = el("start-loading");

  setProgress(fraction: number): void {
    this.fill.style.width = `${Math.round(fraction * 100)}%`;
  }

  setReady(): void {
    this.fill.style.width = "100%";
    this.status.textContent = "The sky is ready";
    this.loading.classList.add("is-done");
    this.button.disabled = false;
  }

  setFailed(message: string): void {
    this.status.textContent = message;
  }

  onBegin(handler: () => void): void {
    this.button.addEventListener("click", () => {
      this.screen.classList.add("is-dismissed");
      handler();
    });
  }
}

/** Credits panel toggle. */
export class Credits {
  private readonly panel = el("credits");
  private readonly toggle = el("credits-toggle");

  constructor() {
    this.toggle.addEventListener("click", () => {
      this.panel.hidden = !this.panel.hidden;
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.panel.hidden = true;
    });
  }
}
