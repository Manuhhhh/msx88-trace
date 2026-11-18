import type { TraceStep } from "../core/cpu";
import { simulate } from "../core/simulate";
import type { IrqEvent, SimResult } from "../core/simulate";
import { AsmError } from "../core/types";
import { EXAMPLES } from "./examples";
import { FLAG_ORDER, REG_ORDER, bin8, hex, hex16, hex8 } from "./format";
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
          <button type="button" id="run" class="key key--primary">Run trace</button>
        </div>
      </header>
      <main class="workspace">
        <section class="pane pane--source" aria-labelledby="h-source">
          <h2 id="h-source" class="pane-title">Source</h2>
          <div class="editor graphite cut">
            <textarea id="source" class="code" spellcheck="false" autocomplete="off" autocapitalize="off"
              aria-label="MSX88 assembly source" aria-describedby="source-help"
              placeholder="ORG 2000H&#10;MOV AX, 5&#10;INT 0&#10;END"></textarea>
          </div>
          <p id="source-help" class="help">Run with Ctrl+Enter. The link in the address bar reproduces this run.</p>
          <div class="settings">
            <h3 class="label-title">Run settings</h3>
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
        </section>
        <section class="pane pane--trace" aria-labelledby="h-trace">
          <div class="pane-head flex flex-wrap items-baseline gap-x-(--space-md) gap-y-(--space-3xs)">
            <h2 id="h-trace" class="pane-title">Trace</h2>
            <p id="summary" class="summary" role="status"></p>
          </div>
          <div id="region" class="region"></div>
          <div id="detail" class="detail"></div>
        </section>
      </main>
    </div>`;

  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const sourceEl = q<HTMLTextAreaElement>("source");
  const inputEl = q<HTMLInputElement>("input");
  const maxEl = q<HTMLInputElement>("max");
  const eventsEl = q<HTMLOListElement>("events");
  const regionEl = q<HTMLDivElement>("region");
  const detailEl = q<HTMLDivElement>("detail");
  const summaryEl = q<HTMLParagraphElement>("summary");
  const exampleEl = q<HTMLSelectElement>("example");

  let result: SimResult | null = null;
  let selected = -1;

  // ---- settings ------------------------------------------------------------

  exampleEl.append(h("option", { value: "" }, "Choose an example"));
  for (const ex of EXAMPLES) exampleEl.append(h("option", { value: ex.id }, ex.title));

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
    remove.addEventListener("click", () => li.remove());
    eventsEl.append(li);
  }

  function writeState(s: ShareState): void {
    sourceEl.value = s.source;
    inputEl.value = s.input;
    maxEl.value = String(s.maxSteps);
    eventsEl.replaceChildren();
    for (const ev of s.events) addEventRow(ev);
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
    selected = -1;
    setSummary();
    detailEl.replaceChildren();
    const load = h("button", { type: "button", class: "key" }, "Load the interrupt example");
    load.addEventListener("click", () => loadExample("f10"));
    regionEl.replaceChildren(
      h(
        "div",
        { class: "state" },
        h("h3", { class: "state-title" }, "No trace yet"),
        h("p", {}, "Write or load a program and run it. Each instruction becomes a row with the registers, flags and stack after it."),
        load,
      ),
    );
  }

  function renderAsmError(err: AsmError): void {
    result = null;
    selected = -1;
    setSummary();
    detailEl.replaceChildren();
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

  function cell(text: string, className: string, changed = false): HTMLTableCellElement {
    return h("td", { class: changed ? `${className} is-changed` : className }, text);
  }

  function renderTrace(res: SimResult): void {
    result = res;
    const head = h("tr", {});
    const cols = ["Step", "IP", "Instruction", ...REG_ORDER, ...FLAG_ORDER, "Note"];
    const headClass: Record<string, string> = {
      Step: "val col-step",
      IP: "val col-ip",
      Instruction: "text col-instr",
      Note: "text",
    };
    for (const c of cols) head.append(h("th", { scope: "col", class: headClass[c] ?? "val" }, c));

    const body = h("tbody", {});
    res.steps.forEach((s, i) => {
      const tr = h("tr", { class: s.kind === "irq" ? "row row--irq" : "row", "data-index": String(i), tabindex: "-1" });
      tr.append(cell(String(s.step), "num col-step"));
      tr.append(cell(hex16(s.ip), "val col-ip"));
      tr.append(cell(s.text, "text instr col-instr"));
      for (const r of REG_ORDER) tr.append(cell(hex16(s.regs[r]), "val", s.changedRegs.includes(r)));
      for (const f of FLAG_ORDER) {
        tr.append(cell(s.flags[f] ? "1" : "0", "val flag", s.changedFlags.includes(f)));
      }
      tr.append(cell(s.note ?? "", "text note"));
      body.append(tr);
    });

    const table = h(
      "table",
      { class: "trace" },
      h("caption", { class: "visually-hidden" }, "Execution trace, one row per step, values in hexadecimal"),
      h("thead", {}, head),
      body,
    );
    const wrap = h("div", { class: "trace-wrap" }, table);

    const children: Child[] = [];
    if (res.reason !== "halted") {
      children.push(
        h("p", { class: "notice", role: "status" }, res.error ? `${STOP_TEXT[res.reason]}: ${res.error}.` : `${STOP_TEXT[res.reason]}.`),
      );
    }
    if (res.output) {
      children.push(h("div", { class: "screen graphite cut" }, h("span", { class: "label" }, "Screen output"), h("pre", {}, res.output)));
    }
    children.push(wrap);
    regionEl.replaceChildren(...children.filter((c): c is Node => c !== null && c !== undefined && c !== false));

    const irqs = res.steps.filter((s) => s.kind === "irq").length;
    setSummary(
      ...[
        `${res.steps.length} steps`,
        irqs > 0 ? `${irqs} interrupt${irqs === 1 ? "" : "s"}` : "",
        STOP_TEXT[res.reason],
      ].filter(Boolean),
    );

    body.addEventListener("click", (e) => {
      const tr = (e.target as HTMLElement).closest<HTMLTableRowElement>("tr.row");
      if (tr) select(Number(tr.dataset.index), false);
    });
    body.addEventListener("keydown", (e) => {
      const keys: Record<string, number> = {
        ArrowDown: selected + 1,
        ArrowUp: selected - 1,
        Home: 0,
        End: res.steps.length - 1,
      };
      if (!(e.key in keys)) return;
      e.preventDefault();
      select(Math.min(res.steps.length - 1, Math.max(0, keys[e.key])), true);
    });
    if (res.steps.length > 0) select(0, false);
  }

  function select(index: number, focus: boolean): void {
    if (!result) return;
    const rows = regionEl.querySelectorAll<HTMLTableRowElement>("tbody tr");
    rows.forEach((r) => {
      r.removeAttribute("aria-current");
      r.tabIndex = -1;
    });
    selected = index;
    const row = rows[index];
    row.setAttribute("aria-current", "true");
    row.tabIndex = 0;
    if (focus) {
      row.focus();
      row.scrollIntoView({ block: "nearest" });
    }
    renderDetail(result.steps[index]);
  }

  function renderDetail(s: TraceStep): void {
    const list = (items: string[], empty: string): HTMLElement =>
      items.length ? h("ul", { class: "mono-list" }, ...items.map((t) => h("li", {}, t))) : h("p", { class: "none" }, empty);
    const section = (title: string, body: HTMLElement): HTMLElement =>
      h("section", { class: "detail-block" }, h("h3", { class: "label-title" }, title), body);

    const stack = s.stack.map((w, i) => `${hex16((s.regs.SP + 2 * i) & 0xffff)}H  ${hex16(w)}H`);
    const writes = s.memWrites.map((m) =>
      m.width === 8
        ? `${hex16(m.addr)}H: ${hex8(m.before)}H became ${hex8(m.after)}H`
        : `${hex16(m.addr)}H: ${hex16(m.before)}H became ${hex16(m.after)}H`,
    );
    const ports = s.io.map((io) => `${io.dir} ${hex8(io.port)}H, value ${hex(io.value, io.width / 4)}H`);
    const pic = s.devices
      ? [`IMR ${bin8(s.devices.IMR)}`, `IRR ${bin8(s.devices.IRR)}`, `ISR ${bin8(s.devices.ISR)}`]
      : [];

    detailEl.replaceChildren(
      h("h3", { class: "detail-title" }, `Step ${s.step}`, h("span", { class: "instr-inline" }, s.text)),
      h(
        "div",
        { class: "detail-grid" },
        section("Stack, top first", list(stack, "Empty")),
        section("Memory writes", list(writes, "None")),
        section("Ports", list(ports, "None")),
        section("PIC registers", list(pic, "Not available")),
      ),
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

  q("run").addEventListener("click", run);
  q("add-event").addEventListener("click", () => addEventRow({ line: 0, step: 10 }));
  exampleEl.addEventListener("change", () => {
    if (exampleEl.value) loadExample(exampleEl.value);
  });
  sourceEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      run();
    }
  });

  const initial = decodeState(location.hash.slice(1));
  writeState(initial ?? { source: "", input: "", maxSteps: 2000, events: [] });
  if (initial) run();
  else renderEmpty();
}
