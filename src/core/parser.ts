import { AsmError } from "./types";
import type { IndexReg, Operand, Reg, Sym, Width } from "./types";

export const REGS = new Set<string>([
  "AL", "AH", "BL", "BH", "CL", "CH", "DL", "DH",
  "AX", "BX", "CX", "DX", "SI", "DI", "BP", "SP",
]);
const INDEX = new Set<string>(["BX", "SI", "DI", "BP"]);
export const RESERVED = new Set([
  "ORG", "END", "EQU", "DB", "DW", "OFFSET", "PTR", "BYTE", "WORD", "DUP",
]);

export interface SourceLine {
  line: number;
  /** Code label (`NAME:`). */
  label?: string;
  /** Symbol defined by EQU / DB / DW (`NAME DB 0`). */
  name?: string;
  /** Directive or mnemonic, upper case. */
  op?: string;
  args: string[];
  /** Text without label and comment. */
  text: string;
}

function stripComment(s: string): string {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === ";") {
      return s.slice(0, i);
    }
  }
  return s;
}

/** Splits on top-level commas, ignoring commas in quotes, () and []. */
export function splitArgs(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let cur = "";
  for (const c of s) {
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') quote = c;
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  out.push(cur.trim());
  return out;
}

export function parseSource(source: string): SourceLine[] {
  const result: SourceLine[] = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    let s = stripComment(raw).trim();
    if (!s) return;
    const out: SourceLine = { line, args: [], text: "" };
    const lm = /^([A-Za-z_]\w*)\s*:(.*)$/.exec(s);
    if (lm) {
      out.label = lm[1].toUpperCase();
      s = lm[2].trim();
    }
    out.text = s;
    if (s) {
      const m = /^(\S+)(?:\s+(.*))?$/.exec(s)!;
      const first = m[1].toUpperCase();
      let rest = (m[2] ?? "").trim();
      const named = /^(EQU|DB|DW)(?:\s+(.*))?$/i.exec(rest);
      if (named) {
        out.name = first;
        out.op = named[1].toUpperCase();
        rest = (named[2] ?? "").trim();
      } else {
        out.op = first;
      }
      out.args = rest ? splitArgs(rest) : [];
      if (out.args.some((a) => a === "")) throw new AsmError("Empty operand", line);
    }
    result.push(out);
  });
  return result;
}

export function parseNumber(t: string): number | null {
  if (/^\d[0-9A-F]*H$/i.test(t)) return parseInt(t.slice(0, -1), 16);
  if (/^[01]+B$/i.test(t)) return parseInt(t.slice(0, -1), 2);
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  return null;
}

type Token =
  | { t: "char"; v: number }
  | { t: "op"; v: "+" | "-" }
  | { t: "id"; v: string }
  | { t: "num"; v: string };

function tokenize(text: string, line: number): Token[] {
  const re = /\s*(?:'(.)'|([+-])|([A-Za-z_?@$][\w?@$]*)|(\d[0-9A-Za-z]*))/y;
  const tokens: Token[] = [];
  let pos = 0;
  while (pos < text.length && text.slice(pos).trim() !== "") {
    re.lastIndex = pos;
    const m = re.exec(text);
    if (!m) throw new AsmError(`Unexpected text in expression: "${text.slice(pos).trim()}"`, line);
    pos = re.lastIndex;
    if (m[1] !== undefined) tokens.push({ t: "char", v: m[1].charCodeAt(0) });
    else if (m[2] !== undefined) tokens.push({ t: "op", v: m[2] as "+" | "-" });
    else if (m[3] !== undefined) tokens.push({ t: "id", v: m[3] });
    else tokens.push({ t: "num", v: m[4] });
  }
  return tokens;
}

export interface Eval {
  value: number;
  /** References a data symbol directly (not through OFFSET): a memory operand. */
  mem: boolean;
  /** References a symbol that is not defined yet (first pass only). */
  forward: boolean;
  /** Width of the first data symbol referenced, if any. */
  width?: Width;
}

