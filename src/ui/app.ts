import { simulate } from "../core/simulate";
import type { IrqEvent, SimResult } from "../core/simulate";
import { AsmError } from "../core/types";
import { EXAMPLES } from "./examples";
import { hex8, hex16 } from "./format";
import { buildHistory, stackSlots } from "./history";
import { tokenize } from "./highlight";
import { tabEdit } from "./indent";
import type { CellSeries, Series } from "./history";
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

const LINES = [
  { line: 0, label: "F10 key (INT0)" },
  { line: 1, label: "Timer (INT1)" },
  { line: 2, label: "Handshake (INT2)" },
];

const STOP_TEXT: Record<SimResult["reason"], string> = {
  halted: "Program ended",
  "max-steps": "Stopped at the step limit",
  error: "Stopped by an error",
};

export function mountApp(root: HTMLElement): void {
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <a class="wordmark" href="./" aria-label="MSX88 Trace, start over">MSX88 Trace</a>
        <div class="topbar-actions flex items-center gap-(--space-sm)">
          <label class="field-inline flex items-center gap-(--space-xs)">
            <span class="label">Example</span>
            <select id="example" class="control"></select>
          </label>
          <button type="button" id="help-open" class="key" aria-haspopup="dialog">How it works</button>
          <button type="button" id="run" class="key key--primary">Run trace</button>
        </div>
      </header>
      <main class="workspace">
        <section class="pane pane--source" aria-labelledby="h-source">
          <div class="pane-head flex items-baseline justify-between gap-(--space-sm)">
            <h2 id="h-source" class="pane-title">Source</h2>
            <button type="button" id="layout" class="key key--quiet layout-toggle" aria-pressed="false" aria-describedby="layout-help">Full-width source</button>
            <span id="layout-help" class="visually-hidden">Gives the source the whole width and moves the trace below it.</span>
          </div>
          <div class="editor graphite cut">
            <div class="gutter" aria-hidden="true"><pre id="gutter" class="gutter-lines">1</pre></div>
            <div class="editor-scroll">
              <div id="line-hl" class="line-hl is-off"></div>
              <pre class="hl" aria-hidden="true"><code id="hl-code"></code></pre>
              <textarea id="source" class="code" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"
                aria-label="MSX88 assembly source" aria-describedby="source-help"
                placeholder="ORG 2000H&#10;MOV AX, 5&#10;INT 0&#10;END"></textarea>
            </div>
          </div>
          <p id="source-help" class="help">Run with Ctrl+Enter. Tab indents; Esc then Tab leaves the editor. The link in the address bar reproduces this run.</p>
          <details id="settings" class="settings">
            <summary id="settings-label" class="label-title">Run settings</summary>
            <div class="settings-body">
              <div class="grid gap-(--space-sm) sm:grid-cols-2">
                <label class="field flex flex-col gap-(--space-3xs)">
                  <span class="label">Keyboard input for INT 6</span>
                  <input id="input" class="control" type="text" name="input" autocomplete="off" />
                </label>
                <label class="field flex flex-col gap-(--space-3xs)">
                  <span class="label">Step limit</span>
                  <input id="max" class="control" type="number" name="max-steps" min="1" max="20000" inputmode="numeric" />
                </label>
              </div>
              <fieldset class="events">
                <legend class="label">Interrupt requests</legend>
                <ol id="events" class="events-list flex flex-col gap-(--space-xs)"></ol>
                <button type="button" id="add-event" class="key">Add request</button>
              </fieldset>
            </div>
          </details>
        </section>
        <section class="pane pane--trace" aria-labelledby="h-trace">
          <div class="pane-head flex flex-wrap items-baseline gap-x-(--space-md) gap-y-(--space-3xs)">
            <h2 id="h-trace" class="pane-title">Trace</h2>
            <p id="summary" class="summary" role="status"></p>
          </div>
          <div id="modebar" class="modebar" hidden>
            <div class="seg" role="group" aria-label="Trace view">
              <button type="button" id="mode-all" class="key key--quiet seg-btn" aria-pressed="true">All steps</button>
              <button type="button" id="mode-step" class="key key--quiet seg-btn" aria-pressed="false">Step by step</button>
            </div>
            <div id="stepper" class="stepper" hidden>
              <button type="button" id="st-reset" class="key key--sm">Reset</button>
              <button type="button" id="st-prev" class="key key--sm">Previous</button>
              <button type="button" id="st-next" class="key key--sm key--primary">Next</button>
              <button type="button" id="st-play" class="key key--sm">Play</button>
              <output id="st-count" class="label stepper-count" for="st-range">0 / 0</output>
              <input id="st-range" class="stepper-range" type="range" min="0" max="0" value="0" aria-label="Step" />
            </div>
          </div>
          <p id="hover" class="hover-line" aria-hidden="true"></p>
          <div id="region" class="region"></div>
          <div id="ledgers" class="ledgers"></div>
        </section>
      </main>
    </div>
    <dialog id="help" class="help-dialog" aria-labelledby="help-title">
      <div class="help-head">
        <h2 id="help-title" class="pane-title">How MSX88 Trace works</h2>
        <button type="button" id="help-close" class="key">Close</button>
      </div>
      <div class="help-body">
        <section>
          <h3>What it does</h3>
          <p>It runs an MSX88 assembly program one instruction at a time and records every value the registers, the flags, data memory and the stack go through, so you can follow the program by hand.</p>
        </section>
        <section>
          <h3>Using it</h3>
          <ol>
            <li>Write a program in <strong>Source</strong>, or pick one from <strong>Example</strong>.</li>
            <li>Press <strong>Run trace</strong> or <kbd>Ctrl</kbd> + <kbd>Enter</kbd>. In the editor, <kbd>Tab</kbd> indents (<kbd>Shift</kbd> + <kbd>Tab</kbd> outdents); press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to move on to the next control. If a line does not assemble, it is selected in the source with the reason.</li>
            <li>Read the four tables under <strong>Trace</strong>. Every table is indexed by step: step 1 is the first instruction that ran.</li>
          </ol>
        </section>
        <section>
          <h3>The four tables</h3>
          <dl>
            <dt>Registers</dt>
            <dd>One column per register, one row per step in which one of them changed. A blank cell did not change. The first row, <em>start</em>, holds the initial values.</dd>
            <dt>Flags</dt>
            <dd>The same layout for ZF, SF, CF, OF, IF, PF and AF, with their value (0 or 1) after the step.</dd>
            <dt>Heap</dt>
            <dd>One row per data memory address that was written. To the right, the value it started with (<em>s0</em>) and every value it took after, oldest first. Dimmed, struck-through values were overwritten.</dd>
            <dt>Stack</dt>
            <dd>One row per stack address, from the base (<code>8000H</code>) downwards. To the right, every value pushed there, oldest first. Dimmed, struck-through values were already popped.</dd>
          </dl>
        </section>
        <section>
          <h3>Hover to locate a step</h3>
          <p>Pass the mouse over a row, or over a value in Heap or Stack, to see the step, the instruction address (IP), the source line and the instruction. The same step lights up in every table and its line is highlighted in the source. A blue edge on the left marks a step where the CPU accepted an interrupt.</p>
        </section>
        <section>
          <h3>Run settings</h3>
          <ul>
            <li><strong>Keyboard input for INT 6</strong>: the characters the program reads.</li>
            <li><strong>Step limit</strong>: stops runaway loops (up to 20000 steps).</li>
            <li><strong>Interrupt requests</strong>: raise F10, the timer or the handshake line right before a given step, to trace how the program serves an interrupt.</li>
          </ul>
        </section>
        <section>
          <h3>Step by step</h3>
          <p>Switch <strong>All steps</strong> to <strong>Step by step</strong> to run the program one instruction at a time. The tables fill in as you go, the step that just ran stays lit in each of them, and its line stays highlighted in the source. Use <strong>Next</strong> and <strong>Previous</strong> (or the <kbd>→</kbd> and <kbd>←</kbd> keys), drag the slider to jump to any step, or press <strong>Play</strong> to let it run on its own.</p>
        </section>
        <section>
          <h3>Making room</h3>
          <p><strong>Full-width source</strong> gives the editor the whole width and moves the trace below it. Each table has <strong>Expand</strong> to fill the trace area and <strong>Hide</strong> to fold it down to its title. Wide tables scroll sideways.</p>
        </section>
        <section>
          <h3>Sharing</h3>
          <p>The address bar always holds the source and settings of the last run. Copy the link and anyone who opens it gets the same trace.</p>
        </section>
      </div>
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
  const hlCodeEl = q<HTMLElement>("hl-code");
  const settingsLabel = q<HTMLElement>("settings-label");
  const summaryEl = q<HTMLParagraphElement>("summary");
  const exampleEl = q<HTMLSelectElement>("example");

  let result: SimResult | null = null;

  // ---- source gutter and line highlight --------------------------------------

  let gutterCount = 0;
  let painted: string | null = null;
  /** Draws the coloured copy of the source that sits under the transparent textarea. */
  function paintSource(): void {
    const text = sourceEl.value;
    if (text === painted) return;
    painted = text;
    const frag = document.createDocumentFragment();
    for (const t of tokenize(text)) {
      frag.append(t.kind ? h("span", { class: `tk tk-${t.kind}` }, t.text) : t.text);
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

  exampleEl.append(h("option", { value: "" }, "Choose an example"));
  for (const ex of EXAMPLES) exampleEl.append(h("option", { value: ex.id }, ex.title));

  function updateSettingsLabel(): void {
    const n = eventsEl.children.length;
    settingsLabel.textContent = n > 0 ? `Run settings, ${n} interrupt request${n === 1 ? "" : "s"}` : "Run settings";
  }

  function addEventRow(ev: IrqEvent): void {
    const select = h("select", { class: "control", "aria-label": "Line to raise" });
    for (const l of LINES) {
      const opt = h("option", { value: String(l.line) }, l.label);
      if (l.line === ev.line) opt.selected = true;
      select.append(opt);
    }
    const step = h("input", {
      class: "control control--num",
      type: "number",
      min: "1",
      inputmode: "numeric",
      value: String(ev.step),
      "aria-label": "Raise before step",
    });
    const remove = h("button", { type: "button", class: "key key--quiet" }, "Remove");
    const li = h(
      "li",
      { class: "event-row flex flex-wrap items-center gap-(--space-xs)" },
      select,
      h("span", { class: "label" }, "before step"),
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
    leaveStepping();
    setSummary();
    hoverEl.textContent = "";
    ledgersEl.replaceChildren();
    const load = h("button", { type: "button", class: "key" }, "Load the interrupt example");
    load.addEventListener("click", () => loadExample("f10"));
    regionEl.replaceChildren(
      h(
        "div",
        { class: "state" },
        h("h3", { class: "state-title" }, "No trace yet"),
        h("p", {}, "Write or load a program and run it. You get every value the registers, flags, memory and stack went through."),
        load,
      ),
    );
  }

  function renderAsmError(err: AsmError): void {
    result = null;
    leaveStepping();
    setSummary();
    hoverEl.textContent = "";
    ledgersEl.replaceChildren();
    regionEl.replaceChildren(
      h(
        "div",
        { class: "state state--error", role: "alert" },
        h("h3", { class: "state-title" }, "The program did not assemble"),
        h("p", { class: "error-line" }, err.message),
        h("p", {}, "Fix that line in the source and run the trace again."),
      ),
    );
    if (err.line > 0) {
      const lines = sourceEl.value.split("\n");
      const start = lines.slice(0, err.line - 1).reduce((n, l) => n + l.length + 1, 0);
      sourceEl.focus();
      sourceEl.setSelectionRange(start, start + (lines[err.line - 1]?.length ?? 0));
    }
  }

  const hexOf = (width: 8 | 16) => (width === 8 ? hex8 : hex16);
  const HOVER_HINT = "Hover a row to see its instruction.";

  /** Where a step sits in the program: its number, address, source line and text. */
  function describeStep(n: number): string {
    const s = result?.steps[n - 1];
    if (!s) return "";
    const where = s.kind === "irq" ? `interrupt accepted before ${hex16(s.ip)}H` : `IP ${hex16(s.ip)}H${s.line > 0 ? `, line ${s.line}` : ""}`;
    return `Step ${s.step} · ${where} · ${s.text}`;
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
      h("th", { scope: "row", class: "num" }, "start"),
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
  const LEDGER_ORDER = ["Registers", "Flags", "Heap", "Stack"] as const;
  const collapsed = new Set<string>();
  let expanded: string | null = null;
  let wide = false;

  function ledger(title: string, hint: string, body: Child): HTMLElement {
    const toggle = (btn: HTMLButtonElement, fn: () => void): HTMLButtonElement => {
      btn.addEventListener("click", fn);
      return btn;
    };
    const hide = toggle(h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "hide" }, "Hide"), () => {
      if (!collapsed.delete(title)) collapsed.add(title);
      applyLedgerState();
    });
    const grow = toggle(h("button", { type: "button", class: "key key--quiet ledger-btn", "data-act": "expand" }, "Expand"), () => {
      expanded = expanded === title ? null : title;
      applyLedgerState();
    });
    return h(
      "section",
      { class: "ledger", "data-ledger": title },
      h(
        "div",
        { class: "ledger-head" },
        h("h3", { class: "label-title" }, title),
        h("span", { class: "label ledger-hint" }, hint),
        h("span", { class: "ledger-tools" }, grow, hide),
      ),
      h("div", { class: "ledger-body" }, body),
    );
  }

  /** Reflects the hide / expand state on the ledgers and re-sizes the grid tracks around hidden ones. */
  function applyLedgerState(): void {
    const isOff = (k: string): boolean => collapsed.has(k) && expanded !== k;
    for (const el of ledgersEl.querySelectorAll<HTMLElement>(".ledger")) {
      const key = el.dataset.ledger!;
      el.classList.toggle("is-collapsed", isOff(key));
      el.classList.toggle("is-expanded", expanded === key);
      el.querySelector('[data-act="hide"]')!.textContent = collapsed.has(key) ? "Show" : "Hide";
      el.querySelector('[data-act="expand"]')!.textContent = expanded === key ? "Restore" : "Expand";
    }
    ledgersEl.toggleAttribute("data-expanded", expanded !== null);
    if (expanded !== null) {
      ledgersEl.style.removeProperty("--cols");
      ledgersEl.style.removeProperty("--rows");
      return;
    }
    // a track holding only hidden ledgers shrinks to its header; the rest share what is left
    const track = (keys: readonly string[], fr: number): string => (keys.every(isOff) ? "auto" : `minmax(0, ${fr}fr)`);
    if (wide) {
      ledgersEl.style.setProperty("--cols", LEDGER_ORDER.map((k, i) => track([k], [1.3, 1, 1, 1][i])).join(" "));
      ledgersEl.style.setProperty("--rows", "minmax(0, 1fr)");
    } else {
      ledgersEl.style.setProperty("--cols", "minmax(0, 1fr) minmax(0, 1fr)");
      ledgersEl.style.setProperty("--rows", [track(["Registers"], 1.2), track(["Flags", "Heap"], 1), track(["Stack"], 1)].join(" "));
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
      h("th", { scope: "col", class: "num" }, "Address"),
      h("th", { scope: "colgroup", colspan: String(depth), class: "val" }, "Oldest → newest"),
    );
    const rows = cells.map((c) => {
      const fmt = hexOf(c.width);
      return h(
        "tr",
        { class: "log-row" },
        h("th", { scope: "row", class: "num" }, `${hex16(c.addr)}H`, h("span", { class: "slot-tag" }, c.width === 8 ? "byte" : "word")),
        h("td", { class: "val is-start", title: "Value before the first step (s0)" }, fmt(c.initial), h("span", { class: "cell-step" }, "s0")),
        ...c.points.map((p, i) => {
          const live = i === c.points.length - 1;
          return h(
            "td",
            {
              class: live ? "val is-set" : "val is-set is-stale",
              "data-step": String(p.step),
              title: `${describeStep(p.step)}${live ? "" : ` · overwritten at step ${c.points[i + 1].step}`}`,
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
      h("caption", { class: "visually-hidden" }, "Data memory addresses, each with the values it held in order; dimmed values were overwritten"),
      h("thead", {}, head),
      h("tbody", {}, ...rows),
    );
  }

  /** One row per stack address, from the base down; to the right, every value pushed there in order. */
  function stackTable(events: ReturnType<typeof buildHistory>["stack"]): HTMLElement {
    if (events.length === 0) return h("p", { class: "none" }, "The stack was not used.");
    const slots = stackSlots(events);
    const depth = Math.max(1, ...slots.map((sl) => sl.writes.length));
    const head = h(
      "tr",
      {},
      h("th", { scope: "col", class: "num" }, "Address"),
      h("th", { scope: "colgroup", colspan: String(depth), class: "val" }, "Oldest → newest"),
    );
    const rows = slots.map((sl, i) =>
      h(
        "tr",
        { class: i === 0 ? "log-row log-row--start" : "log-row" },
        h("th", { scope: "row", class: "num" }, `${hex16(sl.addr)}H`, i === 0 ? h("span", { class: "slot-tag" }, "base") : null),
        ...sl.writes.map((w) => {
          const live = w.poppedAt === undefined;
          return h(
            "td",
            {
              class: live ? "val is-set" : "val is-set is-stale",
              "data-step": String(w.step),
              title: `${describeStep(w.step)}${live ? "" : ` · popped at step ${w.poppedAt}`}`,
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
      h("caption", { class: "visually-hidden" }, "Stack addresses, each with the values pushed there in order; dimmed values were popped"),
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
    if (mode === "all") return HOVER_HINT;
    return pos === 0 ? "Ready. Press Next to run the first instruction." : describeStep(pos);
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
    const bodies: Record<string, HTMLElement> = {
      Registers: valueTable("Register values by step, hexadecimal", "Step", hist.registers.map((r) => ({ name: r.name, series: r })), (_, v) => hex16(v)),
      Flags: valueTable("Flag values by step", "Step", hist.flags.map((f) => ({ name: f.name, series: f })), (_, v) => String(v)),
      Heap: hist.heap.length > 0 ? heapTable(hist.heap) : h("p", { class: "none" }, "Nothing was written to data memory."),
      Stack: stackTable(hist.stack),
    };
    for (const el of ledgersEl.querySelectorAll<HTMLElement>(".ledger")) {
      const body = el.querySelector<HTMLElement>(".ledger-body")!;
      const { scrollTop, scrollLeft } = body;
      body.replaceChildren(bodies[el.dataset.ledger!]);
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
    stPlayBtn.textContent = playTimer === undefined ? "Play" : "Pause";
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
    if (mode !== "step" || helpEl.open || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const t = e.target as HTMLElement;
    if (t.closest("input, textarea, select, [contenteditable]")) return;
    e.preventDefault();
    stopPlay();
    goTo(pos + (e.key === "ArrowRight" ? 1 : -1));
  });

  function renderTrace(res: SimResult): void {
    result = res;
    hovered = 0;
    stopPlay();
    pos = 0;
    modebarEl.hidden = false;

    const children: Child[] = [];
    if (res.reason !== "halted") {
      children.push(
        h("p", { class: "notice", role: "status" }, res.error ? `${STOP_TEXT[res.reason]}: ${res.error}.` : `${STOP_TEXT[res.reason]}.`),
      );
    }
    if (res.output) {
      children.push(h("div", { class: "screen graphite cut" }, h("span", { class: "label" }, "Screen output"), h("pre", {}, res.output)));
    }
    regionEl.replaceChildren(...children.filter((c): c is Node => c !== null && c !== undefined && c !== false));

    ledgersEl.replaceChildren(
      ledger("Registers", "each value placed", null),
      ledger("Flags", "each value placed", null),
      ledger("Heap", "data memory writes", null),
      ledger("Stack", "pushes and pops", null),
    );
    applyLedgerState();
    goTo(0);

    const irqs = res.steps.filter((s) => s.kind === "irq").length;
    setSummary(
      ...[
        `${res.steps.length} steps`,
        irqs > 0 ? `${irqs} interrupt${irqs === 1 ? "" : "s"}` : "",
        STOP_TEXT[res.reason],
      ].filter(Boolean),
    );
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
    const ex = EXAMPLES.find((e) => e.id === id);
    if (!ex) return;
    writeState(ex.state);
    run();
  }

  q("help-open").addEventListener("click", () => helpEl.showModal());
  q("help-close").addEventListener("click", () => helpEl.close());
  // a click on the backdrop (the dialog element itself, outside its content) closes it
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
      run();
      return;
    }
    if (e.key === "Escape") {
      leaveOnTab = true;
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

  const initial = decodeState(location.hash.slice(1));
  writeState(initial ?? { source: "", input: "", maxSteps: 2000, events: [] });
  if (initial) run();
  else renderEmpty();
}
