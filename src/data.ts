// Shape of data/elements.json, written by scripts/sync.ts from the official sources.
// HTML strings (whatwg, categories, desc...) are sanitized by the sync: only <a href>, <code>, <i>.

import elements from "../data/elements.json";
import sourcesJson from "../data/sources.json";

export type Attribute = { name: string; desc: string; value: string; href: string | null };

export type Baseline = { feature: string; status: "high" | "low" | false; lowDate: string | null; highDate: string | null };

export type Example = { html: string; css: string | null; js: string | null };

export type Element = {
  id: string;
  names: string[];
  spec: string | null;
  whatwg: string;
  categories: string;
  categoryList: string[];
  parents: string;
  children: string;
  attributes: Attribute[];
  globals: boolean;
  attrsNote: string | null;
  interface: string;
  advice: string | null;
  mdn: { url: string; summary: string } | null;
  status: { deprecated: boolean; experimental: boolean; standardTrack: boolean };
  support: Record<string, string> | null;
  baseline: Baseline | null;
  example: Example | null;
};

export type Section = {
  slug: string;
  number: string | null;
  title: string;
  kind: "standard" | "obsolete" | "proposals";
  spec: string | null;
  elements: Element[];
};

export type Data = { sections: Section[]; globalAttributes: Attribute[] };

export type Sources = { whatwg: string; mdn: string; bcd: string; webFeatures: string };

// The JSON is produced by our own sync script against these types.
export const data = elements as Data;
export const sources: Sources = sourcesJson;

export const BROWSERS: Record<string, string> = {
  chrome: "Chrome",
  edge: "Edge",
  firefox: "Firefox",
  safari: "Safari",
  chrome_android: "Chrome Android",
  safari_ios: "Safari iOS",
};

export const elementCount = data.sections.reduce((n, s) => n + s.elements.reduce((m, e) => m + e.names.length, 0), 0);

export const sectionUrl = (s: Section) => `/${s.slug}/`;
