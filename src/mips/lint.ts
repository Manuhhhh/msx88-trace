import { AsmError } from "../core/types";
import { DEFAULT_LINT } from "../ui/lint";
import type { Diagnostic, LintSettings } from "../ui/lint";
import { assembleMips, regNumber } from "./assembler";
import type { MipsInstr, MipsProgram } from "./assembler";
import { readsOf, writesOf } from "./pipeline";
import { simulateMips } from "./sim";
import type { MipsStep } from "./sim";

const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NAME = "[A-Za-z_.$][\\w.$]*";

/** Columns of `word` as a whole word in `code`, or null. */
function findWord(code: string, word: string): [number, number] | null {
  const m = new RegExp(`(?<![\\w.$])${escape(word)}(?![\\w.$])`).exec(code);
  return m ? [m.index, m.index + m[0].length] : null;
}

/** Columns of the last occurrence of `text` as written, or null. */
function findText(code: string, text: string): [number, number] | null {
  const i = code.lastIndexOf(text);
  return i < 0 ? null : [i, i + text.length];
}

/** The code of a line without its comment (# or ;), as columns, ignoring the blanks around it. */
function statement(line: string): [number, number] {
  let quote: string | null = null;
  let end = line.length;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#" || c === ";") {
      end = i;
      break;
    }
  }
  const code = line.slice(0, end);
  return [code.length - code.trimStart().length, code.trimEnd().length];
}

/** The last numeric literal in the code, used when a value is written in hex and the message prints it in decimal. */
function lastNumber(code: string): [number, number] | null {
  let last: [number, number] | null = null;
  for (const m of code.matchAll(/(?<![\w.$])(?:0[xX][0-9a-fA-F]+|\d+)(?![\w.$])/g)) last = [m.index, m.index + m[0].length];
  return last;
}

/**
 * Works out which text on the line the assembler is complaining about, from its message. The messages
 * name the culprit (a label, a mnemonic, a number); when one does not, the whole statement is marked.
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
  const number = (c: string, n: string): [number, number] | null => findWord(c, n) ?? lastNumber(c);
  return (
    by(/^(?:Unknown instruction|Unknown directive|Undefined label|Undefined symbol|Symbol) (\S+?)(?: is already defined)?$/, findWord) ??
    by(/^Instruction (\S+) found in the \.data section$/, findWord) ??
    by(/^(\S+) is only allowed in the \.data section$/, findWord) ??
    by(/^(\S+) expects .* operand/, findWord) ??
    by(/^\S+: (\S+) is not a register$/, findWord) ??
    by(/^\S+: (\S+) is a data label|^\S+: label (\S+) points past/, findWord) ??
    by(/^\S+: immediate (-?\d+) does not fit|^\S+: shift amount (-?\d+) must/, number) ??
    by(/^\S+: expected offset\(register\), got (.+)$/, findText) ??
    whole
  );
}

function offsetOf(lines: string[], line: number): number {
  return lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0);
}

function fromAsmError(e: AsmError, source: string): Diagnostic {
  const lines = source.split("\n");
  if (e.line < 1 || e.line > lines.length) return { severity: "error", check: "syntax", line: 0, message: e.message, from: 0, to: 0 };
  const start = offsetOf(lines, e.line - 1 + 1);
  const [a, b] = locate(e.message, lines[e.line - 1]);
  return { severity: "error", check: "syntax", line: e.line, message: e.message, from: start + a, to: start + b };
}

/** Offsets of the text `pick` finds on `line` (1-based), or of the whole statement. */
function onLine(lines: string[], line: number, pick: (text: string) => [number, number] | null): { from: number; to: number } {
  const text = lines[line - 1] ?? "";
  const [a, b] = pick(text) ?? statement(text);
  return { from: offsetOf(lines, line) + a, to: offsetOf(lines, line) + b };
}

// ---- control flow ----------------------------------------------------------------------

const CONDITIONAL = new Set(["beq", "bne", "beqz", "bnez"]);
const BACKWARD_JUMPS = new Set([...CONDITIONAL, "j", "b"]);

interface Flow {
  succ: Map<number, number[]>;
  /** True when a jump goes through a register, so what runs cannot be known from the source. */
  indirect: boolean;
}

