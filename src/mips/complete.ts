import type { Completion, Suggestion, SuggestionKind } from "../ui/complete";
import type { Key } from "../ui/i18n";
import { ABI_NAMES, FORMAT_OF, regNumber } from "./assembler";
import type { Format } from "./assembler";

const WORD = /[\w.$]/;
const NAME = "[A-Za-z_.$][\\w.$]*";
const LABEL = new RegExp(`^\\s*(${NAME})\\s*:\\s*`);

type Operand = "reg" | "imm" | "mem" | "code" | "sys";

/** What each operand position of an instruction takes, in order. */
const OPERANDS: Record<Format, Operand[]> = {
  rrr: ["reg", "reg", "reg"],
  rri: ["reg", "reg", "imm"],
  ri: ["reg", "imm"],
  shift: ["reg", "reg", "imm"],
  mem: ["reg", "mem"],
  br2: ["reg", "reg", "code"],
  br1: ["reg", "code"],
  jump: ["code"],
  jr: ["reg"],
  md: ["reg", "reg"],
  mf: ["reg"],
  sys: ["sys"],
  none: [],
};

/** The syscall numbers the simulator handles, with what each does. */
const SYSCALLS: [string, Key][] = [
  ["0", "mips.sys.0"],
  ["5", "mips.sys.5"],
];

const DATA_DIRECTIVES = [".word", ".word16", ".word32", ".word64", ".byte", ".space", ".ascii", ".asciiz"];
const TEXT_DIRECTIVES = [".data", ".global"];
/** Directives that take an operand, so a space follows them. */
const TAKES_OPERAND = new Set([...DATA_DIRECTIVES, ".global", ".globl", ".entry"]);
const ENTRY_DIRECTIVES = new Set([".global", ".globl", ".entry"]);
const KIND_RANK: Record<SuggestionKind, number> = { ins: 0, dir: 1, reg: 2, num: 3, lab: 4, sym: 5 };

/** True when the text before the caret on this line leaves it inside a comment or an open string. */
function inCommentOrString(before: string): boolean {
  let quote: string | null = null;
  for (const c of before) {
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" || c === ";") return true;
  }
  return quote !== null;
}

interface Defined {
  name: string;
  section: "text" | "data";
}

/** Labels the program defines, with the section each one sits in, and the section the caret line is in. */
function scan(lines: string[]): { names: Defined[]; sectionAt: (line: number) => "text" | "data" } {
  const names: Defined[] = [];
  const seen = new Set<string>();
  const sections: ("text" | "data")[] = [];
  let section: "text" | "data" = "text";
  for (const raw of lines) {
    sections.push(section);
    let s = raw.replace(/[#;].*$/, "");
    for (let m = LABEL.exec(s); m; m = LABEL.exec(s)) {
      const name = m[1];
      const key = name.toLowerCase();
      if (!seen.has(key) && !FORMAT_OF.has(key) && regNumber(name) === undefined) {
        seen.add(key);
        names.push({ name, section });
      }
      s = s.slice(m[0].length);
    }
    const dir = /^\s*(\.\w+)/.exec(s)?.[1].toLowerCase();
    if (dir === ".data") section = "data";
    else if (dir === ".text" || dir === ".code") section = "text";
  }
  return { names, sectionAt: (i) => sections[i] ?? section };
}

function registerNames(dollar: boolean): string[] {
  if (!dollar) return Array.from({ length: 32 }, (_, i) => `r${i}`);
  return [...Array.from({ length: 32 }, (_, i) => `$${i}`), ...ABI_NAMES.map((n) => `$${n}`)];
}

/**
 * What to suggest for the word under the caret. `manual` is Ctrl+Space: it also answers an empty word
 * and a word at the start of a line. While typing it stays quiet unless the user has started a word
 * where an instruction, a register or a name is likely, so it never gets in the way.
 */
export function completeMips(source: string, caret: number, manual: boolean): Completion | null {
  let from = caret;
  while (from > 0 && WORD.test(source[from - 1])) from--;
  let to = caret;
  while (to < source.length && WORD.test(source[to])) to++;
  const prefix = source.slice(from, caret);
  if (!manual && prefix === "") return null;

  const before = source.slice(source.lastIndexOf("\n", from - 1) + 1, from);
  if (inCommentOrString(before)) return null;

  const lines = source.split("\n");
  const lineNo = source.slice(0, from).split("\n").length - 1;
  const { names, sectionAt } = scan(lines);
  const section = sectionAt(lineNo);

  const label = LABEL.exec(before);
  const rest = label ? before.slice(label[0].length) : before;
  const words = rest.split(/[\s,]+/).filter((w) => w !== "");

  const candidates: Omit<Suggestion, "insert">[] = [];
  const addAll = (kind: SuggestionKind, texts: Iterable<string>): void => {
    for (const label of texts) candidates.push({ label, kind });
  };
  const addNames = (sec: "text" | "data" | "both"): void => {
    for (const n of names) if (sec === "both" || n.section === sec) candidates.push({ label: n.name, kind: n.section === "text" ? "lab" : "sym" });
  };

  if (words.length === 0) {
    // the start of a statement (a bare word at column 0 is usually a new label)
    if (!manual && !label && before === "") return null;
    if (section === "data") addAll("dir", [...DATA_DIRECTIVES, ".text"]);
    else {
      addAll("ins", FORMAT_OF.keys());
      addAll("dir", TEXT_DIRECTIVES);
    }
  } else {
    const first = words[0].toLowerCase();
    if (ENTRY_DIRECTIVES.has(first)) {
      if (words.length === 1) addNames("text");
    } else if (FORMAT_OF.has(first)) {
      const kinds = OPERANDS[FORMAT_OF.get(first)!];
      // operands are separated by commas; inside the parentheses of offset(base) only a register fits
      const args = rest.trimStart().slice(first.length);
      const index = (args.match(/,/g) ?? []).length;
      const kind: Operand | undefined = /\([^)]*$/.test(args) ? "reg" : kinds[index];
      if (kind === "reg") addAll("reg", registerNames(prefix.startsWith("$")));
      else if (kind === "imm") addNames("both");
      else if (kind === "mem") addNames("data");
      else if (kind === "code") addNames("text");
      else if (kind === "sys") for (const [n, detail] of SYSCALLS) candidates.push({ label: n, kind: "num", detail });
    }
  }

  const low = prefix.toLowerCase();
  const gap = /[ \t]/.test(source[to] ?? "") ? "" : " ";
  const items: Suggestion[] = candidates
    .filter((c) => c.label.toLowerCase().startsWith(low))
    .sort((a, b) => KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.label.localeCompare(b.label))
    .map((c) => {
      const takesOperand =
        (c.kind === "ins" && FORMAT_OF.get(c.label) !== "none") || (c.kind === "dir" && TAKES_OPERAND.has(c.label));
      return { ...c, insert: c.label + (takesOperand ? gap : "") };
    });

  if (items.length === 0) return null;
  // typing a word that is already complete: nothing left to offer
  if (!manual && items.length === 1 && items[0].label.toLowerCase() === low) return null;
  return { from, to, prefix, items };
}
