import { AsmError } from "../core/types";
import { mipsExamplesFor } from "../mips/examples";
import { tokenizeMips } from "../mips/highlight";
import { buildPipeline } from "../mips/pipeline";
import type { Pipeline, PipelineRow } from "../mips/pipeline";
import { decodeMipsState, encodeMipsState } from "../mips/share";
import type { MipsShareState } from "../mips/share";
import { simulateMips } from "../mips/sim";
import type { MipsSimResult } from "../mips/sim";
import { fmtValue, memoryRows, pipelineWindow, registerTable } from "../mips/view";
import { wireArchSelect } from "./arch";
import { h } from "./dom";
import type { Child } from "./dom";
import { markRange } from "./highlight";
import { LANGS, getLang, setLang, t, translateCore } from "./i18n";
import type { Key, Lang } from "./i18n";
import { newlineEdit, tabEdit } from "./indent";

/** How many instructions the cycle diagram draws at a time: it is steps x cycles, so a long run needs paging. */
const PIPE_PAGE = 24;
const DEFAULT_STATE_ID = "sum-loop";

export function mountMipsApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="wordmark" href="?arch=mips" data-i18n-aria="mips.wordmark.label">EduMIPS64 Trace</a>
        <div class="topbar-actions flex items-center gap-(--space-sm)">
          <select id="lang" class="control lang-select" aria-label="Idioma / Language"></select>
          <select id="arch" class="control lang-select" data-i18n-aria="arch.label"></select>
          <label class="field-inline flex items-center gap-(--space-xs)">
            <span class="label" data-i18n="example.label"></span>
            <select id="example" class="control"></select>
          </label>
          <button type="button" id="run" class="key key--primary" data-i18n="run"></button>
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
              <pre class="hl" aria-hidden="true"><code id="hl-code"></code></pre>
              <textarea id="source" class="code" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"
                data-i18n-aria="mips.source.aria" aria-describedby="source-help"
                placeholder=".text&#10;daddi r1, r0, 5&#10;halt"></textarea>
            </div>
          </div>
          <p id="source-help" class="help" data-i18n="mips.source.help"></p>
          <details id="settings" class="settings">
            <summary class="label-title" data-i18n="settings.max"></summary>
            <div class="settings-body">
              <label class="field flex flex-col gap-(--space-3xs)">
                <span class="label" data-i18n="settings.max"></span>
                <input id="max" class="control" type="number" name="max-steps" min="1" max="20000" inputmode="numeric" />
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
          <div id="region" class="region"></div>
          <div id="ledgers" class="ledgers ledgers--mips"></div>
        </section>
      </main>
    </div>`;

  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const sourceEl = q<HTMLTextAreaElement>("source");
  const maxEl = q<HTMLInputElement>("max");
  const forwardingEl = q<HTMLInputElement>("forwarding");
  const regionEl = q<HTMLDivElement>("region");
  const ledgersEl = q<HTMLDivElement>("ledgers");
  const gutterEl = q<HTMLPreElement>("gutter");
  const hlCodeEl = q<HTMLElement>("hl-code");
  const summaryEl = q<HTMLParagraphElement>("summary");
  const exampleEl = q<HTMLSelectElement>("example");
  const langEl = q<HTMLSelectElement>("lang");

  let result: MipsSimResult | null = null;
  let pipeline: Pipeline | null = null;
  let pipeStart = 0;
  let view: "empty" | "error" | "trace" = "empty";
  let lastError: AsmError | null = null;
  /** Where the assembler pointed, drawn as an error mark until the source changes. */
  let errorMark: { from: number; to: number } | null = null;

  // ---- editor ----------------------------------------------------------------

  let gutterCount = 0;
  let painted: string | null = null;

  function paintSource(): void {
    const text = sourceEl.value;
    const key = `${errorMark ? `${errorMark.from}:${errorMark.to}` : ""}|${text}`;
    if (key === painted) return;
    painted = key;
    const base = tokenizeMips(text);
    const tokens = errorMark ? markRange(base, errorMark.from, errorMark.to, "error") : base;
    const frag = document.createDocumentFragment();
    for (const tk of tokens) {
      const cls = [tk.kind ? `tk tk-${tk.kind}` : "", tk.mark ? "tk-err" : ""].filter(Boolean).join(" ");
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
  }
  sourceEl.addEventListener("scroll", syncGutter);
  sourceEl.addEventListener("input", () => {
    errorMark = null;
    syncGutter();
  });

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
      run();
      return;
    }
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
    };
  }

  function writeState(s: MipsShareState): void {
    sourceEl.value = s.source;
    maxEl.value = String(s.maxSteps);
    forwardingEl.checked = s.forwarding;
    errorMark = null;
    syncGutter();
  }

  // ---- rendering -------------------------------------------------------------

  function setSummary(...parts: string[]): void {
    summaryEl.replaceChildren(...parts.map((p) => h("span", {}, p)));
  }

  function renderEmpty(): void {
    result = null;
    pipeline = null;
    view = "empty";
    setSummary();
    ledgersEl.replaceChildren();
    regionEl.replaceChildren(
      h("div", { class: "state" }, h("h3", { class: "state-title" }, t("empty.title")), h("p", {}, t("mips.empty.body"))),
    );
  }

  function renderAsmError(err: AsmError, reveal = true): void {
    result = null;
    pipeline = null;
    view = "error";
    lastError = err;
    setSummary();
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
    if (err.line > 0) {
      const lines = sourceEl.value.split("\n");
      const start = lines.slice(0, err.line - 1).reduce((n, l) => n + l.length + 1, 0);
      errorMark = { from: start, to: start + (lines[err.line - 1]?.length ?? 0) };
      painted = null;
      syncGutter();
      if (reveal) {
        sourceEl.focus();
        sourceEl.setSelectionRange(errorMark.from, errorMark.to);
      }
    }
  }

  const stat = (key: Key, n: number | string): string => t(key, { n });

  function buildChrome(res: MipsSimResult): void {
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
    regionEl.replaceChildren(...children.filter((c): c is Node => c instanceof Node));
    ledgersEl.replaceChildren(
      ledger("pipeline", "mips.pipeline", "mips.pipeline.hint"),
      ledger("registers", "mips.registers", "mips.registers.hint"),
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

  function ledger(id: string, title: Key, hint: Key): HTMLElement {
    return h(
      "section",
      { class: "ledger", "data-ledger": id },
      h("div", { class: "ledger-head" }, h("h3", { class: "label-title" }, t(title)), h("span", { class: "label ledger-hint" }, t(hint))),
      h("div", { class: "ledger-body" }),
    );
  }

  const body = (id: string): HTMLElement => ledgersEl.querySelector<HTMLElement>(`[data-ledger="${id}"] .ledger-body`)!;

  /** The instruction's row header: its step number and text. */
  const stepHead = (step: number, text: string): HTMLElement =>
    h("th", { scope: "row", title: text }, text, h("span", { class: "cell-step" }, String(step)));

  const none = (key: Key): HTMLElement => h("p", { class: "none label" }, t(key));

  function pipelineBody(): HTMLElement {
    const p = pipeline!;
    const w = pipelineWindow(p, pipeStart, PIPE_PAGE);
    pipeStart = w.start;
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
      w.total > PIPE_PAGE
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
    const tab = registerTable(result!.steps);
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
              const f = fmtValue(v);
              return h("td", { class: "val is-set", title: f.hex }, f.dec);
            }),
          ),
        ),
      ),
    );
  }

  function memoryBody(): HTMLElement {
    const rows = memoryRows(result!.steps);
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
            h("td", { class: "val", title: r.before === undefined ? undefined : fmtValue(r.before).hex }, r.before === undefined ? "" : fmtValue(r.before).dec),
            h("td", { class: "val is-set", title: fmtValue(r.after).hex }, fmtValue(r.after).dec),
          ),
        ),
      ),
    );
  }

  function paintLedgers(): void {
    body("pipeline").replaceChildren(pipelineBody());
    body("registers").replaceChildren(registersBody());
    body("memory").replaceChildren(memoryBody());
  }

  function page(delta: number): void {
    pipeStart += delta;
    body("pipeline").replaceChildren(pipelineBody());
  }

  function renderTrace(res: MipsSimResult): void {
    result = res;
    view = "trace";
    pipeStart = 0;
    pipeline = buildPipeline(res.steps, { forwarding: forwardingEl.checked });
    buildChrome(res);
    paintLedgers();
  }

  // hovering a step lights it in every table at once
  let hovered = 0;
  function setHover(n: number): void {
    if (n === hovered) return;
    hovered = n;
    for (const r of ledgersEl.querySelectorAll(".is-hover")) r.classList.remove("is-hover");
    if (n > 0) for (const r of ledgersEl.querySelectorAll(`[data-step="${n}"]`)) r.classList.add("is-hover");
  }
  ledgersEl.addEventListener("mouseover", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-step]");
    setHover(row ? Number(row.dataset.step) : 0);
  });
  ledgersEl.addEventListener("mouseleave", () => setHover(0));

  // ---- run -------------------------------------------------------------------

  function run(): void {
    const state = readState();
    history.replaceState(null, "", `${location.pathname}${location.search}#${encodeMipsState(state)}`);
    if (state.source.trim() === "") {
      renderEmpty();
      return;
    }
    try {
      renderTrace(simulateMips(state.source, { maxSteps: state.maxSteps }));
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
    body("pipeline").replaceChildren(pipelineBody());
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
    if (view === "trace" && result) {
      buildChrome(result);
      paintLedgers();
    } else if (view === "error" && lastError) {
      renderAsmError(lastError, false);
    } else {
      renderEmpty();
    }
  }

  langEl.addEventListener("change", () => {
    setLang(langEl.value as Lang);
    applyLanguage();
  });

  wireArchSelect(q<HTMLSelectElement>("arch"), "mips");
  applyStaticText();
  buildExampleOptions();
  const fromHash = decodeMipsState(location.hash.slice(1));
  const starter = mipsExamplesFor(getLang()).find((e) => e.id === DEFAULT_STATE_ID)!;
  writeState(fromHash ?? { source: starter.source, maxSteps: 2000, forwarding: false });
  run();
}
