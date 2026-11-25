import { enableColumnResize } from "./colresize";
import { AsmError } from "../core/types";
import { mipsExamplesFor } from "../mips/examples";
import { completeMips } from "../mips/complete";
import { tokenizeMips } from "../mips/highlight";
import { lintMips } from "../mips/lint";
import { buildPipeline } from "../mips/pipeline";
import type { Pipeline, PipelineRow } from "../mips/pipeline";
import { decodeMipsState, encodeMipsState } from "../mips/share";
import type { MipsShareState } from "../mips/share";
import { MipsSimulation, simulateMips } from "../mips/sim";
import type { MipsSimResult } from "../mips/sim";
import { hex16, hex8 } from "./format";
import { fmtWide, getRadix, useRadixFor, wireRadix } from "./radix";
import { groupMemory } from "./memgroup";
import type { MemoryEntry } from "./memgroup";
import { declLine, memoryMap, memoryRows, pipelineUpTo, pipelineWindow, registerTable, stepFacts, variableTable } from "../mips/view";
import { wireArchSelect } from "./arch";
import { h } from "./dom";
import type { Child } from "./dom";
import { markRange } from "./highlight";
import { LANGS, getLang, setLang, t, translateCore } from "./i18n";
import type { Key, Lang } from "./i18n";
import { newlineEdit, tabEdit } from "./indent";
import { createLineHighlight } from "./linehl";
import { loadLintSettings, saveLintSettings } from "./lint";
import type { Diagnostic } from "./lint";
import { createLintView, renderLintChecks } from "./lintview";
import { revealCurrent } from "./reveal";
import { createSuggest } from "./suggest";
import { createTextMetrics } from "./textpos";
import { buildTerminal, terminalEnd, terminalView } from "./terminal";
import { DEFAULT_RATE, MAX_RATE, MIN_RATE, drive, liveRate } from "./live";
import type { Driver } from "./live";
import type { Terminal } from "./terminal";

/** How many instructions the cycle diagram draws at a time: it is steps x cycles, so a long run needs paging. */
const PIPE_PAGE = 24;
const DEFAULT_STATE_ID = "sum-loop";
const LINT_KEY = "msx88-trace:lint-mips";

