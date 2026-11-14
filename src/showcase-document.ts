import type { Example } from "./data";

/** The complete document a showcase becomes: what `vp run validate` sends to the W3C checker. */
export function showcaseDocument({ html, css, js }: Example): string {
  if (/<html[\s>]/i.test(html)) {
    if (css || js)
      throw new Error("A full-document showcase keeps its CSS and JS inside its own HTML");
    return html;
  }
  const script = js ? `<script>${js}</script>` : "";
  const body = /<body[\s>]/i.test(html)
    ? html.replace(/<\/body>/i, `${script}</body>`)
    : `<body>${html}${script}</body>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Showcase</title>${css ? `<style>${css}</style>` : ""}</head>${body}</html>`;
}
