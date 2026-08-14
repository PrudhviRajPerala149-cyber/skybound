import * as THREE from "three";
import type { ShipRig } from "./ship";
import type { Archipelago } from "../scene/islands";

const BASE_OFFSET = new THREE.Vector3(0, 2.3, 8.6);
/** Extra trail-back at top speed, for a sense of acceleration. */
const SPEED_PULLBACK = 3.2;
const LOOK_AHEAD = 6;

const POSITION_DAMPING = 5.2;
const TARGET_DAMPING = 7.5;

/**
 * Third-person chase camera. Smoothing uses 1 - exp(-k*dt) rather than a raw
 * lerp constant so the follow feels the same at 30fps and 144fps.
 */
export class ChaseCamera {
  private readonly desired = new THREE.Vector3();
  private readonly lookTarget = new THREE.Vector3();
  private readonly smoothedTarget = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly toCamera = new THREE.Vector3();

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly rig: ShipRig,
    private readonly world: Archipelago,
  ) {
    this.smoothedTarget.copy(rig.root.position);
    camera.position.copy(rig.root.position).add(BASE_OFFSET);
  }

  update(dt: number, speed: number, maxSpeed: number): void {
    const pull = Math.min(speed / maxSpeed, 1.4) * SPEED_PULLBACK;

    this.offset.copy(BASE_OFFSET).setZ(BASE_OFFSET.z + pull);
    this.desired.copy(this.offset).applyQuaternion(this.rig.root.quaternion);
    this.desired.add(this.rig.root.position);

    this.avoidTerrain();

    this.camera.position.lerp(this.desired, 1 - Math.exp(-POSITION_DAMPING * dt));

    // Aim slightly ahead of the ship rather than at it, which keeps the
    // horizon steady while turning.
    this.lookTarget
      .set(0, 0, -LOOK_AHEAD)
      .applyQuaternion(this.rig.root.quaternion)
      .add(this.rig.root.position);

    this.smoothedTarget.lerp(this.lookTarget, 1 - Math.exp(-TARGET_DAMPING * dt));
    this.camera.lookAt(this.smoothedTarget);
  }

  /**
   * Pulls the camera in if an island sits between it and the ship, so the
   * view never ends up buried inside rock.
   */
  private avoidTerrain(): void {
    this.toCamera.copy(this.desired).sub(this.rig.root.position);
    const distance = this.toCamera.length();
    if (distance < 0.001) return;
    this.toCamera.divideScalar(distance);

    let allowed = distance;

    for (const collider of this.world.colliders) {
      const padded = collider.radius + 1.5;
      if (this.desired.distanceTo(collider.center) > padded) continue;

      // Camera is inside this collider — walk it back toward the ship.
      const clearance =
        collider.center.distanceTo(this.rig.root.position) - padded;
      allowed = Math.min(allowed, Math.max(clearance, 3));
    }

    if (allowed < distance) {
      this.desired
        .copy(this.rig.root.position)
        .addScaledVector(this.toCamera, allowed);
    }
  }
}
