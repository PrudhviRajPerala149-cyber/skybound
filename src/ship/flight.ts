import * as THREE from "three";
import type { ShipRig } from "./ship";

const LOOK_SENSITIVITY = 0.0022;
const MAX_PITCH = THREE.MathUtils.degToRad(80);

/**
 * How quickly the ship's actual heading catches up to where the mouse has
 * asked it to point. Higher is snappier, lower is floatier; this is the one
 * value to tune if the mouse feels heavy or too loose.
 */
const LOOK_SMOOTHING = 14;

/**
 * Largest movement accepted from a single mouse event, in pixels. Pointer
 * lock occasionally emits a huge spike — on acquiring the lock, or when the
 * OS applies acceleration to a fast flick — which would otherwise whip the
 * ship right around.
 */
const MAX_LOOK_STEP = 110;

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

  /**
   * Where the ship is actually pointing. The mouse steers `targetYaw` /
   * `targetPitch`, and these ease toward it every frame, which is what turns
   * a burst of raw mouse events into smooth motion.
   *
   * Assigning to either snaps both the live and target value, so teleporting
   * the ship never leaves it fighting a stale target.
   */
  private _yaw = 0;
  private _pitch = -0.05;

  private targetYaw = 0;
  private targetPitch = -0.05;

  /** Mouse movement received since the last frame, in pixels. */
  private pendingLookX = 0;
  private pendingLookY = 0;

  /** Facing -Z from the spawn point, i.e. in toward the archipelago. */
  get yaw(): number {
    return this._yaw;
  }

  set yaw(value: number) {
    this._yaw = value;
    this.targetYaw = value;
  }

  get pitch(): number {
    return this._pitch;
  }

  set pitch(value: number) {
    this._pitch = THREE.MathUtils.clamp(value, -MAX_PITCH, MAX_PITCH);
    this.targetPitch = this._pitch;
  }

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

  /**
   * Both look paths funnel through here so they behave identically.
   *
   * Mouse events arrive at the pointing device's polling rate, which is
   * unrelated to the frame rate — several can land between two frames, or
   * none at all. Banking them up and spending them once per frame in
   * `update` is what keeps the motion even.
   */
  private applyLook(dx: number, dy: number): void {
    this.pendingLookX += THREE.MathUtils.clamp(dx, -MAX_LOOK_STEP, MAX_LOOK_STEP);
    this.pendingLookY += THREE.MathUtils.clamp(dy, -MAX_LOOK_STEP, MAX_LOOK_STEP);
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

    // Spend a frame's worth of mouse movement, then let the keys steer the
    // same target so both inputs share one smoothing path.
    this.targetYaw -= this.pendingLookX * LOOK_SENSITIVITY;
    this.targetPitch = THREE.MathUtils.clamp(
      this.targetPitch - this.pendingLookY * LOOK_SENSITIVITY,
      -MAX_PITCH,
      MAX_PITCH,
    );
    this.pendingLookX = 0;
    this.pendingLookY = 0;

    if (this.active) {
      this.targetYaw += turnInput * YAW_RATE * dt;
    }

    // Framerate-independent ease, so the feel is identical at 30 and 144fps.
    const follow = 1 - Math.exp(-LOOK_SMOOTHING * dt);
    const previousYaw = this._yaw;
    this._yaw += (this.targetYaw - this._yaw) * follow;
    this._pitch += (this.targetPitch - this._pitch) * follow;

    // Orientation first, so thrust is applied along the current heading.
    this.euler.set(this._pitch, this._yaw, 0);
    this.rig.root.quaternion.setFromEuler(this.euler);

    // Bank from how fast the ship is actually turning rather than from the
    // keys alone, so steering with the mouse leans into the turn too.
    //
    // The dt guard matters: Clock.getDelta() returns 0 when two frames land in
    // the same tick, and 0/0 would put a NaN into the hull's rotation, which
    // is sticky and would make the ship disappear.
    const turnAmount =
      dt > 0
        ? THREE.MathUtils.clamp((this._yaw - previousYaw) / dt / YAW_RATE, -1, 1)
        : 0;

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

    this.updateCosmetics(dt, turnAmount, boosting);
  }

  /** Banking, boost lean and idle bob — visual only. */
  private updateCosmetics(dt: number, turnAmount: number, boosting: boolean): void {
    const targetBank = turnAmount * MAX_BANK;
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
