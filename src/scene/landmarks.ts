import * as THREE from "three";
import type { ResumeSection } from "../content/resume";
import type { IslandCollider } from "./islands";
import { createRadialTexture } from "./textures";

/**
 * Shapes and colours cycle if there are more sections than entries here, so
 * adding a seventh section to resume.ts never breaks the world.
 */
const FORMS = ["obelisk", "crystal", "ring", "beacon", "monolith", "orb"] as const;
type Form = (typeof FORMS)[number];

const COLORS = [
  0xffc95e, // amber
  0x6fe3d0, // teal
  0xff8f7a, // coral
  0xf6e7a8, // pale gold
  0xc79bff, // violet
  0x8fe36f, // green
];

/** How far out the ship can be and still trip a landmark. */
function triggerRadiusFor(islandRadius: number): number {
  return 34 + islandRadius * 0.42;
}

export interface Landmark {
  section: ResumeSection;
  position: THREE.Vector3;
  triggerRadius: number;
  found: boolean;
}

interface LandmarkParts extends Landmark {
  group: THREE.Group;
  body: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  /** Desaturates the beacon once it has been collected. */
  spentColor: THREE.Color;
  phase: number;
  baseY: number;
  haloScale: number;
}

export class LandmarkField {
  readonly group = new THREE.Group();
  readonly landmarks: Landmark[] = [];

  private readonly parts: LandmarkParts[] = [];
  private readonly haloTexture = createRadialTexture([
    [0.0, "rgba(255,255,255,0.95)"],
    [0.18, "rgba(255,255,255,0.55)"],
    [0.45, "rgba(255,255,255,0.16)"],
    [1.0, "rgba(255,255,255,0)"],
  ]);

  /**
   * One landmark per section, spread as evenly as possible around the hero
   * ring. The colliders arrive in ring order, so striding through them keeps
   * the sections from clustering on one side of the archipelago.
   */
  constructor(colliders: IslandCollider[], sections: ResumeSection[]) {
    const stride = Math.max(1, Math.floor(colliders.length / sections.length));

    sections.forEach((section, index) => {
      const island = colliders[(index * stride) % colliders.length];
      if (!island) return;
      this.build(section, island, index);
    });
  }

  private build(section: ResumeSection, island: IslandCollider, index: number): void {
    const color = new THREE.Color(COLORS[index % COLORS.length]);
    const form = FORMS[index % FORMS.length];
    const scale = THREE.MathUtils.clamp(island.radius * 0.26, 7, 18);

    const material = new THREE.MeshStandardMaterial({
      color: color.clone().multiplyScalar(0.6),
      emissive: color,
      emissiveIntensity: 1.6,
      roughness: 0.35,
      metalness: 0,
    });

    const body = new THREE.Mesh(geometryFor(form, scale), material);

    // A soft additive halo is what makes the beacon legible from across the
    // map — the mesh alone is only a few pixels at that range.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.haloTexture,
        color,
        blending: THREE.AdditiveBlending,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    );
    const haloScale = scale * 7;
    halo.scale.setScalar(haloScale);

    const light = new THREE.PointLight(color, 9, scale * 26, 2);

    const group = new THREE.Group();
    group.add(body, halo, light);

    // Hovering just clear of the island's highest point, so the beacon never
    // ends up buried in a peak or a tree.
    const baseY = island.topY + scale * 0.85;
    group.position.set(island.center.x, baseY, island.center.z);
    this.group.add(group);

    const landmark: LandmarkParts = {
      section,
      position: group.position,
      triggerRadius: triggerRadiusFor(island.radius),
      found: false,
      group,
      body,
      material,
      halo,
      light,
      spentColor: color.clone().multiplyScalar(0.22),
      phase: index * 1.7,
      baseY,
      haloScale,
    };

    this.parts.push(landmark);
    this.landmarks.push(landmark);
  }

  /**
   * Animates the beacons and reports the first landmark the ship has just
   * entered, or null. Returns one per frame; with the ring spacing used here
   * two can never overlap.
   */
  update(dt: number, elapsed: number, shipPosition: THREE.Vector3): Landmark | null {
    let discovered: Landmark | null = null;

    for (const part of this.parts) {
      if (part.found) {
        // Collected beacons are inert: they keep turning slowly so they still
        // read as made things, but emit nothing.
        part.body.rotation.y += dt * 0.12;
        continue;
      }

      const pulse = 0.5 + 0.5 * Math.sin(elapsed * 1.7 + part.phase);

      part.material.emissiveIntensity = 1.15 + pulse * 1.5;
      part.light.intensity = 5 + pulse * 9;
      part.halo.material.opacity = 0.4 + pulse * 0.45;
      part.halo.scale.setScalar((0.9 + pulse * 0.22) * part.haloScale);
      part.body.rotation.y += dt * 0.45;
      part.group.position.y = part.baseY + Math.sin(elapsed * 0.8 + part.phase) * 1.4;

      if (
        !discovered &&
        shipPosition.distanceTo(part.position) <= part.triggerRadius
      ) {
        this.extinguish(part);
        discovered = part;
      }
    }

    return discovered;
  }

  /**
   * Switches a beacon off completely rather than dimming it: no emission, no
   * halo, no light. What remains is a dark monument, which is how the visitor
   * tells at a glance that this one is already collected.
   */
  private extinguish(part: LandmarkParts): void {
    part.found = true;

    part.material.emissive.setRGB(0, 0, 0);
    part.material.emissiveIntensity = 0;
    part.material.color.copy(part.spentColor);
    part.material.needsUpdate = true;

    part.halo.visible = false;
    part.halo.material.opacity = 0;

    part.light.intensity = 0;
    part.light.visible = false;

    part.group.position.y = part.baseY;
  }

  /** Used by the tests and by any future "reveal all" affordance. */
  findBySection(id: string): Landmark | undefined {
    return this.landmarks.find((l) => l.section.id === id);
  }
}

function geometryFor(form: Form, scale: number): THREE.BufferGeometry {
  switch (form) {
    case "obelisk":
      return new THREE.ConeGeometry(scale * 0.34, scale * 2.1, 4);
    case "crystal":
      return new THREE.OctahedronGeometry(scale * 0.85);
    case "ring":
      return new THREE.TorusGeometry(scale * 0.7, scale * 0.14, 10, 28);
    case "beacon":
      return new THREE.CylinderGeometry(scale * 0.18, scale * 0.34, scale * 1.9, 8);
    case "monolith":
      return new THREE.BoxGeometry(scale * 0.5, scale * 1.9, scale * 0.5);
    case "orb":
      return new THREE.IcosahedronGeometry(scale * 0.8, 0);
  }
}
