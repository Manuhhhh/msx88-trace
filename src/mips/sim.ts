import { assembleMips, DATA_SIZE } from "./assembler";
import type { MipsInstr, MipsProgram } from "./assembler";
import { loadBytes, storeBytes } from "./memory";

export class MipsError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`Line ${line}: ${message}`);
    this.name = "MipsError";
    this.line = line;
  }
}

export interface RegWrite {
  reg: number;
  before: bigint;
  after: bigint;
}

export interface MemAccess {
  kind: "read" | "write";
  addr: number;
  size: number;
  /** Value held before a write (absent for reads). */
  before?: bigint;
  /** Value read, or value stored. */
  after: bigint;
}

export interface MipsStep {
  /** 1-based position in the executed stream. */
  n: number;
  instr: MipsInstr;
  regs: RegWrite[];
  mem: MemAccess[];
  /** For branches and jumps: whether control left the sequential path. */
  taken?: boolean;
  /** Text this step printed through the memory-mapped output. */
  output?: string;
  /** True when this step cleared the terminal (CONTROL = 6). */
  clear?: boolean;
}

/** WinMIPS64's memory-mapped I/O window (pipeline.cpp MMIO): CONTROL at 0x10000, DATA at 0x10008. */
export const MMIO = 0x10000;
const MMIO_SIZE = 16;

const MASK = (1n << 64n) - 1n;
const s64 = (v: bigint): bigint => BigInt.asIntN(64, v);
const u64 = (v: bigint): bigint => v & MASK;

const LOADS: Record<string, { size: number; signed: boolean }> = {
  lb: { size: 1, signed: true }, lbu: { size: 1, signed: false },
  lh: { size: 2, signed: true }, lhu: { size: 2, signed: false },
  lw: { size: 4, signed: true }, lwu: { size: 4, signed: false },
  ld: { size: 8, signed: true },
};
const STORES: Record<string, number> = { sb: 1, sh: 2, sw: 4, sd: 8 };

export class MipsCpu {
  /** Signed 64-bit register values; r0 is always 0. */
  regs: bigint[] = Array<bigint>(32).fill(0n);
  /** Index of the next instruction. */
  pc: number;
  halted = false;
  output = "";
  /** The CONTROL/DATA registers behind the memory-mapped window. */
  readonly mm = new Uint8Array(MMIO_SIZE);
  readonly mem: Uint8Array;
  readonly program: MipsProgram;

  constructor(program: MipsProgram) {
    this.program = program;
    this.mem = program.data.slice();
    this.pc = program.entry;
  }

  private fail(ins: MipsInstr, msg: string): never {
    throw new MipsError(msg, ins.line);
  }

  private access(ins: MipsInstr, addr: bigint, size: number): number {
    if (addr < 0n || addr + BigInt(size) > BigInt(DATA_SIZE)) {
      this.fail(ins, `Address ${addr} is outside data memory`);
    }
    const a = Number(addr);
    // ASSUMPTION: WinMIPS64 reports "misaligned memory load/store" and skips the access but keeps running; here the run stops.
    if (a % size !== 0) this.fail(ins, `Misaligned memory access at address ${a} (${size} bytes)`);
    return a;
  }

  private cstring(ins: MipsInstr, addr: bigint): string {
    let s = "";
    for (let a = addr; ; a++) {
      const at = this.access(ins, a, 1);
      if (this.mem[at] === 0) return s;
      s += String.fromCharCode(this.mem[at]);
    }
  }

