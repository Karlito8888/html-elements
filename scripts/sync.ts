/**
 * Download the official sources and write data/elements.json and data/sources.json.
 *
 * Sources:
 * - WHATWG HTML Living Standard: element index, attribute indices, obsolete features, TOC.
 * - MDN content (github.com/mdn/content): element summaries and their official examples.
 * - MDN browser-compat-data (npm @mdn/browser-compat-data): status flags and browser support.
 * - web-features (npm web-features): Baseline status.
 *
 * Run: bun run sync
 */

import { $ } from "bun";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Attribute, Baseline, Data, Element, Example, Section, Sources } from "../src/data";

const SPEC = "https://html.spec.whatwg.org/multipage/";
const MDN = "https://developer.mozilla.org/en-US/docs/";
const MDN_ELEMENTS = "files/en-us/web/html/reference/elements";
// Elements the WHATWG index lists but MDN documents outside its HTML reference.
const MDN_EXTRA: Record<string, string> = {
  svg: "files/en-us/web/svg/reference/element/svg",
  math: "files/en-us/web/mathml/reference/element/math",
};
const BROWSERS = ["chrome", "edge", "firefox", "safari", "chrome_android", "safari_ios"] as const;

// ------------------------------------------------------------------ download

async function get(url: string): Promise<Response> {
  const res = await fetch(url, { headers: { "User-Agent": "html-elements-sync" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
  return res;
}

/** Download an npm package tarball and return the parsed JSON of one file inside it. */
async function npmJson(pkg: string, file: string, dir: string): Promise<{ version: string; json: unknown }> {
  const meta: unknown = await (await get(`https://registry.npmjs.org/${pkg}/latest`)).json();
  const tarball = at(meta, ["dist", "tarball"]);
  const version = at(meta, ["version"]);
  if (typeof tarball !== "string" || typeof version !== "string") throw new Error(`npm metadata of ${pkg} has no tarball`);
  const tgz = join(dir, `${pkg.replace(/\W/g, "_")}.tgz`);
  await Bun.write(tgz, await get(tarball));
  const out = join(dir, pkg.replace(/\W/g, "_"));
  await $`mkdir -p ${out} && tar xzf ${tgz} -C ${out}`.quiet();
  return { version, json: await Bun.file(join(out, "package", file)).json() };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/** Read a nested property of untyped JSON; undefined as soon as a step is not an object. */
function at(value: unknown, path: string[]): unknown {
  for (const key of path) value = isRecord(value) ? value[key] : undefined;
  return value;
}

// ------------------------------------------------------------------ HTML helpers
// The spec omits optional end tags (</tr>, </td>, </dd>): rows and cells are split on their
// start tags instead of being parsed as a tree.

const HREF = /href=(?:"([^"]*)"|([^\s>]+))/;
const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

function unescape(s: string): string {
  return s.replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (m, e: string) => {
    if (e[0] === "#") return String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function escape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function text(fragment: string): string {
  return unescape(fragment.replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
}

/** Keep only <a href> (made absolute against `page`), <code> and <i>; drop every other tag and attribute. */
function clean(fragment: string, page = "indices.html"): string {
  const out = fragment.replace(/<(\/?)(\w+)([^>]*)>/g, (_, closing: string, name: string, attrs: string) => {
    name = name.toLowerCase();
    if (name === "code" || name === "i") return `<${closing}${name}>`;
    if (name !== "a") return "";
    if (closing) return "</a>";
    const h = attrs.match(HREF);
    if (!h) return "<a>";
    let href = unescape(h[1] ?? h[2]);
    if (href.startsWith("#")) href = SPEC + page + href;
    else if (!href.startsWith("http")) href = SPEC + href;
    return `<a href="${escape(href)}">`;
  });
  return out.replace(/\s+/g, " ").trim();
}

function tableBody(page: string, caption: string): string {
  const start = page.indexOf(`<caption>${caption}`);
  if (start < 0) throw new Error(`Table "${caption}" not found`);
  return page.slice(page.indexOf("<tbody>", start), page.indexOf("</table>", start));
}

const cells = (row: string) => row.split(/<t[hd]\b[^>]*>/).slice(1);
const rows = (body: string) => body.split("<tr>").slice(1);

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// ------------------------------------------------------------------ WHATWG

type Toc = Map<string, { num: string; title: string }>;

function parseToc(toc: string): Toc {
  const out: Toc = new Map();
  for (const m of toc.matchAll(/<a href=(?:"([^"]*)"|([^\s>]+))><span class=secno>([\d.]+)<\/span>([\s\S]*?)<\/a>/g)) {
    out.set(m[1] ?? m[2], { num: m[3], title: text(m[4]) });
  }
  return out;
}

type AttrInfo = { name: string; desc: string; value: string };

/** href of an attribute-on-element -> description, plus the global attributes.
 *  Event handler attributes are indexed for element lookups (body's onafterprint) but are not
 *  globals here: the site links their own index instead. */
function parseAttributes(indices: string): { byHref: Map<string, AttrInfo>; globals: Attribute[] } {
  const byHref = new Map<string, AttrInfo>();
  const globals: Attribute[] = [];
  for (const caption of ["List of attributes", "List of event handler content attributes"]) {
    for (const row of rows(tableBody(indices, caption))) {
      const c = cells(row);
      if (c.length < 4) continue;
      const info = { name: text(c[0]), desc: clean(c[2]), value: clean(c[3]) };
      if (caption === "List of attributes" && text(c[1]) === "HTML elements") {
        globals.push({ ...info, href: null });
      }
      for (const h of c[1].matchAll(new RegExp(HREF, "g"))) byHref.set(unescape(h[1] ?? h[2]), info);
    }
  }
  return { byHref, globals };
}

type Row = Omit<Element, "id" | "mdn" | "status" | "support" | "baseline" | "example" | "advice"> & { anchor: string };

function parseElements(indices: string, attrs: Map<string, AttrInfo>): Row[] {
  const out: Row[] = [];
  for (const row of rows(tableBody(indices, "List of elements"))) {
    const c = cells(row);
    let names = [...c[0].matchAll(/<code[^>]*><a href=([^ >]+)>([\w-]+)<\/a><\/code>/g)].map((m) => [m[1], m[2]]);
    if (!names.length) {
      // "SVG svg" and "MathML math" link to their own specifications.
      names = [...c[0].matchAll(/<a [^>]*?href=(?:"([^"]*)"|([^\s>]+))[^>]*>(?:SVG|MathML) <code>([\w-]+)<\/code><\/a>/g)]
        .map((m) => [m[1] ?? m[2], m[3]]);
    }
    if (!names.length) continue; // "autonomous custom elements" is a concept, not a tag name

    const attributes: Attribute[] = [];
    let globals = false;
    // MathML and SVG say "per [MATHML]" / "per [SVG]": their attributes live in those specs.
    const attrsNote = c[5].includes("references.html") ? clean(c[5]) : null;
    for (const m of c[5].matchAll(/<a href=(?:"([^"]*)"|([^\s>]+))[^>]*>([^<]+)<\/a>/g)) {
      const href = unescape(m[1] ?? m[2]);
      if (href.endsWith("#global-attributes")) {
        globals = true;
        continue;
      }
      if (href.includes("references.html")) continue;
      const info = attrs.get(href);
      attributes.push({ name: text(m[3]), desc: info?.desc ?? "", value: info?.value ?? "", href: SPEC + href });
    }
    const anchor = names[0][0];
    out.push({
      names: names.map((n) => n[1]),
      anchor,
      spec: anchor.startsWith("http") ? anchor : SPEC + anchor,
      whatwg: clean(c[1]),
      categories: clean(c[2]),
      categoryList: [...new Set(text(c[2]).split(";").map((p) => p.replace(/\*/g, "").trim()))]
        .filter((p) => p && p !== "none")
        .sort(),
      parents: clean(c[3]),
      children: clean(c[4]),
      attributes,
      globals,
      attrsNote,
      interface: clean(c[6]),
    });
  }
  return out;
}

/** WHATWG §16.2: groups of <dt> element names sharing one <dd> of advice. */
function parseObsolete(obsolete: string): { name: string; spec: string; advice: string }[] {
  const start = obsolete.indexOf("<dl", obsolete.indexOf("id=non-conforming-features"));
  const dl = obsolete.slice(start, obsolete.indexOf("</dl>", start));
  const out: { name: string; spec: string; advice: string }[] = [];
  let pending: [string, string][] = [];
  for (const m of dl.matchAll(/<(dt|dd)\b[^>]*>([\s\S]*?)(?=<dt\b|<dd\b|$)/g)) {
    if (m[1] === "dt") {
      const d = m[2].match(/<dfn id=([\w-]+)[^>]*><code>([\w-]+)<\/code>/) ?? m[2].match(/<a href=#([\w-]+)>([\w-]+)<\/a>/);
      if (d) pending.push([d[2], `${SPEC}obsolete.html#${d[1]}`]);
    } else {
      for (const [name, spec] of pending) out.push({ name, spec, advice: clean(m[2], "obsolete.html") });
      pending = [];
    }
  }
  return out;
}

// ------------------------------------------------------------------ MDN

/** The subset of MDN markdown and macros used in element summaries, to HTML. */
function mdInline(src: string): string {
  const slots: string[] = [];
  const keep = (fragment: string) => `\u0000${slots.push(fragment) - 1}\u0000`;

  let s = src.replace(/\{\{\s*(\w+)\s*\((.*?)\)\s*\}\}/g, (_, name: string, rawArgs: string) => {
    const args = [...rawArgs.matchAll(/"([^"]*)"/g)].map((a) => a[1]);
    const macro = name.toLowerCase();
    if (macro === "htmlelement" && args.length) {
      const tag = args[0].toLowerCase();
      return keep(`<a href="${MDN}Web/HTML/Reference/Elements/${tag}"><code>&lt;${escape(tag)}&gt;</code></a>`);
    }
    if (macro === "glossary" && args.length) {
      return keep(`<a href="${MDN}Glossary/${args[0].replace(/ /g, "_")}">${escape(args.at(-1)!)}</a>`);
    }
    return args.length ? keep(`<code>${escape(args[0])}</code>`) : "";
  });
  s = s.replace(/\{\{[^}]*\}\}/g, "");
  s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label: string, url: string) => {
    if (url.startsWith("/")) url = "https://developer.mozilla.org" + url;
    return keep(`<a href="${escape(url)}">${mdInline(label)}</a>`);
  });
  s = s.replace(/`([^`]+)`/g, (_, code: string) => keep(`<code>${escape(code)}</code>`));
  s = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/(?<!\w)_(.+?)_(?!\w)/g, "<em>$1</em>");
  while (s.includes("\u0000")) s = s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)]);
  return s.replace(/\s+/g, " ").trim();
}

// Root-relative MDN asset paths only resolve on developer.mozilla.org.
const ASSETS = /(?<=["'(\s,])\/shared-assets\//g;

/** The page's interactive example, else the first example of its Examples section. */
function mdnExample(body: string): Example | null {
  const fence = /^```(\w+)([^\n]*)\n([\s\S]*?)^```/gm;
  let blocks = [...body.matchAll(fence)].filter((m) => m[2].includes("interactive-example")).map((m) => [m[1], m[3]]);
  if (!blocks.length && body.includes("\n## Examples")) {
    const section = body.split("\n## Examples")[1].split("\n## ")[0];
    for (const chunk of section.split("\n### ")) {
      const found = [...chunk.matchAll(fence)].map((m) => [m[1], m[3]]);
      if (found.some(([lang]) => lang === "html")) {
        blocks = found;
        break;
      }
    }
  }
  const out: Partial<Record<"html" | "css" | "js", string>> = {};
  for (const [lang, code] of blocks) {
    if (lang !== "html" && lang !== "css" && lang !== "js") continue;
    out[lang] = [out[lang], code.trim()].filter(Boolean).join("\n\n").replace(ASSETS, "https://developer.mozilla.org/shared-assets/");
  }
  return out.html ? { html: out.html, css: out.css ?? null, js: out.js ?? null } : null;
}

async function readMdn(root: string, name: string) {
  const rel = MDN_EXTRA[name] ?? `${MDN_ELEMENTS}/${/^h[1-6]$/.test(name) ? "heading_elements" : name}`;
  const file = Bun.file(join(root, rel, "index.md"));
  if (!(await file.exists())) return null;
  const [, front, ...rest] = (await file.text()).split("---");
  const body = rest.join("---");
  const slug = front.match(/^slug: (.+)$/m)![1].trim();
  const compat = front.match(/^browser-compat:\s*(\S+)$/m)?.[1] ?? front.match(/^\s+- (\w+\.elements\.[\w-]+)$/m)?.[1] ?? null;
  const paragraph = body.trim().split("\n\n").find((p) => p.trim() && !/^\s*(\{\{|#|>|```)/.test(p));
  return { url: MDN + slug, summary: paragraph ? mdInline(paragraph) : "", compat, example: mdnExample(body) };
}

// ------------------------------------------------------------------ BCD and web-features

type Compat = { status: Element["status"]; support: Record<string, string>; spec: string | null };

function readCompat(bcd: unknown, key: string): Compat | null {
  const c = at(bcd, [...key.split("."), "__compat"]);
  if (!isRecord(c)) return null;
  const spec = c.spec_url;
  return {
    status: {
      deprecated: at(c, ["status", "deprecated"]) === true,
      experimental: at(c, ["status", "experimental"]) === true,
      standardTrack: at(c, ["status", "standard_track"]) !== false,
    },
    support: Object.fromEntries(BROWSERS.map((b) => [b, supportLabel(at(c, ["support", b]))])),
    spec: typeof spec === "string" ? spec : Array.isArray(spec) && typeof spec[0] === "string" ? spec[0] : null,
  };
}

/** BCD support statement -> first version with support; the first statement is the main one. */
function supportLabel(statement: unknown): string {
  const first: unknown = Array.isArray(statement) ? statement[0] : statement;
  if (!isRecord(first)) return "?";
  const added = first.version_added;
  let label = added === true ? "Yes" : added === false ? "No" : added === "preview" ? "Preview" : typeof added === "string" ? added : "?";
  if (first.flags) label += " (flag)";
  if (typeof first.prefix === "string") label += ` (${first.prefix} prefix)`;
  if (typeof first.version_removed === "string") label += `, removed in ${first.version_removed}`;
  return label;
}

/** BCD compat key -> Baseline status of the web-features feature that contains it.
 *  Discouraged features are skipped: web-features says to show their discouraged status instead. */
function baselineIndex(features: unknown): Map<string, Baseline> {
  if (!isRecord(features)) throw new Error("web-features data has no features object");
  const out = new Map<string, Baseline>();
  for (const [id, f] of Object.entries(features)) {
    if (!isRecord(f) || f.kind !== "feature" || f.discouraged) continue;
    const status = f.status;
    if (!isRecord(status)) continue;
    const level = status.baseline;
    if (level !== "high" && level !== "low" && level !== false) continue;
    const date = (v: unknown) => (typeof v === "string" ? v : null);
    for (const key of Array.isArray(f.compat_features) ? f.compat_features : []) {
      if (typeof key !== "string") continue;
      out.set(key, { feature: id, status: level, lowDate: date(status.baseline_low_date), highDate: date(status.baseline_high_date) });
    }
  }
  return out;
}

// ------------------------------------------------------------------ assembly

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "html-elements-"));
  try {
    const [toc, indices, obsolete] = await Promise.all(
      ["", "indices.html", "obsolete.html"].map(async (p) => (await get(SPEC + p)).text()),
    );
    const mdnRoot = join(dir, "mdn-content");
    await $`git clone -q --depth 1 --filter=blob:none --sparse https://github.com/mdn/content ${mdnRoot}`;
    await $`git -C ${mdnRoot} sparse-checkout set ${MDN_ELEMENTS} ${Object.values(MDN_EXTRA)}`;
    const [bcd, webFeatures] = await Promise.all([
      npmJson("@mdn/browser-compat-data", "data.json", dir),
      npmJson("web-features", "data.json", dir),
    ]);
    const baseline = baselineIndex(at(webFeatures.json, ["features"]));

    const tocMap = parseToc(toc);
    const { byHref, globals } = parseAttributes(indices);
    const sections = new Map<string, Section>();
    const order = new Map<Element, number[]>();
    const seen = new Set<string>();
    const elements: { el: Element; mdnName: string }[] = [];

    const sectionFor = (key: string, init: () => Section) => {
      if (!sections.has(key)) sections.set(key, init());
      return sections.get(key)!;
    };

    const extraAnchor: Record<string, string> = { svg: "embedded-content-other.html#svg-0", math: "embedded-content-other.html#mathml" };
    for (const row of parseElements(indices, byHref)) {
      const anchor = extraAnchor[row.names[0]] ?? row.anchor;
      const entry = tocMap.get(anchor);
      if (!entry) throw new Error(`No TOC entry for ${anchor}`);
      const num = entry.num.split(".").slice(0, 2).join(".");
      const [href, top] = [...tocMap.entries()].find(([, t]) => t.num === num)!;
      const section = sectionFor(num, () => ({
        slug: slugify(top.title), number: num, title: top.title, kind: "standard", spec: SPEC + href, elements: [],
      }));
      const { anchor: _, ...rest } = row;
      const id = row.names.length > 1 ? `${row.names[0]}-${row.names.at(-1)}` : row.names[0];
      const el: Element = { ...emptyElement(id, row.spec), ...rest, id };
      section.elements.push(el);
      order.set(el, entry.num.split(".").map(Number));
      elements.push({ el, mdnName: row.names[0] });
      row.names.forEach((n) => seen.add(n));
    }

    const obsoleteSection = sectionFor("obsolete", () => ({
      slug: "obsolete", number: "16.2", title: "Obsolete elements", kind: "obsolete",
      spec: `${SPEC}obsolete.html#non-conforming-features`, elements: [],
    }));
    for (const ob of parseObsolete(obsolete)) {
      if (seen.has(ob.name)) continue;
      seen.add(ob.name);
      const el = emptyElement(ob.name, ob.spec);
      el.advice = ob.advice;
      obsoleteSection.elements.push(el);
      elements.push({ el, mdnName: ob.name });
    }

    const proposals = sectionFor("proposals", () => ({
      slug: "proposals", number: null, title: "Proposals and non-standard elements", kind: "proposals", spec: null, elements: [],
    }));
    const mdnNames = (await readdir(join(mdnRoot, MDN_ELEMENTS), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
    const bcdElements = at(bcd.json, ["html", "elements"]);
    if (!isRecord(bcdElements)) throw new Error("browser-compat-data has no html.elements");
    const others = [...new Set([...Object.keys(bcdElements), ...mdnNames])]
      .filter((n) => !seen.has(n) && n !== "heading_elements")
      .sort();
    for (const name of others) {
      const el = emptyElement(name, null);
      proposals.elements.push(el);
      elements.push({ el, mdnName: name });
    }

    for (const { el, mdnName } of elements) {
      const mdn = await readMdn(mdnRoot, mdnName);
      el.mdn = mdn && { url: mdn.url, summary: mdn.summary };
      el.example = mdn?.example ?? null;
      const key = mdn?.compat ?? `html.elements.${mdnName}`;
      const c = readCompat(bcd.json, key);
      el.status = c?.status ?? { deprecated: false, experimental: false, standardTrack: true };
      el.support = c?.support ?? null;
      el.baseline = baseline.get(key) ?? null;
      el.spec ??= c?.spec ?? null;
    }

    const byNumber = (a: number[], b: number[]) => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) - (b[i] ?? 0);
      return 0;
    };
    for (const s of sections.values()) {
      if (s.kind === "standard") s.elements.sort((a, b) => byNumber(order.get(a)!, order.get(b)!));
      else s.elements.sort((a, b) => a.names[0].localeCompare(b.names[0]));
    }
    const sorted = [...sections.values()].sort((a, b) => {
      const rank = (s: Section) => (s.kind === "standard" ? 0 : s.kind === "obsolete" ? 1 : 2);
      return rank(a) - rank(b) || byNumber((a.number ?? "0").split(".").map(Number), (b.number ?? "0").split(".").map(Number));
    });

    const data: Data = { sections: sorted, globalAttributes: globals };
    const mdnCommit = (await $`git -C ${mdnRoot} log -1 --format=%cs\ %h`.text()).trim();
    const sources: Sources = {
      whatwg: toc.match(/<span class=pubdate>([^<]+)<\/span>/)![1],
      mdn: mdnCommit,
      bcd: bcd.version,
      webFeatures: webFeatures.version,
    };
    await Bun.write("data/elements.json", JSON.stringify(data, null, 1) + "\n");
    await Bun.write("data/sources.json", JSON.stringify(sources, null, 2) + "\n");

    const all = sorted.flatMap((s) => s.elements);
    console.log(
      `data/elements.json: ${all.reduce((n, e) => n + e.names.length, 0)} element names, ${all.length} entries, ` +
        `${sorted.length} sections, ${all.filter((e) => e.example).length} examples, ${all.filter((e) => e.baseline).length} with Baseline`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function emptyElement(name: string, spec: string | null): Element {
  return {
    id: name, names: [name], spec, whatwg: "", categories: "", categoryList: [], parents: "", children: "",
    attributes: [], globals: false, attrsNote: null, interface: "", advice: null,
    mdn: null, status: { deprecated: false, experimental: false, standardTrack: true }, support: null, baseline: null, example: null,
  };
}

await main();