/** Evaluates `term (+|- term)*`. Terms: number, 'c', symbol, OFFSET symbol. */
export function evalExpr(
  text: string,
  symbols: Map<string, Sym>,
  strict: boolean,
  line: number,
): Eval {
  const tokens = tokenize(text, line);
  if (tokens.length === 0) throw new AsmError("Empty expression", line);
  const res: Eval = { value: 0, mem: false, forward: false };
  let sign = 1;
  let expectTerm = true;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (tok.t === "op") {
      const s = tok.v === "-" ? -1 : 1;
      sign = expectTerm ? sign * s : s;
      expectTerm = true;
      continue;
    }
    if (!expectTerm) throw new AsmError(`Unexpected "${text}"`, line);
    let val: number;
    if (tok.t === "num") {
      const n = parseNumber(tok.v);
      if (n === null) throw new AsmError(`Invalid number "${tok.v}"`, line);
      val = n;
    } else if (tok.t === "char") {
      val = tok.v;
    } else {
      let name = tok.v.toUpperCase();
      let isOffset = false;
      if (name === "OFFSET") {
        const next = tokens[++i];
        if (!next || next.t !== "id") throw new AsmError("OFFSET needs a symbol", line);
        name = next.v.toUpperCase();
        isOffset = true;
      }
      const sym = symbols.get(name);
      if (!sym) throw new AsmError(`Undefined symbol ${name}`, line);
      if (!sym.defined) {
        if (strict) throw new AsmError(`Symbol ${name} is not defined yet`, line);
        res.forward = true;
        val = 0;
      } else {
        val = sym.value;
      }
      if (sym.kind === "data" && !isOffset) {
        res.mem = true;
        res.width ??= sym.width;
      }
    }
    res.value += sign * val;
    sign = 1;
    expectTerm = false;
  }
  if (expectTerm) throw new AsmError("Incomplete expression", line);
  return res;
}

/**
 * Parses one operand. In the first pass (`strict=false`) forward references
 * resolve to 0 and are flagged so instruction sizes can still be computed.
 */
export function parseOperand(
  text: string,
  symbols: Map<string, Sym>,
  strict: boolean,
  line: number,
): { op: Operand; forward: boolean } {
  let t = text.trim();
  let width: Width | undefined;
  const ptr = /^(BYTE|WORD)\s+PTR\s+(.*)$/i.exec(t);
  if (ptr) {
    width = ptr[1].toUpperCase() === "BYTE" ? 8 : 16;
    t = ptr[2].trim();
  }
  const upper = t.toUpperCase();
  if (REGS.has(upper)) {
    return { op: { kind: "reg", reg: upper as Reg }, forward: false };
  }
  if (t.startsWith("[") && t.endsWith("]")) {
    const inner = t.slice(1, -1).trim();
    if (INDEX.has(inner.toUpperCase())) {
      return { op: { kind: "memReg", base: inner.toUpperCase() as IndexReg, width }, forward: false };
    }
    if (/\b(BX|SI|DI|BP)\b/i.test(inner)) {
      throw new AsmError(`Unsupported addressing mode: ${text}`, line);
    }
    const e = evalExpr(inner, symbols, strict, line);
    return { op: { kind: "mem", addr: checkAddr(e.value, line), width: width ?? e.width }, forward: e.forward };
  }
  const e = evalExpr(t, symbols, strict, line);
  if (e.mem) {
    return { op: { kind: "mem", addr: checkAddr(e.value, line), width: width ?? e.width }, forward: e.forward };
  }
  return { op: { kind: "imm", value: e.value }, forward: e.forward };
}

function checkAddr(v: number, line: number): number {
  if (v < 0 || v > 0xffff) throw new AsmError(`Address out of range: ${v}`, line);
  return v;
}
