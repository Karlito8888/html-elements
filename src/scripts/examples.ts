import type { Editor } from "./editor";

// Live examples: each preview is a sandboxed iframe (opaque origin, no access to this page),
// rendered when it scrolls near the viewport. "Edit" swaps the highlighted code for CodeMirror.
// Section showcases add a browser-window bar, a "Show tags" mode and a list of their elements.

type Lang = "html" | "css" | "js";
type Source = Record<Lang, string | null>;
type Xray = { tags: string[]; urls: Record<string, string> };

const SANDBOX =
  "allow-scripts allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox";
// Neutral page defaults so examples render the same in light and dark mode; the example CSS follows and wins.
const BASE_CSS = "body{margin:16px;font-family:system-ui,sans-serif;color:#1b1b1b;background:#fff}";

/**
 * Runs inside a showcase preview. Serialized with toString(), so it must not use anything from
 * this module. Reports the page title, icon and which section elements are not drawn; outlines
 * elements when "Show tags" is on; a click (a second tap on touch screens) asks the page to open
 * that element's details.
 */
function xrayAgent(id: string, tags: string[], initiallyOn: boolean) {
  const post = (message: object) => parent.postMessage({ example: id, ...message }, "*");
  const sectionTags = new Set(tags);
  const selector = tags.join(",");
  const style = document.createElement("style");
  style.textContent = `
    html.xray-on:is(${selector}), html.xray-on :is(${selector}) { outline: 2px dashed #f06529 !important; outline-offset: -2px; }
    html.xray-on, html.xray-on * { cursor: help !important; }
    [data-xray-match] { outline: 3px solid #a855f7 !important; outline-offset: 1px; background-color: rgb(168 85 247 / 0.15) !important; }
    xray-box { position: fixed; z-index: 2147483647; pointer-events: none; display: none; border: 2px solid #f06529; border-radius: 4px; background: rgb(240 101 41 / 0.1); }
    xray-label { position: absolute; left: -2px; bottom: 100%; font: 600 12px/1.6 ui-monospace, monospace; color: #fff; background: #f06529; padding: 0 6px; border-radius: 4px 4px 4px 0; white-space: nowrap; }
    xray-box.below xray-label { bottom: auto; top: 0; border-radius: 0 0 4px 0; }
    xray-box.other { border-color: #64748b; background: rgb(100 116 139 / 0.08); }
    xray-box.other xray-label { background: #64748b; }`;
  document.head.append(style);
  const box = document.createElement("xray-box");
  const label = document.createElement("xray-label");
  box.append(label);
  document.documentElement.append(box);

  let on = initiallyOn;
  let pointer = "mouse";
  let touched: Element | null = null;
  document.documentElement.classList.toggle("xray-on", on);

  const show = (el: Element | null) => {
    if (!on || !el || box.contains(el)) {
      box.style.display = "none";
      return;
    }
    const r = el.getBoundingClientRect();
    box.className = `${sectionTags.has(el.localName) ? "" : "other"} ${r.top < 22 ? "below" : ""}`;
    Object.assign(box.style, {
      display: "block",
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    label.textContent = `<${el.localName}>`;
  };

  addEventListener("pointerdown", (e: PointerEvent) => (pointer = e.pointerType), true);
  addEventListener("mouseover", (e) => show(e.target instanceof Element ? e.target : null), true);
  document.documentElement.addEventListener("mouseleave", () => show(null));
  addEventListener("scroll", () => show(null), true);
  addEventListener(
    "click",
    (e) => {
      if (!on || !(e.target instanceof Element)) return;
      e.preventDefault();
      e.stopPropagation();
      if (pointer !== "mouse" && touched !== e.target) {
        touched = e.target;
        show(e.target);
        return;
      }
      post({ navigate: e.target.localName });
    },
    true,
  );

  // Commands from the page arrive on a MessagePort handed over at startup: in headless Chromium
  // (2026-11-05) the page's postMessage to this sandboxed frame threw "Illegal invocation".
  const channel = new MessageChannel();
  channel.port1.onmessage = (e) => {
    const data = (e.data ?? {}) as { xray?: unknown; highlight?: unknown };
    if (typeof data.xray === "boolean") {
      on = data.xray;
      document.documentElement.classList.toggle("xray-on", on);
      if (!on) show(null);
    }
    if ("highlight" in data) {
      for (const el of document.querySelectorAll("[data-xray-match]"))
        el.removeAttribute("data-xray-match");
      if (typeof data.highlight !== "string") return;
      const matches = [...document.getElementsByTagName(data.highlight)];
      for (const el of matches) el.setAttribute("data-xray-match", "");
      const first = matches.find((el) => el.getClientRects().length > 0);
      const r = first?.getBoundingClientRect();
      // Scroll the preview itself only, never the page around it.
      if (r && (r.top < 0 || r.bottom > innerHeight))
        scrollBy({ top: r.top - 40, behavior: "smooth" });
    }
  };
  parent.postMessage({ example: id, port: true }, "*", [channel.port2]);

  const report = () =>
    post({
      title: document.title,
      icon: document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ?? null,
      hidden: tags.filter(
        (t) => ![...document.getElementsByTagName(t)].some((el) => el.getClientRects().length > 0),
      ),
    });
  report();
  addEventListener("load", report);
}

function srcdoc(source: Source, id: string, xray: (Xray & { on: boolean }) | null): string {
  const html = source.html ?? "";
  const fullDocument = /<html[\s>]|<!doctype/i.test(html);
  // The preview reports its height tagged with its element id so the page can size the frame.
  const resize = `<script>new ResizeObserver(() => parent.postMessage({ previewHeight: Math.ceil(document.documentElement.getBoundingClientRect().height), example: ${JSON.stringify(id)} }, "*")).observe(document.documentElement);</script>`;
  const agent = xray
    ? `<script>(${xrayAgent.toString()})(${JSON.stringify(id)}, ${JSON.stringify(xray.tags)}, ${xray.on});</script>`
    : "";
  return (
    (fullDocument ? "" : `<!doctype html><meta charset="utf-8"><style>${BASE_CSS}</style>`) +
    (source.css ? `<style>${source.css}</style>` : "") +
    html +
    (source.js ? `<script>${source.js}</script>` : "") +
    resize +
    agent
  );
}

function combined(source: Source): string {
  return [
    source.html,
    source.css && `<style>\n${source.css}\n</style>`,
    source.js && `<script>\n${source.js}\n</script>`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

const handlers = new Map<
  string,
  (data: Record<string, unknown>, ports: readonly MessagePort[]) => void
>();

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
  const maxHeight = Number(root.dataset.maxHeight ?? 720);
  // Showcase only: written by Example.astro from the section's elements.
  const xrayJson = root.querySelector("[data-xray]")?.textContent;
  const xray: Xray | null = xrayJson ? JSON.parse(xrayJson) : null;
  let xrayOn = false;
  let frame: HTMLIFrameElement | null = null;
  let editors: (Editor & { lang: Lang })[] = [];
  let timer: number | undefined;

  const render = () => {
    if (frame) frame.srcdoc = srcdoc(current, id, xray && { ...xray, on: xrayOn });
  };
  // Set by each new preview document (every render), see xrayAgent.
  let port: MessagePort | null = null;
  const tell = (message: object) => {
    if (port) port.postMessage(message);
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

  const tabTitle = root.querySelector<HTMLElement>("[data-tab-title]");
  const tabIcon = root.querySelector<HTMLImageElement>("[data-tab-icon]");
  const chips = [...root.querySelectorAll<HTMLAnchorElement>("[data-tag]")];
  // Elements drawn by the browser itself rather than in the page: show them in the window bar.
  const chrome: Record<string, HTMLElement | null> = { title: tabTitle, link: tabIcon };

  handlers.set(id, (data, ports) => {
    if (data.port === true && ports[0]) port = ports[0];
    if (typeof data.previewHeight === "number" && frame) {
      frame.style.height = `${Math.min(Math.max(data.previewHeight, 140), maxHeight)}px`;
    }
    if (!xray) return;
    if (typeof data.title === "string" && tabTitle)
      tabTitle.textContent = data.title || tabTitle.dataset.fallback!;
    if ("icon" in data && tabIcon) {
      tabIcon.hidden = typeof data.icon !== "string";
      if (typeof data.icon === "string") tabIcon.src = data.icon;
    }
    const hidden = data.hidden;
    if (Array.isArray(hidden)) {
      for (const chip of chips) {
        const off = hidden.includes(chip.dataset.tag);
        chip.classList.toggle("offscreen", off);
        chip.title = off ? "Not drawn on the page: find it in the code below" : "";
      }
      const note = root.querySelector<HTMLElement>("[data-offscreen-note]");
      if (note) note.hidden = !chips.some((chip) => chip.classList.contains("offscreen"));
    }
    if (typeof data.navigate === "string" && xray.urls[data.navigate])
      location.href = xray.urls[data.navigate];
  });

  const xrayButton = root.querySelector<HTMLButtonElement>('[data-action="xray"]');
  xrayButton?.addEventListener("click", () => {
    xrayOn = !xrayOn;
    xrayButton.setAttribute("aria-pressed", String(xrayOn));
    xrayButton.textContent = xrayOn ? "Hide tags" : "Show tags";
    tell({ xray: xrayOn });
  });
  for (const chip of chips) {
    const highlight = (on: boolean) => {
      tell({ highlight: on ? chip.dataset.tag : null });
      chrome[chip.dataset.tag!]?.classList.toggle("flash", on);
    };
    chip.addEventListener("pointerenter", () => highlight(true));
    chip.addEventListener("pointerleave", () => highlight(false));
    chip.addEventListener("focus", () => highlight(true));
    chip.addEventListener("blur", () => highlight(false));
  }

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

// Every preview posts messages tagged with its example id; route them to that example.
window.addEventListener("message", (e) => {
  const data: unknown = e.data;
  if (
    typeof data !== "object" ||
    data === null ||
    !("example" in data) ||
    typeof data.example !== "string"
  )
    return;
  handlers.get(data.example)?.(data as Record<string, unknown>, e.ports);
});
