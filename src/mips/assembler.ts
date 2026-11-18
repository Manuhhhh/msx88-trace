import { AsmError } from "../core/types";
import { storeBytes } from "./memory";

// ASSUMPTION: EduMIPS64 syntax as documented at edumips64.readthedocs.io, from memory:
// `.word` is an alias of `.word64`, data memory starts at address 0 and data is
// naturally aligned, instructions are 4 bytes and live apart from data memory.

export const DATA_SIZE = 0x10000;

export type Format =
  | "rrr" // op rd, rs, rt
  | "rri" // op rt, rs, imm
  | "ri" // op rt, imm
  | "shift" // op rd, rt, sa
  | "mem" // op rt, imm(rs)
  | "br2" // op rs, rt, label
  | "br1" // op rs, label
  | "jump" // op label
  | "jr" // op rs
  | "md" // op rs, rt (result in LO/HI)
  | "mf" // op rd
  | "sys" // op [imm]
  | "none";

const FORMATS: Record<Format, string[]> = {
  rrr: ["dadd", "daddu", "dsub", "dsubu", "and", "or", "xor", "nor", "slt", "sltu", "dsllv", "dsrlv", "dsrav", "dmul", "dmulu"],
  rri: ["daddi", "daddiu", "andi", "ori", "xori", "slti", "sltiu"],
  ri: ["lui"],
  shift: ["dsll", "dsrl", "dsra"],
  mem: ["lb", "lbu", "lh", "lhu", "lw", "lwu", "ld", "sb", "sh", "sw", "sd"],
  br2: ["beq", "bne"],
  br1: ["beqz", "bnez"],
  jump: ["j", "jal", "b"],
  jr: ["jr", "jalr"],
  md: ["ddiv", "ddivu"],
  mf: ["mflo", "mfhi"],
  sys: ["syscall"],
  none: ["nop", "halt"],
};

export const FORMAT_OF = new Map<string, Format>(
  (Object.entries(FORMATS) as [Format, string[]][]).flatMap(([fmt, names]) => names.map((n): [string, Format] => [n, fmt])),
);

export const DIRECTIVES = new Set([
  ".data", ".text", ".code", ".global", ".globl", ".entry",
  ".byte", ".word", ".word16", ".word32", ".word64", ".space", ".ascii", ".asciiz",
]);

const VARIABLE_SHIFTS = new Set(["dsllv", "dsrlv", "dsrav"]);

const ABI_NAMES = [
  "zero", "at", "v0", "v1", "a0", "a1", "a2", "a3",
  "t0", "t1", "t2", "t3", "t4", "t5", "t6", "t7",
  "s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7",
  "t8", "t9", "k0", "k1", "gp", "sp", "fp", "ra",
];

/** Register number for `r5`, `$5` or `$t0`, or undefined when `s` is not a register. */
export function regNumber(s: string): number | undefined {
  const m = /^(?:r|\$)(\d{1,2})$/i.exec(s);
  if (m) {
    const n = Number(m[1]);
    return n < 32 ? n : undefined;
  }
  const abi = /^\$(\w+)$/.exec(s);
  if (abi) {
    const i = ABI_NAMES.indexOf(abi[1].toLowerCase());
    return i < 0 ? undefined : i;
  }
  return undefined;
}

export interface MipsInstr {
  index: number;
  /** Byte address in instruction memory (4 per instruction). */
  addr: number;
  mnemonic: string;
  format: Format;
  rd?: number;
  rs?: number;
  rt?: number;
  imm: bigint;
  /** Instruction index a branch or jump goes to. */
  target?: number;
  line: number;
  /** Instruction text as written, without label or comment. */
  text: string;
}

export interface MipsSym {
  kind: "code" | "data";
  /** Instruction byte address for code, data byte address for data. */
  value: number;
}

export interface MipsProgram {
  instrs: MipsInstr[];
  /** Initial data memory image. */
  data: Uint8Array;
  symbols: Map<string, MipsSym>;
  /** Source line of each data directive, by the first byte it fills (used by the trace to name memory). */
  dataLines: Map<number, number>;
  entry: number;
}

