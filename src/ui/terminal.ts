import { h } from "./dom";
import type { Child } from "./dom";
import { t, translateCore } from "./i18n";

/** The slice of a trace step the terminal cares about. */
export interface TermStep {
  /** Characters the program printed. */
  output?: string;
  /** The character the program consumed from the input buffer. */
  input?: string;
}

export interface TermView {
  /** Everything on the terminal after `upTo` steps: each typed line echoed where the program first read it, mixed with what was printed. */
  text: string;
  /** Lines typed but not read yet by the program. */
  pending: string[];
}

/**
 * What the terminal shows once the first `upTo` steps have run. `lines` are the lines typed so far, in order, and
 * together make the input buffer. Like on a conventional terminal a line is echoed in full, followed by a line break.
 */
export function terminalView(steps: readonly TermStep[], upTo: number, lines: readonly string[]): TermView {
  // index (in characters) of the first character of each line in the input buffer
  const starts: number[] = [];
  let at = 0;
  for (const l of lines) {
    starts.push(at);
    at += [...l].length;
  }
  let text = "";
  let consumed = 0;
  let echoed = 0;
  for (const s of steps.slice(0, upTo)) {
    if (s.input !== undefined) {
      while (echoed < lines.length && starts[echoed] <= consumed) text += `${lines[echoed++]}\n`;
      consumed++;
    }
    if (s.output) text += s.output;
  }
  return { text, pending: lines.slice(echoed).filter((l) => l !== "") };
}

/** The closing line of a run: how it ended. */
export interface TermEnd {
  kind: "halted" | "max-steps" | "error";
  text: string;
}

/** How the run ended, once the steps shown reach its last one; nothing while it is still going or paused on INT 6. */
export function terminalEnd(reason: string, error: string | undefined, upTo: number, total: number): TermEnd | undefined {
  if (upTo < total) return undefined;
  if (reason === "halted") return { kind: "halted", text: t("stop.halted") };
  if (reason === "max-steps") return { kind: "max-steps", text: t("stop.max-steps") };
  if (reason === "error") return { kind: "error", text: error ? `${t("stop.error")}: ${translateCore(error)}` : t("stop.error") };
  return undefined;
}

export interface Terminal {
  el: HTMLElement;
  /** Redraws the screen; once the run has `end`ed there is no prompt left. */
  paint(view: TermView, end?: TermEnd): void;
  focus(): void;
}

interface TerminalOptions {
  /** Called with a typed line when the user presses Enter. Without it the terminal is output only. */
  onSend?: (line: string) => void;
  /** Called when the user empties the input buffer. */
  onClear?: () => void;
  /** Called when the user presses the F10 key button. */
  onF10?: () => void;
}

/** A graphite terminal: a scrollback of everything printed so far and, when `onSend` is given, a prompt at the end of it. */
export function buildTerminal(opts: TerminalOptions = {}): Terminal {
  const out = h("pre", { class: "terminal-out", role: "log", "aria-live": "polite" });
  const queued = h("pre", { class: "terminal-queued" });
  const ending = h("p", { class: "terminal-end", role: "status" });
  ending.hidden = true;
  const scroll = h("div", { class: "terminal-scroll", tabindex: "-1" }, out, queued, ending);
  const head: Child[] = [h("span", { class: "label" }, t("terminal.title"))];
  let line: HTMLInputElement | undefined;
  let focusOn: HTMLInputElement | undefined;
  let promptEl: HTMLElement | undefined;
  let keys: HTMLElement | undefined;

  if (opts.onSend) {
    const { onSend, onClear, onF10 } = opts;
    const input = h("input", {
      class: "terminal-input",
      type: "text",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
      "aria-label": t("terminal.input"),
    });
    line = input;
    // There is no visible input: a hidden one only receives the keystrokes (and paste, and phone keyboards), and what the
    // eye sees is a mirror of it with a blinking underscore at the caret.
    const mirror = h("span", { class: "terminal-mirror", "aria-hidden": "true" });
    const drawMirror = (): void => {
      const at = input.selectionStart ?? input.value.length;
      mirror.replaceChildren(input.value.slice(0, at), h("span", { class: "terminal-cursor" }, "_"), input.value.slice(at));
    };
    for (const ev of ["input", "keyup", "click", "focus"]) input.addEventListener(ev, drawMirror);
    drawMirror();
    const form = h("form", { class: "terminal-line" }, h("span", { class: "terminal-prompt", "aria-hidden": "true" }, ">"), mirror, input);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const text = input.value;
      if (text === "") return;
      input.value = "";
      drawMirror();
      onSend(text);
    });
    const clear = h("button", { type: "button", class: "terminal-clear" }, t("terminal.clear"));
    clear.addEventListener("click", () => onClear?.());
    const f10 = h("button", { type: "button", class: "terminal-key", title: t("terminal.f10"), "aria-label": t("terminal.f10") }, "F10");
    f10.addEventListener("click", () => onF10?.());
    keys = f10;
    head.push(h("span", { class: "terminal-tools" }, f10, clear));
    scroll.append(form);
    focusOn = input;
    promptEl = form;
  }

  const el = h("section", { class: "screen graphite cut terminal", "aria-label": t("terminal.title") }, h("div", { class: "terminal-head" }, ...head), scroll);
  // Clicking anywhere on the terminal puts the cursor on the prompt, unless the click was on a button or ended a text selection.
  el.addEventListener("click", (e) => {
    if (!focusOn || (e.target as HTMLElement).closest("button")) return;
    if (window.getSelection()?.isCollapsed === false) return;
    focusOn.focus();
  });
  return {
    el,
    paint(view, end) {
      out.textContent = view.text;
      out.hidden = view.text === "";
      queued.textContent = view.pending.map((l) => `> ${l}`).join("\n");
      queued.hidden = view.pending.length === 0;
      ending.hidden = !end;
      ending.textContent = end?.text ?? "";
      if (end) ending.dataset.kind = end.kind;
      if (promptEl) promptEl.hidden = !!end;
      // a program that has ended can no longer be interrupted
      if (keys) keys.hidden = !!end;
      scroll.scrollTop = scroll.scrollHeight;
    },
    focus() {
      line?.focus();
    },
  };
}
