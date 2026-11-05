import type { Editor } from "./editor";

// Live examples: each preview is a sandboxed iframe (opaque origin, no access to this page),
// rendered when it scrolls near the viewport. "Edit" swaps the highlighted code for CodeMirror.

type Lang = "html" | "css" | "js";
type Source = Record<Lang, string | null>;

const SANDBOX = "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox";
// Neutral page defaults so examples render the same in light and dark mode; the example CSS follows and wins.
const BASE_CSS = "body{margin:16px;font-family:system-ui,sans-serif;color:#1b1b1b;background:#fff}";

function srcdoc(source: Source, id: string): string {
  const html = source.html ?? "";
  const fullDocument = /<html[\s>]|<!doctype/i.test(html);
  // The preview reports its height tagged with its element id so the page can size the frame.
  const resize = `<script>new ResizeObserver(() => parent.postMessage({ previewHeight: Math.ceil(document.documentElement.getBoundingClientRect().height), example: ${JSON.stringify(id)} }, "*")).observe(document.documentElement);<\/script>`;
  return (
    (fullDocument ? "" : `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}</style>`) +
    (source.css ? `<style>${source.css}</style>` : "") +
    html +
    (source.js ? `<script>${source.js}<\/script>` : "") +
    resize
  );
}

function combined(source: Source): string {
  return [source.html, source.css && `<style>\n${source.css}\n</style>`, source.js && `<script>\n${source.js}\n<\/script>`]
    .filter(Boolean)
    .join("\n\n");
}

function setup(root: HTMLElement) {
  const id = root.dataset.example!;
  const original: Source = JSON.parse(root.querySelector("[data-source]")!.textContent!);
  const current: Source = { ...original };
  const frameHost = root.querySelector<HTMLElement>("[data-frame]")!;
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
  const panels = [...root.querySelectorAll<HTMLElement>('[role="tabpanel"]')];
  const editButton = root.querySelector<HTMLButtonElement>('[data-action="edit"]')!;
  const resetButton = root.querySelector<HTMLButtonElement>('[data-action="reset"]')!;
  const copyButton = root.querySelector<HTMLButtonElement>('[data-action="copy"]')!;
  let frame: HTMLIFrameElement | null = null;
  let editors: (Editor & { lang: Lang })[] = [];
  let timer: number | undefined;

  const render = () => {
    if (frame) frame.srcdoc = srcdoc(current, id);
  };

  new IntersectionObserver(
    (entries, observer) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      observer.disconnect();
      frame = document.createElement("iframe");
      frame.title = `Live preview: ${frameHost.dataset.label}`;
      frame.setAttribute("sandbox", SANDBOX);
      frameHost.append(frame);
      render();
    },
    { rootMargin: "300px 0px" },
  ).observe(frameHost);

  const select = (tab: HTMLButtonElement) => {
    for (const t of tabs) {
      const selected = t === tab;
      t.setAttribute("aria-selected", String(selected));
      t.tabIndex = selected ? 0 : -1;
      panels.find((p) => p.id === t.getAttribute("aria-controls"))!.hidden = !selected;
    }
  };
  for (const tab of tabs) {
    tab.addEventListener("click", () => select(tab));
    tab.addEventListener("keydown", (e) => {
      const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (!step) return;
      const next = tabs[(tabs.indexOf(tab) + step + tabs.length) % tabs.length];
      select(next);
      next.focus();
    });
  }

  editButton.addEventListener("click", async () => {
    editButton.disabled = true;
    editButton.textContent = "Loading editor…";
    // Deliberately lazy: CodeMirror (about 190 KB gzipped) is only downloaded by readers who edit an example.
    const { createEditor } = await import("./editor");
    editors = panels.map((panel) => {
      const lang = panel.dataset.panel as Lang;
      panel.querySelector("pre")!.hidden = true;
      const editor = createEditor(panel, lang, current[lang] ?? "", (value) => {
        current[lang] = value;
        resetButton.hidden = false;
        clearTimeout(timer);
        timer = window.setTimeout(render, 300);
      });
      return { lang, ...editor };
    });
    editButton.textContent = "Editing";
    editButton.setAttribute("aria-pressed", "true");
    editors.find((e) => !panels.find((p) => p.dataset.panel === e.lang)!.hidden)?.focus();
  });

  resetButton.addEventListener("click", () => {
    Object.assign(current, original);
    for (const editor of editors) editor.set(original[editor.lang] ?? "");
    resetButton.hidden = true;
    render();
  });

  copyButton.addEventListener("click", async () => {
    await navigator.clipboard.writeText(combined(current));
    copyButton.textContent = "Copied";
    setTimeout(() => (copyButton.textContent = "Copy"), 1500);
  });
}

for (const root of document.querySelectorAll<HTMLElement>("[data-example]")) setup(root);

window.addEventListener("message", (e) => {
  const { previewHeight, example } = (e.data ?? {}) as { previewHeight?: unknown; example?: unknown };
  if (typeof previewHeight !== "number" || typeof example !== "string") return;
  const frame = document.querySelector<HTMLIFrameElement>(`[data-example="${CSS.escape(example)}"] iframe`);
  if (frame) frame.style.height = `${Math.min(Math.max(previewHeight, 140), 720)}px`;
});
