# html-elements

Static site at `https://html.charmaweb.com`: every HTML element with a live editable
example, its attributes, content model, browser support and Baseline status. Astro 7,
TypeScript, Vite+ (`vp`, Bun underneath), hand-written CSS. Remote `Karlito8888/html-elements`, branch `main`.

## Commands

```bash
vp run sync     # download the sources, rewrite data/elements.json and data/sources.json
vp run validate # send every showcase to the W3C Nu HTML Checker (network; run by hand, not in CI)
vp run dev      # http://localhost:4340
vp run gate     # the gate: astro check && vp check && astro build
vp run preview  # serve dist/ on 4340 (daemonized: `vpx astro preview stop`)
```

`vp check` formats with Oxfmt and lints and type-checks with Oxlint, configured in `vite.config.ts`
(`src/showcases/`, `data/` and `wrangler.jsonc` are left unformatted); `.astro` files are covered
by `astro check` only. `scripts/*.ts` use Bun APIs, so they run with `bun` through the `sync` and
`validate` scripts. Hooks live in `.vite-hooks/` (`vp staged` on commit).

## Data

`scripts/sync.ts` is the only writer of `data/`. It reads, in raw HTTP or from npm:

| Source | Used for |
|---|---|
| WHATWG `multipage/indices.html` (element, attribute and event handler indices) | element list, short description, categories, parents, children, attributes, interface |
| WHATWG `multipage/obsolete.html` § 16.2 | obsolete elements and the replacement advice |
| WHATWG `multipage/` TOC | section numbers, titles, slugs, order |
| `github.com/mdn/content` (sparse clone) | MDN summary (first paragraph) and example (`interactive-example` fences, else the first `## Examples` subsection) |
| npm `@mdn/browser-compat-data` | deprecated / experimental / standard-track flags, first supported version |
| npm `web-features` | Baseline status, through the feature that lists the element's compat key |

The WHATWG pages omit optional end tags, so the sync splits rows and cells on start tags
rather than parsing a tree. `src/data.ts` holds the types both sides share.

`data/sources.json` changes on almost every run (spec date, MDN commit); the weekly
workflow opens a pull request only when `data/elements.json` changes.

## Layout

- `src/pages/index.astro` home, `[section].astro` one page per spec section (plus
  `obsolete` and `proposals`), `global-attributes.astro`, `404.astro`, `search.json.ts` the
  search index.
- `src/components/ElementBlock.astro` one element; `Example.astro` preview plus Shiki code
  tabs; `Search.astro` combobox over `/search.json`; `ThemeToggle.astro` auto / light / dark
  in `localStorage`; `SectionNav.astro` sidebar.
- `src/scripts/examples.ts` previews: sandboxed `srcdoc` iframes (no `allow-same-origin`)
  mounted when near the viewport, sized by a `postMessage` tagged with the element id.
  `src/scripts/editor.ts` CodeMirror, imported only on "Edit" (about 190 KB gzipped).

## Section showcases

Each standard section page opens with a hand-written demo page that uses every element of
the section: `src/showcases/<slug>.html`, plus optional `.css` and `.js` (4.1 and 4.2 are
full documents and keep their CSS inside). `src/showcases.ts` loads them and fails the
build when a standard section has no showcase or a showcase skips one of its elements;
`src/showcase-document.ts` builds the complete document that `vp run validate` checks.
Obsolete and proposals have none, by choice.

`Example.astro` with the `showcase` prop draws a browser-window bar (the tab shows the
demo's `<title>` and icon), a "Show tags" toggle and the section's elements as chips. The
preview runs `xrayAgent` (in `examples.ts`): it outlines the section's elements, labels the
one under the pointer, asks the page to open an element's details on click, and reports
which elements are not drawn (dashed chips). The page sends it commands through a
`MessagePort` the preview hands over at startup. Observed 2026-11-05 in headless Chromium:
the site script's `postMessage` to the sandboxed frame's window threw "Illegal invocation"
and never arrived, while the port works; the cause was not isolated.

`validate` tolerates only the checker's CSS errors on `appearance: base-select` and
`::picker(select)` (customizable select, which its CSS parser does not know yet) and still
prints them.

## Deployment

Cloudflare Worker `html-elements` (static assets, `wrangler.jsonc`) in the
`charmaweb11@gmail.com` account, custom domain `html.charmaweb.com`, deployed by
`.github/workflows/deploy.yml` on every push to `main` (secret `CLOUDFLARE_API_TOKEN`,
variable `CLOUDFLARE_ACCOUNT_ID`, same setup as abaddon). `.github/workflows/sync.yml`
runs the sync every Monday and opens a pull request.

## Licences

Code MIT (`LICENSE`). Content quotes WHATWG (CC BY 4.0), MDN prose (CC BY-SA 2.5), MDN
code examples and browser-compat-data (CC0), web-features (Apache 2.0); the site content
is therefore CC BY-SA 2.5, credited in the footer.