  /**
   * WinMIPS64 polls CONTROL after every cycle (update_io): a nonzero CONTROL byte is acted on and cleared.
   * 1/2 print DATA as an unsigned/signed integer plus a newline, 3 as a double, 4 the string at address DATA,
   * 6 clears the terminal. ASSUMPTION: graphics (5, 7) and keyboard input (8, 9) are unsupported and stop the run.
   */
  private updateIo(ins: MipsInstr, step: MipsStep): void {
    if (this.mm[0] === 0) return;
    const control = Number(loadBytes(this.mm, 0, 4));
    const data = loadBytes(this.mm, 8, 8);
    let out = "";
    switch (control) {
      case 1: out = `${data}\n`; break;
      case 2: out = `${BigInt.asIntN(64, data)}\n`; break;
      case 3: {
        const view = new DataView(new ArrayBuffer(8));
        view.setBigUint64(0, data);
        out = `${view.getFloat64(0).toFixed(6)}\n`;
        break;
      }
      case 4: out = this.cstring(ins, data); break;
      case 6:
        this.output = "";
        step.clear = true;
        break;
      case 5: case 7: this.fail(ins, `CONTROL ${control} (graphics) is not supported`); break;
      case 8: case 9: this.fail(ins, `CONTROL ${control} (keyboard input) is not supported`); break;
      default: break;
    }
    this.mm[0] = 0;
    if (out !== "") {
      step.output = (step.output ?? "") + out;
      this.output += out;
    }
  }

  private write(step: MipsStep, reg: number, value: bigint): void {
    if (reg === 0) return;
    const after = s64(value);
    step.regs.push({ reg, before: this.regs[reg], after });
    this.regs[reg] = after;
  }

  step(): MipsStep {
    const ins = this.program.instrs[this.pc];
    if (!ins) {
      this.halted = true;
      throw new MipsError("Execution ran past the last instruction", 0);
    }
    const step: MipsStep = { n: 0, instr: ins, regs: [], mem: [] };
    const rs = ins.rs === undefined ? 0n : this.regs[ins.rs];
    const rt = ins.rt === undefined ? 0n : this.regs[ins.rt];
    const simm = BigInt.asIntN(16, ins.imm);
    const zimm = BigInt.asUintN(16, ins.imm);
    let next = this.pc + 1;
    const rd = (v: bigint): void => this.write(step, ins.rd!, v);
    const rtw = (v: bigint): void => this.write(step, ins.rt!, v);
    // ASSUMPTION: dadd/dsub/daddi raise an "Integer overflow" error like MIPS64 (the *u forms wrap).
    const checked = (v: bigint): bigint => {
      if (v !== s64(v)) this.fail(ins, "Integer overflow");
      return v;
    };
    const branch = (cond: boolean): void => {
      step.taken = cond;
      if (cond) next = ins.target!;
    };

    switch (ins.mnemonic) {
      case "dadd": rd(checked(rs + rt)); break;
      case "daddu": rd(rs + rt); break;
      case "dsub": rd(checked(rs - rt)); break;
      case "dsubu": rd(rs - rt); break;
      case "and": rd(rs & rt); break;
      case "or": rd(rs | rt); break;
      case "xor": rd(rs ^ rt); break;
      case "slt": rd(rs < rt ? 1n : 0n); break;
      case "sltu": rd(u64(rs) < u64(rt) ? 1n : 0n); break;
      case "dsllv": rd(rt << (u64(rs) & 63n)); break;
      case "dsrlv": rd(u64(rt) >> (u64(rs) & 63n)); break;
      case "dsrav": rd(rt >> (u64(rs) & 63n)); break;
      case "dmul": case "dmulu": rd(rs * rt); break;
      case "daddi": rtw(checked(rs + simm)); break;
      case "daddui": rtw(rs + simm); break;
      case "andi": rtw(rs & zimm); break;
      case "ori": rtw(rs | zimm); break;
      case "xori": rtw(rs ^ zimm); break;
      case "slti": rtw(rs < simm ? 1n : 0n); break;
      case "sltiu": rtw(u64(rs) < u64(simm) ? 1n : 0n); break;
      case "lui": rtw(BigInt.asIntN(32, simm << 16n)); break;
      case "dsll": rd(rt << ins.imm); break;
      case "dsrl": rd(u64(rt) >> ins.imm); break;
      case "dsra": rd(rt >> ins.imm); break;
      case "ddiv": case "ddivu": {
        const signed = ins.mnemonic === "ddiv";
        const a = signed ? rs : u64(rs);
        const b = signed ? rt : u64(rt);
        if (b === 0n) this.fail(ins, "Division by zero");
        rd(a / b);
        break;
      }
      case "beq": branch(rs === rt); break;
      case "bne": branch(rs !== rt); break;
      case "beqz": branch(rs === 0n); break;
      case "bnez": branch(rs !== 0n); break;
      case "j": branch(true); break;
      case "jal":
        this.write(step, 31, BigInt(ins.addr + 4));
        branch(true);
        break;
      case "jr": case "jalr": {
        if (ins.mnemonic === "jalr") this.write(step, 31, BigInt(ins.addr + 4));
        if (rs < 0n || rs % 4n !== 0n || rs / 4n > BigInt(this.program.instrs.length)) {
          this.fail(ins, `Invalid jump address ${rs}`);
        }
        next = Number(rs / 4n);
        step.taken = true;
        break;
      }
      case "nop": break;
      case "halt": this.halted = true; break;
      default: {
        const ld = LOADS[ins.mnemonic];
        const st = STORES[ins.mnemonic];
        const size = ld?.size ?? st;
        const addr = rs + simm;
        const io = addr >= BigInt(MMIO) && addr + BigInt(size) <= BigInt(MMIO + MMIO_SIZE);
        const at = io ? Number(addr) - MMIO : this.access(ins, addr, size);
        if (io && at % size !== 0) this.fail(ins, `Misaligned memory access at address ${Number(addr)} (${size} bytes)`);
        const mem = io ? this.mm : this.mem;
        if (ld) {
          const raw = loadBytes(mem, at, size);
          const v = ld.signed ? BigInt.asIntN(size * 8, raw) : raw;
          if (!io) step.mem.push({ kind: "read", addr: at, size, after: v });
          rtw(v);
        } else {
          const before = loadBytes(mem, at, size);
          storeBytes(mem, at, size, rt);
          if (!io) step.mem.push({ kind: "write", addr: at, size, before, after: loadBytes(mem, at, size) });
          else this.updateIo(ins, step);
        }
      }
    }
    this.pc = next;
    if (!this.halted && this.pc >= this.program.instrs.length) this.halted = true;
    return step;
  }
}

