# HTML Elements

Every HTML element, alive: <https://html.charmaweb.com>

Each element has a live preview you can edit, its attributes, content model, browser
support and Baseline status. Every description is quoted from the official
documentation, nothing is paraphrased:

- [WHATWG HTML Living Standard](https://html.spec.whatwg.org/multipage/) (element and attribute indices, obsolete features)
- [MDN](https://github.com/mdn/content) (summaries and examples)
- [MDN browser-compat-data](https://github.com/mdn/browser-compat-data) (status and support)
- [web-features](https://github.com/web-platform-dx/web-features) (Baseline)

## Run it

Requires [Bun](https://bun.sh) and Node 22.23.4 or later.

```bash
bun install
bun run sync   # refresh data/ from the sources
bun run dev    # http://localhost:4340
bun run check  # type-check and build to dist/
```

## Licence

The code is under the MIT licence (`LICENSE`). The content quotes the WHATWG standard
(© WHATWG, CC BY 4.0), MDN prose (CC BY-SA 2.5), MDN code examples and browser-compat-data
(CC0) and web-features (Apache 2.0), so the site content is shared under
[CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/).