interface RawLine {
  line: number;
  labels: string[];
  op?: string;
  rest: string;
  text: string;
}

function stripComment(s: string): string {
  let quote: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === ";" || c === "#") return s.slice(0, i);
  }
  return s;
}

function splitArgs(s: string): string[] {
  const out: string[] = [];
  let quote: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quote) {
      cur += c;
      if (c === "\\" && i + 1 < s.length) cur += s[++i];
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    if (c === ",") {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += c;
  }
  if (cur.trim() !== "" || out.length > 0) out.push(cur.trim());
  return out;
}

const LABEL = /^([A-Za-z_.$][\w.$]*)\s*:\s*/;

function readLines(source: string): RawLine[] {
  const out: RawLine[] = [];
  source.split(/\r?\n/).forEach((raw, i) => {
    let s = stripComment(raw).trim();
    const labels: string[] = [];
    for (let m = LABEL.exec(s); m; m = LABEL.exec(s)) {
      labels.push(m[1]);
      s = s.slice(m[0].length);
    }
    if (s === "" && labels.length === 0) return;
    const m = /^(\S+)\s*(.*)$/.exec(s);
    out.push({ line: i + 1, labels, op: m?.[1].toLowerCase(), rest: m?.[2] ?? "", text: s });
  });
  return out;
}

function parseNumber(s: string): bigint | undefined {
  const m = /^([+-])?\s*(0x[0-9a-f]+|\d+)$/i.exec(s);
  if (m) {
    const v = BigInt(m[2]);
    return m[1] === "-" ? -v : v;
  }
  const c = /^'(\\?.)'$/.exec(s);
  if (c) return BigInt(unescape(c[1]).charCodeAt(0));
  return undefined;
}

function unescape(s: string): string {
  if (s[0] !== "\\") return s;
  const map: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", '"': '"', "'": "'" };
  return map[s[1]] ?? s[1];
}

function parseString(s: string, line: number): number[] {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(s);
  if (!m) throw new AsmError(`Expected a "string", got ${s}`, line);
  const bytes: number[] = [];
  for (const part of m[1].match(/\\.|[^\\]/g) ?? []) bytes.push(unescape(part).charCodeAt(0) & 0xff);
  return bytes;
}

const WORD_SIZE: Record<string, number> = { ".byte": 1, ".word16": 2, ".word32": 4, ".word64": 8, ".word": 8 };

interface DataItem {
  line: number;
  addr: number;
  op: string;
  args: string[];
}

