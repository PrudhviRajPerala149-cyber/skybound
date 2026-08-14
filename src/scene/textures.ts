import * as THREE from "three";

/**
 * Builds a soft radial falloff on a canvas. Used for everything in the scene
 * that needs to read as light rather than surface: the sun, the drifting
 * embers, and the landmark beacons.
 */
export function createRadialTexture(
  stops: Array<[number, string]>,
  size = 256,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;

  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  for (const [offset, color] of stops) gradient.addColorStop(offset, color);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
