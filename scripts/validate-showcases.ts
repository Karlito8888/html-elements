/**
 * Send every section showcase to the W3C Nu HTML Checker and fail on any error.
 * Showcases are hand-written, so this is what proves they conform to the HTML standard.
 *
 * Run: bun run validate
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { showcaseDocument } from "../src/showcase-document";

const DIR = "src/showcases";
const CHECKER = "https://validator.w3.org/nu/?out=json";

type Message = { type: string; subType?: string; message: string; lastLine?: number; extract?: string };

// The checker's CSS parser predates customizable select: it rejects `appearance: base-select`
// and `::picker(select)`, which MDN's "Customizable select elements" guide requires. Only CSS
// messages on those exact constructs are tolerated; they are still printed.
const knownGap = (m: Message) => m.message.startsWith("CSS:") && /base-select|::picker\(select\)/.test(m.extract ?? "");

const slugs = [...new Set((await readdir(DIR)).filter((f) => f.endsWith(".html")).map((f) => f.slice(0, -5)))].sort();
let errors = 0;

for (const slug of slugs) {
  const read = async (ext: string) => {
    const file = Bun.file(join(DIR, `${slug}.${ext}`));
    return (await file.exists()) ? file.text() : null;
  };
  const html = (await read("html"))!;
  const doc = showcaseDocument({ html, css: await read("css"), js: await read("js") });
  const res = await fetch(CHECKER, {
    method: "POST",
    headers: { "Content-Type": "text/html; charset=utf-8", "User-Agent": "html-elements-validate" },
    body: doc,
  });
  if (!res.ok) throw new Error(`Checker answered HTTP ${res.status} for ${slug}`);
  const { messages } = (await res.json()) as { messages: Message[] };
  const failed = messages.filter((m) => (m.type === "error" || m.subType === "fatal") && !knownGap(m));
  errors += failed.length;
  console.log(`${failed.length ? "✗" : "✓"} ${slug}: ${failed.length} errors, ${messages.length - failed.length} other messages`);
  for (const m of messages) {
    const kind = knownGap(m) ? "known checker gap" : `${m.type}${m.subType ? `/${m.subType}` : ""}`;
    console.log(`    ${kind} line ${m.lastLine ?? "?"}: ${m.message}`);
  }
}

if (errors) {
  console.error(`${errors} validation errors.`);
  process.exit(1);
}