export interface MipsSimOptions {
  /** Stop with reason "max-steps" after this many steps. Infinity never stops by count. */
  maxSteps?: number;
}

export interface MipsSimResult {
  program: MipsProgram;
  steps: MipsStep[];
  reason: "halted" | "max-steps" | "error" | "running" | "stopped";
  error?: string;
  output: string;
  cpu: MipsCpu;
}

/** A run that can be advanced a few steps at a time and stopped. `steps` is the live list: it grows as the run advances. */
export class MipsSimulation {
  readonly program: MipsProgram;
  readonly cpu: MipsCpu;
  readonly steps: MipsStep[] = [];
  /** "running" while it can still advance; otherwise how it ended. */
  status: MipsSimResult["reason"] = "running";
  error?: string;
  private readonly maxSteps: number;

  /** Assembles `source`; AsmError propagates. */
  constructor(source: string, opts: MipsSimOptions = {}) {
    this.program = assembleMips(source);
    this.cpu = new MipsCpu(this.program);
    this.maxSteps = opts.maxSteps ?? 10_000;
  }

  /** Runs up to `count` more steps, stopping early when the run ends. */
  advance(count = Infinity): void {
    for (let i = 0; i < count && this.status === "running"; i++) {
      if (this.cpu.halted) {
        this.status = "halted";
        break;
      }
      if (this.steps.length >= this.maxSteps) {
        this.status = "max-steps";
        break;
      }
      try {
        const s = this.cpu.step();
        s.n = this.steps.length + 1;
        this.steps.push(s);
      } catch (e) {
        if (!(e instanceof MipsError)) throw e;
        this.status = "error";
        this.error = e.message;
      }
    }
    if (this.status === "running" && this.cpu.halted) this.status = "halted";
  }

  /** Ends a run that was still going. */
  stop(): void {
    if (this.status === "running") this.status = "stopped";
  }

  /** The run so far; `steps` is shared with the simulation. */
  result(): MipsSimResult {
    return { program: this.program, steps: this.steps, reason: this.status, error: this.error, output: this.cpu.output, cpu: this.cpu };
  }
}

/** Assembles `source` and runs it, returning the executed stream. AsmError propagates. */
export function simulateMips(source: string, opts: MipsSimOptions = {}): MipsSimResult {
  const sim = new MipsSimulation(source, opts);
  sim.advance();
  return sim.result();
}
