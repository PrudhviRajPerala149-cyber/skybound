import * as THREE from "three";
import { loadModel, normalizeModel } from "../loader";
import { assetUrl } from "../assets";
import { SHIP_RADIUS } from "../ship/ship";

const MODEL_URLS = [
  "assets/models/island-a.glb",
  "assets/models/island-b.glb",
  "assets/models/island-c.glb",
].map(assetUrl);

/**
 * How much of the blocked speed is redirected along the surface. At 1 the ship
 * keeps all its momentum and skates around the island; at 0 it stops dead.
 */
const SLIDE_RETENTION = 0.85;

/** Vertical band over which a collider fades out below the island's summit. */
const TAPER_BAND = 0.55; // as a fraction of the island's height

export interface IslandCollider {
  center: THREE.Vector3;
  radius: number;
  topY: number;
  band: number;
}

/**
 * Deterministic PRNG so the archipelago is laid out identically on every
 * visit — a world that reshuffles each reload is disorienting to explore.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Spinner {
  object: THREE.Object3D;
  speed: number;
}

export class Archipelago {
  readonly group = new THREE.Group();
  readonly colliders: IslandCollider[] = [];

  private readonly spinners: Spinner[] = [];
  /** Scratch vector for the slide direction; avoids allocating per contact. */
  private readonly tangent = new THREE.Vector3();

  private constructor() {}

  /**
   * Turns every island slowly on its own axis, each at its own rate and
   * direction. Spin is about Y only, so the sphere colliders — which are
   * symmetric about that axis — stay exactly as valid as they were.
   */
  update(dt: number): void {
    for (const spinner of this.spinners) {
      spinner.object.rotation.y += spinner.speed * dt;
    }
  }

  static async create(): Promise<Archipelago> {
    const world = new Archipelago();
    const sources = await Promise.all(MODEL_URLS.map(loadModel));
    const rand = mulberry32(20240814);

    // --- Hero ring: the islands the visitor actually flies among ----------
    const heroCount = 12;
    for (let i = 0; i < heroCount; i++) {
      const angle =
        (i / heroCount) * Math.PI * 2 + (rand() - 0.5) * 0.42;
      // Radii widen along with the scale, so bigger islands don't crowd each
      // other out of the ring via the separation check below.
      const radius = 170 + rand() * 280;
      const height = (rand() - 0.45) * 130;
      const scale = 70 + rand() * 95;

      const position = new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );

      if (world.tooClose(position, scale)) continue;

      world.place(sources[i % sources.length], position, scale, rand, true);
    }

    // --- Background field: depth above, below and far out ----------------
    const backdropCount = 34;
    for (let i = 0; i < backdropCount; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = 460 + rand() * 1000;
      // Deliberately biased to fill the sky both overhead and underfoot.
      const height = (rand() - 0.5) * 700;
      const scale = 26 + rand() * 62;

      const position = new THREE.Vector3(
        Math.cos(angle) * radius,
        height,
        Math.sin(angle) * radius,
      );

      world.place(sources[i % sources.length], position, scale, rand, false);
    }

    return world;
  }

  /** Keeps collider spheres from interpenetrating. */
  private tooClose(position: THREE.Vector3, scale: number): boolean {
    return this.colliders.some(
      (c) => c.center.distanceTo(position) < c.radius + scale * 0.9,
    );
  }

  private place(
    source: THREE.Object3D,
    position: THREE.Vector3,
    scale: number,
    rand: () => number,
    collidable: boolean,
  ): void {
    const { wrapper } = normalizeModel(source.clone(true), scale);
    wrapper.position.copy(position);
    wrapper.rotation.y = rand() * Math.PI * 2;
    this.group.add(wrapper);

    // Hero islands turn slowly enough to be felt rather than watched; the
    // smaller backdrop ones can afford a little more.
    const range = collidable ? 0.055 : 0.11;
    this.spinners.push({
      object: wrapper,
      speed: (rand() - 0.5) * 2 * range,
    });

    if (!collidable) return;

    // Measure the placed instance rather than assuming the model's proportions.
    const box = new THREE.Box3().setFromObject(wrapper);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    this.colliders.push({
      center,
      // Averaging the two horizontal extents, rather than taking the larger,
      // keeps the sphere inside an irregular island instead of ballooning out
      // to its widest point — which is what made the ship stop in open air.
      radius: ((size.x + size.z) / 2) * 0.4,
      topY: box.max.y,
      band: Math.max(size.y * TAPER_BAND, 4),
    });
  }

  /**
   * Pushes the ship out of any island it has entered and kills the inward
   * component of its velocity, so it slides along the rock instead of
   * sticking or bouncing.
   *
   * The collider radius tapers to nothing across a band below each island's
   * summit, which keeps the airspace directly overhead free to fly through.
   */
  resolveCollisions(position: THREE.Vector3, velocity: THREE.Vector3): boolean {
    let hit = false;
    const offset = new THREE.Vector3();

    for (const c of this.colliders) {
      // Cheap broadphase: skip anything obviously out of reach.
      if (Math.abs(position.y - c.center.y) > c.radius + c.band + SHIP_RADIUS) {
        continue;
      }

      const taper = THREE.MathUtils.clamp(
        1 - (position.y - (c.topY - c.band)) / c.band,
        0,
        1,
      );
      if (taper <= 0) continue;

      const effective = c.radius * taper + SHIP_RADIUS;

      offset.copy(position).sub(c.center);
      const distSq = offset.lengthSq();
      if (distSq >= effective * effective) continue;

      const dist = Math.sqrt(distSq) || 0.0001;
      offset.divideScalar(dist); // now a unit normal pointing away from centre

      position.addScaledVector(offset, effective - dist);

      const inward = velocity.dot(offset);
      if (inward < 0) {
        // Take out the part of the motion driving into the rock…
        velocity.addScaledVector(offset, -inward);

        // …then spend most of it along the surface rather than losing it. Without
        // this, flying straight at an island leaves no tangential motion to keep
        // and the ship simply stops, which reads as being stuck.
        this.tangent.copy(velocity);
        if (this.tangent.lengthSq() < 1e-6) {
          // Dead-on with nothing to follow: any level direction on the surface.
          this.tangent.set(0, 1, 0).cross(offset);
          if (this.tangent.lengthSq() < 1e-6) this.tangent.set(1, 0, 0).cross(offset);
        }
        this.tangent.normalize();
        velocity.addScaledVector(this.tangent, -inward * SLIDE_RETENTION);
      }

      hit = true;
    }

    return hit;
  }
}
