import * as THREE from "three";

/**
 * Cap height in world units — the ship is ~7 long for scale. Sized against
 * the horizontal field of view at ANCHOR's distance so the full name fits the
 * frame with room to spare, including on a narrow portrait window.
 */
const NAME_HEIGHT = 15;
const TITLE_HEIGHT = 4.6;

/** Layers stacked backwards to fake extrusion, so the letters read as solid. */
const DEPTH_LAYERS = 6;
const DEPTH_STEP = 0.9;

/** Where the lettering hangs, ahead of the spawn point and above it. */
const ANCHOR = new THREE.Vector3(0, 70, -175);

const REVEAL_STAGGER = 0.085;
const REVEAL_DURATION = 1.1;
const HOLD_SECONDS = 9;
const FADE_SECONDS = 3.5;

/** Fades early if the ship gets close enough to fly through the letters. */
const NEAR_DISTANCE = 90;

const FONT_STACK = `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif`;

interface Letter {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  delay: number;
  restY: number;
}

/**
 * Draws one glyph to a canvas and returns it with the aspect ratio needed to
 * size a plane for it. Rendering type this way keeps the site's serif — a
 * bundled typeface.json would mean generic geometry in the wrong voice.
 */
function glyphTexture(
  character: string,
  pixelHeight: number,
): { texture: THREE.CanvasTexture; aspect: number } {
  const font = `${pixelHeight}px ${FONT_STACK}`;

  // A first pass purely to measure, before the canvas is sized to fit.
  const gauge = document.createElement("canvas").getContext("2d")!;
  gauge.font = font;
  const metrics = gauge.measureText(character);

  // Just enough margin to keep the glyph off the edge of its canvas; more
  // than this and the letters drift apart, because the padding is baked into
  // each plane's width.
  const pad = pixelHeight * 0.12;
  const width = Math.max(1, Math.ceil(metrics.width + pad * 2));
  const height = Math.ceil(pixelHeight * 1.6 + pad);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d")!;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  // A dark stroke under the fill. Cream lettering alone washes out against a
  // sky this bright; the outline keeps the shapes crisp from any angle, and
  // reads as the letters' own shading rather than a drop shadow.
  ctx.lineJoin = "round";
  ctx.lineWidth = pixelHeight * 0.055;
  ctx.strokeStyle = "rgba(58, 24, 8, 0.85)";
  ctx.strokeText(character, width / 2, height / 2);

  ctx.fillStyle = "#ffffff";
  ctx.fillText(character, width / 2, height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;

  return { texture, aspect: width / height };
}

/**
 * The visitor's name, hanging in the sky ahead of the spawn point.
 *
 * Deliberately not billboarded: it keeps a fixed orientation so flying past
 * shows it at an angle and then edge-on, which is what sells it as sitting in
 * the world rather than being pasted onto the camera.
 */
export class SkyText {
  readonly group = new THREE.Group();

  private readonly letters: Letter[] = [];
  private elapsed = 0;
  private running = false;
  private fade = 1;

  constructor(name: string, title: string) {
    this.group.position.copy(ANCHOR);
    this.group.visible = false;

    const nameWidth = this.buildLine(name, NAME_HEIGHT, 0, 0xfff1d6, 0);
    this.buildLine(
      title.toUpperCase(),
      TITLE_HEIGHT,
      -NAME_HEIGHT * 0.92,
      // Pale gold rather than the UI amber: amber on an orange sky is too
      // close in value to read at this size.
      0xffd9a0,
      nameWidth === 0 ? 0 : 0.34,
    );
  }

  /** Lays out one line centred on the group's origin. Returns its width. */
  private buildLine(
    text: string,
    height: number,
    y: number,
    color: number,
    tracking: number,
  ): number {
    const glyphs = [...text].map((character) =>
      character === " "
        ? null
        : glyphTexture(character, Math.round(height * 12)),
    );

    // Spaces get a fixed advance; drawn glyphs are sized from their canvas.
    const widths = glyphs.map((g) =>
      g ? g.aspect * height * 1.6 : height * (0.34 + tracking),
    );
    const gaps = tracking * height;
    const total =
      widths.reduce((sum, w) => sum + w, 0) + gaps * (glyphs.length - 1);

    let cursor = -total / 2;

    glyphs.forEach((glyph, index) => {
      const width = widths[index];

      if (glyph) {
        const letter = new THREE.Group();
        const materials: THREE.MeshBasicMaterial[] = [];
        const geometry = new THREE.PlaneGeometry(width, height * 1.6);

        // Front face first, then progressively darker slices behind it.
        for (let layer = 0; layer < DEPTH_LAYERS; layer++) {
          const depth = layer / (DEPTH_LAYERS - 1);
          const material = new THREE.MeshBasicMaterial({
            map: glyph.texture,
            transparent: true,
            depthWrite: false,
            color: new THREE.Color(color).multiplyScalar(1 - depth * 0.72),
            opacity: 0,
            fog: true,
          });

          const slice = new THREE.Mesh(geometry, material);
          slice.position.z = -layer * DEPTH_STEP;
          slice.renderOrder = -layer;

          materials.push(material);
          letter.add(slice);
        }

        letter.position.set(cursor + width / 2, y, 0);
        this.letters.push({
          group: letter,
          materials,
          delay: this.letters.length * REVEAL_STAGGER,
          restY: y,
        });
        this.group.add(letter);
      }

      cursor += width + gaps;
    });

    return total;
  }

  /** Called when the visitor commits to the flight. */
  start(): void {
    this.running = true;
    this.elapsed = 0;
    this.group.visible = true;
  }

  update(dt: number, shipPosition: THREE.Vector3): void {
    if (!this.running) return;

    this.elapsed += dt;

    // Retire once it has had its moment, or early if the ship closes on it.
    const distance = shipPosition.distanceTo(this.group.position);
    const overstayed = this.elapsed - HOLD_SECONDS;
    const byTime = overstayed > 0 ? 1 - overstayed / FADE_SECONDS : 1;
    const byRange = THREE.MathUtils.clamp(distance / NEAR_DISTANCE, 0, 1);
    this.fade = Math.max(0, Math.min(byTime, byRange));

    if (this.fade <= 0) {
      this.group.visible = false;
      this.running = false;
      return;
    }

    for (const letter of this.letters) {
      const t = THREE.MathUtils.clamp(
        (this.elapsed - letter.delay) / REVEAL_DURATION,
        0,
        1,
      );
      // Overshoot slightly on the way in, so each letter lands rather than
      // simply appearing.
      const eased = 1 - Math.pow(1 - t, 3);

      letter.group.position.y = letter.restY + (1 - eased) * -7;
      letter.group.scale.setScalar(0.82 + eased * 0.18);

      for (let i = 0; i < letter.materials.length; i++) {
        const layerFalloff = i === 0 ? 1 : 0.55;
        letter.materials[i].opacity = eased * this.fade * layerFalloff;
      }
    }

    // A slow drift keeps it from feeling pasted in place.
    this.group.position.y =
      ANCHOR.y + Math.sin(this.elapsed * 0.5) * 1.6;
  }
}
