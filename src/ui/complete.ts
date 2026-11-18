import { ARITY } from "../core/isa";
import { REGS, RESERVED } from "../core/parser";
import type { Key } from "./i18n";

export type SuggestionKind = "ins" | "dir" | "reg" | "lab" | "sym" | "num";

export interface Suggestion {
  /** What the list shows. */
  label: string;
  kind: SuggestionKind;
  /** What replaces the word in the editor (the label, in the case the user is typing, plus a space when an operand follows). */
  insert: string;
  /** Explains the item when its kind alone does not (the INT numbers). */
  detail?: Key;
}

export interface Completion {
  /** The word being completed: [from, to) in the source. */
  from: number;
  to: number;
  /** The text the user has typed of it, up to the caret. */
  prefix: string;
  items: Suggestion[];
}

const WORD = /[\w@?$]/;
const NAME = "[A-Za-z_@?$][\\w@?$]*";
const LABEL_DEF = new RegExp(`^\\s*(${NAME})\\s*:`);
const SYMBOL_DEF = new RegExp(`^\\s*(${NAME})\\s+(?:EQU|DB|DW)\\b`, "i");

/** The INT numbers the simulator handles itself, with what each does. */
const INT_CALLS: [string, Key][] = [
  ["0", "int.0"],
  ["3", "int.3"],
  ["5", "int.5"],
  ["6", "int.6"],
  ["7", "int.7"],
];

const JUMPS = new Set([...ARITY.keys()].filter((m) => m.startsWith("J")).concat(["CALL", "LOOP"]));
/** Directives that take no name to complete after them. */
const NO_OPERAND_HELP = new Set(["ORG", "END", "EQU", "DB", "DW"]);
const SPACE_AFTER = new Set(["ORG", "EQU", "DB", "DW", "OFFSET", "PTR", "DUP"]);
const KIND_RANK: Record<SuggestionKind, number> = { ins: 0, dir: 1, reg: 2, num: 3, lab: 4, sym: 5 };

/** True when the text before the caret on this line leaves it inside a comment or an open string. */
function inCommentOrString(before: string): boolean {
  let quote: string | null = null;
  for (const c of before) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ";") return true;
  }
  return quote !== null;
}

/** Labels and symbols the program defines, so they can be offered as operands. */
function definedNames(source: string): { name: string; kind: "lab" | "sym" }[] {
  const seen = new Set<string>();
  const out: { name: string; kind: "lab" | "sym" }[] = [];
  for (const raw of source.split("\n")) {
    const line = raw.replace(/;.*$/, "");
    const label = LABEL_DEF.exec(line);
    const sym = label ? null : SYMBOL_DEF.exec(line);
    const found = label ? { name: label[1], kind: "lab" as const } : sym ? { name: sym[1], kind: "sym" as const } : null;
    if (!found) continue;
    const up = found.name.toUpperCase();
    if (seen.has(up) || ARITY.has(up) || RESERVED.has(up) || REGS.has(up)) continue;
    seen.add(up);
    out.push(found);
  }
  return out;
}

/**
 * What to suggest for the word under the caret. `manual` is Ctrl+Space: it also answers an empty word
 * and a word at the start of a line. While typing (`manual` false) it stays quiet unless the user has
 * started a word where an instruction, a register or a name is likely, so it never gets in the way.
 */
export function complete(source: string, caret: number, manual: boolean): Completion | null {
  let from = caret;
  while (from > 0 && WORD.test(source[from - 1])) from--;
  let to = caret;
  while (to < source.length && WORD.test(source[to])) to++;
  const prefix = source.slice(from, caret);
  if (!manual && prefix === "") return null;

  const before = source.slice(source.lastIndexOf("\n", from - 1) + 1, from);
  if (inCommentOrString(before)) return null;

  const label = /^\s*[A-Za-z_@?$][\w@?$]*:/.exec(before);
  const rest = label ? before.slice(label[0].length) : before;
  const words = rest.split(/[\s,]+/).filter((w) => w !== "");

  const names = definedNames(source);
  const candidates: Omit<Suggestion, "insert">[] = [];
  const addAll = (kind: SuggestionKind, labels: Iterable<string>): void => {
    for (const l of labels) candidates.push({ label: l, kind });
  };

  if (words.length === 0) {
    // the start of a statement: an instruction or a directive (a bare word at column 0 is usually a new name)
    if (!manual && !label && before === "") return null;
    addAll("ins", ARITY.keys());
    addAll("dir", ["ORG", "END"]);
  } else {
    const first = words[0].toUpperCase();
    const isOp = ARITY.has(first) || RESERVED.has(first);
    if (!isOp && words.length === 1) {
      addAll("dir", ["DB", "DW", "EQU"]); // NAME DB ...
    } else {
      const op = isOp ? first : words[1].toUpperCase();
      if (op === "INT") {
        for (const [n, detail] of INT_CALLS) candidates.push({ label: n, kind: "num", detail });
      } else if (JUMPS.has(op)) {
        for (const n of names) if (n.kind === "lab") candidates.push({ label: n.name, kind: "lab" });
      } else if (!NO_OPERAND_HELP.has(op)) {
        addAll("reg", REGS);
        addAll("dir", ["OFFSET", "PTR", "BYTE", "WORD", "DUP"]);
        for (const n of names) candidates.push({ label: n.name, kind: n.kind });
      }
    }
  }

  const up = prefix.toUpperCase();
  const typedLower = /[a-z]/.test(prefix) && prefix === prefix.toLowerCase();
  const gap = /[ \t]/.test(source[to] ?? "") ? "" : " ";
  const items: Suggestion[] = candidates
    .filter((c) => c.label.toUpperCase().startsWith(up))
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.label.localeCompare(b.label))
    .map((c) => {
      const cased = typedLower && (c.kind === "ins" || c.kind === "dir" || c.kind === "reg") ? c.label.toLowerCase() : c.label;
      const takesOperand = (c.kind === "ins" && (ARITY.get(c.label) ?? 0) > 0) || (c.kind === "dir" && SPACE_AFTER.has(c.label));
      return { ...c, label: cased, insert: cased + (takesOperand ? gap : "") };
    });

  if (items.length === 0) return null;
  // typing a word that is already complete: nothing left to offer
  if (!manual && items.length === 1 && items[0].label.toUpperCase() === up) return null;
  return { from, to, prefix, items };
}
