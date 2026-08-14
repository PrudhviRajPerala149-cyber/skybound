import * as THREE from "three";
import { createRadialTexture } from "./textures";

/** Direction the sun sits in, low on the horizon for golden hour. */
export const SUN_DIRECTION = new THREE.Vector3(-0.62, 0.1, -0.78).normalize();

const HORIZON = new THREE.Color("#ffb163");
const MID_SKY = new THREE.Color("#e0702c");
const ZENITH = new THREE.Color("#3b4a72");
const HAZE = new THREE.Color("#e08a45");

const skyVertex = /* glsl */ `
  varying vec3 vWorldPosition;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uHorizon;
  uniform vec3 uMid;
  uniform vec3 uZenith;
  varying vec3 vWorldPosition;

  void main() {
    float h = normalize(vWorldPosition).y;

    // Three stops: warm band at the horizon, orange body, dusty blue overhead.
    vec3 color = mix(uHorizon, uMid, smoothstep(-0.05, 0.28, h));
    color = mix(color, uZenith, smoothstep(0.22, 0.78, h));

    // Deepen below the horizon so the cloud sea has something to sit against.
    color = mix(color * 0.62, color, smoothstep(-0.42, -0.02, h));

    gl_FragColor = vec4(color, 1.0);
  }
`;

const cloudVertex = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPosition;
  void main() {
    vUv = uv;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorldPosition = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const cloudFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uLight;
  uniform vec3 uShadow;
  uniform float uScale;
  uniform float uDrift;
  uniform float uCoverage;
  uniform float uOpacity;
  uniform float uFadeNear;
  uniform float uFadeFar;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  // Cheap value noise — plenty for a soft, slow-rolling cloud deck.
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float total = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
      total += noise(p) * amp;
      p *= 2.03;
      amp *= 0.5;
    }
    return total;
  }

  void main() {
    vec2 p = vUv * uScale;
    float drift = uTime * 0.012 * uDrift;
    float n = fbm(p + vec2(drift, drift * 0.6));
    n = mix(n, fbm(p * 1.9 - vec2(drift * 1.4, 0.0)), 0.4);

    vec3 color = mix(uShadow, uLight, smoothstep(0.30, 0.74, n));

    // uCoverage lowers the threshold at which noise becomes cloud, so a layer
    // can range from thin wisps to a solid deck.
    float alpha = smoothstep(uCoverage, uCoverage + 0.3, n) *
      (1.0 - smoothstep(uFadeNear, uFadeFar, length(vWorldPosition.xz)));

    gl_FragColor = vec4(color, alpha * uOpacity);
  }
