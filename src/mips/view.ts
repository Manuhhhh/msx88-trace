import type { MipsProgram } from "./assembler";
import { loadBytes, storeBytes } from "./memory";
import type { Pipeline, PipelineRow } from "./pipeline";
import type { MipsStep } from "./sim";

/** A register column: `r5`, or LO / HI. */
export type RegKey = string;

export interface RegRow {
  step: number;
  line: number;
  text: string;
  /** Registers this step wrote, with their new value. */
  set: Map<RegKey, bigint>;
}

export interface RegTable {
  cols: RegKey[];
  rows: RegRow[];
}

const regName = (n: number): RegKey => `r${n}`;
const colOrder = (k: RegKey): number => Number(k.slice(1));

/** One row per step that changed a register, one column per register that ever changed. */
export function registerTable(steps: MipsStep[]): RegTable {
  const cols = new Set<RegKey>();
  const rows: RegRow[] = [];
  for (const s of steps) {
    const set = new Map<RegKey, bigint>();
    for (const w of s.regs) set.set(regName(w.reg), w.after);
    if (set.size === 0) continue;
    for (const k of set.keys()) cols.add(k);
    rows.push({ step: s.n, line: s.instr.line, text: s.instr.text, set });
  }
  return { cols: [...cols].sort((a, b) => colOrder(a) - colOrder(b)), rows };
}

export interface MemRow {
  step: number;
  line: number;
  text: string;
  kind: "read" | "write";
  addr: number;
  size: number;
  before?: bigint;
  after: bigint;
}

/** Every data-memory access, in execution order. */
export function memoryRows(steps: MipsStep[]): MemRow[] {
  return steps.flatMap((s) => s.mem.map((m) => ({ step: s.n, line: s.instr.line, text: s.instr.text, ...m })));
}

export interface VarWrite {
  step: number;
  line: number;
  text: string;
  /** Value now held (signed by access size). */
  value: bigint;
}

export interface VarCol {
  addr: number;
  /** The data label that covers the address (`arr`, `arr+8`), or `[addr]` when no label does. */
  name: string;
  /** Bytes of the first access to this address. */
  size: number;
  /** Value before the program ran. */
  initial: bigint;
  /** Every store to this address, in execution order. */
  writes: VarWrite[];
}

export interface VarTable {
  cols: VarCol[];
}

/** Name of the data location at `addr`: the nearest data label at or before it, plus the offset. */
function varName(program: MipsProgram, addr: number): string {
  let best: { name: string; value: number } | undefined;
  for (const [name, sym] of program.symbols) {
    if (sym.kind === "data" && sym.value <= addr && (!best || sym.value > best.value)) best = { name, value: sym.value };
  }
  if (!best) return `[${addr}]`;
  return addr === best.value ? best.name : `${best.name}+${addr - best.value}`;
}

/**
 * The trace of the variables in data memory: one entry per location a load or store touched,
 * with its initial value and every value stored to it afterwards.
 */
export function variableTable(program: MipsProgram, steps: MipsStep[]): VarTable {
  const cols = new Map<number, VarCol>();
  for (const s of steps) {
    for (const m of s.mem) {
      let col = cols.get(m.addr);
      if (!col) {
        const initial = BigInt.asIntN(m.size * 8, loadBytes(program.data, m.addr, m.size));
        col = { addr: m.addr, size: m.size, name: varName(program, m.addr), initial, writes: [] };
        cols.set(m.addr, col);
      }
      if (m.kind === "write") col.writes.push({ step: s.n, line: s.instr.line, text: s.instr.text, value: BigInt.asIntN(m.size * 8, m.after) });
    }
  }
  return { cols: [...cols.values()].sort((a, b) => a.addr - b.addr) };
}

/** The source line of the data directive that fills `addr`, or undefined when none does. */
export function declLine(program: MipsProgram, addr: number): number | undefined {
  if (addr >= program.dataEnd) return undefined;
  let best: number | undefined;
  for (const start of program.dataLines.keys()) if (start <= addr && (best === undefined || start > best)) best = start;
  return best === undefined ? undefined : program.dataLines.get(best);
}

