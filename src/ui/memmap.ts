import { DEFAULT_SP } from "../core/cpu";
import type { TraceStep } from "../core/cpu";
import type { Program } from "../core/types";
import { pushedRange } from "./history";

/** The source line that declares the data at `addr`, or undefined when no DB/DW covers it. */
export function declLine(program: Program, addr: number): number | undefined {
  return program.dataLines.find((d) => addr >= d.addr && addr < d.addr + d.size)?.line;
}

export interface ByteRow {
  addr: number;
  /** Data labels that point at this byte, joined with ", ". */
  label?: string;
  value: number;
  /** The byte as 8 binary digits ("" while it is still blank). */
  bits: string;
  /** The printable ASCII character, or "" when the byte is not one. */
  char: string;
  /** Declared with `?` and not stored to yet: it has no meaningful value. */
  blank: boolean;
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
 * Data memory byte by byte as it stood after `steps`: every byte declared with DB/DW plus every byte a store
 * reached (stack pushes belong to the stack table, not here). Only the first `limit` bytes are returned as rows.
 */
export function memoryMap(program: Program, steps: TraceStep[], limit = 1024): ByteMap {
  const mem = program.memory.slice();
  const lastStep = new Map<number, number>();
  let prevSp = DEFAULT_SP;
  for (const s of steps) {
    const pushed = pushedRange(prevSp, s.regs.SP);
    for (const m of s.memWrites) {
      if (pushed && m.width === 16 && m.addr >= pushed[0] && m.addr < pushed[1]) continue;
      mem[m.addr] = m.after & 0xff;
      lastStep.set(m.addr, s.step);
      if (m.width === 16) {
        const hi = (m.addr + 1) & 0xffff;
        mem[hi] = (m.after >> 8) & 0xff;
        lastStep.set(hi, s.step);
      }
    }
    prevSp = s.regs.SP;
  }
  const addrs = new Set<number>(lastStep.keys());
  for (let a = 0; a < program.declared.length; a++) if (program.declared[a]) addrs.add(a);
  const labels = new Map<number, string[]>();
  for (const [name, sym] of program.symbols) if (sym.kind === "data") labels.set(sym.value, [...(labels.get(sym.value) ?? []), name]);
  const sorted = [...addrs].sort((a, b) => a - b);
  const rows = sorted.slice(0, limit).map((addr): ByteRow => {
    const value = mem[addr];
    const step = lastStep.get(addr);
    const blank = program.uninit[addr] === 1 && step === undefined;
    return {
      addr,
      label: labels.get(addr)?.join(", "),
      value,
      bits: blank ? "" : value.toString(2).padStart(8, "0"),
      char: !blank && value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : "",
      blank,
      changed: value !== program.memory[addr],
      step,
    };
  });
  return { rows, total: sorted.length };
}

export interface StackByte {
  addr: number;
  /** The first row, at the address the stack starts from (nothing is stored there). */
  base: boolean;
  value: number;
  /** The byte as 8 binary digits ("" for the base row). */
  bits: string;
  char: string;
  /** At or above SP: part of the stack right now. Below it the byte is a popped leftover. */
  live: boolean;
  /** SP points here. */
  sp: boolean;
  /** Step of the last store to it. */
  step?: number;
}

/**
 * The stack byte by byte as it stood after `steps`, from its base down to the deepest address SP reached.
 * Popped bytes stay listed (dimmed by the screen) because memory keeps them until something overwrites them.
 */
export function stackMap(steps: TraceStep[]): { rows: StackByte[] } {
  const mem = new Map<number, number>();
  const lastStep = new Map<number, number>();
  let lowest = DEFAULT_SP;
  for (const s of steps) {
    lowest = Math.min(lowest, s.regs.SP);
    for (const m of s.memWrites) {
      mem.set(m.addr, m.after & 0xff);
      lastStep.set(m.addr, s.step);
      if (m.width === 16) {
        mem.set((m.addr + 1) & 0xffff, (m.after >> 8) & 0xff);
        lastStep.set((m.addr + 1) & 0xffff, s.step);
      }
    }
  }
  if (lowest >= DEFAULT_SP) return { rows: [] };
  const sp = steps.length > 0 ? steps[steps.length - 1].regs.SP : DEFAULT_SP;
  const rows: StackByte[] = [];
  for (let addr = DEFAULT_SP; addr >= lowest; addr--) {
    const base = addr === DEFAULT_SP;
    const value = mem.get(addr) ?? 0;
    rows.push({
      addr,
      base,
      value,
      bits: base ? "" : value.toString(2).padStart(8, "0"),
      char: !base && value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : "",
      live: addr >= sp,
      sp: addr === sp,
      step: lastStep.get(addr),
    });
  }
  return { rows };
}
