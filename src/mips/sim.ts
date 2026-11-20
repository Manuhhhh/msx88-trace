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
  lo?: RegWrite;
  hi?: RegWrite;
  /** For branches and jumps: whether control left the sequential path. */
  taken?: boolean;
  /** Text this step printed (syscall). */
  output?: string;
}

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
  lo = 0n;
  hi = 0n;
  /** Index of the next instruction. */
  pc: number;
  halted = false;
  output = "";
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
    // ASSUMPTION: EduMIPS64 raises a "misaligned memory access" error for unaligned loads/stores.
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

  /** ASSUMPTION: syscall 5 follows EduMIPS64's printf: r14 points to a block of 64-bit params [format, args...]; r1 gets the length printed. */
  private printf(ins: MipsInstr, step: MipsStep): void {
    const block = this.regs[14];
    const param = (i: number): bigint => {
      const at = this.access(ins, block + BigInt(8 * i), 8);
      step.mem.push({ kind: "read", addr: at, size: 8, after: BigInt.asIntN(64, loadBytes(this.mem, at, 8)) });
      return BigInt.asIntN(64, loadBytes(this.mem, at, 8));
    };
    const fmt = this.cstring(ins, param(0));
    let next = 1;
    const out = fmt.replace(/%([disc%])/g, (_, c: string) => {
      if (c === "%") return "%";
      const v = param(next++);
      if (c === "s") return this.cstring(ins, v);
      if (c === "c") return String.fromCharCode(Number(v & 0xffn));
      return String(v);
    });
    step.output = out;
    this.output += out;
    this.write(step, 1, BigInt(out.length));
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
      case "nor": rd(~(rs | rt)); break;
      case "slt": rd(rs < rt ? 1n : 0n); break;
      case "sltu": rd(u64(rs) < u64(rt) ? 1n : 0n); break;
      case "dsllv": rd(rt << (u64(rs) & 63n)); break;
      case "dsrlv": rd(u64(rt) >> (u64(rs) & 63n)); break;
      case "dsrav": rd(rt >> (u64(rs) & 63n)); break;
      case "dmul": case "dmulu": rd(rs * rt); break;
      case "daddi": rtw(checked(rs + simm)); break;
      case "daddiu": rtw(rs + simm); break;
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
        step.lo = { reg: -1, before: this.lo, after: s64(a / b) };
        step.hi = { reg: -1, before: this.hi, after: s64(a % b) };
        this.lo = step.lo.after;
        this.hi = step.hi.after;
        break;
      }
      case "mflo": rd(this.lo); break;
      case "mfhi": rd(this.hi); break;
      case "beq": branch(rs === rt); break;
      case "bne": branch(rs !== rt); break;
      case "beqz": branch(rs === 0n); break;
      case "bnez": branch(rs !== 0n); break;
      case "j": case "b": branch(true); break;
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
      case "syscall":
        if (ins.imm === 0n) this.halted = true;
        else if (ins.imm === 5n) this.printf(ins, step);
        else this.fail(ins, `Unsupported syscall ${ins.imm}`);
        break;
      default: {
        const ld = LOADS[ins.mnemonic];
        const st = STORES[ins.mnemonic];
        const size = ld?.size ?? st;
        const at = this.access(ins, rs + simm, size);
        if (ld) {
          const raw = loadBytes(this.mem, at, size);
          const v = ld.signed ? BigInt.asIntN(size * 8, raw) : raw;
          step.mem.push({ kind: "read", addr: at, size, after: v });
          rtw(v);
        } else {
          const before = loadBytes(this.mem, at, size);
          storeBytes(this.mem, at, size, rt);
          step.mem.push({ kind: "write", addr: at, size, before, after: loadBytes(this.mem, at, size) });
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
