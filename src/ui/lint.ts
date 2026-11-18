import { assemble } from "../core/assembler";
import { CONDITIONAL_JUMPS } from "../core/isa";
import { simulate } from "../core/simulate";
import type { IrqEvent } from "../core/simulate";
import { AsmError } from "../core/types";
import type { Instr, Program } from "../core/types";
import type { Key } from "./i18n";

/** The checks the linter runs; each can be switched off on its own. */
export type Check = "syntax" | "dead" | "loop" | "uninit";
export type LintSettings = Record<Check, boolean>;
export const CHECKS: Check[] = ["syntax", "dead", "loop", "uninit"];
export const DEFAULT_LINT: LintSettings = { syntax: true, dead: true, loop: true, uninit: true };

export interface Diagnostic {
  severity: "error" | "warning";
  check: Check;
  /** 1-based source line, or 0 when the finding is not tied to a line. */
  line: number;
  /** An assembler error, in the assembler's own English ("Line 3: Unknown instruction FOO"); the screen translates it. */
  message?: string;
  /** A warning: the dictionary key of its text and the values that fill it. */
  key?: Key;
  vars?: Record<string, string | number>;
  /** The offending text as offsets into the source: [from, to). Equal when no text can be pointed at. */
  from: number;
  to: number;
}

/** What the program is run with while it is checked, so the check sees the same input and interrupts as a real run. */
export interface LintInput {
  input?: string;
  maxSteps?: number;
  events?: IrqEvent[];
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

function fromAsmError(e: AsmError, source: string): Diagnostic {
  const lines = source.split("\n");
  if (e.line < 1 || e.line > lines.length) return { severity: "error", check: "syntax", line: 0, message: e.message, from: 0, to: 0 };
  const start = lines.slice(0, e.line - 1).reduce((n, l) => n + l.length + 1, 0);
  const [a, b] = locate(e.message, lines[e.line - 1]);
  return { severity: "error", check: "syntax", line: e.line, message: e.message, from: start + a, to: start + b };
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
    return fromAsmError(e, source);
  }
}

// ---- warnings --------------------------------------------------------------------------

const NAME = "[A-Za-z_@?$][\\w@?$]*";
const LABEL_LINE = new RegExp(`^\\s*(${NAME})\\s*:`);
const BRANCHES = new Set(["JMP", "CALL", "LOOP", ...CONDITIONAL_JUMPS]);

/** Offsets of the line at `line` (1-based) and of the text on it, as [lineStart, from, to]. */
function onLine(lines: string[], line: number, pick: (text: string) => [number, number] | null): { from: number; to: number } {
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
  const [a, b] = pick(lines[line - 1] ?? "") ?? statement(lines[line - 1] ?? "");
  return { from: start + a, to: start + b };
}

interface Flow {
  succ: Map<number, number[]>;
  /** True when a jump or call goes through a register or memory, so what runs cannot be known from the source. */
  indirect: boolean;
}

function flowOf(program: Program): Flow {
  const succ = new Map<number, number[]>();
  let indirect = false;
  for (const ins of program.instrs.values()) {
    const next = program.instrs.has(ins.addr + ins.size) ? [ins.addr + ins.size] : [];
    const op = ins.operands[0];
    const target = op?.kind === "imm" && program.instrs.has(op.value) ? [op.value] : [];
    const mn = ins.mnemonic;
    let out: number[];
    if (mn === "JMP") out = target;
    else if (mn === "CALL" || mn === "LOOP" || CONDITIONAL_JUMPS.has(mn)) out = [...target, ...next];
    else if (mn === "RET" || mn === "IRET" || mn === "HLT") out = [];
    else if (mn === "INT") out = op?.kind === "imm" && op.value === 0 ? [] : next;
    else out = next;
    if ((mn === "JMP" || mn === "CALL") && op?.kind !== "imm") indirect = true;
    succ.set(ins.addr, out);
  }
  return { succ, indirect };
}

function reach(from: Iterable<number>, succ: Map<number, number[]>): Set<number> {
  const seen = new Set<number>();
  const stack = [...from];
  while (stack.length > 0) {
    const a = stack.pop()!;
    if (seen.has(a) || !succ.has(a)) continue;
    seen.add(a);
    stack.push(...succ.get(a)!);
  }
  return seen;
}

/** Handlers installed in the interrupt vector table: the word at 4 * n, when it is the address of an instruction. */
function vectorHandlers(program: Program): number[] {
  const out: number[] = [];
  for (let n = 0; n < 256; n++) {
    const w = program.memory[4 * n] | (program.memory[4 * n + 1] << 8);
    if (w !== 0 && program.instrs.has(w)) out.push(w);
  }
  return out;
}

