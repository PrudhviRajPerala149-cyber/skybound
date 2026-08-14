import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/**
 * Shared loading manager so the start screen can show real progress and only
 * enable "Begin Flight" once every asset has arrived.
 */
export const loadingManager = new THREE.LoadingManager();

const gltfLoader = new GLTFLoader(loadingManager);

export function loadModel(url: string): Promise<THREE.Group> {
  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => resolve(gltf.scene),
      undefined,
      (err) => reject(err),
    );
  });
}

/**
 * Several of these FBX-derived materials are authored as fully metallic with
 * no metalness map, and one is mirror-smooth. A metal surface shows only what
 * it reflects, so without an environment map they render near-black — which is
 * exactly what the largest island did. Materials that genuinely carry a
 * metalness map are left alone.
 */
function conditionMaterial(material: THREE.Material): void {
  const std = material as THREE.MeshStandardMaterial;
  if (!std.isMeshStandardMaterial || std.metalnessMap) return;

  std.metalness = Math.min(std.metalness, 0.08);
  std.roughness = Math.max(std.roughness, 0.55);
  std.needsUpdate = true;
}

/**
 * The supplied GLBs are Sketchfab FBX exports: some carry their own baked
 * Camera and Light nodes, which would otherwise pollute our lighting. Strip
 * anything that isn't geometry, and sanitize the materials on the way past.
 */
export function stripNonMeshes(root: THREE.Object3D): void {
  const doomed: THREE.Object3D[] = [];

  root.traverse((child) => {
    if ((child as THREE.Light).isLight || (child as THREE.Camera).isCamera) {
      doomed.push(child);
      return;
    }

    const mesh = child as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = true;

      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) conditionMaterial(material);
    }
  });

  for (const node of doomed) node.removeFromParent();
}

/**
 * Measures a model and returns a wrapper whose contents are centred on the
 * wrapper origin and scaled so the longest axis equals `targetSize`.
 *
 * The GLBs arrive at wildly different authored scales (the ship is ~270 units
 * across, one island is ~2), so nothing may be trusted from the file itself.
 */
export function normalizeModel(
  model: THREE.Object3D,
  targetSize: number,
): { wrapper: THREE.Group; size: THREE.Vector3 } {
  stripNonMeshes(model);

  const box = new THREE.Box3().setFromObject(model);
  const rawSize = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const longest = Math.max(rawSize.x, rawSize.y, rawSize.z) || 1;
  const scale = targetSize / longest;

  // Recentre in the model's own space, then scale the whole thing.
  model.position.sub(center);

  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(scale);
  wrapper.add(model);

  return { wrapper, size: rawSize.multiplyScalar(scale) };
}
