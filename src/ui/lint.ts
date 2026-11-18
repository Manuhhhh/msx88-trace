import { assemble } from "../core/assembler";
import { AsmError } from "../core/types";

export interface Diagnostic {
  /** 1-based source line, or 0 when the error is not tied to a line. */
  line: number;
  /** The assembler's own English message ("Line 3: Unknown instruction FOO"); the screen translates it. */
  message: string;
  /** The offending text as offsets into the source: [from, to). Equal when no text can be pointed at. */
  from: number;
  to: number;
}

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Columns of `word` as a whole word in `code`, case-insensitive, or null. */
function findWord(code: string, word: string): [number, number] | null {
  const m = new RegExp(`(?<![\\w@?$])${escape(word)}(?![\\w@?$])`, "i").exec(code);
  return m ? [m.index, m.index + m[0].length] : null;
}

/** Columns of the first occurrence of `text` as written, case-insensitive, or null. */
function findText(code: string, text: string): [number, number] | null {
  const i = code.toUpperCase().indexOf(text.toUpperCase());
  return i < 0 ? null : [i, i + text.length];
}

/** The text of a line without its comment, as columns, ignoring the blanks around it. */
function statement(line: string): [number, number] {
  let quote: string | null = null;
  let end = line.length;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ";") {
      end = i;
      break;
    }
  }
  const code = line.slice(0, end);
  const start = code.length - code.trimStart().length;
  return [start, code.trimEnd().length];
}

/**
 * Works out which text on the line the assembler is complaining about, from its message. The messages
 * name the culprit (a symbol, a mnemonic, a number); when one does not, the whole statement is marked.
 */
function locate(message: string, line: string): [number, number] {
  const whole = statement(line);
  const code = line.slice(0, whole[1]);
  const msg = message.replace(/^Line \d+: /, "");
  const by = (re: RegExp, find: (c: string, g: string) => [number, number] | null): [number, number] | null => {
    const m = re.exec(msg);
    const g = m?.slice(1).find((x) => x !== undefined);
    return g === undefined ? null : find(code, g);
  };
  const found =
    by(/^(?:Unknown instruction|Undefined symbol|Duplicate symbol|Reserved name) (\S+)$/, findWord) ??
    by(/^Symbol (\S+) is not defined yet$/, findWord) ??
    by(/^(\S+) (?:expects \d+ operand|count must|needs at least)|^Invalid operands for (\S+)|^(\S+): (?:specify|operand size)/, findWord) ??
    by(
      /^(?:Immediate|Value) (-?\d+) does not fit|^INT number out of range: (-?\d+)|^Port out of range \(use DX\): (-?\d+)|^Invalid DUP count: (-?\d+)|^Address out of range: (-?\d+)|^ORG out of range: (-?\d+)/,
      (c, n) => findWord(c, n) ?? lastNumber(c),
    ) ??
    by(/^Invalid number "(.+)"$|^Unexpected "(.+)"$|^Unexpected text in expression: "(.+)"$|^Unsupported addressing mode: (.+)$/, findText);
  return found ?? whole;
}

/** The last numeric literal on the code part, used when a value is written in hex or binary and the message prints it in decimal. */
function lastNumber(code: string): [number, number] | null {
  let last: [number, number] | null = null;
  for (const m of code.matchAll(/(?<![\w@?$])\d[0-9A-Fa-f]*[HhBbDd]?(?![\w@?$])/g)) last = [m.index, m.index + m[0].length];
  return last;
}

/**
 * Assembles the source without running it and reports the error `Run trace` would show, so a mistake
 * is visible while typing. The assembler stops at the first error, so there is at most one diagnostic.
 */
export function diagnose(source: string): Diagnostic | null {
  if (source.trim() === "") return null;
  try {
    assemble(source);
    return null;
  } catch (e) {
    if (!(e instanceof AsmError)) throw e;
    const lines = source.split("\n");
    if (e.line < 1 || e.line > lines.length) return { line: 0, message: e.message, from: 0, to: 0 };
    const start = lines.slice(0, e.line - 1).reduce((n, l) => n + l.length + 1, 0);
    const [a, b] = locate(e.message, lines[e.line - 1]);
    return { line: e.line, message: e.message, from: start + a, to: start + b };
  }
}
