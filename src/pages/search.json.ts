import { data, sectionUrl } from "../data";

// Static search index: one entry per element, fetched by the Search component on first use.
export function GET() {
  const strip = (html: string) =>
    html
      .replace(/<[^>]+>/g, "")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  const index = data.sections.flatMap((section) =>
    section.elements.map((e) => ({
      names: e.names,
      text: strip(e.whatwg || e.mdn?.summary || ""),
      section: section.title,
      url: `${sectionUrl(section)}#${e.id}`,
    })),
  );
  return new Response(JSON.stringify(index), { headers: { "Content-Type": "application/json" } });
}
