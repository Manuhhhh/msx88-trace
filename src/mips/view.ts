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
const colOrder = (k: RegKey): number => (k === "lo" ? 100 : k === "hi" ? 101 : Number(k.slice(1)));

/** One row per step that changed a register, one column per register that ever changed. */
export function registerTable(steps: MipsStep[]): RegTable {
  const cols = new Set<RegKey>();
  const rows: RegRow[] = [];
  for (const s of steps) {
    const set = new Map<RegKey, bigint>();
    for (const w of s.regs) set.set(regName(w.reg), w.after);
    if (s.lo) set.set("lo", s.lo.after);
    if (s.hi) set.set("hi", s.hi.after);
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
