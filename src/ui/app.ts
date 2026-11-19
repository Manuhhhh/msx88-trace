import { simulate } from "../core/simulate";
import type { IrqEvent, SimResult } from "../core/simulate";
import { AsmError } from "../core/types";
import { wireArchSelect } from "./arch";
import { h } from "./dom";
import type { Child } from "./dom";
import { examplesFor } from "./examples";
import { bin8, hex8, hex16 } from "./format";
import { DEFAULT_SP } from "../core/cpu";
import { fmtUnsigned, useRadixFor, wireRadix } from "./radix";
import { buildHistory, stackSlots } from "./history";
import { markRange, tokenize } from "./highlight";
import { groupMemory } from "./memgroup";
import type { MemoryEntry } from "./memgroup";
import { declLine, memoryMap, stackMap } from "./memmap";
import { newlineEdit, tabEdit } from "./indent";
import { createLineHighlight } from "./linehl";
import { revealCurrent } from "./reveal";
import { createSuggest } from "./suggest";
import { createTextMetrics } from "./textpos";
import type { CellSeries, Series } from "./history";
import { LANGS, getLang, plural, setLang, t, translateCore } from "./i18n";
import type { Key, Lang } from "./i18n";
import { complete } from "./complete";
import { lint, loadLintSettings, saveLintSettings } from "./lint";
import type { Diagnostic } from "./lint";
import { createLintView, renderLintChecks } from "./lintview";
import { cleanName, deleteScript, listScripts, saveScript } from "./scripts";
import { decodeState, encodeState } from "./share";
import type { ShareState } from "./share";

const LINE_IDS = [0, 1, 2] as const;