export interface ByteRow {
  addr: number;
  /** Data labels that point at this byte, joined with ", ". */
  label?: string;
  value: number;
  /** The byte as 8 binary digits. */
  bits: string;
  /** The printable ASCII character, or "" when the byte is not one. */
  char: string;
  /** True when a store changed it from its initial value. */
  changed: boolean;
  /** Step of the last store to it. */
  step?: number;
}

export interface ByteMap {
  rows: ByteRow[];
  /** Bytes the map covers, which can be more than the rows drawn. */
  total: number;
}

/**
 * Data memory byte by byte as it stood after `steps`: the declared data plus anything a store reached.
 * Only the first `limit` bytes are returned as rows.
 */
export function memoryMap(program: MipsProgram, steps: MipsStep[], limit = 1024): ByteMap {
  let total = program.dataEnd;
  for (const s of steps) for (const m of s.mem) if (m.kind === "write") total = Math.max(total, m.addr + m.size);
  const mem = program.data.slice(0, total);
  const lastStep = new Map<number, number>();
  for (const s of steps) {
    for (const m of s.mem) {
      if (m.kind !== "write") continue;
      storeBytes(mem, m.addr, m.size, m.after);
      for (let b = 0; b < m.size; b++) lastStep.set(m.addr + b, s.n);
    }
  }
  const labels = new Map<number, string[]>();
  for (const [name, sym] of program.symbols) if (sym.kind === "data") labels.set(sym.value, [...(labels.get(sym.value) ?? []), name]);
  const rows: ByteRow[] = [];
  for (let addr = 0; addr < Math.min(total, limit); addr++) {
    const value = mem[addr];
    rows.push({
      addr,
      label: labels.get(addr)?.join(", "),
      value,
      bits: value.toString(2).padStart(8, "0"),
      char: value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : "",
      changed: value !== program.data[addr],
      step: lastStep.get(addr),
    });
  }
  return { rows, total };
}

export interface PipelineWindow {
  rows: PipelineRow[];
  /** First and last clock cycle drawn as columns. */
  firstCycle: number;
  lastCycle: number;
  /** Index (into the whole diagram) of the first row shown, and how many rows exist. */
  start: number;
  total: number;
}

/**
 * The diagram is steps x cycles, which a long run makes huge, so it is drawn a window of rows at a time.
 * `start` is clamped so the window always holds rows.
 */
export function pipelineWindow(p: Pipeline, start: number, size: number): PipelineWindow {
  const total = p.rows.length;
  const from = Math.max(0, Math.min(start, Math.max(0, total - size)));
  const rows = p.rows.slice(from, from + size);
  if (rows.length === 0) return { rows, firstCycle: 1, lastCycle: 0, start: from, total };
  const firstCycle = rows[0].cells[0].cycle;
  const lastCycle = Math.max(...rows.map((r) => r.cells[r.cells.length - 1].cycle));
  return { rows, firstCycle, lastCycle, start: from, total };
}

/** A 64-bit value as signed decimal, and as 16 hex digits for the tooltip. */
export function fmtValue(v: bigint): { dec: string; hex: string } {
  return { dec: v.toString(), hex: `0x${BigInt.asUintN(64, v).toString(16).toUpperCase().padStart(16, "0")}` };
}

/** The diagram as it stood after `n` instructions: a row only depends on the ones before it, so a prefix is exact. */
export function pipelineUpTo(p: Pipeline, n: number): Pipeline {
  return { ...p, rows: p.rows.slice(0, Math.max(0, n)) };
}

export interface StepFacts {
  /** `r2 = 14`, `LO = 3`: every register this step wrote. */
  regs: string[];
  mem: { kind: "read" | "write"; addr: number; size: number; value: bigint }[];
  /** Cycles this instruction stalled in ID. */
  raw: number;
  /** True for a taken branch or jump. */
  taken: boolean;
}

/** What one instruction did, as plain data the screen words in the chosen language. */
export function stepFacts(step: MipsStep, row: PipelineRow): StepFacts {
  const regs = step.regs.map((w) => `${regName(w.reg)} = ${w.after}`);
  return {
    regs,
    mem: step.mem.map((m) => ({ kind: m.kind, addr: m.addr, size: m.size, value: m.after })),
    raw: row.raw,
    taken: step.taken === true,
  };
}
