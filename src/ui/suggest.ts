import type { Completion } from "./complete";
import { h } from "./dom";
import { plural, t } from "./i18n";
import type { Key } from "./i18n";
import type { TextMetrics } from "./textpos";

export interface SuggestOptions {
  source: HTMLTextAreaElement;
  list: HTMLElement;
  /** A visually hidden live region that announces how many suggestions there are. */
  status: HTMLElement;
  metrics: TextMetrics;
  /** The language's suggestions for the word under the caret (`manual` is Ctrl+Space). */
  complete: (source: string, caret: number, manual: boolean) => Completion | null;
}

export interface SuggestController {
  open(manual: boolean): void;
  close(): void;
  /** Handles Ctrl+Space / Ctrl+I and, while the list is open, the keys that drive it. True when the key was used. */
  handleKeydown(e: KeyboardEvent): boolean;
}

/** The suggestion list under the editor: opens while typing or on demand, and inserts the chosen item. */
export function createSuggest({ source, list, status, metrics, complete }: SuggestOptions): SuggestController {
  let sug: Completion | null = null;
  let sugIndex = 0;
  let sugManual = false;
  /** Enter only accepts once the user has chosen with the arrows (or opened the list with Ctrl+Space). */
  let sugChosen = false;
  let accepting = false;

  function close(): void {
    if (!sug) return;
    sug = null;
    list.hidden = true;
    list.replaceChildren();
    source.removeAttribute("aria-activedescendant");
    status.textContent = "";
  }

  function paint(): void {
    if (!sug) return;
    list.replaceChildren(
      ...sug.items.map((it, i) =>
        h(
          "li",
          { id: `sg-${i}`, class: "suggest-item", role: "option", "aria-selected": String(i === sugIndex) },
          h("span", { class: "suggest-label" }, it.label),
          h("span", { class: "suggest-kind" }, t(it.detail ?? (`kind.${it.kind}` as Key))),
        ),
      ),
    );
    source.setAttribute("aria-activedescendant", `sg-${sugIndex}`);
    list.children[sugIndex]?.scrollIntoView({ block: "nearest" });
  }

  function place(): void {
    if (!sug) return;
    const { x, y, lh } = metrics.wordPosition(sug.from);
    list.hidden = false;
    const w = list.offsetWidth;
    const hgt = list.offsetHeight;
    const flip = y + hgt > window.innerHeight - 8 && y - lh - hgt > 8;
    list.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    list.style.top = `${flip ? y - lh - hgt : y}px`;
  }

  function open(manual: boolean): void {
    const next = complete(source.value, source.selectionStart, manual);
    if (!next || source.selectionStart !== source.selectionEnd) {
      close();
      return;
    }
    const keep = sug?.items[sugIndex]?.label;
    sug = next;
    sugManual = manual;
    sugChosen = manual;
    sugIndex = Math.max(0, next.items.findIndex((it) => it.label === keep));
    paint();
    place();
    status.textContent = plural("suggest.count", next.items.length);
  }

  function move(delta: number): void {
    if (!sug) return;
    sugIndex = (sugIndex + delta + sug.items.length) % sug.items.length;
    sugChosen = true;
    for (const [i, li] of [...list.children].entries()) li.setAttribute("aria-selected", String(i === sugIndex));
    source.setAttribute("aria-activedescendant", `sg-${sugIndex}`);
    list.children[sugIndex]?.scrollIntoView({ block: "nearest" });
  }

  function accept(): void {
    if (!sug) return;
    const { from, to, items } = sug;
    const text = items[sugIndex].insert;
    close();
    accepting = true;
    source.setSelectionRange(from, to);
    // insertText keeps the browser's undo history; setRangeText is the fallback where it is unavailable
    if (!document.execCommand("insertText", false, text)) {
      source.setRangeText(text, from, to, "end");
      source.dispatchEvent(new Event("input", { bubbles: true }));
    }
    accepting = false;
  }

  source.addEventListener("input", (e) => {
    if (accepting) return;
    const type = (e as InputEvent).inputType ?? "";
    if (type === "insertText") open(false);
    else if (sug && type.startsWith("delete")) open(sugManual);
    else close();
  });
  source.addEventListener("blur", close);
  source.addEventListener("scroll", place); // typing near the bottom scrolls the editor: follow the word
  window.addEventListener("resize", close);
  // mousedown, not click: the editor must keep the focus while an item is chosen
  list.addEventListener("mousedown", (e) => {
    e.preventDefault();
    const li = (e.target as HTMLElement).closest("li");
    if (!li || !sug) return;
    sugIndex = [...list.children].indexOf(li);
    accept();
  });

  function handleKeydown(e: KeyboardEvent): boolean {
    // Ctrl+Space is often taken by the input method or the browser, so Ctrl+I opens the list too
    if ((e.key === " " || e.key.toLowerCase() === "i") && e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
      e.preventDefault();
      open(true);
      return true;
    }
    if (!sug) return false;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey;
    if (plain && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (plain && (e.key === "Tab" || (e.key === "Enter" && sugChosen))) {
      e.preventDefault();
      accept();
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return true;
    }
    if (["ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown"].includes(e.key)) close();
    return false;
  }

  return { open, close, handleKeydown };
}