type LedgerId = "registers" | "flags" | "heap" | "stack" | "bytes";

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="wordmark" href="./" data-i18n-aria="wordmark.label">MSX88 Trace</a>
        <div class="topbar-actions flex items-center gap-(--space-sm)">
          <select id="lang" class="control lang-select" aria-label="Idioma / Language"></select>
          <select id="arch" class="control lang-select" data-i18n-aria="arch.label"></select>
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
            <div class="seg" role="group" data-i18n-aria="radix.aria">
              <button type="button" class="key key--quiet seg-btn" data-radix="dec" aria-pressed="false">Dec</button>
              <button type="button" class="key key--quiet seg-btn" data-radix="hex" aria-pressed="true">Hex</button>
              <button type="button" class="key key--quiet seg-btn" data-radix="bin" aria-pressed="false">Bin</button>
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
  const lineHl = createLineHighlight(sourceEl, lineHlEl);
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
  /** Draws the coloured copy of the source that sits under the transparent textarea. */
  function paintSource(): void {
    const text = sourceEl.value;
    const findings = lintView.findings;
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
    lineHl.sync();
  }

  const highlightLine = (line: number): void => lineHl.show(line);
  sourceEl.addEventListener("scroll", syncGutter);
  sourceEl.addEventListener("input", syncGutter);

  // ---- settings ------------------------------------------------------------

  langEl.replaceChildren(...LANGS.map((l) => h("option", { value: l.id }, l.name)));
  wireArchSelect(q<HTMLSelectElement>("arch"), "msx88");

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

  // ---- live linter and suggestions ---------------------------------------------

  const metrics = createTextMetrics(sourceEl);
  let lintSettings = loadLintSettings();

  const describeFinding = (f: Diagnostic): string => (f.key ? t(f.key, f.vars) : translateCore(f.message ?? ""));

  const lintView = createLintView({
    source: sourceEl,
    list: lintEl,
    tip: lintTipEl,
    metrics,
    describe: describeFinding,
    compute: () => {
      const st = readState();
      return lint(sourceEl.value, { input: st.input, maxSteps: st.maxSteps, events: st.events }, lintSettings);
    },
    onPaint: paintSource,
  });

  function buildLintChecks(): void {
    renderLintChecks(lintChecksEl, lintSettings, (c) => `lint.check.${c}` as Key, (next) => {
      lintSettings = next;
      saveLintSettings(next);
      lintView.now();
    });
  }

  const suggest = createSuggest({ source: sourceEl, list: suggestEl, status: suggestStatusEl, metrics, complete });

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
    lintView.now();
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
  const LEDGER_ORDER: readonly LedgerId[] = ["registers", "heap", "stack", "flags", "bytes"];
  const collapsed = new Set<LedgerId>();
  let expanded: LedgerId | null = null;
  let wide = false;
  // strings take one row with their first and last address; the toggle on the bytes ledger shows every byte instead
  let groupStrings = true;
  // the stack is one row per word with every value pushed there, like the heap; the toggle shows it byte by byte
  let compactStack = true;

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
      resetHeights();
      applyLedgerState();
    });
    const group = toggle(h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "group", "aria-pressed": String(groupStrings) }, t(groupStrings ? "bytes.ungroup" : "bytes.group")), () => {
      groupStrings = !groupStrings;
      group.textContent = t(groupStrings ? "bytes.ungroup" : "bytes.group");
      group.setAttribute("aria-pressed", String(groupStrings));
      const body = ledgersEl.querySelector<HTMLElement>('[data-ledger="bytes"] .ledger-body')!;
      body.replaceChildren(bytesTable(mode === "step" ? pos : result!.steps.length));
    });
    const stackLabel = (): Key => (compactStack ? "bytes.ungroup" : "stack.compact");
    const compact = toggle(h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "compact", "aria-pressed": String(compactStack) }, t(stackLabel())), () => {
      compactStack = !compactStack;
      compact.textContent = t(stackLabel());
      compact.setAttribute("aria-pressed", String(compactStack));
      paintTables();
    });
    return h(
      "section",
      { class: "ledger", "data-ledger": id },
      h(
        "div",
        { class: "ledger-head" },
        h("h3", { class: "label-title" }, t(`ledger.${id}`)),
        h("span", { class: "label ledger-hint" }, t(hint)),
        h("span", { class: "ledger-tools" }, ...(id === "bytes" ? [group] : id === "stack" ? [compact] : []), grow, hide),
      ),
      h("div", { class: "ledger-body" }),
    );
  }

  /** Drops the heights dragged by hand, which would otherwise outlive the layout they were set for. */
  function resetHeights(): void {
    for (const body of ledgersEl.querySelectorAll<HTMLElement>(".ledger-body")) body.style.removeProperty("height");
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
      return;
    }
    // a track holding only hidden ledgers shrinks to its header; the rest share what is left
    const track = (keys: readonly LedgerId[], fr: number): string => (keys.every(isOff) ? "auto" : `minmax(0, ${fr}fr)`);
    if (wide) {
      // one column per table that has something to show
      const shownKeys = LEDGER_ORDER.filter((k) => !ledgersEl.querySelector(`[data-ledger="${k}"]`)?.classList.contains("is-empty"));
      ledgersEl.style.setProperty("--cols", shownKeys.map((k) => track([k], k === "registers" || k === "bytes" ? 1.3 : 1)).join(" "));
    } else {
      ledgersEl.style.setProperty("--cols", "minmax(0, 1fr) minmax(0, 1fr)");
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
      const fmt = (v: number): string => fmtUnsigned(v, c.width);
      return h(
        "tr",
        { class: "log-row", "data-decl": declOf(c.addr) },
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

  /** Data memory byte by byte: address, label, character, hex and the 8 bits of each datum. */
  function bytesTable(upTo: number): HTMLElement {
    const m = memoryMap(result!.program, result!.steps.slice(0, upTo));
    if (m.rows.length === 0) return h("p", { class: "none" }, t("none.bytes"));
    const cell = (r: (typeof m.rows)[number], text: string): HTMLElement =>
      h("td", { class: r.changed ? "val is-set" : "val", title: r.blank ? t("bytes.blank") : undefined }, r.blank ? "?" : text);
    const table = h(
      "table",
      { class: "log" },
      h("caption", { class: "visually-hidden" }, t("caption.bytes")),
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col", class: "num" }, t("table.address")),
          h("th", { scope: "col" }, t("table.name")),
          h("th", { scope: "col" }, t("table.char")),
          h("th", { scope: "col", class: "val" }, t("table.hex")),
          h("th", { scope: "col", class: "val" }, t("table.bits")),
        ),
      ),
      h(
        "tbody",
        {},
        ...(groupStrings ? groupMemory(m.rows, result!.program.units, true) : m.rows.map((row): MemoryEntry<(typeof m.rows)[number]> => ({ kind: "byte", row }))).map((e) => {
          if (e.kind === "text") {
            const changed = e.changed ? "val is-set" : "val";
            return h(
              "tr",
              { class: "log-row", "data-step": e.step === undefined ? undefined : String(e.step), "data-decl": declOf(e.start) },
              h("th", { scope: "row", class: "num", title: `${e.start}–${e.end}` }, `${hex16(e.start)}H–${hex16(e.end)}H`),
              h("td", { class: "var-name" }, e.label ?? ""),
              h("td", { class: "text-cell", title: e.text }, e.text),
              h("td", { class: changed }, t("bytes.count", { n: e.count })),
              h("td", { class: changed }, ""),
            );
          }
          if (e.kind === "unit") {
            const cls = e.changed ? "val is-set" : "val";
            const shown = e.blank ? "?" : e.value !== undefined ? `${e.value.toString(16).toUpperCase().padStart(e.size * 2, "0")}H` : t("bytes.count", { n: e.size });
            return h(
              "tr",
              { class: "log-row", "data-step": e.step === undefined ? undefined : String(e.step), "data-decl": declOf(e.start) },
              h("th", { scope: "row", class: "num", title: `${e.start}–${e.end}` }, `${hex16(e.start)}H–${hex16(e.end)}H`),
              h("td", { class: "var-name" }, e.label ?? ""),
              h("td", {}, ""),
              h("td", { class: cls, title: e.blank ? t("bytes.blank") : undefined }, shown),
              h("td", { class: cls }, e.value !== undefined && !e.blank ? e.value.toString(2).padStart(e.size * 8, "0") : ""),
            );
          }
          const r = e.row;
          return h(
            "tr",
            { class: "log-row", "data-step": r.step === undefined ? undefined : String(r.step), "data-decl": declOf(r.addr) },
            h("th", { scope: "row", class: "num", title: String(r.addr) }, `${hex16(r.addr)}H`),
            h("td", { class: "var-name" }, r.label ?? ""),
            h("td", {}, r.char),
            cell(r, `${hex8(r.value)}H`),
            cell(r, bin8(r.value)),
          );
        }),
      ),
    );
    const more = m.total > m.rows.length ? h("p", { class: "help" }, t("bytes.more", { shown: m.rows.length, total: m.total })) : null;
    return h("div", {}, table, more);
  }

  /** The stack like the heap: one row per word from the base down, with every value pushed there in order; popped ones are dimmed. */
  function stackSlotsTable(events: ReturnType<typeof buildHistory>["stack"], upTo: number): HTMLElement {
    if (events.length === 0) return h("p", { class: "none" }, t("none.stack"));
    const slots = stackSlots(events);
    const sp = upTo > 0 ? result!.steps[upTo - 1].regs.SP : DEFAULT_SP;
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
        h(
          "th",
          { scope: "row", class: "num" },
          `${hex16(sl.addr)}H`,
          i === 0 ? h("span", { class: "slot-tag" }, t("slot.base")) : null,
          sl.addr === sp ? h("span", { class: "slot-tag" }, "SP →") : null,
        ),
        ...sl.writes.map((w) => {
          const live = w.poppedAt === undefined;
          return h(
            "td",
            {
              class: live ? "val is-set" : "val is-set is-stale",
              "data-step": String(w.step),
              title: `${describeStep(w.step)}${live ? "" : t("cell.popped", { n: w.poppedAt ?? "" })}`,
            },
            fmtUnsigned(w.value, 16),
            h("span", { class: "cell-step" }, `s${w.step}`),
          );
        }),
      ),
    );
    return h(
      "table",
      { class: "log log--stack" },
      h("caption", { class: "visually-hidden" }, t("caption.stackSlots")),
      h("thead", {}, head),
      h("tbody", {}, ...rows),
    );
  }

  /** The stack byte by byte, from its base down: address, mark (base / SP), character, hex and bits. Popped bytes are dimmed. */
  function stackTable(upTo: number): HTMLElement {
    const m = stackMap(result!.steps.slice(0, upTo));
    if (m.rows.length === 0) return h("p", { class: "none" }, t("none.stack"));
    return h(
      "table",
      { class: "log" },
      h("caption", { class: "visually-hidden" }, t("caption.stack")),
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col", class: "num" }, t("table.address")),
          h("th", { scope: "col" }, t("table.mark")),
          h("th", { scope: "col" }, t("table.char")),
          h("th", { scope: "col", class: "val" }, t("table.hex")),
          h("th", { scope: "col", class: "val" }, t("table.bits")),
        ),
      ),
      h(
        "tbody",
        {},
        ...m.rows.map((r) => {
          const cls = r.base ? "val" : r.live ? "val is-set" : "val is-set is-stale";
          const mark = [r.base ? t("slot.base") : "", r.sp ? "SP →" : ""].filter(Boolean).join(" ");
          return h(
            "tr",
            { class: r.base ? "log-row log-row--start" : "log-row", "data-step": r.step === undefined ? undefined : String(r.step) },
            h("th", { scope: "row", class: "num", title: String(r.addr) }, `${hex16(r.addr)}H`),
            h("td", { class: "var-name" }, mark),
            h("td", {}, r.char),
            h("td", { class: cls }, r.base ? "" : `${hex8(r.value)}H`),
            h("td", { class: cls }, r.bits),
          );
        }),
      ),
    );
  }

  // ---- hover and step-by-step ---------------------------------------------------

  type Mode = "all" | "step";
  let mode: Mode = "all";
  let pos = 0; // in step mode: how many instructions have run so far
  let hovered = 0;
  let hoveredDecl = 0;
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

  /** The source line that declares the data at `addr`, as a row attribute. */
  const declOf = (addr: number): string | undefined => {
    const line = declLine(result!.program, addr);
    return line === undefined ? undefined : String(line);
  };

  /** Hovering a row lights the instruction of its step; a variable's row lights the line that declares it instead. */
  function setHover(n: number, decl = 0): void {
    if (n === hovered && decl === hoveredDecl) return;
    hovered = n;
    hoveredDecl = decl;
    for (const r of ledgersEl.querySelectorAll(".is-hover")) r.classList.remove("is-hover");
    if (n > 0) for (const r of ledgersEl.querySelectorAll(`[data-step="${n}"]`)) r.classList.add("is-hover");
    hoverEl.textContent = decl > 0 ? t("hover.decl", { line: decl }) : n > 0 ? describeStep(n) : restText();
    highlightLine(decl > 0 ? decl : n > 0 ? lineOf(n) : restLine());
  }
  ledgersEl.addEventListener("mouseover", (e) => {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>("[data-step]");
    const decl = target.closest<HTMLElement>("[data-decl]");
    setHover(el ? Number(el.dataset.step) : 0, decl ? Number(decl.dataset.decl) : 0);
  });
  ledgersEl.addEventListener("mouseleave", () => setHover(0));

  /** Fills the four tables with what happened up to the current position (everything, outside step mode). `animate` lets what this step added slide in. */
  function paintTables(animate = false): void {
    if (!result) return;
    const upTo = mode === "step" ? pos : result.steps.length;
    const hist = buildHistory(result.steps.slice(0, upTo));
    const bodies: Record<LedgerId, HTMLElement> = {
      registers: valueTable(t("caption.registers"), t("table.step"), hist.registers.map((r) => ({ name: r.name, series: r })), (_, v) => fmtUnsigned(v, 16)),
      flags: valueTable(t("caption.flags"), t("table.step"), hist.flags.map((f) => ({ name: f.name, series: f })), (_, v) => String(v)),
      heap: hist.heap.length > 0 ? heapTable(hist.heap) : h("p", { class: "none" }, t("none.heap")),
      stack: compactStack ? stackSlotsTable(hist.stack, upTo) : stackTable(upTo),
      bytes: bytesTable(upTo),
    };
    for (const el of ledgersEl.querySelectorAll<HTMLElement>(".ledger")) {
      const body = el.querySelector<HTMLElement>(".ledger-body")!;
      const { scrollTop, scrollLeft } = body;
      body.replaceChildren(bodies[el.dataset.ledger as LedgerId]);
      body.scrollTop = scrollTop;
      body.scrollLeft = scrollLeft;
      // a table with nothing to show is left out instead of sitting there empty
      el.classList.toggle("is-empty", body.firstElementChild?.classList.contains("none") ?? false);
    }
    if (expanded !== null && ledgersEl.querySelector(`[data-ledger="${expanded}"]`)?.classList.contains("is-empty")) expanded = null;
    applyLedgerState();
    hovered = 0;
    hoveredDecl = 0;
    if (mode === "step" && pos > 0) {
      for (const r of ledgersEl.querySelectorAll(`[data-step="${pos}"]`)) {
        r.classList.add("is-current");
        if (animate) r.classList.add("is-new");
      }
      for (const body of ledgersEl.querySelectorAll<HTMLElement>(".ledger-body")) revealCurrent(body);
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

  useRadixFor("msx88");
  wireRadix(modebarEl, () => paintTables());
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
      ledger("heap", "hint.heap"),
      ledger("stack", "hint.stack"),
      ledger("flags", "hint.values"),
      ledger("bytes", "hint.bytes"),
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
      suggest.close();
      run();
      return;
    }
    if (suggest.handleKeydown(e)) return;
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
    lintView.paint();
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
