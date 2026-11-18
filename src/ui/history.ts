import { DEFAULT_SP } from "../core/cpu";
import type { TraceStep } from "../core/cpu";
import { FLAG_ORDER, REG_ORDER } from "./format";

/** One value taken by a register, flag or memory cell, and the step that put it there. */
export interface Point {
  step: number;
  value: number;
  /** Instruction text of that step. */
  text: string;
  /** The step was a hardware interrupt, not an instruction. */
  irq: boolean;
}

/** Every value a single location went through, in order. */
export interface Series {
  name: string;
  initial: number;
  points: Point[];
}

export interface StackEvent {
  step: number;
  text: string;
  irq: boolean;
  op: "push" | "pop";
  addr: number;
  value: number;
}

export interface CellSeries extends Series {
  addr: number;
  width: 8 | 16;
}

export interface RunHistory {
  registers: Series[];
  flags: Series[];
  heap: CellSeries[];
  stack: StackEvent[];
}

const point = (s: TraceStep, value: number): Point => ({ step: s.step, value, text: s.text, irq: s.kind === "irq" });

/** Memory addresses written by a PUSH or an interrupt: they belong to the stack, not to the heap. */
export function pushedRange(prevSp: number, sp: number): [number, number] | null {
  return sp < prevSp ? [sp, prevSp] : null;
}

/** Derives, from the step-by-step trace, every value each register, flag, memory cell and stack slot took. */
export function buildHistory(steps: TraceStep[]): RunHistory {
  const registers = new Map<string, Series>(
    REG_ORDER.map((r) => [r, { name: r, initial: r === "SP" ? DEFAULT_SP : 0, points: [] }]),
  );
  const flags = new Map<string, Series>();
  const heap = new Map<string, CellSeries>();
  const stack: StackEvent[] = [];

  let prevSp = DEFAULT_SP;
  steps.forEach((s, i) => {
    for (const r of s.changedRegs) registers.get(r)?.points.push(point(s, s.regs[r]));

    for (const f of FLAG_ORDER) {
      const now = s.flags[f] ? 1 : 0;
      let series = flags.get(f);
      if (!series) {
        series = { name: f, initial: s.changedFlags.includes(f) ? 1 - now : now, points: [] };
        flags.set(f, series);
      }
      if (s.changedFlags.includes(f)) series.points.push(point(s, now));
    }

    const sp = s.regs.SP;
    const pushed = pushedRange(prevSp, sp);
    const writeAt = new Map(s.memWrites.map((m) => [m.addr, m.after]));
    if (pushed) {
      for (let addr = prevSp - 2; addr >= sp; addr -= 2) {
        const value = writeAt.get(addr);
        if (value !== undefined) stack.push({ step: s.step, text: s.text, irq: s.kind === "irq", op: "push", addr, value });
      }
    } else if (sp > prevSp) {
      const top = i > 0 ? steps[i - 1].stack : [];
      for (let k = 0; k * 2 < sp - prevSp; k++) {
        const value = top[k];
        if (value !== undefined) stack.push({ step: s.step, text: s.text, irq: s.kind === "irq", op: "pop", addr: prevSp + 2 * k, value });
      }
    }
    prevSp = sp;

    for (const m of s.memWrites) {
      if (pushed && m.width === 16 && m.addr >= pushed[0] && m.addr < pushed[1]) continue;
      const key = `${m.addr}:${m.width}`;
      let series = heap.get(key);
      if (!series) {
        series = { name: key, addr: m.addr, width: m.width, initial: m.before, points: [] };
        heap.set(key, series);
      }
      series.points.push(point(s, m.after));
    }
  });

  return {
    registers: [...registers.values()],
    flags: FLAG_ORDER.map((f) => flags.get(f) ?? { name: f, initial: 0, points: [] }),
    heap: [...heap.values()].sort((a, b) => a.addr - b.addr || a.width - b.width),
    stack,
  };
}

/** A value pushed onto a stack address, and the step that popped it again (if any). */
export interface SlotWrite {
  step: number;
  value: number;
  poppedAt?: number;
}

export interface StackSlot {
  addr: number;
  writes: SlotWrite[];
}

/**
 * Regroups the stack log by address: one slot per word from the base down to the deepest address
 * reached, each with every value pushed there in order. The base itself is listed empty, as the marker
 * of where the stack starts.
 */
export function stackSlots(events: StackEvent[], base = DEFAULT_SP): StackSlot[] {
  const byAddr = new Map<number, SlotWrite[]>();
  for (const e of events) {
    const writes = byAddr.get(e.addr) ?? [];
    byAddr.set(e.addr, writes);
    if (e.op === "push") writes.push({ step: e.step, value: e.value });
    else {
      const open = writes.findLast((w) => w.poppedAt === undefined);
      if (open) open.poppedAt = e.step;
    }
  }
  const lowest = Math.min(base, ...byAddr.keys());
  const slots: StackSlot[] = [{ addr: base, writes: [] }];
  for (let addr = base - 2; addr >= lowest; addr -= 2) slots.push({ addr, writes: byAddr.get(addr) ?? [] });
  return slots;
}
