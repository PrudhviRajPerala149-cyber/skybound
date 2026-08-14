import * as THREE from "three";
import type { ShipRig } from "./ship";

const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = THREE.MathUtils.degToRad(80);

const THRUST = 42;
const VERTICAL_THRUST = 22;
const YAW_RATE = 1.5;
const BOOST_MULTIPLIER = 2.2;
const MAX_SPEED = 52;
/**
 * Per 1/60s, rescaled by dt so framerate never matters. Drag and thrust
 * together settle at roughly THRUST/60 * D / (1 - D) — about 45u/s cruising
 * and 100 on boost, which crosses the gaps between islands at a pace that
 * still feels like an airship rather than a jet.
 */
const DAMPING = 0.985;

const MAX_BANK = 0.5;
const BANK_EASE = 4.2;

/**
 * Pointer lock is refused outright in some contexts — an embedded iframe, or
 * a browser that has just exited lock. That is not an error worth surfacing:
 * the click-drag fallback covers it, so swallow the rejection rather than
 * letting it escape as an unhandled promise.
 */
export function requestPointerLock(element: HTMLElement): void {
  try {
    const result = element.requestPointerLock() as unknown;
    if (result instanceof Promise) result.catch(() => {});
  } catch {
    /* fall back to click-drag look */
  }
}

/**
 * Free-flight model. Orientation is stored as yaw/pitch and applied as a YXZ
 * Euler, so roll can never accumulate into the flight basis — visual banking
 * lives entirely on the cosmetic mesh pivot.
 */
export class FlightController {
  readonly position = new THREE.Vector3(0, 26, 96);
  readonly velocity = new THREE.Vector3();

  /** Facing -Z from the spawn point, i.e. in toward the archipelago. */
  yaw = 0;
  pitch = -0.05;

  /** Ground speed in world units/second. */
  get speed(): number {
    return this.velocity.length();
  }

  private readonly keys = new Set<string>();
  private readonly forward = new THREE.Vector3();
  private readonly euler = new THREE.Euler(0, 0, 0, "YXZ");

  private bank = 0;
  private dragging = false;
  private lastPointer: { x: number; y: number } | null = null;
  private active = false;
  private elapsed = 0;

  constructor(
    private readonly rig: ShipRig,
    private readonly canvas: HTMLCanvasElement,
  ) {
    this.bindInput();
  }

  /** Enabled once the start screen is dismissed. */
  activate(): void {
    this.active = true;
  }

  private bindInput(): void {
    window.addEventListener("keydown", (e) => {
      if (!this.active) return;
      // Space and arrows would otherwise scroll the page.
      if (
        [" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
      }
      this.keys.add(e.code);
    });

    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    // A held key must not stick when focus leaves the window.
    const release = () => this.keys.clear();
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", release);

    // Pointer lock is the primary look control.
    this.canvas.addEventListener("click", () => {
      if (this.active && !document.pointerLockElement) {
        requestPointerLock(this.canvas);
      }
    });

    document.addEventListener("mousemove", (e) => {
      if (!this.active) return;

      if (document.pointerLockElement === this.canvas) {
        this.applyLook(e.movementX, e.movementY);
        return;
      }

      // Click-drag fallback for when pointer lock is unavailable or exited.
      if (this.dragging && this.lastPointer) {
        this.applyLook(
          e.clientX - this.lastPointer.x,
          e.clientY - this.lastPointer.y,
        );
        this.lastPointer = { x: e.clientX, y: e.clientY };
      }
    });

    this.canvas.addEventListener("mousedown", (e) => {
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener("mouseup", () => {
      this.dragging = false;
      this.lastPointer = null;
    });
  }

  /** Both look paths funnel through here so they behave identically. */
  private applyLook(dx: number, dy: number): void {
    this.yaw -= dx * LOOK_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch - dy * LOOK_SENSITIVITY,
      -MAX_PITCH,
      MAX_PITCH,
    );
  }

  update(dt: number): void {
    this.elapsed += dt;

    const k = this.keys;
    const boosting = k.has("ShiftLeft") || k.has("ShiftRight");

    const thrustInput =
      (k.has("KeyW") || k.has("ArrowUp") ? 1 : 0) -
      (k.has("KeyS") || k.has("ArrowDown") ? 1 : 0);
    const turnInput =
      (k.has("KeyA") || k.has("ArrowLeft") ? 1 : 0) -
      (k.has("KeyD") || k.has("ArrowRight") ? 1 : 0);
    const liftInput =
      (k.has("Space") ? 1 : 0) -
      (k.has("ControlLeft") || k.has("ControlRight") ? 1 : 0);

    if (this.active) {
      this.yaw += turnInput * YAW_RATE * dt;
    }

    // Orientation first, so thrust is applied along the current heading.
    this.euler.set(this.pitch, this.yaw, 0);
    this.rig.root.quaternion.setFromEuler(this.euler);

    if (this.active) {
      const power = boosting ? BOOST_MULTIPLIER : 1;

      this.forward.set(0, 0, -1).applyEuler(this.euler);
      this.velocity.addScaledVector(
        this.forward,
        thrustInput * THRUST * power * dt,
      );
      this.velocity.y += liftInput * VERTICAL_THRUST * power * dt;
    }

    // Framerate-independent drag, then a hard speed ceiling.
    this.velocity.multiplyScalar(Math.pow(DAMPING, dt * 60));
    const ceiling = MAX_SPEED * (boosting ? BOOST_MULTIPLIER : 1);
    if (this.velocity.lengthSq() > ceiling * ceiling) {
      this.velocity.setLength(ceiling);
    }

    this.position.addScaledVector(this.velocity, dt);
    this.rig.root.position.copy(this.position);

    this.updateCosmetics(dt, turnInput, boosting);
  }

  /** Banking, boost lean and idle bob — visual only. */
  private updateCosmetics(dt: number, turnInput: number, boosting: boolean): void {
    const targetBank = turnInput * MAX_BANK;
    this.bank += (targetBank - this.bank) * Math.min(1, BANK_EASE * dt);

    this.rig.mesh.rotation.z = this.bank;
    this.rig.mesh.rotation.x = boosting ? -0.06 : 0;
    this.rig.mesh.position.y = Math.sin(this.elapsed * 0.9) * 0.16;
  }

  /** World-space heading in degrees, 0 = north. */
  get headingDegrees(): number {
    return (THREE.MathUtils.radToDeg(-this.yaw) % 360 + 360) % 360;
  }
}
