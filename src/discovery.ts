import type { ResumeSection } from "./content/resume";
import type { Ambience } from "./audio";

/** How long the toast sits alone before the panel slides in behind it. */
const PANEL_DELAY = 1500;
const TOAST_DURATION = 3200;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
}

/**
 * Owns everything that happens after the ship reaches a beacon: the cue, the
 * log, the toast, and the reading panel. The 3D side knows nothing about any
 * of this — it just reports that a landmark was reached.
 */
export class Discovery {
  private readonly trackerList = el("tracker-list");
  private readonly trackerFound = el("tracker-found");
  private readonly trackerTotal = el("tracker-total");
  private readonly trackerFill = el("tracker-fill");

  private readonly toast = el("toast");
  private readonly toastTitle = el("toast-title");

  private readonly scrim = el("reader-scrim");
  private readonly readerEyebrow = el("reader-eyebrow");
  private readonly readerTitle = el("reader-title");
  private readonly readerBody = el("reader-body");

  private readonly rows = new Map<string, HTMLElement>();
  private readonly found = new Set<string>();

  private toastTimer?: number;
  private panelTimer?: number;

  /**
   * `onModalChange` lets the caller suspend the flight controls while a
   * section is open. Discovery stays unaware of the ship itself.
   */
  constructor(
    private readonly sections: ResumeSection[],
    private readonly ambience: Ambience,
    private readonly onModalChange: (open: boolean) => void = () => {},
  ) {
    this.buildTracker();

    el("reader-close").addEventListener("click", () => this.closeReader());
    el("reader-dismiss").addEventListener("click", () => this.closeReader());

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") this.closeReader();
    });
  }

  /** True while a section panel has the screen. */
  get isOpen(): boolean {
    return !this.scrim.hidden;
  }

  private buildTracker(): void {
    this.trackerTotal.textContent = String(this.sections.length);
    this.trackerFound.textContent = "0";

    for (const section of this.sections) {
      const row = document.createElement("li");
      row.className = "tracker__row";
      row.innerHTML = `<span class="tracker__mark"></span><span class="tracker__name"></span>`;
      // textContent rather than interpolation: section titles are author data,
      // but they should never be able to inject markup.
      row.querySelector<HTMLElement>(".tracker__name")!.textContent = section.title;

      this.trackerList.appendChild(row);
      this.rows.set(section.id, row);
    }
  }

  /** Called once, the moment the ship first reaches a landmark. */
  record(section: ResumeSection): void {
    if (this.found.has(section.id)) return;
    this.found.add(section.id);

    this.ambience.playDiscoveryCue();

    const row = this.rows.get(section.id);
    row?.classList.add("is-found");

    this.trackerFound.textContent = String(this.found.size);
    this.trackerFill.style.width = `${(this.found.size / this.sections.length) * 100}%`;

    this.showToast(section);

    // A beat of "you found something" before the reading panel takes over.
    window.clearTimeout(this.panelTimer);
    this.panelTimer = window.setTimeout(
      () => this.openReader(section),
      PANEL_DELAY,
    );
  }

  private showToast(section: ResumeSection): void {
    this.toastTitle.textContent = section.title;
    this.toast.hidden = false;
    // Restart the animation even if a toast is already on screen.
    this.toast.classList.remove("is-live");
    void this.toast.offsetWidth;
    this.toast.classList.add("is-live");

    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove("is-live");
      this.toast.hidden = true;
    }, TOAST_DURATION);
  }

  openReader(section: ResumeSection): void {
    this.readerEyebrow.textContent = section.eyebrow;
    this.readerTitle.textContent = section.title;

    this.readerBody.replaceChildren(
      ...section.body.map((text) => {
        const p = document.createElement("p");
        p.textContent = text;
        return p;
      }),
    );

    this.scrim.hidden = false;
    // Next frame, so the opening transition actually runs.
    requestAnimationFrame(() => this.scrim.classList.add("is-open"));

    this.onModalChange(true);
  }

  /**
   * Hands control back to the ship. Safe to call when nothing is open, which
   * matters because Escape is a global handler.
   */
  closeReader(): void {
    window.clearTimeout(this.panelTimer);
    if (this.scrim.hidden) return;

    this.scrim.classList.remove("is-open");
    this.scrim.hidden = true;

    this.onModalChange(false);
  }

  get foundCount(): number {
    return this.found.size;
  }
}
