---
paths:
  - "**/*.{tsx,jsx,css,scss,html}"
  - "**/jsMain/**/*.kt"
  - "**/presentation/web/**/*.kt"
  - "**/resources/static/**"
  - "**/resources/templates/**"
---

# UI Design Quality (anti-slop)

Applies to React/Tailwind frontends and to Ktor-served UIs (kotlinx.html, Kotlin/JS, static CSS).

## Before writing UI

- Read the project's `DESIGN.md` and `PRODUCT.md` if present; they win over any skill or default. If neither exists and the task is more than a small fix, run `impeccable` to create them first (audience, tone, one reference product, palette, type scale).
- Pick a direction on purpose: one typeface pairing, one accent color, one density. Never fall back to "Inter + slate + indigo gradient".

## Tokens

- All colors, spacing, radii, shadows and font sizes are CSS custom properties (`:root` / Tailwind `@theme`). No raw hex or px values scattered through components or Kotlin code.
- A type scale with clear steps (e.g. 12/14/16/20/28/40) and a 4 or 8 px spacing grid. Tabular numbers for data.

## Ban list (AI tells)

- Gradient text, purple/indigo-to-pink gradients, glow or neon shadows, glassmorphism as decoration.
- Colored left borders on cards ("side tabs"), cards nested in cards, every section in a rounded card.
- Emoji as icons, generic hero with three feature cards, centered everything.
- Bounce/elastic easing, animations on every element, placeholder lorem or "Lorem ipsum"-style fake stats.
- Low-contrast gray-on-gray text; contrast must meet WCAG AA.

## Kotlin/Ktor frontends

- kotlinx.html: no inline `style` attributes; use semantic elements and class names that map to a single stylesheet built on the tokens above. Extract repeated markup into functions (`FlowContent.card(...)`), like components.
- Kotlin/JS (Compose HTML, Kobweb, KVision): keep styles in one stylesheet object or CSS file using the same tokens; no per-element style lambdas for colors and sizes.
- `impeccable detect` (the skill's `scripts/impeccable` launcher, `impeccable.cmd` on Windows without `sh`) does not scan `.kt`: run it on the rendered HTML (save a page or point it at the served URL) and on the CSS files.

## Verify visually

- Run the app and take screenshots with chrome-devtools at 1440 px and 390 px wide. Fix what looks off, then screenshot again; stop after two rounds and report what is left.
- Use `impeccable` (critique/polish/audit) for review, but never enable `impeccable hooks on` (it adds a per-edit hook); `apple-design` only for gesture-driven or physical motion and functional translucency. Never call a design "polished" from code alone.
