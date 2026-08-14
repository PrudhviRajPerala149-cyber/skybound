/**
 * Resolves a path inside `public/` against the deployed base URL.
 *
 * On GitHub Pages the site is served from a subfolder (/skybound/), not the
 * domain root, so a hardcoded "/assets/…" would 404. Vite substitutes
 * BASE_URL at build time, which keeps the same code working on the dev server
 * and on Pages.
 */
export function assetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\//, "")}`;
}
