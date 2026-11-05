# html-elements

Static site at `https://html.charmaweb.com`: every HTML element with a live editable
example, its attributes, content model, browser support and Baseline status. Astro 7,
TypeScript, Bun, hand-written CSS. Remote `Karlito8888/html-elements`, branch `main`.

## Commands

```bash
bun run sync     # download the sources, rewrite data/elements.json and data/sources.json
bun run dev      # http://localhost:4340
bun run check    # the gate: astro check && astro build
bun run preview  # serve dist/ on 4340 (daemonized: `bunx astro preview stop`)
```

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
