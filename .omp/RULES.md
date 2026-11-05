# html-elements rules

Hard requirements of this repository, carried on every request and by every subagent.
Layout, commands and reasons are in the root `AGENTS.md`, which subagents do not receive:
read it by path.

- **Quoted, never written.** Element descriptions, attributes, examples, status and support
  come only from the official sources through `bun run sync`. Never hand-edit
  `data/elements.json` or `data/sources.json`, never write a description or an example
  from memory. Fix a wrong value in `scripts/sync.ts`, then re-run the sync. Two exceptions
  are hand-written: UI copy, such as the beginner sentence on each home-page card (`GUIDE`
  in `src/pages/index.astro`), which must only name elements the section contains; and the
  section showcases in `src/showcases/`, which must use every element of their section (the
  build fails otherwise) and pass `bun run validate` (W3C Nu HTML Checker) after any change.
- **No em dash** in any UI text.
- **Full Bun.** `bun add` / `bun install` only, `bun.lock` is the one lockfile.
- **The gate is `bun run check`** (`astro check && astro build`), zero errors, run before
  claiming anything works; a UI change is also checked in a browser.
- **Content English only**, site copy included. Static output only: no server code, no
  analytics, no cookie.
