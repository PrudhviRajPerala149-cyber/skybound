import { defineConfig } from "vite";

/**
 * GitHub Pages serves this project from https://<user>.github.io/skybound/,
 * so the build needs to know it lives in a subfolder. Everything in the app
 * resolves its asset URLs through src/assets.ts, which reads this value.
 *
 * If you later point a custom domain at the site, or rename the repository,
 * this is the one line to change.
 */
export default defineConfig({
  base: "/skybound/",
});