`;

interface ParticleLayer {
  points: THREE.Points;
  velocities: Float32Array;
  /** Half-width of the box this layer wraps within, centred on the ship. */
  spread: number;
}

export class World {
  readonly group = new THREE.Group();

  private readonly cloudMaterials: THREE.ShaderMaterial[];
  private readonly particleLayers: ParticleLayer[];
  private readonly sun: THREE.Sprite;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
    scene.fog = new THREE.FogExp2(HAZE.getHex(), 0.0016);

    this.group.add(this.createSky());
    scene.environment = this.createEnvironment(renderer);
    this.group.add(...this.createLights());

    this.sun = this.createSun();
    this.group.add(this.sun);

    const { group: clouds, materials } = this.createCloudSea();
    this.cloudMaterials = materials;
    this.group.add(clouds);

    this.particleLayers = this.createParticleLayers();
    this.group.add(...this.particleLayers.map((layer) => layer.points));

    scene.add(this.group);
  }

  private createSky(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(4000, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          uHorizon: { value: HORIZON },
          uMid: { value: MID_SKY },
          uZenith: { value: ZENITH },
        },
        vertexShader: skyVertex,
        fragmentShader: skyFragment,
      }),
    );
  }

  /**
   * Prefilters the sky gradient into an environment map.
   *
   * Some of the island materials are authored as genuinely metallic (they
   * carry a metalness map, so the loader leaves them be), and a metal surface
   * shows nothing but its reflections — without this they render pure black.
   * Building the environment from the same shader as the sky also means every
   * material picks up the golden-hour light for free.
   */
  private createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
    const pmrem = new THREE.PMREMGenerator(renderer);

    // A small stand-in sphere: only the gradient matters, not the scale.
    const source = new THREE.Scene();
    const proxy = this.createSky();
    proxy.geometry = new THREE.SphereGeometry(10, 32, 20);
    source.add(proxy);

    const target = pmrem.fromScene(source, 0.04, 0.1, 100);

    proxy.geometry.dispose();
    (proxy.material as THREE.Material).dispose();
    pmrem.dispose();

    return target.texture;
  }

  private createLights(): THREE.Object3D[] {
    const key = new THREE.DirectionalLight(0xffcf96, 2.6);
    key.position.copy(SUN_DIRECTION).multiplyScalar(600);

    // The sun sits almost on the horizon, so it puts nothing at all on the
    // islands' undersides. This warm bounce off the cloud sea is what keeps
    // them from reading as flat black silhouettes.
    const ambient = new THREE.HemisphereLight(0xffd9a8, 0xa86b3a, 1.55);

    // A cool rim from the opposite side keeps silhouettes from going flat.
    const rim = new THREE.DirectionalLight(0x8fa8d8, 0.7);
    rim.position.copy(SUN_DIRECTION).multiplyScalar(-500).setY(180);

    return [key, ambient, rim];
  }

  /** Large, soft, low-hanging sun disc drawn as a billboard. */
  private createSun(): THREE.Sprite {
    const texture = createRadialTexture(
      [
        [0.0, "rgba(255, 250, 232, 1)"],
        [0.12, "rgba(255, 231, 170, 0.98)"],
        [0.26, "rgba(255, 178, 90, 0.62)"],
        [0.52, "rgba(240, 128, 50, 0.22)"],
        [1.0, "rgba(230, 110, 40, 0)"],
      ],
      512,
    );

    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: texture,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        fog: false,
        transparent: true,
      }),
    );
    sprite.scale.setScalar(1500);
    sprite.renderOrder = -1;
    return sprite;
  }

  /**
   * Stacked cloud decks rather than a single plane: a dense floor far below,
   * then progressively thinner, faster, higher layers. Parallax between them
   * is what sells the depth when the ship climbs or dives through the stack.
   */
  private createCloudSea(): {
    group: THREE.Group;
    materials: THREE.ShaderMaterial[];
  } {
    const layers = [
      { y: -340, size: 6000, scale: 8, coverage: 0.2, opacity: 0.95, drift: 1 },
      { y: -215, size: 5200, scale: 13, coverage: 0.3, opacity: 0.6, drift: 1.5 },
      { y: -90, size: 4400, scale: 18, coverage: 0.4, opacity: 0.4, drift: 2.1 },
      { y: 130, size: 4000, scale: 24, coverage: 0.47, opacity: 0.26, drift: 2.8 },
    ];

    const group = new THREE.Group();
    const materials: THREE.ShaderMaterial[] = [];

    for (const layer of layers) {
      const material = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
        uniforms: {
          uTime: { value: 0 },
          uLight: { value: new THREE.Color("#ffdcb0") },
          uShadow: { value: new THREE.Color("#c4693a") },
          uScale: { value: layer.scale },
          uDrift: { value: layer.drift },
          uCoverage: { value: layer.coverage },
          uOpacity: { value: layer.opacity },
          uFadeNear: { value: layer.size * 0.18 },
          uFadeFar: { value: layer.size * 0.42 },
        },
        vertexShader: cloudVertex,
        fragmentShader: cloudFragment,
      });

      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(layer.size, layer.size, 1, 1),
        material,
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = layer.y;
      mesh.renderOrder = -1;

      group.add(mesh);
      materials.push(material);
    }

    return { group, materials };
  }

  /** Soft round falloff — square point sprites read as debris, not embers. */
  private createEmberTexture(): THREE.Texture {
    return createRadialTexture(
      [
        [0, "rgba(255, 244, 214, 1)"],
        [0.35, "rgba(255, 196, 120, 0.55)"],
        [1, "rgba(255, 170, 90, 0)"],
      ],
      64,
    );
  }

  /**
   * Three ember fields rather than one. A single layer has to choose between
   * fine sparks close by and coarse motes in the distance; splitting it lets
   * each pick its own size, density and drift, which is what reads as depth.
   */
  private createParticleLayers(): ParticleLayer[] {
    const texture = this.createEmberTexture();

    return [
      // Fine sparks, dense and near.
      { count: 3000, spread: 300, size: 0.75, opacity: 0.55, rise: 1.7, color: 0xffc27a },
      // Brighter, slower motes drifting through the mid ground.
      { count: 1100, spread: 210, size: 2.1, opacity: 0.42, rise: 0.9, color: 0xffe0ac },
      // Coarse far dust, barely moving — parallax against everything else.
      { count: 1700, spread: 640, size: 4.2, opacity: 0.22, rise: 0.5, color: 0xffb277 },
    ].map((spec) => {
      const positions = new Float32Array(spec.count * 3);
      const velocities = new Float32Array(spec.count * 3);

      for (let i = 0; i < spec.count; i++) {
        for (let axis = 0; axis < 3; axis++) {
          positions[i * 3 + axis] = (Math.random() - 0.5) * spec.spread * 2;
        }
        velocities[i * 3] = (Math.random() - 0.5) * 1.4;
        velocities[i * 3 + 1] = Math.random() * spec.rise + 0.35;
        velocities[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
      }

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

      const points = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: spec.color,
          map: texture,
          size: spec.size,
          sizeAttenuation: true,
          transparent: true,
          opacity: spec.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          fog: false,
        }),
      );
      points.frustumCulled = false;

      return { points, velocities, spread: spec.spread };
    });
  }

  /**
   * Keeps the sun infinitely distant and the ember field wrapped around the
   * ship, so atmosphere travels with the visitor instead of being left behind.
   */
  update(dt: number, elapsed: number, focus: THREE.Vector3): void {
    for (const material of this.cloudMaterials) {
      material.uniforms.uTime.value = elapsed;
    }

    this.sun.position.copy(focus).addScaledVector(SUN_DIRECTION, 3200);

    for (const layer of this.particleLayers) {
      const positions = layer.points.geometry.attributes.position
        .array as Float32Array;
      const { spread, velocities } = layer;

      for (let i = 0; i < positions.length; i += 3) {
        positions[i] += velocities[i] * dt;
        positions[i + 1] += velocities[i + 1] * dt;
        positions[i + 2] += velocities[i + 2] * dt;

        // Wrap each axis into a box centred on the ship.
        for (let axis = 0; axis < 3; axis++) {
          const relative = positions[i + axis] - focus.getComponent(axis);
          if (relative > spread) positions[i + axis] -= spread * 2;
          else if (relative < -spread) positions[i + axis] += spread * 2;
        }
      }

      layer.points.geometry.attributes.position.needsUpdate = true;
    }
  }
}