/** Assembles EduMIPS64 source into a program image. Throws AsmError. */
export function assembleMips(source: string): MipsProgram {
  const symbols = new Map<string, MipsSym>();
  const instrs: MipsInstr[] = [];
  const rawInstrs: { line: RawLine; index: number }[] = [];
  const items: DataItem[] = [];
  const dataLines = new Map<number, number>();
  let section: "text" | "data" = "text";
  let dataEnd = 0;
  let entryLabel: string | undefined;
  /** Data labels waiting for the next datum, so they take its natural alignment. */
  let pending: { name: string; line: number }[] = [];
  const flushPending = (at: number): void => {
    for (const p of pending) define(p.name, { kind: "data", value: at }, p.line);
    pending = [];
  };

  const define = (name: string, sym: MipsSym, line: number): void => {
    if (symbols.has(name)) throw new AsmError(`Symbol ${name} is already defined`, line);
    symbols.set(name, sym);
  };

  // Pass 1: lay out data, number instructions, collect labels.
  for (const ln of readLines(source)) {
    for (const label of ln.labels) {
      if (section === "text") define(label, { kind: "code", value: rawInstrs.length * 4 }, ln.line);
      else pending.push({ name: label, line: ln.line });
    }
    if (ln.op === undefined) continue;
    const op = ln.op;
    if (op === ".data" || op === ".text" || op === ".code") {
      flushPending(dataEnd);
      section = op === ".data" ? "data" : "text";
      continue;
    }
    if (op === ".global" || op === ".globl" || op === ".entry") {
      entryLabel = ln.rest.trim() || undefined;
      continue;
    }
    if (op.startsWith(".")) {
      if (!DIRECTIVES.has(op)) throw new AsmError(`Unknown directive ${op}`, ln.line);
      if (section !== "data") throw new AsmError(`${op} is only allowed in the .data section`, ln.line);
      const args = splitArgs(ln.rest);
      if (args.length === 0) throw new AsmError(`${op} expects at least one value`, ln.line);
      const size = WORD_SIZE[op];
      if (size) {
        dataEnd = alignTo(dataEnd, size);
        flushPending(dataEnd);
        items.push({ line: ln.line, addr: dataEnd, op, args });
        dataEnd += size * args.length;
      } else if (op === ".space") {
        const n = parseNumber(args[0]);
        if (n === undefined || n < 0n) throw new AsmError(".space expects a non-negative number of bytes", ln.line);
        flushPending(dataEnd);
        items.push({ line: ln.line, addr: dataEnd, op, args });
        dataEnd += Number(n);
      } else {
        flushPending(dataEnd);
        const len = args.reduce((n, a) => n + parseString(a, ln.line).length + (op === ".asciiz" ? 1 : 0), 0);
        items.push({ line: ln.line, addr: dataEnd, op, args });
        dataEnd += len;
      }
      if (dataEnd > DATA_SIZE) throw new AsmError(`Data does not fit in ${DATA_SIZE} bytes`, ln.line);
      continue;
    }
    if (section === "data") throw new AsmError(`Instruction ${op} found in the .data section`, ln.line);
    if (!FORMAT_OF.has(op)) throw new AsmError(`Unknown instruction ${op}`, ln.line);
    rawInstrs.push({ line: ln, index: rawInstrs.length });
  }

  flushPending(dataEnd);

  // Pass 2: data bytes, then operands.
  const data = new Uint8Array(DATA_SIZE);
  for (const it of items) {
    dataLines.set(it.addr, it.line);
    let at = it.addr;
    const size = WORD_SIZE[it.op];
    if (size) {
      for (const a of it.args) {
        const v = evalExpr(a, symbols, it.line);
        storeBytes(data, at, size, v);
        at += size;
      }
    } else if (it.op === ".ascii" || it.op === ".asciiz") {
      for (const a of it.args) {
        for (const byte of parseString(a, it.line)) data[at++] = byte;
        if (it.op === ".asciiz") data[at++] = 0;
      }
    }
  }

  for (const { line: ln, index } of rawInstrs) {
    instrs.push(encode(ln, index, symbols, rawInstrs.length));
  }
  let entry = 0;
  if (entryLabel !== undefined) {
    const sym = symbols.get(entryLabel);
    if (!sym || sym.kind !== "code") throw new AsmError(`Entry point ${entryLabel} is not a code label`, 1);
    entry = sym.value / 4;
  }
  return { instrs, data, symbols, dataLines, entry };
}

function alignTo(n: number, size: number): number {
  return Math.ceil(n / size) * size;
}

/** A number, or a symbol optionally followed by +N / -N. */
function evalExpr(s: string, symbols: Map<string, MipsSym>, line: number): bigint {
  const n = parseNumber(s);
  if (n !== undefined) return n;
  const m = /^([A-Za-z_.$][\w.$]*)\s*(?:([+-])\s*(\w+))?$/.exec(s);
  if (m) {
    const sym = symbols.get(m[1]);
    if (!sym) throw new AsmError(`Undefined symbol ${m[1]}`, line);
    let v = BigInt(sym.value);
    if (m[2]) {
      const off = parseNumber(m[3]);
      if (off === undefined) throw new AsmError(`Invalid offset ${m[3]}`, line);
      v = m[2] === "-" ? v - off : v + off;
    }
    return v;
  }
  throw new AsmError(`Invalid value ${s}`, line);
}

