import * as THREE from "three";
import { loadModel, normalizeModel } from "../loader";
import { assetUrl } from "../assets";

/** Longest dimension of the ship in world units after normalization. */
export const SHIP_LENGTH = 7;

/** Collision radius used against island colliders. */
export const SHIP_RADIUS = 2.6;

/**
 * Yaw applied to the raw model so its bow points down -Z (our canonical
 * forward). The Sketchfab export lands broadside-on, so it needs a quarter
 * turn; the sign was confirmed in-browser by checking which end leads.
 * If the ship ever renders sideways or reversed, this is the single value
 * to tune — nothing else depends on the model's authored orientation.
 */
export const MODEL_YAW_CORRECTION = -Math.PI / 2;

export interface ShipRig {
  /** Driven by the flight model. Its -Z is forward. Never tilt this. */
  root: THREE.Group;
  /** Cosmetic pivot: banking, bob, boost pitch. Safe to rotate freely. */
  mesh: THREE.Group;
}

export async function createShip(): Promise<ShipRig> {
  const model = await loadModel(assetUrl("assets/models/ship.glb"));
  const { wrapper } = normalizeModel(model, SHIP_LENGTH);

  // Orientation is decided from measured geometry, not from the file's
  // authored axes: the hull's longer horizontal span is its length, and we
  // rotate that span onto Z.
  const box = new THREE.Box3().setFromObject(wrapper);
  const size = box.getSize(new THREE.Vector3());
  const orient = new THREE.Group();
  orient.rotation.y = size.x > size.z ? MODEL_YAW_CORRECTION : 0;
  orient.add(wrapper);

  const mesh = new THREE.Group();
  mesh.add(orient);

  const root = new THREE.Group();
  root.add(mesh);

  return { root, mesh };
}