function staticWarnings(program: Program, source: string, on: LintSettings): Diagnostic[] {
  const { succ, indirect } = flowOf(program);
  if (indirect) return [];
  const lines = source.split("\n");
  const out: Diagnostic[] = [];
  const sorted = [...program.instrs.values()].sort((a, b) => a.addr - b.addr);
  const handlers = vectorHandlers(program);

  if (on.dead) {
    // an address used as a value (MOV BX, OFFSET PROC) may be jumped to later: count it as an entry, to stay quiet
    const taken = sorted
      .filter((i) => !BRANCHES.has(i.mnemonic) && i.mnemonic !== "INT")
      .flatMap((i) => i.operands.flatMap((o) => (o.kind === "imm" && program.instrs.has(o.value) ? [o.value] : [])));
    const live = reach([program.entry, ...handlers, ...taken], succ);
    const labelAt = new Map<number, string>();
    for (const [name, sym] of program.symbols) if (sym.kind === "code" && !labelAt.has(sym.value)) labelAt.set(sym.value, name);
    let prev: Instr | undefined;
    for (const ins of sorted) {
      const covered = prev !== undefined && prev.addr + prev.size === ins.addr && !live.has(prev.addr);
      prev = ins;
      if (live.has(ins.addr)) continue;
      const name = labelAt.get(ins.addr);
      if (name !== undefined) {
        const at = lines.findIndex((l) => LABEL_LINE.exec(l)?.[1].toUpperCase() === name.toUpperCase());
        if (at >= 0) {
          out.push({ severity: "warning", check: "dead", line: at + 1, key: "lint.msg.deadLabel", vars: { name: LABEL_LINE.exec(lines[at])![1] }, ...onLine(lines, at + 1, (t) => findWord(t, LABEL_LINE.exec(t)![1])) });
          continue;
        }
      }
      if (covered) continue;
      out.push({ severity: "warning", check: "dead", line: ins.line, key: "lint.msg.dead", ...onLine(lines, ins.line, () => null) });
    }
  }

  if (on.loop) {
    const main = reach([program.entry], succ);
    const interruptCanEnd = [...reach(handlers, succ)].some((a) => {
      const i = program.instrs.get(a)!;
      return i.mnemonic === "HLT" || (i.mnemonic === "INT" && i.operands[0]?.kind === "imm" && i.operands[0].value === 0);
    });
    if (!interruptCanEnd) {
      // everything that can still reach a way out (a halt, a return, the end of the code)
      const pred = new Map<number, number[]>();
      for (const [a, ns] of succ) for (const n of ns) pred.set(n, [...(pred.get(n) ?? []), a]);
      const exits = [...succ].filter(([, ns]) => ns.length === 0).map(([a]) => a);
      const canEnd = reach(exits, pred as Map<number, number[]>);
      const seen = new Set<number>();
      for (const ins of sorted) {
        const target = ins.operands[0];
        if (!main.has(ins.addr) || canEnd.has(ins.addr) || target?.kind !== "imm") continue;
        const backward = (ins.mnemonic === "JMP" || ins.mnemonic === "LOOP" || CONDITIONAL_JUMPS.has(ins.mnemonic)) && target.value <= ins.addr;
        if (!backward || seen.has(ins.line)) continue;
        seen.add(ins.line);
        out.push({ severity: "warning", check: "loop", line: ins.line, key: "lint.msg.loop", ...onLine(lines, ins.line, () => null) });
      }
    }
  }
  return out;
}

/** Reads of memory declared with `?` that the run reached before anything was stored in it. */
function uninitWarnings(reads: { line: number; addr: number }[], program: Program, source: string): Diagnostic[] {
  const lines = source.split("\n");
  const blank = [...program.symbols].filter(([, s]) => s.kind === "data" && program.uninit[s.value] === 1);
  return reads.map(({ line, addr }) => {
    // the declared variable the byte belongs to: the closest one that starts at or before it
    const owner = blank.filter(([, s]) => s.value <= addr).sort((a, b) => b[1].value - a[1].value)[0]?.[0];
    const text = lines[line - 1] ?? "";
    const where = owner !== undefined ? findWord(text, owner) : null;
    return {
      severity: "warning",
      check: "uninit",
      line,
      ...(owner !== undefined ? { key: "lint.msg.uninit" as const, vars: { name: owner } } : { key: "lint.msg.uninitAnon" as const }),
      ...onLine(lines, line, () => where),
    };
  });
}

/**
 * Everything the linter reports for a program: the syntax error if there is one, otherwise the warnings
 * of the enabled checks. Without a syntax error the program is also run (bounded) to see which variables
 * are read before they are assigned.
 */
export function lint(source: string, run: LintInput = {}, on: LintSettings = DEFAULT_LINT): Diagnostic[] {
  if (source.trim() === "") return [];
  let program: Program;
  let reads: { line: number; addr: number }[] = [];
  try {
    if (on.uninit) {
      const sim = simulate(source, { input: run.input, maxSteps: Math.min(run.maxSteps ?? 2000, 5000), irqEvents: run.events });
      program = sim.program;
      reads = sim.cpu.uninitReads;
    } else {
      program = assemble(source);
    }
  } catch (e) {
    if (!(e instanceof AsmError)) throw e;
    return on.syntax ? [fromAsmError(e, source)] : [];
  }
  return [...staticWarnings(program, source, on), ...(on.uninit ? uninitWarnings(reads, program, source) : [])].sort((a, b) => a.line - b.line);
}

// ---- the user's choice of checks -----------------------------------------------------------

const SETTINGS_KEY = "msx88-trace:lint";

export function loadLintSettings(storage: Pick<Storage, "getItem"> | null = safeStorage()): LintSettings {
  try {
    const raw: unknown = JSON.parse(storage?.getItem(SETTINGS_KEY) ?? "null");
    if (typeof raw !== "object" || raw === null) return { ...DEFAULT_LINT };
    const o = raw as Record<string, unknown>;
    return Object.fromEntries(CHECKS.map((c) => [c, typeof o[c] === "boolean" ? o[c] : DEFAULT_LINT[c]])) as LintSettings;
  } catch {
    return { ...DEFAULT_LINT };
  }
}

export function saveLintSettings(settings: LintSettings, storage: Pick<Storage, "setItem"> | null = safeStorage()): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* the choice still applies for this visit */
  }
}

function safeStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
