import { simulate } from "../core/simulate";
import type { IrqEvent, SimResult } from "../core/simulate";
import { AsmError } from "../core/types";
import { examplesFor } from "./examples";
import { hex8, hex16 } from "./format";
import { buildHistory, stackSlots } from "./history";
import { markRange, tokenize } from "./highlight";
import { newlineEdit, tabEdit } from "./indent";
import type { CellSeries, Series } from "./history";
import { LANGS, getLang, plural, setLang, t, translateCore } from "./i18n";
import type { Key, Lang } from "./i18n";
import { complete } from "./complete";
import { CHECKS, lint, loadLintSettings, saveLintSettings } from "./lint";
import type { Check, Diagnostic } from "./lint";
import type { Completion } from "./complete";
import { cleanName, deleteScript, listScripts, saveScript } from "./scripts";
import { decodeState, encodeState } from "./share";
import type { ShareState } from "./share";

type Child = Node | string | null | undefined | false;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string | boolean | undefined> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

const LINE_IDS = [0, 1, 2] as const;

type LedgerId = "registers" | "flags" | "heap" | "stack";

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="wordmark" href="./" data-i18n-aria="wordmark.label">MSX88 Trace</a>
        <div class="topbar-actions flex items-center gap-(--space-sm)">
          <select id="lang" class="control lang-select" aria-label="Idioma / Language"></select>
          <label class="field-inline flex items-center gap-(--space-xs)">
            <span class="label" data-i18n="example.label"></span>
            <select id="example" class="control"></select>
          </label>
          <label class="field-inline flex items-center gap-(--space-xs)">
            <span class="label" data-i18n="scripts.label"></span>
            <select id="scripts" class="control"></select>
          </label>
          <button type="button" id="script-save" class="key" data-i18n="scripts.save"></button>
          <button type="button" id="script-delete" class="key key--quiet" data-i18n="scripts.delete" hidden></button>
          <span id="script-status" class="label" role="status"></span>
          <button type="button" id="help-open" class="key" aria-haspopup="dialog" data-i18n="help.open"></button>
          <a id="manual-open" class="key" href="./manual.html" target="_blank" rel="noopener" data-i18n="manual.open"></a>
          <button type="button" id="run" class="key key--primary" data-i18n="run"></button>
        </div>
      </header>
      <main class="workspace">
        <section class="pane pane--source" aria-labelledby="h-source">
          <div class="pane-head flex items-baseline justify-between gap-(--space-sm)">
            <h2 id="h-source" class="pane-title" data-i18n="source.title"></h2>
            <button type="button" id="layout" class="key key--quiet layout-toggle" aria-pressed="false" aria-describedby="layout-help" data-i18n="layout.btn"></button>
            <span id="layout-help" class="visually-hidden" data-i18n="layout.help"></span>
          </div>
          <div class="editor graphite cut">
            <div class="gutter" aria-hidden="true"><pre id="gutter" class="gutter-lines">1</pre></div>
            <div class="editor-scroll">
              <div id="line-hl" class="line-hl is-off"></div>
              <pre class="hl" aria-hidden="true"><code id="hl-code"></code></pre>
              <textarea id="source" class="code" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"
                data-i18n-aria="source.aria" aria-describedby="source-help lint" aria-autocomplete="list" aria-controls="suggest"
                placeholder="ORG 2000H&#10;MOV AX, 5&#10;INT 0&#10;END"></textarea>
            </div>
          </div>
          <ul id="lint" class="lint-list" role="status" hidden></ul>
          <details id="lint-opts" class="lint-opts">
            <summary class="label-title" data-i18n="lint.options"></summary>
            <div id="lint-checks" class="lint-checks"></div>
          </details>
          <p id="source-help" class="help" data-i18n="source.help"></p>
          <details id="settings" class="settings">
            <summary id="settings-label" class="label-title"></summary>
            <div class="settings-body">
              <div class="grid gap-(--space-sm) sm:grid-cols-2">
                <label class="field flex flex-col gap-(--space-3xs)">
                  <span class="label" data-i18n="settings.input"></span>
                  <input id="input" class="control" type="text" name="input" autocomplete="off" />
                </label>
                <label class="field flex flex-col gap-(--space-3xs)">
                  <span class="label" data-i18n="settings.max"></span>
                  <input id="max" class="control" type="number" name="max-steps" min="1" max="20000" inputmode="numeric" />
                </label>
              </div>
              <fieldset class="events">
                <legend class="label" data-i18n="settings.events"></legend>
                <ol id="events" class="events-list flex flex-col gap-(--space-xs)"></ol>
                <button type="button" id="add-event" class="key" data-i18n="settings.add"></button>
              </fieldset>
            </div>
          </details>
        </section>
        <section class="pane pane--trace" aria-labelledby="h-trace">
          <div class="pane-head flex flex-wrap items-baseline gap-x-(--space-md) gap-y-(--space-3xs)">
            <h2 id="h-trace" class="pane-title" data-i18n="trace.title"></h2>
            <p id="summary" class="summary" role="status"></p>
          </div>
          <div id="modebar" class="modebar" hidden>
            <div class="seg" role="group" data-i18n-aria="view.aria">
              <button type="button" id="mode-all" class="key key--quiet seg-btn" aria-pressed="true" data-i18n="view.all"></button>
              <button type="button" id="mode-step" class="key key--quiet seg-btn" aria-pressed="false" data-i18n="view.step"></button>
            </div>
            <div id="stepper" class="stepper" hidden>
              <button type="button" id="st-reset" class="key key--sm" data-i18n="step.reset"></button>
              <button type="button" id="st-prev" class="key key--sm" data-i18n="step.prev"></button>
              <button type="button" id="st-next" class="key key--sm key--primary" data-i18n="step.next"></button>
              <button type="button" id="st-play" class="key key--sm"></button>
              <output id="st-count" class="label stepper-count" for="st-range">0 / 0</output>
              <input id="st-range" class="stepper-range" type="range" min="0" max="0" value="0" data-i18n-aria="step.range" />
            </div>
          </div>
          <p id="hover" class="hover-line" aria-hidden="true"></p>
          <div id="region" class="region"></div>
          <div id="ledgers" class="ledgers"></div>
        </section>
      </main>
    </div>
    <div id="lint-tip" class="lint-tip" role="tooltip" hidden></div>
    <ul id="suggest" class="suggest" role="listbox" data-i18n-aria="suggest.aria" hidden></ul>
    <p id="suggest-status" class="visually-hidden" role="status"></p>
    <dialog id="save-dialog" class="help-dialog save-dialog" aria-labelledby="save-title">
      <form id="save-form" method="dialog" class="save-form">
        <h2 id="save-title" class="pane-title" data-i18n="scripts.saveTitle"></h2>
        <label class="field flex flex-col gap-(--space-3xs)">
          <span class="label" data-i18n="scripts.name"></span>
          <input id="save-name" class="control" type="text" maxlength="60" autocomplete="off" required />
        </label>
        <p id="save-note" class="help" data-i18n="scripts.replace" hidden></p>
        <div class="save-actions">
          <button type="button" id="save-cancel" class="key" data-i18n="scripts.cancel"></button>
          <button type="submit" class="key key--primary" data-i18n="scripts.confirm"></button>
        </div>
      </form>
    </dialog>
    <dialog id="help" class="help-dialog" aria-labelledby="help-title">
      <div class="help-head">
        <h2 id="help-title" class="pane-title" data-i18n="help.title"></h2>
        <button type="button" id="help-close" class="key" data-i18n="help.close"></button>
      </div>
      <div class="help-body" data-i18n-html="help.body"></div>
    </dialog>`;

  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const sourceEl = q<HTMLTextAreaElement>("source");
  const inputEl = q<HTMLInputElement>("input");
  const maxEl = q<HTMLInputElement>("max");
  const eventsEl = q<HTMLOListElement>("events");
  const regionEl = q<HTMLDivElement>("region");
  const ledgersEl = q<HTMLDivElement>("ledgers");
  const hoverEl = q<HTMLParagraphElement>("hover");
  const gutterEl = q<HTMLPreElement>("gutter");
  const layoutBtn = q<HTMLButtonElement>("layout");
  const helpEl = q<HTMLDialogElement>("help");
  const modebarEl = q<HTMLDivElement>("modebar");
  const stepperEl = q<HTMLDivElement>("stepper");
  const modeAllBtn = q<HTMLButtonElement>("mode-all");
  const modeStepBtn = q<HTMLButtonElement>("mode-step");
  const stResetBtn = q<HTMLButtonElement>("st-reset");
  const stPrevBtn = q<HTMLButtonElement>("st-prev");
  const stNextBtn = q<HTMLButtonElement>("st-next");
  const stPlayBtn = q<HTMLButtonElement>("st-play");
  const stRange = q<HTMLInputElement>("st-range");
  const stCount = q<HTMLOutputElement>("st-count");
  const shellEl = root.querySelector<HTMLElement>(".shell")!;
  const lineHlEl = q<HTMLDivElement>("line-hl");
  const lintEl = q<HTMLUListElement>("lint");
  const lintChecksEl = q<HTMLDivElement>("lint-checks");
  const lintTipEl = q<HTMLDivElement>("lint-tip");
  const hlCodeEl = q<HTMLElement>("hl-code");
  const settingsLabel = q<HTMLElement>("settings-label");
  const summaryEl = q<HTMLParagraphElement>("summary");
  const exampleEl = q<HTMLSelectElement>("example");
  const langEl = q<HTMLSelectElement>("lang");
  const scriptsEl = q<HTMLSelectElement>("scripts");
  const scriptDeleteEl = q<HTMLButtonElement>("script-delete");
  const scriptStatusEl = q<HTMLSpanElement>("script-status");
  const saveDialogEl = q<HTMLDialogElement>("save-dialog");
  const saveNameEl = q<HTMLInputElement>("save-name");
  const saveNoteEl = q<HTMLParagraphElement>("save-note");
  const suggestEl = q<HTMLUListElement>("suggest");
  const suggestStatusEl = q<HTMLParagraphElement>("suggest-status");

  let result: SimResult | null = null;
  // what the trace area currently shows, so a language change can redraw it
  let view: "empty" | "error" | "trace" = "empty";
  let lastError: AsmError | null = null;

  // ---- source gutter and line highlight --------------------------------------

  let gutterCount = 0;
  let painted: string | null = null;
  // declared here, filled by the live syntax check below
  let findings: Diagnostic[] = [];
  /** Draws the coloured copy of the source that sits under the transparent textarea. */
  function paintSource(): void {
    const text = sourceEl.value;
    const key = `${findings.map((f) => `${f.severity}:${f.from}:${f.to}`).join(",")}|${text}`;
    if (key === painted) return;
    painted = key;
    const frag = document.createDocumentFragment();
    const tokens = findings.reduce((acc, f) => markRange(acc, f.from, f.to, f.severity), tokenize(text));
    for (const t of tokens) {
      const cls = [t.kind ? `tk tk-${t.kind}` : "", t.mark ? (t.mark === "error" ? "tk-err" : "tk-warn") : ""].filter(Boolean).join(" ");
      frag.append(cls ? h("span", { class: cls }, t.text) : t.text);
    }
    // a final newline would collapse in the <pre>; the textarea still shows its empty last line
    frag.append("\n ");
    hlCodeEl.replaceChildren(frag);
  }

  function syncGutter(): void {
    paintSource();
    hlCodeEl.style.transform = `translate(${-sourceEl.scrollLeft}px, ${-sourceEl.scrollTop}px)`;
    const n = sourceEl.value.split("\n").length;
    if (n !== gutterCount) {
      gutterCount = n;
      gutterEl.textContent = Array.from({ length: n }, (_, i) => i + 1).join("\n");
      gutterEl.parentElement!.style.setProperty("--digits", String(String(n).length));
    }
    gutterEl.style.transform = `translateY(${-sourceEl.scrollTop}px)`;
    lineHlEl.style.transform = `translateY(${-sourceEl.scrollTop}px)`;
  }

  /**
   * The band is positioned in the text's own coordinates and shifted by the scroll, so scrolling never
   * fights the glide: only `top` is animated (see .line-hl), and it slides from line to line.
   */
  function placeHighlight(line: number, reveal: boolean): void {
    const cs = getComputedStyle(sourceEl);
    const lh = parseFloat(cs.lineHeight) || 1.6 * parseFloat(cs.fontSize);
    const top = parseFloat(cs.paddingTop) + (line - 1) * lh;
    if (reveal && (top < sourceEl.scrollTop || top + lh > sourceEl.scrollTop + sourceEl.clientHeight)) {
      sourceEl.scrollTop = Math.max(0, top - sourceEl.clientHeight / 2);
    }
    // the very first placement appears in place; every later one glides from where the band was
    const first = lineHlEl.style.top === "";
    if (first) lineHlEl.style.transition = "none";
    lineHlEl.style.top = `${top}px`;
    lineHlEl.style.height = `${lh}px`;
    lineHlEl.style.transform = `translateY(${-sourceEl.scrollTop}px)`;
    if (first) {
      void lineHlEl.offsetHeight;
      lineHlEl.style.transition = "";
    }
    lineHlEl.classList.remove("is-off");
  }
  function highlightLine(line: number): void {
    if (line > 0) {
      placeHighlight(line, true);
    } else {
      // fade out where it is, so the next line it lights glides in from here
      lineHlEl.classList.add("is-off");
    }
  }
  sourceEl.addEventListener("scroll", syncGutter);
  sourceEl.addEventListener("input", syncGutter);

  // ---- settings ------------------------------------------------------------

  langEl.replaceChildren(...LANGS.map((l) => h("option", { value: l.id }, l.name)));

  function buildExampleOptions(): void {
    const keep = exampleEl.value;
    exampleEl.replaceChildren(
      h("option", { value: "" }, t("example.choose")),
      ...examplesFor(getLang()).map((ex) => h("option", { value: ex.id }, ex.title)),
    );
    exampleEl.value = keep;
  }

  // ---- saved scripts (localStorage) -----------------------------------------

  function buildScriptOptions(select?: string): void {
    const keep = select ?? scriptsEl.value;
    const saved = listScripts();
    scriptsEl.replaceChildren(
      h("option", { value: "" }, t("scripts.choose")),
      ...saved.map((sc) => h("option", { value: sc.name }, sc.name)),
    );
    scriptsEl.value = saved.some((sc) => sc.name === keep) ? keep : "";
    scriptDeleteEl.hidden = scriptsEl.value === "";
  }

  let statusTimer: number | undefined;
  function flashStatus(text: string): void {
    scriptStatusEl.textContent = text;
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => (scriptStatusEl.textContent = ""), 4000);
  }

  function updateReplaceNote(): void {
    const name = cleanName(saveNameEl.value);
    saveNoteEl.hidden = !listScripts().some((sc) => sc.name === name);
  }

  // ---- live linter ---------------------------------------------------------------

  let lintTimer: number | undefined;
  let lintSettings = loadLintSettings();

  const describeFinding = (f: Diagnostic): string => (f.key ? t(f.key, f.vars) : translateCore(f.message ?? ""));

  /** Marks the text the linter points at and lists what it found, without running anything for real. */
  function paintDiagnostic(): void {
    hideLintTip();
    paintSource();
    lintEl.replaceChildren(
      ...findings.map((f) => {
        const text = f.line > 0 && f.key ? t("lint.at", { n: f.line, msg: describeFinding(f) }) : describeFinding(f);
        const item = h("li", { class: "lint-item", "data-severity": f.severity }, text);
        if (f.to > f.from) {
          // a click takes you to the text it is about
          item.addEventListener("click", () => {
            sourceEl.focus();
            sourceEl.setSelectionRange(f.from, f.to);
          });
        }
        return item;
      }),
    );
    lintEl.hidden = findings.length === 0;
    if (findings.some((f) => f.severity === "error")) sourceEl.setAttribute("aria-invalid", "true");
    else sourceEl.removeAttribute("aria-invalid");
  }

  function lintNow(): void {
    window.clearTimeout(lintTimer);
    const st = readState();
    findings = lint(sourceEl.value, { input: st.input, maxSteps: st.maxSteps, events: st.events }, lintSettings);
    paintDiagnostic();
  }

  function buildLintChecks(): void {
    lintChecksEl.replaceChildren(
      ...CHECKS.map((c: Check) => {
        const box = h("input", { type: "checkbox", name: `lint-${c}` });
        box.checked = lintSettings[c];
        box.addEventListener("change", () => {
          lintSettings = { ...lintSettings, [c]: box.checked };
          saveLintSettings(lintSettings);
          lintNow();
        });
        return h("label", { class: "lint-check flex items-center gap-(--space-xs)" }, box, h("span", { class: "label" }, t(`lint.check.${c}` as Key)));
      }),
    );
  }

  /** Waits for a pause in typing, so a half-written line is not flagged while it is being written. */
  function scheduleLint(): void {
    window.clearTimeout(lintTimer);
    lintTimer = window.setTimeout(lintNow, 600);
  }

  function hideLintTip(): void {
    lintTipEl.hidden = true;
  }

  /** Source offset of the character under a viewport point, or -1 outside the text. */
  function offsetAtPoint(x: number, y: number): number {
    const cs = getComputedStyle(sourceEl);
    const lh = parseFloat(cs.lineHeight) || 1.6 * parseFloat(cs.fontSize);
    charWidth ||= measureChar(cs);
    const rect = sourceEl.getBoundingClientRect();
    const line = Math.floor((y - rect.top - parseFloat(cs.paddingTop) + sourceEl.scrollTop) / lh);
    const col = Math.floor((x - rect.left - parseFloat(cs.paddingLeft) + sourceEl.scrollLeft) / charWidth);
    const lines = sourceEl.value.split("\n");
    if (line < 0 || line >= lines.length || col < 0) return -1;
    let at = lines.slice(0, line).reduce((n, l) => n + l.length + 1, 0);
    let visual = 0;
    for (const c of lines[line]) {
      const next = c === "\t" ? (Math.floor(visual / 8) + 1) * 8 : visual + 1;
      if (col < next) return at;
      visual = next;
      at++;
    }
    return -1;
  }

  sourceEl.addEventListener("mousemove", (e) => {
    if (findings.length === 0) return;
    const at = offsetAtPoint(e.clientX, e.clientY);
    const f = findings.find((x) => x.to > x.from && at >= x.from && at < x.to);
    if (!f) {
      hideLintTip();
      return;
    }
    lintTipEl.textContent = describeFinding(f);
    lintTipEl.dataset.severity = f.severity;
    lintTipEl.hidden = false;
    const { x, y } = wordPosition(f.from);
    const w = lintTipEl.offsetWidth;
    lintTipEl.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    lintTipEl.style.top = `${y + 2}px`;
  });
  sourceEl.addEventListener("mouseleave", hideLintTip);
  sourceEl.addEventListener("scroll", hideLintTip);
  sourceEl.addEventListener("input", hideLintTip);

  sourceEl.addEventListener("input", scheduleLint);

  // ---- suggestions and autocomplete -------------------------------------------

  let sug: Completion | null = null;
  let sugIndex = 0;
  let sugManual = false;
  /** Enter only accepts once the user has chosen with the arrows (or opened the list with Ctrl+Space). */
  let sugChosen = false;
  let accepting = false;

  function closeSuggest(): void {
    if (!sug) return;
    sug = null;
    suggestEl.hidden = true;
    suggestEl.replaceChildren();
    sourceEl.removeAttribute("aria-activedescendant");
    suggestStatusEl.textContent = "";
  }

  let charWidth = 0;
  function measureChar(cs: CSSStyleDeclaration): number {
    const ctx = document.createElement("canvas").getContext("2d");
    if (!ctx) return parseFloat(cs.fontSize) * 0.6;
    ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    return ctx.measureText("0").width;
  }

  /** Viewport position of the start of the word being completed, and the height of a line. */
  function wordPosition(offset: number): { x: number; y: number; lh: number } {
    const cs = getComputedStyle(sourceEl);
    const fontSize = parseFloat(cs.fontSize);
    const lh = parseFloat(cs.lineHeight) || fontSize * 1.6;
    charWidth ||= measureChar(cs);
    const before = sourceEl.value.slice(0, offset);
    const line = before.split("\n").length - 1;
    let col = 0;
    for (const c of before.slice(before.lastIndexOf("\n") + 1)) col = c === "\t" ? (Math.floor(col / 8) + 1) * 8 : col + 1;
    const rect = sourceEl.getBoundingClientRect();
    return {
      x: rect.left + parseFloat(cs.paddingLeft) + col * charWidth - sourceEl.scrollLeft,
      y: rect.top + parseFloat(cs.paddingTop) + (line + 1) * lh - sourceEl.scrollTop,
      lh,
    };
  }

  function paintSuggest(): void {
    if (!sug) return;
    suggestEl.replaceChildren(
      ...sug.items.map((it, i) =>
        h(
          "li",
          { id: `sg-${i}`, class: "suggest-item", role: "option", "aria-selected": String(i === sugIndex) },
          h("span", { class: "suggest-label" }, it.label),
          h("span", { class: "suggest-kind" }, t(it.detail ?? (`kind.${it.kind}` as Key))),
        ),
      ),
    );
    sourceEl.setAttribute("aria-activedescendant", `sg-${sugIndex}`);
    suggestEl.children[sugIndex]?.scrollIntoView({ block: "nearest" });
  }

  function placeSuggest(): void {
    if (!sug) return;
    const { x, y, lh } = wordPosition(sug.from);
    suggestEl.hidden = false;
    const w = suggestEl.offsetWidth;
    const hgt = suggestEl.offsetHeight;
    const flip = y + hgt > window.innerHeight - 8 && y - lh - hgt > 8;
    suggestEl.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    suggestEl.style.top = `${flip ? y - lh - hgt : y}px`;
  }

  function openSuggest(manual: boolean): void {
    const next = complete(sourceEl.value, sourceEl.selectionStart, manual);
    if (!next || sourceEl.selectionStart !== sourceEl.selectionEnd) {
      closeSuggest();
      return;
    }
    const keep = sug?.items[sugIndex]?.label;
    sug = next;
    sugManual = manual;
    sugChosen = manual;
    sugIndex = Math.max(0, next.items.findIndex((it) => it.label === keep));
    paintSuggest();
    placeSuggest();
    suggestStatusEl.textContent = plural("suggest.count", next.items.length);
  }

  function moveSuggest(delta: number): void {
    if (!sug) return;
    sugIndex = (sugIndex + delta + sug.items.length) % sug.items.length;
    sugChosen = true;
    for (const [i, li] of [...suggestEl.children].entries()) li.setAttribute("aria-selected", String(i === sugIndex));
    sourceEl.setAttribute("aria-activedescendant", `sg-${sugIndex}`);
    suggestEl.children[sugIndex]?.scrollIntoView({ block: "nearest" });
  }

  function acceptSuggest(): void {
    if (!sug) return;
    const { from, to, items } = sug;
    const text = items[sugIndex].insert;
    closeSuggest();
    accepting = true;
    sourceEl.setSelectionRange(from, to);
    // insertText keeps the browser's undo history; setRangeText is the fallback where it is unavailable
    if (!document.execCommand("insertText", false, text)) {
      sourceEl.setRangeText(text, from, to, "end");
      sourceEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    accepting = false;
  }

  sourceEl.addEventListener("input", (e) => {
    if (accepting) return;
    const type = (e as InputEvent).inputType ?? "";
    if (type === "insertText") openSuggest(false);
    else if (sug && type.startsWith("delete")) openSuggest(sugManual);
    else closeSuggest();
  });
  sourceEl.addEventListener("blur", closeSuggest);
  sourceEl.addEventListener("scroll", placeSuggest); // typing near the bottom scrolls the editor: follow the word
  window.addEventListener("resize", closeSuggest);
  // mousedown, not click: the editor must keep the focus while an item is chosen
  suggestEl.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const li = (e.target as HTMLElement).closest("li");
    if (!li || !sug) return;
    sugIndex = [...suggestEl.children].indexOf(li);
    acceptSuggest();
  });

  function updateSettingsLabel(): void {
    const n = eventsEl.children.length;
    settingsLabel.textContent = n > 0 ? plural("settings.title", n) : t("settings.title");
  }

  function addEventRow(ev: IrqEvent): void {
    const select = h("select", { class: "control", "aria-label": t("settings.lineAria") });
    for (const line of LINE_IDS) {
      const opt = h("option", { value: String(line) }, t(`line.${line}`));
      if (line === ev.line) opt.selected = true;
      select.append(opt);
    }
    const step = h("input", {
      class: "control control--num",
      type: "number",
      min: "1",
      inputmode: "numeric",
      value: String(ev.step),
      "aria-label": t("settings.stepAria"),
    });
    const remove = h("button", { type: "button", class: "key key--quiet" }, t("settings.remove"));
    const li = h(
      "li",
      { class: "event-row flex flex-wrap items-center gap-(--space-xs)" },
      select,
      h("span", { class: "label" }, t("settings.before")),
      step,
      remove,
    );
    remove.addEventListener("click", () => {
      li.remove();
      updateSettingsLabel();
    });
    eventsEl.append(li);
    updateSettingsLabel();
  }

  function writeState(s: ShareState): void {
    sourceEl.value = s.source;
    syncGutter();
    inputEl.value = s.input;
    maxEl.value = String(s.maxSteps);
    eventsEl.replaceChildren();
    for (const ev of s.events) addEventRow(ev);
    updateSettingsLabel();
    lintNow();
  }

  function readState(): ShareState {
    const events: IrqEvent[] = [];
    for (const li of eventsEl.querySelectorAll("li")) {
      const [select, step] = li.querySelectorAll("select, input");
      const n = Math.floor(Number((step as HTMLInputElement).value));
      events.push({ line: Number((select as HTMLSelectElement).value), step: Number.isFinite(n) && n >= 1 ? n : 1 });
    }
    const max = Math.floor(Number(maxEl.value));
    return {
      source: sourceEl.value,
      input: inputEl.value,
      maxSteps: Number.isFinite(max) ? Math.min(20000, Math.max(1, max)) : 2000,
      events,
    };
  }

  // ---- regions -------------------------------------------------------------

  function setSummary(...parts: string[]): void {
    summaryEl.replaceChildren(...parts.map((p) => h("span", {}, p)));
  }

  function renderEmpty(): void {
    result = null;
    view = "empty";
    leaveStepping();
    setSummary();
    hoverEl.textContent = "";
    ledgersEl.replaceChildren();
    const load = h("button", { type: "button", class: "key" }, t("empty.load"));
    load.addEventListener("click", () => loadExample("f10"));
    regionEl.replaceChildren(
      h(
        "div",
        { class: "state" },
        h("h3", { class: "state-title" }, t("empty.title")),
        h("p", {}, t("empty.body")),
        load,
      ),
    );
  }

  function renderAsmError(err: AsmError, reveal = true): void {
    result = null;
    view = "error";
    lastError = err;
    leaveStepping();
    setSummary();
    hoverEl.textContent = "";
    ledgersEl.replaceChildren();
    regionEl.replaceChildren(
      h(
        "div",
        { class: "state state--error", role: "alert" },
        h("h3", { class: "state-title" }, t("error.title")),
        h("p", { class: "error-line" }, translateCore(err.message)),
        h("p", {}, t("error.fix")),
      ),
    );
    if (reveal && err.line > 0) {
      const lines = sourceEl.value.split("\n");
      const start = lines.slice(0, err.line - 1).reduce((n, l) => n + l.length + 1, 0);
      sourceEl.focus();
      sourceEl.setSelectionRange(start, start + (lines[err.line - 1]?.length ?? 0));
    }
  }

  const hexOf = (width: 8 | 16) => (width === 8 ? hex8 : hex16);

  /** Where a step sits in the program: its number, address, source line and text. */
  function describeStep(n: number): string {
    const s = result?.steps[n - 1];
    if (!s) return "";
    const ip = hex16(s.ip);
    const where = s.kind === "irq" ? t("desc.irq", { ip }) : t("desc.ip", { ip }) + (s.line > 0 ? t("desc.line", { n: s.line }) : "");
    return t("desc.step", { n: s.step, where, text: s.text });
  }

  function stepRow(n: number, ...cells: HTMLElement[]): HTMLTableRowElement {
    const s = result?.steps[n - 1];
    return h("tr", { class: s?.kind === "irq" ? "log-row log-row--irq" : "log-row", "data-step": String(n), title: describeStep(n) }, ...cells);
  }

  /** One column per location, one row per step in which any of them took a new value; blank cells did not change. */
  function valueTable(caption: string, firstHead: string, columns: { name: string; series: Series }[], fmt: (c: number, v: number) => string): HTMLElement {
    const steps = [...new Set(columns.flatMap((c) => c.series.points.map((p) => p.step)))].sort((a, b) => a - b);
    const start = h(
      "tr",
      { class: "log-row log-row--start" },
      h("th", { scope: "row", class: "num" }, t("table.start")),
      ...columns.map((c, i) => h("td", { class: "val" }, fmt(i, c.series.initial))),
    );
    const rows = steps.map((n) =>
      stepRow(
        n,
        h("th", { scope: "row", class: "num" }, String(n)),
        ...columns.map((c, i) => {
          const p = c.series.points.findLast((x) => x.step === n);
          return h("td", { class: p ? "val is-set" : "val" }, p ? fmt(i, p.value) : "");
        }),
      ),
    );
    return h(
      "table",
      { class: "log" },
      h("caption", { class: "visually-hidden" }, caption),
      h("thead", {}, h("tr", {}, h("th", { scope: "col", class: "num" }, firstHead), ...columns.map((c) => h("th", { scope: "col", class: "val" }, c.name)))),
      h("tbody", {}, start, ...rows),
    );
  }

  // Each ledger can be hidden down to its header or enlarged to fill the whole trace area.
  const LEDGER_ORDER: readonly LedgerId[] = ["registers", "flags", "heap", "stack"];
  const collapsed = new Set<LedgerId>();
  let expanded: LedgerId | null = null;
  let wide = false;

  function ledger(id: LedgerId, hint: Key): HTMLElement {
    const toggle = (btn: HTMLButtonElement, fn: () => void): HTMLButtonElement => {
      btn.addEventListener("click", fn);
      return btn;
    };
    const hide = toggle(h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "hide" }, t("ledger.hide")), () => {
      if (!collapsed.delete(id)) collapsed.add(id);
      applyLedgerState();
    });
    const grow = toggle(h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "expand" }, t("ledger.expand")), () => {
      expanded = expanded === id ? null : id;
      applyLedgerState();
    });
    return h(
      "section",
      { class: "ledger", "data-ledger": id },
      h(
        "div",
        { class: "ledger-head" },
        h("h3", { class: "label-title" }, t(`ledger.${id}`)),
        h("span", { class: "label ledger-hint" }, t(hint)),
        h("span", { class: "ledger-tools" }, grow, hide),
      ),
      h("div", { class: "ledger-body" }),
    );
  }

  /** Reflects the hide / expand state on the ledgers and re-sizes the grid tracks around hidden ones. */
  function applyLedgerState(): void {
    const isOff = (k: LedgerId): boolean => collapsed.has(k) && expanded !== k;
    for (const el of ledgersEl.querySelectorAll<HTMLElement>(".ledger")) {
      const key = el.dataset.ledger as LedgerId;
      el.classList.toggle("is-collapsed", isOff(key));
      el.classList.toggle("is-expanded", expanded === key);
      el.querySelector('[data-act="hide"]')!.textContent = collapsed.has(key) ? t("ledger.show") : t("ledger.hide");
      el.querySelector('[data-act="expand"]')!.textContent = expanded === key ? t("ledger.restore") : t("ledger.expand");
    }
    ledgersEl.toggleAttribute("data-expanded", expanded !== null);
    if (expanded !== null) {
      ledgersEl.style.removeProperty("--cols");
      ledgersEl.style.removeProperty("--rows");
      return;
    }
    // a track holding only hidden ledgers shrinks to its header; the rest share what is left
    const track = (keys: readonly LedgerId[], fr: number): string => (keys.every(isOff) ? "auto" : `minmax(0, ${fr}fr)`);
    if (wide) {
      ledgersEl.style.setProperty("--cols", LEDGER_ORDER.map((k, i) => track([k], [1.3, 1, 1, 1][i])).join(" "));
      ledgersEl.style.setProperty("--rows", "minmax(0, 1fr)");
    } else {
      ledgersEl.style.setProperty("--cols", "minmax(0, 1fr) minmax(0, 1fr)");
      ledgersEl.style.setProperty("--rows", [track(["registers"], 1.2), track(["flags", "heap"], 1), track(["stack"], 1)].join(" "));
    }
  }

  layoutBtn.addEventListener("click", () => {
    wide = !wide;
    shellEl.dataset.layout = wide ? "wide" : "split";
    layoutBtn.setAttribute("aria-pressed", String(wide));
    applyLedgerState();
    syncGutter();
  });

  /** One row per memory address written; to the right, the value it started with and every one it took after. */
  function heapTable(cells: CellSeries[]): HTMLElement {
    const depth = Math.max(...cells.map((c) => c.points.length)) + 1;
    const head = h(
      "tr",
      {},
      h("th", { scope: "col", class: "num" }, t("table.address")),
      h("th", { scope: "colgroup", colspan: String(depth), class: "val" }, t("table.order")),
    );
    const rows = cells.map((c) => {
      const fmt = hexOf(c.width);
      return h(
        "tr",
        { class: "log-row" },
        h("th", { scope: "row", class: "num" }, `${hex16(c.addr)}H`, h("span", { class: "slot-tag" }, c.width === 8 ? t("slot.byte") : t("slot.word"))),
        h("td", { class: "val is-start", title: t("cell.initial") }, fmt(c.initial), h("span", { class: "cell-step" }, "s0")),
        ...c.points.map((p, i) => {
          const live = i === c.points.length - 1;
          return h(
            "td",
            {
              class: live ? "val is-set" : "val is-set is-stale",
              "data-step": String(p.step),
              title: `${describeStep(p.step)}${live ? "" : t("cell.overwritten", { n: c.points[i + 1].step })}`,
            },
            fmt(p.value),
            h("span", { class: "cell-step" }, `s${p.step}`),
          );
        }),
      );
    });
    return h(
      "table",
      { class: "log log--stack" },
      h("caption", { class: "visually-hidden" }, t("caption.heap")),
      h("thead", {}, head),
      h("tbody", {}, ...rows),
    );
  }

  /** One row per stack address, from the base down; to the right, every value pushed there in order. */
  function stackTable(events: ReturnType<typeof buildHistory>["stack"]): HTMLElement {
    if (events.length === 0) return h("p", { class: "none" }, t("none.stack"));
    const slots = stackSlots(events);
    const depth = Math.max(1, ...slots.map((sl) => sl.writes.length));
    const head = h(
      "tr",
      {},
      h("th", { scope: "col", class: "num" }, t("table.address")),
      h("th", { scope: "colgroup", colspan: String(depth), class: "val" }, t("table.order")),
    );
    const rows = slots.map((sl, i) =>
      h(
        "tr",
        { class: i === 0 ? "log-row log-row--start" : "log-row" },
        h("th", { scope: "row", class: "num" }, `${hex16(sl.addr)}H`, i === 0 ? h("span", { class: "slot-tag" }, t("slot.base")) : null),
        ...sl.writes.map((w) => {
          const live = w.poppedAt === undefined;
          return h(
            "td",
            {
              class: live ? "val is-set" : "val is-set is-stale",
              "data-step": String(w.step),
              title: `${describeStep(w.step)}${live ? "" : t("cell.popped", { n: w.poppedAt ?? "" })}`,
            },
            hex16(w.value),
            h("span", { class: "cell-step" }, `s${w.step}`),
          );
        }),
      ),
    );
    return h(
      "table",
      { class: "log log--stack" },
      h("caption", { class: "visually-hidden" }, t("caption.stack")),
      h("thead", {}, head),
      h("tbody", {}, ...rows),
    );
  }

  // ---- hover and step-by-step ---------------------------------------------------

  type Mode = "all" | "step";
  let mode: Mode = "all";
  let pos = 0; // in step mode: how many instructions have run so far
  let hovered = 0;
  let playTimer: number | undefined;

  const total = (): number => result?.steps.length ?? 0;

  /** The source line of a step; an interrupt has none of its own, so it shows the instruction it cut in on. */
  function lineOf(n: number): number {
    const step = n > 0 ? result?.steps[n - 1] : undefined;
    return step ? step.line || (result?.program.instrs.get(step.ip)?.line ?? 0) : 0;
  }

  /** What the readout and the source highlight show while nothing is hovered. */
  function restText(): string {
    if (mode === "all") return t("hover.hint");
    return pos === 0 ? t("hover.ready") : describeStep(pos);
  }
  const restLine = (): number => (mode === "step" ? lineOf(pos) : 0);

  function setHover(n: number): void {
    if (n === hovered) return;
    hovered = n;
    for (const r of ledgersEl.querySelectorAll(".is-hover")) r.classList.remove("is-hover");
    if (n > 0) for (const r of ledgersEl.querySelectorAll(`[data-step="${n}"]`)) r.classList.add("is-hover");
    hoverEl.textContent = n > 0 ? describeStep(n) : restText();
    highlightLine(n > 0 ? lineOf(n) : restLine());
  }
  ledgersEl.addEventListener("mouseover", (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
    setHover(el ? Number(el.dataset.step) : 0);
  });
  ledgersEl.addEventListener("mouseleave", () => setHover(0));

  /** Fills the four tables with what happened up to the current position (everything, outside step mode). `animate` lets what this step added slide in. */
  function paintTables(animate = false): void {
    if (!result) return;
    const upTo = mode === "step" ? pos : result.steps.length;
    const hist = buildHistory(result.steps.slice(0, upTo));
    const bodies: Record<LedgerId, HTMLElement> = {
      registers: valueTable(t("caption.registers"), t("table.step"), hist.registers.map((r) => ({ name: r.name, series: r })), (_, v) => hex16(v)),
      flags: valueTable(t("caption.flags"), t("table.step"), hist.flags.map((f) => ({ name: f.name, series: f })), (_, v) => String(v)),
      heap: hist.heap.length > 0 ? heapTable(hist.heap) : h("p", { class: "none" }, t("none.heap")),
      stack: stackTable(hist.stack),
    };
    for (const el of ledgersEl.querySelectorAll<HTMLElement>(".ledger")) {
      const body = el.querySelector<HTMLElement>(".ledger-body")!;
      const { scrollTop, scrollLeft } = body;
      body.replaceChildren(bodies[el.dataset.ledger as LedgerId]);
      body.scrollTop = scrollTop;
      body.scrollLeft = scrollLeft;
    }
    hovered = 0;
    if (mode === "step" && pos > 0) {
      for (const r of ledgersEl.querySelectorAll(`[data-step="${pos}"]`)) {
        r.classList.add("is-current");
        if (animate) r.classList.add("is-new");
      }
      for (const body of ledgersEl.querySelectorAll<HTMLElement>(".ledger-body")) revealCurrent(body);
    }
  }

  /** Scrolls a ledger just enough to bring the current step's row or cell into view, clear of the sticky headers. */
  function revealCurrent(body: HTMLElement): void {
    const cur = body.querySelectorAll<HTMLElement>(".is-current");
    if (cur.length === 0) return;
    const box = body.getBoundingClientRect();
    const headH = body.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const sideW = body.querySelector<HTMLElement>("tbody th")?.getBoundingClientRect().width ?? 0;
    for (const el of [cur[0], cur[cur.length - 1]]) {
      const r = el.getBoundingClientRect();
      if (r.top < box.top + headH) body.scrollTop += r.top - box.top - headH;
      else if (r.bottom > box.bottom) body.scrollTop += r.bottom - box.bottom;
      if (r.left < box.left + sideW) body.scrollLeft += r.left - box.left - sideW;
      else if (r.right > box.right) body.scrollLeft += r.right - box.right;
    }
  }

  function updateStepper(): void {
    const n = total();
    stRange.max = String(n);
    stRange.value = String(pos);
    stCount.textContent = `${pos} / ${n}`;
    stResetBtn.disabled = stPrevBtn.disabled = pos === 0;
    stNextBtn.disabled = pos >= n;
    stPlayBtn.disabled = n === 0;
    stPlayBtn.textContent = playTimer === undefined ? t("step.play") : t("step.pause");
  }

  function stopPlay(): void {
    if (playTimer !== undefined) window.clearInterval(playTimer);
    playTimer = undefined;
  }

  function goTo(n: number): void {
    const before = pos;
    pos = Math.min(total(), Math.max(0, n));
    paintTables(mode === "step" && pos > before);
    hoverEl.textContent = restText();
    highlightLine(restLine());
    updateStepper();
  }

  function setMode(next: Mode): void {
    stopPlay();
    mode = next;
    pos = 0;
    modeAllBtn.setAttribute("aria-pressed", String(next === "all"));
    modeStepBtn.setAttribute("aria-pressed", String(next === "step"));
    stepperEl.hidden = next !== "step";
    goTo(0);
  }

  /** No trace to step through: stop any playback and tuck the controls away. */
  function leaveStepping(): void {
    stopPlay();
    pos = 0;
    modebarEl.hidden = true;
    highlightLine(0);
  }

  function togglePlay(): void {
    if (playTimer !== undefined) {
      stopPlay();
      updateStepper();
      return;
    }
    if (pos >= total()) goTo(0);
    playTimer = window.setInterval(() => {
      goTo(pos + 1);
      if (pos >= total()) {
        stopPlay();
        updateStepper();
      }
    }, 600);
    updateStepper();
  }

  modeAllBtn.addEventListener("click", () => setMode("all"));
  modeStepBtn.addEventListener("click", () => setMode("step"));
  stResetBtn.addEventListener("click", () => {
    stopPlay();
    goTo(0);
  });
  stPrevBtn.addEventListener("click", () => {
    stopPlay();
    goTo(pos - 1);
  });
  stNextBtn.addEventListener("click", () => {
    stopPlay();
    goTo(pos + 1);
  });
  stPlayBtn.addEventListener("click", togglePlay);
  stRange.addEventListener("input", () => {
    stopPlay();
    goTo(Number(stRange.value));
  });
  // arrow keys step through the run, unless the keys belong to a field or the dialog is open
  document.addEventListener("keydown", (e) => {
    if (mode !== "step" || helpEl.open || saveDialogEl.open || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    stopPlay();
    goTo(pos + (e.key === "ArrowRight" ? 1 : -1));
  });

  /** The notice, the screen output, the four ledger frames and the summary line of a finished run. */
  function buildTraceChrome(res: SimResult): void {
    const children: Child[] = [];
    if (res.reason !== "halted") {
      const reason = t(`stop.${res.reason}`);
      children.push(
        h(
          "p",
          { class: "notice", role: "status" },
          res.error ? t("notice.withError", { reason, error: translateCore(res.error) }) : t("notice.plain", { reason }),
        ),
      );
    }
    if (res.output) {
      children.push(h("div", { class: "screen graphite cut" }, h("span", { class: "label" }, t("screen.output")), h("pre", {}, res.output)));
    }
    regionEl.replaceChildren(...children.filter((c): c is Node => c !== null && c !== undefined && c !== false));

    ledgersEl.replaceChildren(
      ledger("registers", "hint.values"),
      ledger("flags", "hint.values"),
      ledger("heap", "hint.heap"),
      ledger("stack", "hint.stack"),
    );
    applyLedgerState();

    const irqs = res.steps.filter((s) => s.kind === "irq").length;
    setSummary(
      ...[
        t("summary.steps", { n: res.steps.length }),
        irqs > 0 ? plural("summary.interrupts", irqs) : "",
        t(`stop.${res.reason}`),
      ].filter(Boolean),
    );
  }

  function renderTrace(res: SimResult): void {
    result = res;
    view = "trace";
    hovered = 0;
    stopPlay();
    pos = 0;
    modebarEl.hidden = false;
    buildTraceChrome(res);
    goTo(0);
  }

  // ---- run -----------------------------------------------------------------

  function run(): void {
    const state = readState();
    history.replaceState(null, "", `#${encodeState(state)}`);
    if (state.source.trim() === "") {
      renderEmpty();
      return;
    }
    try {
      renderTrace(
        simulate(state.source, { input: state.input, maxSteps: state.maxSteps, irqEvents: state.events }),
      );
      // On a phone the trace sits below the editor: bring it into view.
      if (window.matchMedia("(max-width: 59.99rem)").matches) {
        root.querySelector("#h-trace")?.scrollIntoView({ block: "start" });
      }
    } catch (e) {
      if (e instanceof AsmError) renderAsmError(e);
      else throw e;
    }
  }

  function loadExample(id: string): void {
    const ex = examplesFor(getLang()).find((e) => e.id === id);
    if (!ex) return;
    writeState(ex.state);
    run();
  }

  q("script-save").addEventListener("click", () => {
    saveNameEl.value = scriptsEl.value;
    updateReplaceNote();
    saveDialogEl.showModal();
    saveNameEl.select();
  });
  saveNameEl.addEventListener("input", updateReplaceNote);
  q("save-cancel").addEventListener("click", () => saveDialogEl.close());
  q("save-form").addEventListener("submit", (e) => {
    if (cleanName(saveNameEl.value) === "") {
      e.preventDefault(); // a blank name keeps the dialog open
      saveNameEl.focus();
      return;
    }
    const saved = saveScript(saveNameEl.value, readState());
    if (saved === null) {
      flashStatus(t("scripts.failed"));
      return;
    }
    buildScriptOptions(saved);
    flashStatus(t("scripts.saved", { name: saved }));
  });
  scriptsEl.addEventListener("change", () => {
    scriptDeleteEl.hidden = scriptsEl.value === "";
    const sc = listScripts().find((x) => x.name === scriptsEl.value);
    if (!sc) return;
    writeState(sc.state);
    run();
  });
  scriptDeleteEl.addEventListener("click", () => {
    const name = scriptsEl.value;
    if (name && deleteScript(name)) {
      buildScriptOptions("");
      flashStatus(t("scripts.deleted", { name }));
    }
  });
  q("help-open").addEventListener("click", () => helpEl.showModal());
  q("help-close").addEventListener("click", () => helpEl.close());
  helpEl.addEventListener("click", (e) => {
    if (e.target === helpEl) helpEl.close();
  });
  q("run").addEventListener("click", run);
  q("add-event").addEventListener("click", () => addEventRow({ line: 0, step: 10 }));
  exampleEl.addEventListener("change", () => {
    if (exampleEl.value) loadExample(exampleEl.value);
  });
  // Tab indents inside the editor. Esc, then Tab, hands the focus on so the keyboard is never trapped.
  let leaveOnTab = false;
  sourceEl.addEventListener("blur", () => {
    leaveOnTab = false;
  });
  sourceEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      closeSuggest();
      run();
      return;
    }
    // Ctrl+Space is often taken by the input method or the browser, so Ctrl+I opens the list too
    if ((e.key === " " || e.key.toLowerCase() === "i") && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      openSuggest(true);
      return;
    }
    if (sug) {
      const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
      if (plain && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        e.preventDefault();
        moveSuggest(e.key === "ArrowDown" ? 1 : -1);
        return;
      }
      if (plain && (e.key === "Tab" || (e.key === "Enter" && sugChosen))) {
        e.preventDefault();
        acceptSuggest();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        closeSuggest();
        return;
      }
      if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) closeSuggest();
    }
    if (e.key === "Escape") {
      leaveOnTab = true;
      return;
    }
    // Enter starts the new line with the indentation of the one it leaves
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      e.preventDefault();
      leaveOnTab = false;
      const nl = newlineEdit(sourceEl.value, sourceEl.selectionStart, sourceEl.selectionEnd);
      sourceEl.setSelectionRange(nl.from, nl.to);
      if (!document.execCommand("insertText", false, nl.text)) {
        sourceEl.setRangeText(nl.text, nl.from, nl.to, "end");
        sourceEl.dispatchEvent(new Event("input", { bubbles: true }));
      }
      sourceEl.setSelectionRange(nl.caret, nl.caret);
      return;
    }
    if (e.key !== "Tab" || e.ctrlKey || e.metaKey || e.altKey) {
      if (!["Shift", "Control", "Alt", "Meta"].includes(e.key)) leaveOnTab = false;
      return;
    }
    if (leaveOnTab) {
      leaveOnTab = false;
      return;
    }
    e.preventDefault();
    const edit = tabEdit(sourceEl.value, sourceEl.selectionStart, sourceEl.selectionEnd, e.shiftKey);
    sourceEl.setSelectionRange(edit.from, edit.to);
    // insertText keeps the browser's undo history; setRangeText is the fallback where it is unavailable
    if (!document.execCommand("insertText", false, edit.text)) {
      sourceEl.setRangeText(edit.text, edit.from, edit.to, "end");
      sourceEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    sourceEl.setSelectionRange(edit.selStart, edit.selEnd);
  });

  // ---- language ---------------------------------------------------------------

  /** Texts that live in the markup: they carry a data-i18n* attribute naming their key. */
  function applyStaticText(): void {
    const lang = getLang();
    document.documentElement.lang = lang;
    document.title = t("app.title");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("app.description"));
    for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n as Key);
    for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-html]")) el.innerHTML = t(el.dataset.i18nHtml as Key);
    for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria as Key));
    langEl.value = lang;
  }

  /** Switches the whole screen to the current language without touching the program, the settings or the position in the run. */
  function applyLanguage(): void {
    applyStaticText();
    buildExampleOptions();
    buildScriptOptions();
    buildLintChecks();
    paintDiagnostic();
    const events = readState().events;
    eventsEl.replaceChildren();
    for (const ev of events) addEventRow(ev);
    updateSettingsLabel();
    if (view === "trace" && result) {
      buildTraceChrome(result);
      paintTables(false);
      hoverEl.textContent = restText();
    } else if (view === "error" && lastError) {
      renderAsmError(lastError, false);
    } else {
      renderEmpty();
    }
    updateStepper();
  }

  langEl.addEventListener("change", () => {
    setLang(langEl.value as Lang);
    applyLanguage();
  });

  applyStaticText();
  buildExampleOptions();
  buildScriptOptions();
  buildLintChecks();
  const initial = decodeState(location.hash.slice(1));
  writeState(initial ?? { source: "", input: "", maxSteps: 2000, events: [] });
  if (initial) run();
  else renderEmpty();
}
