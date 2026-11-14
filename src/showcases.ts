// Section showcases: one hand-written page per standard section, using every element of that
// section. Files live in src/showcases/<slug>.html (+ optional .css and .js) and are checked by
// `vp run validate` against the W3C Nu HTML Checker.

import type { Example, Section } from "./data";
import { showcaseDocument } from "./showcase-document";

const FILES = import.meta.glob<string>("./showcases/*.{html,css,js}", {
  query: "?raw",
  import: "default",
  eager: true,
});

/** The showcase of a standard section. The build fails if it is missing or skips an element. */
export function showcaseFor(section: Section): Example | null {
  if (section.kind !== "standard") return null;
  const read = (ext: string) => FILES[`./showcases/${section.slug}.${ext}`]?.trim() || null;
  const html = read("html");
  if (!html)
    throw new Error(
      `No showcase for section "${section.slug}": add src/showcases/${section.slug}.html`,
    );
  const showcase = { html, css: read("css"), js: read("js") };
  const source = showcaseDocument(showcase);
  const missing = section.elements
    .flatMap((e) => e.names)
    .filter((n) => !new RegExp(`<${n}[\\s>/]`, "i").test(source));
  if (missing.length)
    throw new Error(
      `Showcase "${section.slug}" does not use ${missing.map((n) => `<${n}>`).join(", ")}`,
    );
  return showcase;
}
