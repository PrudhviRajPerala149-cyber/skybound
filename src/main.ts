import * as THREE from "three";
import "./style.css";

import { loadingManager } from "./loader";
import { World } from "./scene/world";
import { Archipelago } from "./scene/islands";
import { createShip } from "./ship/ship";
import { FlightController, requestPointerLock } from "./ship/flight";
import { ChaseCamera } from "./ship/camera";
import { Ambience } from "./audio";
import { Hud, StartScreen, Credits } from "./hud";
import { LandmarkField } from "./scene/landmarks";
import { Discovery } from "./discovery";
import { profile, sections } from "./content/resume";

/** A tab-switch stall must never let the ship tunnel through a collider. */
const MAX_DELTA = 0.05;
const MAX_SPEED_REFERENCE = 58;

async function boot(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;

  const startScreen = new StartScreen();
  const hud = new Hud();
  new Credits();

  loadingManager.onProgress = (_url, loaded, total) => {
    startScreen.setProgress(total > 0 ? loaded / total : 0);
  };

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    62,
    window.innerWidth / window.innerHeight,
    0.5,
    6000,
  );

  const world = new World(scene, renderer);

  const [ship, archipelago] = await Promise.all([
    createShip(),
    Archipelago.create(),
  ]);

  scene.add(ship.root);
  scene.add(archipelago.group);

  // One beacon per resume section, planted on the hero islands.
  const landmarks = new LandmarkField(archipelago.colliders, sections);
  scene.add(landmarks.group);

  const flight = new FlightController(ship, canvas);
  ship.root.position.copy(flight.position);

  const chase = new ChaseCamera(camera, ship, archipelago);

  const muteButton = document.getElementById("mute-toggle")!;
  const muteIcon = document.getElementById("mute-icon")!;
  const ambience = new Ambience((muted) => {
    muteIcon.textContent = muted ? "✕" : "♪";
    muteButton.classList.toggle("is-off", muted);
    muteButton.title = muted ? "Unmute music (M)" : "Mute music (M)";
  });

  const discovery = new Discovery(sections, ambience);

  document.getElementById("profile-name")!.textContent = profile.name;
  document.getElementById("profile-title")!.textContent = profile.title;

  muteButton.addEventListener("click", () => ambience.toggle());
  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyM") ambience.toggle();
  });

  window.addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  startScreen.onBegin(() => {
    flight.activate();
    hud.reveal();
    ambience.start();
    requestPointerLock(canvas);
  });

  startScreen.setReady();

  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), MAX_DELTA);
    const elapsed = clock.elapsedTime;

    flight.update(dt);
    archipelago.resolveCollisions(flight.position, flight.velocity);
    // Collision may have pushed the ship, so re-sync the visual transform
    // before the camera reads it.
    ship.root.position.copy(flight.position);

    archipelago.update(dt);

    const reached = landmarks.update(dt, elapsed, flight.position);
    if (reached) discovery.record(reached.section);

    chase.update(dt, flight.speed, MAX_SPEED_REFERENCE);
    world.update(dt, elapsed, flight.position);
    hud.update(dt, flight.headingDegrees, flight.speed, flight.position.y);

    renderer.render(scene, camera);
  });

  // Exposed purely so the scene can be driven and inspected from the console
  // during development and testing. Not shipped in a production build.
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).skybound = {
      flight,
      archipelago,
      ship,
      camera,
      ambience,
      landmarks,
      discovery,
    };
  }
}

boot().catch((error) => {
  console.error("[skybound] failed to start", error);
  const status = document.getElementById("loading-status");
  if (status) status.textContent = "Unable to load the sky — see console";
});
