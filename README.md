# Gabriel Accetta — Portfolio

A dark, editorial single-page portfolio for a software engineer. Built as an
awwwards-style experience: large Fraunces display type, monospace technical
labels, and an interactive WebGL starfield in the hero.

## Stack

- **Vite + TypeScript** — build & dev server
- **Three.js** — interactive hero starfield (twinkle, pointer parallax,
  cursor illumination + faint constellation lines). Near-monochrome with a
  single restrained ember accent.
- **GSAP + ScrollTrigger** — intro timeline, scroll reveals, velocity-aware
  skills marquee
- **Lenis** — smooth scrolling
- **Custom CSS** — bespoke editorial design system (no UI framework)

## Design

- Dark, warm-night palette: deep near-black, warm off-white text, one ember
  accent used sparingly.
- Type: Fraunces (display serif + italic accents), JetBrains Mono (labels),
  Inter (body).
- Fully responsive with a dedicated mobile menu, and respects
  `prefers-reduced-motion`.

## Develop

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # type-check + production build to /dist
pnpm preview  # preview the production build
```

## Notes

- The starfield pauses rendering when the hero scrolls out of view, caps the
  device pixel ratio, and reduces star count on touch devices.
- All animation initial states are guarded behind a `.js` class so content
  remains visible if scripts fail; a preloader failsafe also self-clears.