function flowOf(program: MipsProgram): Flow {
  const succ = new Map<number, number[]>();
  let indirect = false;
  for (const ins of program.instrs) {
    const next = ins.index + 1 < program.instrs.length ? [ins.index + 1] : [];
    const target = ins.target === undefined ? [] : [ins.target];
    const mn = ins.mnemonic;
    let out: number[];
    if (mn === "j" || mn === "b") out = target;
    else if (CONDITIONAL.has(mn) || mn === "jal") out = [...target, ...next];
    else if (mn === "jr") {
      // jr r31 is a return; any other register is a jump to an address only the run knows
      out = [];
      if (ins.rs !== 31) indirect = true;
    } else if (mn === "jalr") {
      out = next;
      indirect = true;
    } else if (mn === "halt" || (mn === "syscall" && ins.imm === 0n)) out = [];
    else out = next;
    succ.set(ins.index, out);
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

/** Names of the labels written on a line (`a: b: nop`). */
function labelsOn(line: string): string[] {
  const out: string[] = [];
  let s = line.slice(0, statement(line)[1]);
  for (let m = new RegExp(`^\\s*(${NAME})\\s*:\\s*`).exec(s); m; m = new RegExp(`^\\s*(${NAME})\\s*:\\s*`).exec(s)) {
    out.push(m[1]);
    s = s.slice(m[0].length);
  }
  return out;
}

function staticWarnings(program: MipsProgram, source: string, on: LintSettings): Diagnostic[] {
  const { succ, indirect } = flowOf(program);
  if (indirect) return [];
  const lines = source.split("\n");
  const out: Diagnostic[] = [];
  const instrs: MipsInstr[] = program.instrs;

  if (on.dead) {
    const live = reach([program.entry], succ);
    const labelAt = new Map<number, string>();
    for (const [name, sym] of program.symbols) if (sym.kind === "code" && !labelAt.has(sym.value / 4)) labelAt.set(sym.value / 4, name);
    let prev: MipsInstr | undefined;
    for (const ins of instrs) {
      const covered = prev !== undefined && !live.has(prev.index);
      prev = ins;
      if (live.has(ins.index)) continue;
      const name = labelAt.get(ins.index);
      if (name !== undefined) {
        const at = lines.findIndex((l) => labelsOn(l).includes(name));
        if (at >= 0) {
          out.push({ severity: "warning", check: "dead", line: at + 1, key: "lint.msg.deadLabel", vars: { name }, ...onLine(lines, at + 1, (t) => findWord(t, name)) });
          continue;
        }
      }
      if (covered) continue;
      out.push({ severity: "warning", check: "dead", line: ins.line, key: "lint.msg.dead", ...onLine(lines, ins.line, () => null) });
    }
  }

  if (on.loop) {
    const main = reach([program.entry], succ);
    // everything that can still reach a way out (a halt, a return, the end of the code)
    const pred = new Map<number, number[]>();
    for (const [a, ns] of succ) for (const n of ns) pred.set(n, [...(pred.get(n) ?? []), a]);
    const exits = [...succ].filter(([, ns]) => ns.length === 0).map(([a]) => a);
    const canEnd = reach(exits, pred);
    const seen = new Set<number>();
    for (const ins of instrs) {
      if (!main.has(ins.index) || canEnd.has(ins.index) || ins.target === undefined) continue;
      if (!BACKWARD_JUMPS.has(ins.mnemonic) || ins.target > ins.index || seen.has(ins.line)) continue;
      seen.add(ins.line);
      out.push({ severity: "warning", check: "loop", line: ins.line, key: "lint.msg.loop", ...onLine(lines, ins.line, () => null) });
    }
  }
  return out;
}

/** Registers the run read before any instruction wrote them (r0 is always 0, so it never counts). */
function uninitWarnings(steps: MipsStep[], source: string): Diagnostic[] {
  const lines = source.split("\n");
  const written = new Set<number>();
  const seen = new Set<string>();
  const out: Diagnostic[] = [];
  for (const { instr } of steps) {
    for (const r of readsOf(instr)) {
      if (r >= 32 || written.has(r) || seen.has(`${instr.line}:${r}`)) continue;
      seen.add(`${instr.line}:${r}`);
      const text = lines[instr.line - 1] ?? "";
      // the register as the user wrote it ($t0, r5); syscall 5 reads r14 without naming it
      const token = [...text.slice(0, statement(text)[1]).matchAll(/[$\w]+/g)].find((m) => regNumber(m[0]) === r);
      const name = token ? token[0] : `r${r}`;
      out.push({
        severity: "warning",
        check: "uninit",
        line: instr.line,
        key: "lint.msg.uninitReg",
        vars: { name },
        ...onLine(lines, instr.line, () => (token ? [token.index, token.index + token[0].length] : null)),
      });
    }
    for (const w of writesOf(instr)) written.add(w);
  }
  return out;
}

export interface MipsLintInput {
  maxSteps?: number;
}

/**
 * Everything the linter reports for a program: the syntax error if there is one, otherwise the warnings
 * of the enabled checks. Without a syntax error the program is also run (bounded) to see which registers
 * are read before they are assigned.
 */
export function lintMips(source: string, run: MipsLintInput = {}, on: LintSettings = DEFAULT_LINT): Diagnostic[] {
  if (source.trim() === "") return [];
  let program: MipsProgram;
  let steps: MipsStep[] = [];
  try {
    if (on.uninit) {
      const sim = simulateMips(source, { maxSteps: Math.min(run.maxSteps ?? 2000, 5000) });
      program = sim.program;
      steps = sim.steps;
    } else {
      program = assembleMips(source);
    }
  } catch (e) {
    if (!(e instanceof AsmError)) throw e;
    return on.syntax ? [fromAsmError(e, source)] : [];
  }
  return [...staticWarnings(program, source, on), ...(on.uninit ? uninitWarnings(steps, source) : [])].sort((a, b) => a.line - b.line);
}