export function mountMipsApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="wordmark" href="?arch=mips" data-i18n-aria="mips.wordmark.label">MIPS64 Trace</a>
        <div class="topbar-actions flex items-center gap-(--space-sm)">
          <select id="lang" class="control lang-select" aria-label="Idioma / Language"></select>
          <select id="arch" class="control lang-select" data-i18n-aria="arch.label"></select>
          <label class="field-inline flex items-center gap-(--space-xs)">
            <span class="label" data-i18n="example.label"></span>
            <select id="example" class="control"></select>
          </label>
          <a id="manual-open" class="key" href="./manual.html?arch=mips" target="_blank" rel="noopener" data-i18n="manual.open"></a>
          <button type="button" id="stop" class="key" data-i18n="live.stop" hidden></button>
          <button type="button" id="run" class="key key--primary key--icon">
            <svg class="icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 2.5v11l9.5-5.5z" fill="currentColor" /></svg>
            <span data-i18n="run"></span>
          </button>
        </div>
      </header>
      <main class="workspace">
        <section class="pane pane--source" aria-labelledby="h-source">
          <div class="pane-head flex items-baseline justify-between gap-(--space-sm)">
            <h2 id="h-source" class="pane-title" data-i18n="source.title"></h2>
          </div>
          <div class="editor graphite cut">
            <div class="gutter" aria-hidden="true"><pre id="gutter" class="gutter-lines">1</pre></div>
            <div class="editor-scroll">
              <div id="line-hl" class="line-hl is-off"></div>
              <pre class="hl" aria-hidden="true"><code id="hl-code"></code></pre>
              <textarea id="source" class="code" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"
                data-i18n-aria="mips.source.aria" aria-describedby="source-help lint" aria-autocomplete="list" aria-controls="suggest"
                placeholder=".text&#10;daddi r1, r0, 5&#10;halt"></textarea>
            </div>
          </div>
          <div id="term" class="term-slot"></div>
          <ul id="lint" class="lint-list" role="status" hidden></ul>
          <details id="lint-opts" class="lint-opts">
            <summary class="label-title" data-i18n="lint.options"></summary>
            <div id="lint-checks" class="lint-checks"></div>
          </details>
          <p id="source-help" class="help" data-i18n="mips.source.help"></p>
          <details id="settings" class="settings">
            <summary class="label-title" data-i18n="settings.max"></summary>
            <div class="settings-body">
              <label class="field flex flex-col gap-(--space-3xs)">
                <span class="label" data-i18n="settings.max"></span>
                <input id="max" class="control" type="number" name="max-steps" min="1" max="20000" inputmode="numeric" />
              </label>
              <label class="field-inline flex items-center gap-(--space-xs)">
                <input id="nolimit" type="checkbox" />
                <span class="label" data-i18n="settings.unlimited"></span>
              </label>
              <label id="rate-field" class="field flex flex-col gap-(--space-3xs)" hidden>
                <span class="label" data-i18n="settings.rate"></span>
                <input id="rate" class="control" type="number" name="steps-per-second" min="${MIN_RATE}" max="${MAX_RATE}" inputmode="numeric" />
              </label>
            </div>
          </details>
        </section>
        <section class="pane pane--trace" aria-labelledby="h-trace">
          <div class="pane-head flex flex-wrap items-baseline gap-x-(--space-md) gap-y-(--space-3xs)">
            <h2 id="h-trace" class="pane-title" data-i18n="trace.title"></h2>
            <p id="summary" class="summary" role="status"></p>
          </div>
          <div class="modebar">
            <label class="check" aria-describedby="fwd-help">
              <input id="forwarding" type="checkbox" />
              <span data-i18n="mips.forwarding"></span>
            </label>
            <span id="fwd-help" class="help" data-i18n="mips.forwarding.help"></span>
          </div>
          <div id="viewbar" class="modebar" hidden>
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
          <div id="ledgers" class="ledgers ledgers--mips"></div>
        </section>
      </main>
    </div>
    <div id="lint-tip" class="lint-tip" role="tooltip" hidden></div>
    <ul id="suggest" class="suggest" role="listbox" data-i18n-aria="suggest.aria" hidden></ul>
    <p id="suggest-status" class="visually-hidden" role="status"></p>`;

  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const sourceEl = q<HTMLTextAreaElement>("source");
  const maxEl = q<HTMLInputElement>("max");
  const noLimitEl = q<HTMLInputElement>("nolimit");
  const rateEl = q<HTMLInputElement>("rate");
  const rateFieldEl = q<HTMLElement>("rate-field");
  const stopEl = q<HTMLButtonElement>("stop");
  const forwardingEl = q<HTMLInputElement>("forwarding");
  const regionEl = q<HTMLDivElement>("region");
  const termEl = q<HTMLDivElement>("term");
  const ledgersEl = q<HTMLDivElement>("ledgers");
  enableColumnResize(ledgersEl);
  const gutterEl = q<HTMLPreElement>("gutter");
  const hlCodeEl = q<HTMLElement>("hl-code");
  const summaryEl = q<HTMLParagraphElement>("summary");
  const exampleEl = q<HTMLSelectElement>("example");
  const langEl = q<HTMLSelectElement>("lang");
  const lineHlEl = q<HTMLDivElement>("line-hl");
  const lintEl = q<HTMLUListElement>("lint");
  const lintChecksEl = q<HTMLDivElement>("lint-checks");
  const lintTipEl = q<HTMLDivElement>("lint-tip");
  const suggestEl = q<HTMLUListElement>("suggest");
  const suggestStatusEl = q<HTMLParagraphElement>("suggest-status");
  const hoverEl = q<HTMLParagraphElement>("hover");
  const viewbarEl = q<HTMLDivElement>("viewbar");
  const stepperEl = q<HTMLDivElement>("stepper");
  const modeAllBtn = q<HTMLButtonElement>("mode-all");
  const modeStepBtn = q<HTMLButtonElement>("mode-step");
  const stResetBtn = q<HTMLButtonElement>("st-reset");
  const stPrevBtn = q<HTMLButtonElement>("st-prev");
  const stNextBtn = q<HTMLButtonElement>("st-next");
  const stPlayBtn = q<HTMLButtonElement>("st-play");
  const stRange = q<HTMLInputElement>("st-range");
  const stCount = q<HTMLOutputElement>("st-count");
  const lineHl = createLineHighlight(sourceEl, lineHlEl);
  const highlightLine = (line: number): void => lineHl.show(line);

  let result: MipsSimResult | null = null;
  let terminal: Terminal | null = null;
  /** The run in progress when there is no step limit: it advances a little at a time instead of all at once. */
  let sim: MipsSimulation | null = null;
  let driver: Driver | null = null;
  let pipeline: Pipeline | null = null;
  let pipeStart = 0;
  let view: "empty" | "error" | "trace" = "empty";
  let lastError: AsmError | null = null;
  type Mode = "all" | "step";
  let mode: Mode = "all";
  /** In step mode: how many instructions have run so far. */
  let pos = 0;
  let playTimer: number | undefined;

  // ---- editor ----------------------------------------------------------------

  let gutterCount = 0;
  let painted: string | null = null;

  function paintSource(): void {
    const text = sourceEl.value;
    const findings = lintView.findings;
    const key = `${findings.map((f) => `${f.severity}:${f.from}:${f.to}`).join(",")}|${text}`;
    if (key === painted) return;
    painted = key;
    const tokens = findings.reduce((acc, f) => markRange(acc, f.from, f.to, f.severity), tokenizeMips(text));
    const frag = document.createDocumentFragment();
    for (const tk of tokens) {
      const cls = [tk.kind ? `tk tk-${tk.kind}` : "", tk.mark ? (tk.mark === "error" ? "tk-err" : "tk-warn") : ""].filter(Boolean).join(" ");
      frag.append(cls ? h("span", { class: cls }, tk.text) : tk.text);
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
  sourceEl.addEventListener("scroll", syncGutter);
  sourceEl.addEventListener("input", syncGutter);

  // ---- live linter and suggestions ---------------------------------------------

  const metrics = createTextMetrics(sourceEl);
  let lintSettings = loadLintSettings(undefined, LINT_KEY);
  const describeFinding = (f: Diagnostic): string => (f.key ? t(f.key, f.vars) : translateCore(f.message ?? ""));

  const lintView = createLintView({
    source: sourceEl,
    list: lintEl,
    tip: lintTipEl,
    metrics,
    describe: describeFinding,
    compute: () => lintMips(sourceEl.value, { maxSteps: readState().maxSteps }, lintSettings),
    onPaint: paintSource,
  });

  function buildLintChecks(): void {
    renderLintChecks(lintChecksEl, lintSettings, (c) => (c === "uninit" ? "mips.lint.check.uninit" : `lint.check.${c}`), (next) => {
      lintSettings = next;
      saveLintSettings(next, undefined, LINT_KEY);
      lintView.now();
    });
  }

  const suggest = createSuggest({ source: sourceEl, list: suggestEl, status: suggestStatusEl, metrics, complete: completeMips });

  function insert(text: string, from: number, to: number): void {
    sourceEl.setSelectionRange(from, to);
    // insertText keeps the browser's undo history; setRangeText is the fallback where it is unavailable
    if (!document.execCommand("insertText", false, text)) {
      sourceEl.setRangeText(text, from, to, "end");
      sourceEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  let leaveOnTab = false;
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
    if (e.key === "Enter" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.isComposing) {
      e.preventDefault();
      leaveOnTab = false;
      const nl = newlineEdit(sourceEl.value, sourceEl.selectionStart, sourceEl.selectionEnd);
      insert(nl.text, nl.from, nl.to);
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
    insert(edit.text, edit.from, edit.to);
    sourceEl.setSelectionRange(edit.selStart, edit.selEnd);
  });

  // ---- state ---------------------------------------------------------------

  function readState(): MipsShareState {
    const max = Number.parseInt(maxEl.value, 10);
    return {
      source: sourceEl.value,
      maxSteps: Number.isFinite(max) ? Math.min(20000, Math.max(1, max)) : 2000,
      forwarding: forwardingEl.checked,
      ...(noLimitEl.checked ? { unlimited: true, stepsPerSecond: liveRate(rateEl.value) } : {}),
    };
  }

  /** With no step limit the step count is moot and the pace takes its place. */
  function syncLimit(): void {
    maxEl.disabled = noLimitEl.checked;
    rateFieldEl.hidden = !noLimitEl.checked;
  }
  noLimitEl.addEventListener("change", syncLimit);

  function writeState(s: MipsShareState): void {
    sourceEl.value = s.source;
    maxEl.value = String(s.maxSteps);
    noLimitEl.checked = s.unlimited === true;
    rateEl.value = String(s.stepsPerSecond ?? DEFAULT_RATE);
    syncLimit();
    forwardingEl.checked = s.forwarding;
    lintView.now();
  }

  // ---- rendering -------------------------------------------------------------

  function setSummary(...parts: string[]): void {
    summaryEl.replaceChildren(...parts.map((p) => h("span", {}, p)));
  }

  function renderEmpty(): void {
    result = null;
    pipeline = null;
    view = "empty";
    leaveStepping();
    setSummary();
    hoverEl.textContent = "";
    ledgersEl.replaceChildren();
    termEl.replaceChildren();
    terminal = null;
    regionEl.replaceChildren(
      h("div", { class: "state" }, h("h3", { class: "state-title" }, t("empty.title")), h("p", {}, t("mips.empty.body"))),
    );
  }

  function renderAsmError(err: AsmError, reveal = true): void {
    result = null;
    pipeline = null;
    view = "error";
    lastError = err;
    leaveStepping();
    setSummary();
    hoverEl.textContent = "";
    ledgersEl.replaceChildren();
    termEl.replaceChildren();
    terminal = null;
    regionEl.replaceChildren(
      h(
        "div",
        { class: "state state--error", role: "alert" },
        h("h3", { class: "state-title" }, t("error.title")),
        h("p", { class: "error-line" }, translateCore(err.message)),
        h("p", {}, t("error.fix")),
      ),
    );
    // the linter underlines the same text the assembler complained about
    lintView.now();
    const f = lintView.findings.find((x) => x.severity === "error" && x.to > x.from);
    if (reveal && f) {
      sourceEl.focus();
      sourceEl.setSelectionRange(f.from, f.to);
    }
  }

  const stat = (key: Key, n: number | string): string => t(key, { n });

  function buildChrome(res: MipsSimResult): void {
    const children: Child[] = [];
    if (res.reason !== "halted" && res.reason !== "running") {
      const reason = t(`stop.${res.reason}`);
      children.push(
        h(
          "p",
          { class: "notice", role: "status" },
          res.error ? t("notice.withError", { reason, error: translateCore(res.error) }) : t("notice.plain", { reason }),
        ),
      );
    }
    terminal = buildTerminal();
    termEl.replaceChildren(terminal.el);
    regionEl.replaceChildren(...children.filter((c): c is Node => c instanceof Node));
    paintTerminal();
    ledgersEl.replaceChildren(
      ledger("pipeline", "mips.pipeline", "mips.pipeline.hint"),
      ledger("registers", "mips.registers", "mips.registers.hint"),
      ledger("variables", "mips.variables", "mips.variables.hint"),
      ledger("bytes", "mips.bytes", "mips.bytes.hint"),
      ledger("memory", "mips.memory", "mips.memory.hint"),
    );
    paintSummary();
  }

  function paintSummary(): void {
    if (!result || !pipeline) return;
    const s = pipeline.stats;
    setSummary(
      t("summary.steps", { n: result.steps.length }),
      stat("mips.summary.cycles", s.cycles),
      stat("mips.summary.cpi", s.cpi.toFixed(2)),
      stat("mips.summary.raw", s.raw),
      stat("mips.summary.flushes", s.flushes),
      t(`stop.${result.reason}`),
    );
  }

  // strings take one row with their first and last address; the toggle on the bytes table shows every byte instead
  let groupStrings = true;

  function ledger(id: string, title: Key, hint: Key): HTMLElement {
    const tools: HTMLElement[] = [];
    if (id === "bytes") {
      const btn = h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "group", "aria-pressed": String(groupStrings) }, t(groupStrings ? "bytes.ungroup" : "bytes.group"));
      btn.addEventListener("click", () => {
        groupStrings = !groupStrings;
        btn.textContent = t(groupStrings ? "bytes.ungroup" : "bytes.group");
        btn.setAttribute("aria-pressed", String(groupStrings));
        body("bytes").replaceChildren(bytesBody());
        body("bytes").parentElement!.classList.toggle("is-empty", body("bytes").firstElementChild?.classList.contains("none") ?? false);
      });
      tools.push(h("span", { class: "ledger-tools" }, btn));
    }
    return h(
      "section",
      { class: "ledger", "data-ledger": id },
      h("div", { class: "ledger-head" }, h("h3", { class: "label-title" }, t(title)), h("span", { class: "label ledger-hint" }, t(hint)), ...tools),
      h("div", { class: "ledger-body" }),
    );
  }

  const body = (id: string): HTMLElement => ledgersEl.querySelector<HTMLElement>(`[data-ledger="${id}"] .ledger-body`)!;

  /** The value in the base that is not on screen (hex while decimal or binary shows), for the tooltip. */
  const otherForm = (v: bigint): string => fmtWide(v, getRadix() === "hex" ? "dec" : "hex");

  /** The instruction's row header: its step number and text. */
  const stepHead = (step: number, text: string): HTMLElement =>
    h("th", { scope: "row", title: text }, text, h("span", { class: "cell-step" }, String(step)));

  const none = (key: Key): HTMLElement => h("p", { class: "none label" }, t(key));

  function pipelineBody(): HTMLElement {
    const stepping = mode === "step";
    // stepping shows the last instructions up to the current one, so the newest row is always on screen
    const p = stepping ? pipelineUpTo(pipeline!, pos) : pipeline!;
    const w = pipelineWindow(p, stepping ? Number.MAX_SAFE_INTEGER : pipeStart, PIPE_PAGE);
    if (!stepping) pipeStart = w.start;
    if (w.rows.length === 0) return h("div");

    const cycles = Array.from({ length: w.lastCycle - w.firstCycle + 1 }, (_, i) => w.firstCycle + i);
    const cellFor = (row: PipelineRow, cycle: number): HTMLElement => {
      const idx = cycle - row.cells[0].cycle;
      const cell = idx >= 0 ? row.cells[idx] : undefined;
      if (!cell) return h("td", { class: "st" });
      const waiting = cell.stage === "IF" && idx > 0;
      return h("td", { class: `st st-${cell.stage}${waiting ? " is-wait" : ""}` }, cell.stage);
    };
    const table = h(
      "table",
      { class: "log log--pipe" },
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, t("mips.col.instruction")), ...cycles.map((c) => h("th", { scope: "col", class: "cyc" }, String(c))))),
      h(
        "tbody",
        {},
        ...w.rows.map((row) => {
          const tr = h(
            "tr",
            { class: `log-row${row.flush ? " log-row--flush" : ""}`, "data-step": String(row.step), title: row.flush ? t("mips.flush") : undefined },
            stepHead(row.step, row.instr.text),
            ...cycles.map((c) => cellFor(row, c)),
          );
          return tr;
        }),
      ),
    );

    const prev = h("button", { type: "button", class: "key key--sm", disabled: w.start === 0 }, t("mips.page.prev"));
    const next = h("button", { type: "button", class: "key key--sm", disabled: w.start + PIPE_PAGE >= w.total }, t("mips.page.next"));
    prev.addEventListener("click", () => page(-PIPE_PAGE));
    next.addEventListener("click", () => page(PIPE_PAGE));
    const nav =
      !stepping && w.total > PIPE_PAGE
        ? h(
            "div",
            { class: "pipe-nav" },
            prev,
            h("span", { class: "label" }, t("mips.page.range", { from: w.start + 1, to: w.start + w.rows.length, total: w.total })),
            next,
          )
        : null;
    return h("div", { class: "pipe" }, nav, table, h("p", { class: "help pipe-legend" }, t("mips.legend")));
  }

  function registersBody(): HTMLElement {
    const tab = registerTable(result!.steps.slice(0, shown()));
    if (tab.rows.length === 0) return none("mips.none.registers");
    return h(
      "table",
      { class: "log" },
      h(
        "thead",
        {},
        h("tr", {}, h("th", { scope: "col" }, t("mips.col.instruction")), ...tab.cols.map((c) => h("th", { scope: "col", class: "val" }, c.toUpperCase()))),
      ),
      h(
        "tbody",
        {},
        ...tab.rows.map((row) =>
          h(
            "tr",
            { class: "log-row", "data-step": String(row.step) },
            stepHead(row.step, row.text),
            ...tab.cols.map((c) => {
              const v = row.set.get(c);
              if (v === undefined) return h("td", { class: "val" });
              return h("td", { class: "val is-set", title: otherForm(v) }, fmtWide(v));
            }),
          ),
        ),
      ),
    );
  }

  function variablesBody(): HTMLElement {
    const cols = variableTable(result!.program, result!.steps.slice(0, shown())).cols;
    if (cols.length === 0) return none("mips.none.variables");
    // one row per memory location; its values sit in a single line, oldest first, and only the latest is not struck through
    const value = (v: bigint, tip: string, step?: number): HTMLElement => {
      return h("span", { class: "var-val", title: `${otherForm(v)}${tip}`, "data-step": step === undefined ? undefined : String(step) }, fmtWide(v));
    };
    return h(
      "table",
      { class: "log" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col" }, t("mips.col.addr")),
          h("th", { scope: "col" }, t("mips.col.variable")),
          h("th", { scope: "col" }, t("mips.col.values")),
        ),
      ),
      h(
        "tbody",
        {},
        ...cols.map((c) => {
          const vals = [value(c.initial, ""), ...c.writes.map((w) => value(w.value, ` · ${w.text} (${w.step})`, w.step))];
          for (const v of vals.slice(0, -1)) v.classList.add("is-old");
          return h(
            "tr",
            { class: "log-row", "data-decl": declOf(c.addr) },
            h("th", { scope: "row", class: "num", title: t("mips.col.varTip", { addr: c.addr, size: c.size }) }, `${c.addr} · 0x${c.addr.toString(16).toUpperCase()}`),
            h("td", { class: "var-name" }, c.name),
            h("td", {}, h("div", { class: "var-vals" }, ...vals)),
          );
        }),
      ),
    );
  }

  /** Data memory byte by byte: address, label, character, hex and the 8 bits of each datum. */
  function bytesBody(): HTMLElement {
    const m = memoryMap(result!.program, result!.steps.slice(0, shown()));
    if (m.rows.length === 0) return none("mips.none.bytes");
    const table = h(
      "table",
      { class: "log" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col", class: "num" }, t("mips.col.addr")),
          h("th", { scope: "col" }, t("mips.col.variable")),
          h("th", { scope: "col" }, t("mips.col.char")),
          h("th", { scope: "col", class: "val" }, t("mips.col.hex")),
          h("th", { scope: "col", class: "val" }, t("mips.col.bits")),
        ),
      ),
      h(
        "tbody",
        {},
        ...(groupStrings ? groupMemory(m.rows, result!.program.units, false) : m.rows.map((row): MemoryEntry<(typeof m.rows)[number]> => ({ kind: "byte", row }))).map((e) => {
          if (e.kind === "text") {
            const cls = e.changed ? "val is-set" : "val";
            return h(
              "tr",
              { class: "log-row", "data-step": e.step === undefined ? undefined : String(e.step), "data-decl": declOf(e.start) },
              h("th", { scope: "row", class: "num", title: `${e.start}–${e.end}` }, `${hex16(e.start)}H–${hex16(e.end)}H`),
              h("td", { class: "var-name" }, e.label ?? ""),
              h("td", { class: "text-cell", title: e.text }, e.text),
              h("td", { class: cls }, t("bytes.count", { n: e.count })),
              h("td", { class: cls }, ""),
            );
          }
          if (e.kind === "unit") {
            const cls = e.changed ? "val is-set" : "val";
            const shown = e.value !== undefined ? `${e.value.toString(16).toUpperCase().padStart(e.size * 2, "0")}H` : t("bytes.count", { n: e.size });
            return h(
              "tr",
              { class: "log-row", "data-step": e.step === undefined ? undefined : String(e.step), "data-decl": declOf(e.start) },
              h("th", { scope: "row", class: "num", title: `${e.start}–${e.end}` }, `${hex16(e.start)}H–${hex16(e.end)}H`),
              h("td", { class: "var-name" }, e.label ?? ""),
              h("td", {}, ""),
              h("td", { class: cls }, shown),
              h("td", { class: cls }, e.value !== undefined ? e.value.toString(2).padStart(e.size * 8, "0") : ""),
            );
          }
          const r = e.row;
          return h(
            "tr",
            { class: "log-row", "data-step": r.step === undefined ? undefined : String(r.step), "data-decl": declOf(r.addr) },
            h("th", { scope: "row", class: "num", title: String(r.addr) }, `${hex16(r.addr)}H`),
            h("td", { class: "var-name" }, r.label ?? ""),
            h("td", {}, r.char),
            h("td", { class: r.changed ? "val is-set" : "val" }, `${hex8(r.value)}H`),
            h("td", { class: r.changed ? "val is-set" : "val" }, r.bits),
          );
        }),
      ),
    );
    const more = m.total > m.rows.length ? h("p", { class: "help" }, t("mips.bytes.more", { shown: m.rows.length, total: m.total })) : null;
    return h("div", {}, table, more);
  }

  function memoryBody(): HTMLElement {
    const rows = memoryRows(result!.steps.slice(0, shown()));
    if (rows.length === 0) return none("mips.none.memory");
    return h(
      "table",
      { class: "log" },
      h(
        "thead",
        {},
        h(
          "tr",
          {},
          h("th", { scope: "col" }, t("mips.col.instruction")),
          h("th", { scope: "col" }, t("mips.col.access")),
          h("th", { scope: "col", class: "num" }, t("mips.col.addr")),
          h("th", { scope: "col", class: "num" }, t("mips.col.size")),
          h("th", { scope: "col", class: "val" }, t("mips.col.before")),
          h("th", { scope: "col", class: "val" }, t("mips.col.value")),
        ),
      ),
      h(
        "tbody",
        {},
        ...rows.map((r) =>
          h(
            "tr",
            { class: "log-row", "data-step": String(r.step) },
            stepHead(r.step, r.text),
            h("td", {}, t(`mips.kind.${r.kind}`)),
            h("td", { class: "num", title: `0x${r.addr.toString(16).toUpperCase()}` }, String(r.addr)),
            h("td", { class: "num" }, String(r.size)),
            h("td", { class: "val", title: r.before === undefined ? undefined : otherForm(r.before) }, r.before === undefined ? "" : fmtWide(r.before)),
            h("td", { class: "val is-set", title: otherForm(r.after) }, fmtWide(r.after)),
          ),
        ),
      ),
    );
  }

  const total = (): number => result?.steps.length ?? 0;
  /** How many instructions the tables cover: all of them, or only those run so far when stepping. */
  const shown = (): number => (mode === "step" ? pos : total());

  /** Fills the three tables with what happened up to the current position. `animate` lets what this step added slide in. */
  function paintLedgers(animate = false): void {
    if (!result) return;
    const scroll = new Map<string, [number, number]>();
    for (const id of ["pipeline", "registers", "variables", "bytes", "memory"]) scroll.set(id, [body(id).scrollTop, body(id).scrollLeft]);
    body("pipeline").replaceChildren(pipelineBody());
    body("registers").replaceChildren(registersBody());
    body("variables").replaceChildren(variablesBody());
    body("bytes").replaceChildren(bytesBody());
    body("memory").replaceChildren(memoryBody());
    // a table with nothing to show is left out instead of sitting there empty
    for (const el of ledgersEl.querySelectorAll<HTMLElement>(".ledger")) {
      el.classList.toggle("is-empty", el.querySelector(".ledger-body")?.firstElementChild?.classList.contains("none") ?? false);
    }
    for (const [id, [top, left]] of scroll) {
      body(id).scrollTop = top;
      body(id).scrollLeft = left;
    }
    hovered = 0;
    hoveredDecl = 0;
    if (mode === "step" && pos > 0) {
      for (const r of ledgersEl.querySelectorAll(`[data-step="${pos}"]`)) {
        r.classList.add("is-current");
        if (animate) r.classList.add("is-new");
      }
      for (const b of ledgersEl.querySelectorAll<HTMLElement>(".ledger-body")) revealCurrent(b);
    }
  }

  function page(delta: number): void {
    pipeStart += delta;
    body("pipeline").replaceChildren(pipelineBody());
  }

  function renderTrace(res: MipsSimResult): void {
    result = res;
    view = "trace";
    pipeStart = 0;
    hovered = 0;
    hoveredDecl = 0;
    stopPlay();
    pos = 0;
    pipeline = buildPipeline(res.steps, { forwarding: forwardingEl.checked });
    viewbarEl.hidden = false;
    buildChrome(res);
    goTo(0);
  }

  // ---- hovering and stepping ------------------------------------------------------

  const lineOf = (n: number): number => result?.steps[n - 1]?.instr.line ?? 0;

  /** Where a step sits in the program and what it did: registers written, memory touched, stalls, a taken branch. */
  function describeStep(n: number): string {
    const s = result?.steps[n - 1];
    const row = pipeline?.rows[n - 1];
    if (!s || !row) return "";
    const f = stepFacts(s, row);
    const effects = [
      ...f.regs,
      ...f.mem.map((m) => t(m.kind === "write" ? "mips.eff.write" : "mips.eff.read", { size: m.size, addr: m.addr, value: String(m.value) })),
      f.raw > 0 ? t("mips.eff.raw", { n: f.raw }) : "",
      f.taken ? t("mips.eff.taken") : "",
    ].filter(Boolean);
    const head = t("mips.desc.step", { n, line: s.instr.line, text: s.instr.text });
    return effects.length > 0 ? `${head} → ${effects.join(" · ")}` : head;
  }

  /** What the readout and the source highlight show while nothing is hovered. */
  function restText(): string {
    if (mode === "all") return t("hover.hint");
    return pos === 0 ? t("hover.ready") : describeStep(pos);
  }
  const restLine = (): number => (mode === "step" ? lineOf(pos) : 0);

  // hovering a step lights it in every table at once
  let hovered = 0;
  let hoveredDecl = 0;
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
    const row = target.closest<HTMLElement>("[data-step]");
    const decl = target.closest<HTMLElement>("[data-decl]");
    setHover(row ? Number(row.dataset.step) : 0, decl ? Number(decl.dataset.decl) : 0);
  });
  ledgersEl.addEventListener("mouseleave", () => setHover(0));

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
    paintLedgers(mode === "step" && pos > before);
    paintTerminal();
    hoverEl.textContent = restText();
    highlightLine(restLine());
    updateStepper();
  }

  /** Redraws the terminal for the steps shown now. */
  function paintTerminal(): void {
    if (!result || !terminal) return;
    const upTo = mode === "step" ? pos : result.steps.length;
    terminal.paint(terminalView(result.steps, upTo, []), terminalEnd(result.reason, result.error, upTo, result.steps.length));
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
    endLive();
    stopPlay();
    pos = 0;
    viewbarEl.hidden = true;
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

  useRadixFor("mips");
  wireRadix(viewbarEl, () => paintLedgers());
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
  // arrow keys step through the run, unless the keys belong to a field
  document.addEventListener("keydown", (e) => {
    if (mode !== "step" || view !== "trace" || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    if ((e.target as HTMLElement).closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    stopPlay();
    goTo(pos + (e.key === "ArrowRight" ? 1 : -1));
  });

  // ---- run -------------------------------------------------------------------

  /** Drops the live run, if any: its timer and the Stop button. */
  function endLive(): void {
    driver?.halt();
    driver = null;
    sim = null;
    stopEl.hidden = true;
  }

  /** One live batch of steps has run: show how far it got, or close the trace when the run ended. */
  function liveTick(): void {
    if (!sim) return;
    const now = sim.result();
    result = now;
    pipeline = buildPipeline(now.steps, { forwarding: forwardingEl.checked });
    if (sim.status === "running") {
      if (mode === "all") paintLedgers();
      paintTerminal();
      paintSummary();
      updateStepper();
      return;
    }
    endLive();
    buildChrome(now);
    paintLedgers();
    hoverEl.textContent = restText();
    updateStepper();
  }

  stopEl.addEventListener("click", () => {
    sim?.stop();
    liveTick();
  });

  function run(): void {
    endLive();
    const state = readState();
    history.replaceState(null, "", `${location.pathname}${location.search}#${encodeMipsState(state)}`);
    if (state.source.trim() === "") {
      renderEmpty();
      return;
    }
    try {
      if (state.unlimited) {
        const live = new MipsSimulation(state.source, { maxSteps: Infinity });
        sim = live;
        renderTrace(live.result());
        stopEl.hidden = false;
        driver = drive(live, state.stepsPerSecond ?? DEFAULT_RATE, liveTick);
      } else {
        renderTrace(simulateMips(state.source, { maxSteps: state.maxSteps }));
      }
      if (window.matchMedia("(max-width: 59.99rem)").matches) {
        root.querySelector("#h-trace")?.scrollIntoView({ block: "start" });
      }
    } catch (e) {
      if (e instanceof AsmError) renderAsmError(e);
      else throw e;
    }
  }

  // forwarding only changes the timing, so the stream is not run again
  forwardingEl.addEventListener("change", () => {
    if (view !== "trace" || !result) return;
    pipeline = buildPipeline(result.steps, { forwarding: forwardingEl.checked });
    paintSummary();
    paintLedgers();
    hoverEl.textContent = restText();
    history.replaceState(null, "", `${location.pathname}${location.search}#${encodeMipsState(readState())}`);
  });

  q("run").addEventListener("click", run);

  // ---- examples and language ---------------------------------------------------

  function buildExampleOptions(): void {
    const keep = exampleEl.value;
    exampleEl.replaceChildren(
      h("option", { value: "" }, t("example.choose")),
      ...mipsExamplesFor(getLang()).map((ex) => h("option", { value: ex.id }, ex.title)),
    );
    exampleEl.value = keep;
  }

  exampleEl.addEventListener("change", () => {
    const ex = mipsExamplesFor(getLang()).find((e) => e.id === exampleEl.value);
    if (!ex) return;
    writeState({ ...readState(), source: ex.source });
    run();
  });

  langEl.replaceChildren(...LANGS.map((l) => h("option", { value: l.id }, l.name)));

  function applyStaticText(): void {
    const lang: Lang = getLang();
    document.documentElement.lang = lang;
    document.title = t("mips.app.title");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("mips.app.description"));
    for (const el of root.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n as Key);
    for (const el of root.querySelectorAll<HTMLElement>("[data-i18n-aria]")) el.setAttribute("aria-label", t(el.dataset.i18nAria as Key));
    langEl.value = lang;
  }

  function applyLanguage(): void {
    applyStaticText();
    buildExampleOptions();
    buildLintChecks();
    lintView.paint();
    if (view === "trace" && result) {
      buildChrome(result);
      paintLedgers();
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

  wireArchSelect(q<HTMLSelectElement>("arch"), "mips");
  applyStaticText();
  buildExampleOptions();
  buildLintChecks();
  const fromHash = decodeMipsState(location.hash.slice(1));
  const starter = mipsExamplesFor(getLang()).find((e) => e.id === DEFAULT_STATE_ID)!;
  writeState(fromHash ?? { source: starter.source, maxSteps: 2000, forwarding: false });
  run();
}
