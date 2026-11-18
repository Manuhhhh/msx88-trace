import { ARITY, instrSize, validateResolved } from "./isa";
import { REGS, RESERVED, evalExpr, parseOperand, parseSource, splitArgs } from "./parser";
import type { SourceLine } from "./parser";
import { AsmError } from "./types";
import type { Instr, Program, Sym, Width } from "./types";

interface Item {
  src: SourceLine;
  addr: number;
  size: number;
  kind: "data" | "instr";
}

/** One byte (DB) or word (DW) of a data list; `uninit` marks a `?`, which reserves space without giving it a value. */
interface Cell {
  value: number;
  uninit: boolean;
}

/**
 * Values of a DB/DW argument list, one entry per byte (DB) or word (DW).
 * Supports numbers, expressions, `?`, 'strings' and `n DUP(values)`.
 */
function dataValues(
  args: string[],
  width: Width,
  symbols: Map<string, Sym>,
  strict: boolean,
  line: number,
): Cell[] {
  const out: Cell[] = [];
  for (const a of args) {
    if (a === "?") {
      out.push({ value: 0, uninit: true });
      continue;
    }
    const str = /^(['"])(.*)\1$/.exec(a);
    if (str) {
      if (width === 16 && str[2].length > 1) throw new AsmError("DW cannot hold a string", line);
      for (const ch of str[2]) out.push({ value: ch.charCodeAt(0), uninit: false });
      continue;
    }
    const dup = /^(.+?)\s+DUP\s*\((.*)\)\s*$/i.exec(a);
    if (dup) {
      const count = evalExpr(dup[1], symbols, true, line).value;
      if (count < 0 || count > 0xffff) throw new AsmError(`Invalid DUP count: ${count}`, line);
      const inner = dataValues(splitArgs(dup[2]), width, symbols, strict, line);
      for (let k = 0; k < count; k++) out.push(...inner);
      continue;
    }
    out.push({ value: evalExpr(a, symbols, strict, line).value, uninit: false });
  }
  return out;
}

export function assemble(source: string): Program {
  const lines = parseSource(source);
  const symbols = new Map<string, Sym>();

  const declare = (name: string, sym: Sym, line: number): void => {
    if (REGS.has(name) || ARITY.has(name) || RESERVED.has(name)) {
      throw new AsmError(`Reserved name ${name}`, line);
    }
    if (symbols.has(name)) throw new AsmError(`Duplicate symbol ${name}`, line);
    symbols.set(name, sym);
  };
  const mark = (name: string, loc: number): void => {
    const s = symbols.get(name)!;
    s.value = loc;
    s.defined = true;
  };

  // Pass 0: declare every symbol so operands can be classified (memory vs immediate).
  for (const l of lines) {
    if (l.op === "END") break;
    if (l.label) declare(l.label, { kind: "code", value: 0, defined: false }, l.line);
    if (!l.name) continue;
    if (l.op === "EQU") {
      if (l.args.length !== 1) throw new AsmError("EQU expects one value", l.line);
      const value = evalExpr(l.args[0], symbols, true, l.line).value;
      declare(l.name, { kind: "const", value, defined: true }, l.line);
    } else {
      const width: Width = l.op === "DB" ? 8 : 16;
      declare(l.name, { kind: "data", value: 0, width, defined: false }, l.line);
    }
  }

  // Pass 1: lay out data and instructions, assigning addresses and sizes.
  const items: Item[] = [];
  let loc = 0;
  for (const l of lines) {
    if (l.op === "END") break;
    if (l.label) mark(l.label, loc);
    if (!l.op || l.op === "EQU") continue;
    if (l.op === "ORG") {
      if (l.args.length !== 1) throw new AsmError("ORG expects one address", l.line);
      loc = evalExpr(l.args[0], symbols, true, l.line).value;
      if (loc < 0 || loc > 0xffff) throw new AsmError(`ORG out of range: ${loc}`, l.line);
      continue;
    }
    if (l.name) mark(l.name, loc);
    let size: number;
    let kind: Item["kind"];
    if (l.op === "DB" || l.op === "DW") {
      const width: Width = l.op === "DB" ? 8 : 16;
      if (l.args.length === 0) throw new AsmError(`${l.op} needs at least one value`, l.line);
      size = dataValues(l.args, width, symbols, false, l.line).length * (width / 8);
      kind = "data";
    } else {
      const parsed = l.args.map((a) => parseOperand(a, symbols, false, l.line));
      size = instrSize(
        l.op,
        parsed.map((p) => p.op),
        parsed.map((p) => p.forward),
        l.line,
      );
      kind = "instr";
    }
    if (loc + size > 0x10000) throw new AsmError("Program exceeds 64 KiB of memory", l.line);
    items.push({ src: l, addr: loc, size, kind });
    loc += size;
  }

  // Pass 2: resolve operands and emit data into the memory image.
  const memory = new Uint8Array(0x10000);
  const uninit = new Uint8Array(0x10000);
  const instrs = new Map<number, Instr>();
  const codeBytes = new Uint8Array(0x10000);
  let entry: number | undefined;
  for (const it of items) {
    const l = it.src;
    if (it.kind === "data") {
      const width: Width = l.op === "DB" ? 8 : 16;
      const values = dataValues(l.args, width, symbols, true, l.line);
      const min = width === 8 ? -128 : -32768;
      const max = width === 8 ? 255 : 65535;
      values.forEach(({ value: v, uninit: blank }, k) => {
        if (v < min || v > max) throw new AsmError(`Value ${v} does not fit in ${width} bits`, l.line);
        const a = it.addr + k * (width / 8);
        memory[a] = v & 0xff;
        if (width === 16) memory[a + 1] = (v >> 8) & 0xff;
        if (blank) for (let b = 0; b < width / 8; b++) uninit[a + b] = 1;
      });
      continue;
    }
    const mnemonic = l.op!;
    const operands = l.args.map((a) => parseOperand(a, symbols, true, l.line).op);
    validateResolved(mnemonic, operands, l.line);
    for (let a = it.addr; a < it.addr + it.size; a++) {
      if (codeBytes[a]) {
        throw new AsmError(`Code overlaps another instruction at ${a.toString(16).toUpperCase()}H`, l.line);
      }
      codeBytes[a] = 1;
    }
    instrs.set(it.addr, { addr: it.addr, size: it.size, mnemonic, operands, line: l.line, text: l.text });
    entry ??= it.addr;
  }

  return { instrs, memory, symbols, uninit, entry: entry ?? 0 };
}