function encode(ln: RawLine, index: number, symbols: Map<string, MipsSym>, count: number): MipsInstr {
  const mn = ln.op!;
  const format = FORMAT_OF.get(mn)!;
  const args = ln.rest.trim() === "" ? [] : splitArgs(ln.rest);
  const line = ln.line;
  const ins: MipsInstr = { index, addr: index * 4, mnemonic: mn, format, imm: 0n, line, text: ln.text };

  const arity: Record<Format, number | [number, number]> = {
    rrr: 3, rri: 3, ri: 2, shift: 3, mem: 2, br2: 3, br1: 2, jump: 1, jr: 1, md: 2, mf: 1, sys: [0, 1], none: 0,
  };
  const want = arity[format];
  const [lo, hi] = Array.isArray(want) ? want : [want, want];
  if (args.length < lo || args.length > hi) {
    throw new AsmError(`${mn} expects ${lo === hi ? lo : `${lo} or ${hi}`} operand(s), got ${args.length}`, line);
  }
  const reg = (s: string): number => {
    const n = regNumber(s);
    if (n === undefined) throw new AsmError(`${mn}: ${s} is not a register`, line);
    return n;
  };
  const imm16 = (s: string): bigint => {
    const v = evalExpr(s, symbols, line);
    if (v < -32768n || v > 65535n) throw new AsmError(`${mn}: immediate ${v} does not fit in 16 bits`, line);
    return v;
  };
  const label = (s: string): number => {
    const sym = symbols.get(s);
    if (!sym) throw new AsmError(`Undefined label ${s}`, line);
    if (sym.kind !== "code") throw new AsmError(`${mn}: ${s} is a data label, not a code label`, line);
    const target = sym.value / 4;
    if (target >= count) throw new AsmError(`${mn}: label ${s} points past the last instruction`, line);
    return target;
  };

  switch (format) {
    case "rrr":
      ins.rd = reg(args[0]);
      if (VARIABLE_SHIFTS.has(mn)) {
        // dsllv rd, rt, rs: the value comes first and the shift amount last.
        ins.rt = reg(args[1]);
        ins.rs = reg(args[2]);
      } else {
        ins.rs = reg(args[1]);
        ins.rt = reg(args[2]);
      }
      break;
    case "rri":
      ins.rt = reg(args[0]);
      ins.rs = reg(args[1]);
      ins.imm = imm16(args[2]);
      break;
    case "ri":
      ins.rt = reg(args[0]);
      ins.imm = imm16(args[1]);
      break;
    case "shift": {
      ins.rd = reg(args[0]);
      ins.rt = reg(args[1]);
      const sa = evalExpr(args[2], symbols, line);
      if (sa < 0n || sa > 63n) throw new AsmError(`${mn}: shift amount ${sa} must be between 0 and 63`, line);
      ins.imm = sa;
      break;
    }
    case "mem": {
      ins.rt = reg(args[0]);
      const m = /^(.*)\(\s*([^)]+?)\s*\)$/.exec(args[1]);
      if (!m) throw new AsmError(`${mn}: expected offset(register), got ${args[1]}`, line);
      ins.imm = m[1].trim() === "" ? 0n : imm16(m[1].trim());
      ins.rs = reg(m[2]);
      break;
    }
    case "br2":
      ins.rs = reg(args[0]);
      ins.rt = reg(args[1]);
      ins.target = label(args[2]);
      break;
    case "br1":
      ins.rs = reg(args[0]);
      ins.target = label(args[1]);
      break;
    case "jump":
      ins.target = label(args[0]);
      break;
    case "jr":
      ins.rs = reg(args[0]);
      break;
    case "md":
      ins.rs = reg(args[0]);
      ins.rt = reg(args[1]);
      break;
    case "mf":
      ins.rd = reg(args[0]);
      break;
    case "sys": {
      const v = args.length ? parseNumber(args[0]) : 0n;
      if (v === undefined || v < 0n) throw new AsmError(`${mn}: expected a syscall number`, line);
      ins.imm = v;
      break;
    }
    case "none":
      break;
  }
  return ins;
}
