# Skybound

An interactive resume you fly through rather than scroll. A low-poly airship
explores a golden-hour sky of floating islands; each island carries a glowing
beacon, and reaching one opens a section of the resume.

Built with Three.js and Vite in vanilla TypeScript.

## Controls

| Input | Action |
| --- | --- |
| `W` / `S` | Thrust forward / back |
| `A` / `D` | Turn |
| Mouse | Look (pointer lock, with click-drag fallback) |
| `Shift` | Boost |
| `Space` / `Ctrl` | Climb / dive |
| `M` | Mute music |
| `Esc` | Close the open panel |

## Editing the resume

All content lives in [`src/content/resume.ts`](src/content/resume.ts) — a
`profile` object and a `sections` array. Nothing else needs editing.

The world adapts to that array: a beacon is generated for each section, the
expedition log sizes itself to the count, and landmark shapes and colours
cycle if you add more sections than there are presets. Section `id`s must stay
unique.

## Development

```bash
npm install
npm run dev
```

The dev server runs at `http://localhost:5173/skybound/` — the path reflects
the `base` in [`vite.config.ts`](vite.config.ts), which matches the GitHub
Pages subfolder.

```bash
npm run build     # type-check and bundle to dist/
npm run preview   # serve the production build locally
```

## Deployment

Pushing to `main` triggers [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml),
which builds the site and publishes it to GitHub Pages.

If you rename the repository or attach a custom domain, update `base` in
`vite.config.ts` to match — every asset URL resolves through it.

## Credits

Third-party assets used under Creative Commons Attribution:

- "Lowpoly Flying Ship" by Wordofcurse, via Sketchfab
- "Low Poly Floating Island" by camerondymott, via Sketchfab
- "LowPoly: small floating island" by Jean-Yves TRAN, via Sketchfab
- "Adventure Documentary" by leberch, via Pixabay

Models are licensed under CC BY 4.0. Music is courtesy of Pixabay.
