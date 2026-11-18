import { h } from "./dom";
import { t } from "./i18n";
import type { Key } from "./i18n";
import { CHECKS } from "./lint";
import type { Check, Diagnostic, LintSettings } from "./lint";
import type { TextMetrics } from "./textpos";

export interface LintViewOptions {
  source: HTMLTextAreaElement;
  list: HTMLElement;
  tip: HTMLElement;
  metrics: TextMetrics;
  /** Checks the current source and returns what the linter reports. */
  compute: () => Diagnostic[];
  /** A finding in the words of the current language. */
  describe: (d: Diagnostic) => string;
  /** Redraws the coloured copy of the source, which underlines the findings. */
  onPaint: () => void;
}

export interface LintView {
  readonly findings: Diagnostic[];
  /** Checks right now and shows the result. */
  now(): void;
  /** Redraws what is already known (after a language change). */
  paint(): void;
}

/** The live linter on screen: the list of findings, the hover message on the underlined text and the debounce while typing. */
export function createLintView({ source, list, tip, metrics, compute, describe, onPaint }: LintViewOptions): LintView {
  let findings: Diagnostic[] = [];
  let timer: number | undefined;

  function hideTip(): void {
    tip.hidden = true;
  }

  function paint(): void {
    hideTip();
    onPaint();
    list.replaceChildren(
      ...findings.map((f) => {
        const text = f.line > 0 && f.key ? t("lint.at", { n: f.line, msg: describe(f) }) : describe(f);
        const item = h("li", { class: "lint-item", "data-severity": f.severity }, text);
        if (f.to > f.from) {
          // a click takes you to the text it is about
          item.addEventListener("click", () => {
            source.focus();
            source.setSelectionRange(f.from, f.to);
          });
        }
        return item;
      }),
    );
    list.hidden = findings.length === 0;
    if (findings.some((f) => f.severity === "error")) source.setAttribute("aria-invalid", "true");
    else source.removeAttribute("aria-invalid");
  }

  function now(): void {
    window.clearTimeout(timer);
    findings = compute();
    paint();
  }

  /** Waits for a pause in typing, so a half-written line is not flagged while it is being written. */
  function schedule(): void {
    window.clearTimeout(timer);
    timer = window.setTimeout(now, 600);
  }

  source.addEventListener("mousemove", (e) => {
    if (findings.length === 0) return;
    const at = metrics.offsetAtPoint(e.clientX, e.clientY);
    const f = findings.find((x) => x.to > x.from && at >= x.from && at < x.to);
    if (!f) {
      hideTip();
      return;
    }
    tip.textContent = describe(f);
    tip.dataset.severity = f.severity;
    tip.hidden = false;
    const { x, y } = metrics.wordPosition(f.from);
    const w = tip.offsetWidth;
    tip.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    tip.style.top = `${y + 2}px`;
  });
  source.addEventListener("mouseleave", hideTip);
  source.addEventListener("scroll", hideTip);
  source.addEventListener("input", hideTip);
  source.addEventListener("input", schedule);

  return {
    get findings() {
      return findings;
    },
    now,
    paint,
  };
}

/** One checkbox per check, to switch each of them off on its own. */
export function renderLintChecks(
  container: HTMLElement,
  settings: LintSettings,
  label: (c: Check) => Key,
  onChange: (next: LintSettings) => void,
): void {
  let current = settings;
  container.replaceChildren(
    ...CHECKS.map((c) => {
      const box = h("input", { type: "checkbox", name: `lint-${c}` });
      box.checked = current[c];
      box.addEventListener("change", () => {
        current = { ...current, [c]: box.checked };
        onChange(current);
      });
      return h("label", { class: "lint-check flex items-center gap-(--space-xs)" }, box, h("span", { class: "label" }, t(label(c))));
    }),
  );
}
