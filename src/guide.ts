import * as THREE from "three";
import type { LandmarkField, Landmark } from "./scene/landmarks";
import { completionStory } from "./content/resume";

/** Text is rewritten a few times a second; the arrow moves every frame. */
const TEXT_INTERVAL = 0.2;

/** World units to the visitor-facing distance unit used on the HUD. */
const UNITS_TO_FEET = 12;

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: #${id}`);
  return node as T;
}

/**
 * The on-screen heading prompt: which island to make for next, told in the
 * log's voice, with an arrow that swings to point at it.
 *
 * The arrow works in bearings rather than screen projection, so it stays
 * meaningful when the target is behind the ship — it simply points backwards
 * — where a projected marker would have to be clamped to an edge.
 */
export class Guide {
  private readonly root = el("guide");
  private readonly pointer = el("guide-pointer");
  private readonly story = el("guide-story");
  private readonly target = el("guide-target");
  private readonly distance = el("guide-distance");

  private textTimer = 0;
  private currentId: string | null = null;
  private angle = 0;

  constructor(private readonly landmarks: LandmarkField) {}

  /**
   * `heading` is the ship's heading in radians using the same convention as
   * the compass: 0 is -Z, increasing clockwise.
   */
  update(dt: number, shipPosition: THREE.Vector3, heading: number): void {
    const next = this.nearestUnfound(shipPosition);

    if (!next) {
      this.showCompletion();
      return;
    }

    this.root.hidden = false;

    // Bearing to the target in the same frame of reference as the heading.
    const dx = next.position.x - shipPosition.x;
    const dz = next.position.z - shipPosition.z;
    const bearing = Math.atan2(dx, -dz);

    // Shortest way round, so the arrow never spins the long way.
    let delta = bearing - heading;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));

    // Eased so a hard turn of the helm doesn't make the arrow twitch.
    this.angle += (delta - this.angle) * Math.min(1, 9 * dt);
    this.pointer.style.transform = `rotate(${this.angle}rad)`;

    this.textTimer += dt;
    if (this.textTimer < TEXT_INTERVAL && this.currentId === next.section.id) {
      return;
    }
    this.textTimer = 0;

    if (this.currentId !== next.section.id) {
      this.currentId = next.section.id;
      this.story.textContent = next.section.hint;
      this.target.textContent = next.section.title;

      // Replay the entrance whenever the target changes.
      this.root.classList.remove("is-fresh");
      void this.root.offsetWidth;
      this.root.classList.add("is-fresh");
    }

    const range = Math.round(
      (Math.hypot(dx, dz) * UNITS_TO_FEET) / 100,
    ) * 100;
    this.distance.textContent = `${range.toLocaleString("en-US")} ft`;
  }

  private showCompletion(): void {
    if (this.currentId === "__done__") return;
    this.currentId = "__done__";

    this.root.hidden = false;
    this.root.classList.add("is-done");
    this.story.textContent = completionStory;
    this.target.textContent = "";
    this.distance.textContent = "";
    this.pointer.style.transform = "rotate(0rad)";
  }

  /** Nearest by horizontal distance — altitude shouldn't reorder the chain. */
  private nearestUnfound(from: THREE.Vector3): Landmark | null {
    let best: Landmark | null = null;
    let bestDistance = Infinity;

    for (const landmark of this.landmarks.landmarks) {
      if (landmark.found) continue;

      const distance = Math.hypot(
        landmark.position.x - from.x,
        landmark.position.z - from.z,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = landmark;
      }
    }

    return best;
  }
}
