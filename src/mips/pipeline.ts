import type { MipsInstr } from "./assembler";
import type { MipsStep } from "./sim";

// ASSUMPTION: a classic in-order 5-stage pipeline as WinMIPS64 draws it. Every integer
// instruction takes one cycle in EX (mul/div are not multi-cycle), there are no structural
// hazards, and WAW/WAR cannot happen in order. The register file is written in WB and can be
// read by an ID that runs in that same cycle. Branches and jumps resolve in ID, and a taken one
// discards the instruction being fetched. WinMIPS64 also gives mul/div multi-cycle latencies and optional delay slot / branch target buffer; those are not modelled.

export type Stage = "IF" | "ID" | "RAW" | "EX" | "MEM" | "WB";

export interface Cell {
  /** 1-based clock cycle. */
  cycle: number;
  /** `IF` repeats while the instruction waits for ID to free up; `RAW` marks cycles stalled in ID. */
  stage: Stage;
}

export interface PipelineRow {
  /** Step number (1-based) in the executed stream. */
  step: number;
  instr: MipsInstr;
  cells: Cell[];
  /** Cycles this instruction stalled in ID waiting for an operand. */
  raw: number;
  /** True when this instruction was a taken branch/jump that discarded the next fetch. */
  flush: boolean;
}

export interface PipelineStats {
  instructions: number;
  cycles: number;
  cpi: number;
  raw: number;
  flushes: number;
}

export interface Pipeline {
  rows: PipelineRow[];
  cycles: number;
  stats: PipelineStats;
  forwarding: boolean;
}

export interface PipelineOptions {
  /** With forwarding, results are available right after EX (loads: after MEM) instead of after WB. */
  forwarding: boolean;
}

const LOADS = new Set(["lb", "lbu", "lh", "lhu", "lw", "lwu", "ld"]);
const RESOLVE_IN_ID = new Set(["beq", "bne", "beqz", "bnez", "jr", "jalr"]);

/** Registers an instruction reads (r0 excluded: it never carries a dependency). */
export function readsOf(i: MipsInstr): number[] {
  const out: (number | undefined)[] = [];
  switch (i.format) {
    case "rrr": case "br2": out.push(i.rs, i.rt); break;
    case "rri": case "br1": case "jr": out.push(i.rs); break;
    case "shift": out.push(i.rt); break;
    case "mem": out.push(i.rs, LOADS.has(i.mnemonic) ? undefined : i.rt); break;
    default: break;
  }
  return out.filter((r): r is number => r !== undefined && r !== 0);
}

/** Registers an instruction writes. */
export function writesOf(i: MipsInstr): number[] {
  const out: (number | undefined)[] = [];
  switch (i.format) {
    case "rrr": case "shift": out.push(i.rd); break;
    case "rri": case "ri": out.push(i.rt); break;
    case "mem": if (LOADS.has(i.mnemonic)) out.push(i.rt); break;
    case "jump": if (i.mnemonic === "jal") out.push(31); break;
    case "jr": if (i.mnemonic === "jalr") out.push(31); break;
    default: break;
  }
  return out.filter((r): r is number => r !== undefined && r !== 0);
}

/** Turns the executed instruction stream into the cycle diagram, stalls and statistics. */
export function buildPipeline(steps: MipsStep[], opts: PipelineOptions): Pipeline {
  const writers = new Map<number, { ex: number; load: boolean }>();
  const rows: PipelineRow[] = [];
  let prev: { id: number; ex: number; flush: boolean } | undefined;
  let rawTotal = 0;
  let flushes = 0;

  for (const step of steps) {
    const ins = step.instr;
    const ifC = prev ? Math.max(prev.id, prev.flush ? prev.ex : 0) : 1;
    const idC = Math.max(ifC + 1, prev ? prev.ex : 0);
    const inId = RESOLVE_IN_ID.has(ins.mnemonic);
    let ex = idC + 1;
    for (const r of readsOf(ins)) {
      const w = writers.get(r);
      if (!w) continue;
      let ready: number;
      if (!opts.forwarding) ready = w.ex + 3;
      else if (inId) ready = w.ex + (w.load ? 3 : 2);
      else ready = w.ex + (w.load ? 2 : 1);
      ex = Math.max(ex, ready);
    }

    const cells: Cell[] = [];
    for (let c = ifC; c < idC; c++) cells.push({ cycle: c, stage: "IF" });
    cells.push({ cycle: idC, stage: "ID" });
    for (let c = idC + 1; c < ex; c++) cells.push({ cycle: c, stage: "RAW" });
    cells.push({ cycle: ex, stage: "EX" }, { cycle: ex + 1, stage: "MEM" }, { cycle: ex + 2, stage: "WB" });

    const flush = step.taken === true;
    const raw = ex - idC - 1;
    rawTotal += raw;
    if (flush) flushes++;
    rows.push({ step: step.n, instr: ins, cells, raw, flush });

    const load = LOADS.has(ins.mnemonic);
    for (const r of writesOf(ins)) writers.set(r, { ex, load });
    prev = { id: idC, ex, flush };
  }

  const cycles = rows.length ? rows[rows.length - 1].cells[rows[rows.length - 1].cells.length - 1].cycle : 0;
  const stats: PipelineStats = {
    instructions: rows.length,
    cycles,
    cpi: rows.length ? cycles / rows.length : 0,
    raw: rawTotal,
    flushes,
  };
  return { rows, cycles, stats, forwarding: opts.forwarding };
}
