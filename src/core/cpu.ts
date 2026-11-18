import { CONDITIONAL_JUMPS, isMem, regWidth, widthOf } from "./isa";
import type { Instr, MemOperand, Operand, Program, Reg, Reg16, Width } from "./types";

export class CpuError extends Error {
  ip: number;
  constructor(message: string, ip: number) {
    super(message);
    this.name = "CpuError";
    this.ip = ip;
  }
}

export interface Flags {
  CF: boolean;
  PF: boolean;
  AF: boolean;
  ZF: boolean;
  SF: boolean;
  IF: boolean;
  OF: boolean;
}

export type RegName = Reg16 | "IP";
export type Regs = Record<RegName, number>;

export interface MemWrite {
  addr: number;
  before: number;
  after: number;
  width: Width;
}

export interface IoAccess {
  port: number;
  value: number;
  width: Width;
  dir: "in" | "out";
}

export interface TraceStep {
  /** 1-based step number. */
  step: number;
  /** "irq" = the CPU accepted a hardware interrupt instead of running an instruction. */
  kind: "instr" | "irq";
  /** Address of the instruction executed (or interrupted, for "irq"). */
  ip: number;
  text: string;
  line: number;
  /** State after the step. */
  regs: Regs;
  flags: Flags;
  changedRegs: RegName[];
  changedFlags: (keyof Flags)[];
  memWrites: MemWrite[];
  io: IoAccess[];
  /** Words on the stack after the step, from SP upwards (top first). */
  stack: number[];
  /** Characters printed by INT 7 in this step. */
  output: string;
  /** Device registers after the step (see CpuOptions.deviceState). */
  devices?: Record<string, number>;
  note?: string;
}

export interface Bus {
  in(port: number, width: Width): number;
  out(port: number, width: Width, value: number): void;
}

/** Plain 256-port bus; PIC and other devices replace it. */
export class PlainBus implements Bus {
  ports = new Uint8Array(256);
  in(port: number, width: Width): number {
    return width === 8 ? this.ports[port] : this.ports[port] | (this.ports[(port + 1) & 0xff] << 8);
  }
  out(port: number, width: Width, value: number): void {
    this.ports[port] = value & 0xff;
    if (width === 16) this.ports[(port + 1) & 0xff] = (value >> 8) & 0xff;
  }
}

export interface CpuOptions {
  bus?: Bus;
  /** Asked before each step while IF=1; returns the interrupt to accept, if any. */
  interruptPoll?: () => { vector: number; label: string } | null;
  /** Characters consumed by INT 6. */
  input?: string;
  /** Random integer in [0, max], used by INT 5. */
  random?: (max: number) => number;
  /** Initial stack pointer. */
  sp?: number;
  /** Device registers to include in every trace step (e.g. PIC IRR/ISR/IMR). */
  deviceState?: () => Record<string, number>;
}

// ASSUMPTION: SP starts at 8000h (documented MSX88 convention, not verified here).
const DEFAULT_SP = 0x8000;
const STACK_VIEW_WORDS = 16;
const FLAG_BITS: Record<keyof Flags, number> = {
  CF: 0, PF: 2, AF: 4, ZF: 6, SF: 7, IF: 9, OF: 11,
};
const HALVES: Record<string, [Reg16, "lo" | "hi"]> = {
  AL: ["AX", "lo"], AH: ["AX", "hi"], BL: ["BX", "lo"], BH: ["BX", "hi"],
  CL: ["CX", "lo"], CH: ["CX", "hi"], DL: ["DX", "lo"], DH: ["DX", "hi"],
};
const REG_NAMES: RegName[] = ["AX", "BX", "CX", "DX", "SI", "DI", "BP", "SP", "IP"];
const FLAG_NAMES = Object.keys(FLAG_BITS) as (keyof Flags)[];

const mask = (w: Width): number => (w === 8 ? 0xff : 0xffff);
const signBit = (w: Width): number => (w === 8 ? 0x80 : 0x8000);
const evenParity = (b: number): boolean => {
  let p = 0;
  for (let i = 0; i < 8; i++) p ^= (b >> i) & 1;
  return p === 0;
};

interface Pending {
  memWrites: MemWrite[];
  io: IoAccess[];
  output: string;
  note?: string;
}

export class Cpu {
  readonly mem: Uint8Array;
  regs: Record<Reg16, number>;
  ip: number;
  flags: Flags;
  halted = false;
  stepCount = 0;
  output = "";
  private program: Program;
  private bus: Bus;
  private interruptPoll?: CpuOptions["interruptPoll"];
  private deviceState?: CpuOptions["deviceState"];
  private input: string[];
  private random: (max: number) => number;
  private stackBase: number;
  private cur: Pending = { memWrites: [], io: [], output: "" };

  constructor(program: Program, opts: CpuOptions = {}) {
    this.program = program;
    this.mem = program.memory.slice();
    this.bus = opts.bus ?? new PlainBus();
    this.interruptPoll = opts.interruptPoll;
    this.deviceState = opts.deviceState;
    this.input = [...(opts.input ?? "")];
    this.random = opts.random ?? ((max) => Math.floor(Math.random() * (max + 1)));
    this.stackBase = opts.sp ?? DEFAULT_SP;
    this.regs = { AX: 0, BX: 0, CX: 0, DX: 0, SI: 0, DI: 0, BP: 0, SP: this.stackBase };
    this.ip = program.entry;
    this.flags = { CF: false, PF: false, AF: false, ZF: false, SF: false, IF: false, OF: false };
  }

  // ---- registers, flags, memory -------------------------------------------

  getReg(r: Reg): number {
    if (regWidth(r) === 16) return this.regs[r as Reg16];
    const [full, half] = HALVES[r];
    const v = this.regs[full];
    return half === "lo" ? v & 0xff : v >> 8;
  }

  setReg(r: Reg, value: number): void {
    if (regWidth(r) === 16) {
      this.regs[r as Reg16] = value & 0xffff;
      return;
    }
    const [full, half] = HALVES[r];
    const v = this.regs[full];
    this.regs[full] = half === "lo" ? (v & 0xff00) | (value & 0xff) : (v & 0x00ff) | ((value & 0xff) << 8);
  }

  flagsWord(): number {
    return FLAG_NAMES.reduce((w, f) => (this.flags[f] ? w | (1 << FLAG_BITS[f]) : w), 0);
  }

  private setFlagsWord(w: number): void {
    for (const f of FLAG_NAMES) this.flags[f] = (w & (1 << FLAG_BITS[f])) !== 0;
  }

  read(addr: number, w: Width): number {
    const a = addr & 0xffff;
    return w === 8 ? this.mem[a] : this.mem[a] | (this.mem[(a + 1) & 0xffff] << 8);
  }

  private write(addr: number, w: Width, value: number): void {
    const a = addr & 0xffff;
    const before = this.read(a, w);
    this.mem[a] = value & 0xff;
    if (w === 16) this.mem[(a + 1) & 0xffff] = (value >> 8) & 0xff;
    this.cur.memWrites.push({ addr: a, before, after: value & mask(w), width: w });
  }

  private push16(v: number): void {
    this.regs.SP = (this.regs.SP - 2) & 0xffff;
    this.write(this.regs.SP, 16, v);
  }

  private pop16(): number {
    const v = this.read(this.regs.SP, 16);
    this.regs.SP = (this.regs.SP + 2) & 0xffff;
    return v;
  }

  private addr(o: MemOperand): number {
    return o.kind === "mem" ? o.addr : this.regs[o.base];
  }

  private readOp(o: Operand, w: Width): number {
    if (o.kind === "reg") return this.getReg(o.reg);
    if (o.kind === "imm") return o.value & mask(w);
    return this.read(this.addr(o), w);
  }

  private writeOp(o: Operand, w: Width, v: number): void {
    if (o.kind === "reg") this.setReg(o.reg, v);
    else if (isMem(o)) this.write(this.addr(o), w, v);
    else throw new CpuError("Cannot write to an immediate", this.ip);
  }

  // ---- ALU ----------------------------------------------------------------

  private setSZP(r: number, w: Width): void {
    this.flags.ZF = r === 0;
    this.flags.SF = (r & signBit(w)) !== 0;
    this.flags.PF = evenParity(r & 0xff);
  }

  private alu(op: string, a: number, b: number, w: Width): number {
    const m = mask(w);
    const s = signBit(w);
    const f = this.flags;
    let r: number;
    switch (op) {
      case "ADD":
      case "ADC": {
        const full = a + b + (op === "ADC" && f.CF ? 1 : 0);
        r = full & m;
        f.CF = full > m;
        f.OF = ((a ^ r) & (b ^ r) & s) !== 0;
        f.AF = ((a ^ b ^ r) & 0x10) !== 0;
        break;
      }
      case "SUB":
      case "SBB":
      case "CMP": {
        const full = a - b - (op === "SBB" && f.CF ? 1 : 0);
        r = full & m;
        f.CF = full < 0;
        f.OF = ((a ^ b) & (a ^ r) & s) !== 0;
        f.AF = ((a ^ b ^ r) & 0x10) !== 0;
        break;
      }
      case "AND":
      case "TEST":
        r = a & b;
        f.CF = f.OF = f.AF = false;
        break;
      case "OR":
        r = a | b;
        f.CF = f.OF = f.AF = false;
        break;
      case "XOR":
        r = a ^ b;
        f.CF = f.OF = f.AF = false;
        break;
      default:
        throw new CpuError(`Unsupported ALU operation ${op}`, this.ip);
    }
    this.setSZP(r, w);
    return r;
  }

  private shift(op: "SHL" | "SHR", a: number, count: number, w: Width): number {
    const m = mask(w);
    const s = signBit(w);
    if (count === 0) return a;
    let r = a;
    for (let i = 0; i < count; i++) {
      if (op === "SHL") {
        this.flags.CF = (r & s) !== 0;
        r = (r << 1) & m;
      } else {
        this.flags.CF = (r & 1) !== 0;
        r >>= 1;
      }
    }
    // OF is only defined for 1-bit shifts.
    this.flags.OF = op === "SHL" ? ((r & s) !== 0) !== this.flags.CF : (a & s) !== 0;
    this.setSZP(r, w);
    return r;
  }

  private condition(mn: string): boolean {
    const { CF, ZF, SF, OF } = this.flags;
    switch (mn) {
      case "JZ": case "JE": return ZF;
      case "JNZ": case "JNE": return !ZF;
      case "JC": case "JB": return CF;
      case "JNC": case "JAE": return !CF;
      case "JS": return SF;
      case "JNS": return !SF;
      case "JA": return !CF && !ZF;
      case "JBE": return CF || ZF;
      case "JG": return !ZF && SF === OF;
      case "JGE": return SF === OF;
      case "JL": return SF !== OF;
      case "JLE": return ZF || SF !== OF;
      default: throw new CpuError(`Unsupported jump ${mn}`, this.ip);
    }
  }

  // ---- interrupts ---------------------------------------------------------

  /** CPU response to an interrupt: push FLAGS, IF=0, push IP, load handler from the vector table. */
  private enterInterrupt(vector: number, returnIp: number): void {
    this.push16(this.flagsWord());
    this.flags.IF = false;
    this.push16(returnIp);
    // ASSUMPTION: a vector table entry holds only the handler offset (CS is not modelled).
    this.ip = this.read(4 * vector, 16);
  }

  private systemCall(n: number): boolean {
    switch (n) {
      case 0:
        this.halted = true;
        this.cur.note = "INT 0: end of program";
        return true;
      case 3:
        this.cur.note = "INT 3: breakpoint";
        return true;
      case 5:
        this.setReg("AL", this.random(this.getReg("AL")));
        this.cur.note = "INT 5: random number in AL";
        return true;
      case 6: {
        // ASSUMPTION: INT 6 stores the character read at the address in BX.
        const ch = this.input.shift();
        if (ch === undefined) throw new CpuError("INT 6: no input left", this.ip);
        this.write(this.regs.BX, 8, ch.charCodeAt(0));
        this.cur.note = `INT 6: read '${ch}'`;
        return true;
      }
      case 7: {
        // ASSUMPTION: INT 7 prints AL characters starting at the address in BX.
        const count = this.getReg("AL");
        let text = "";
        for (let i = 0; i < count; i++) text += String.fromCharCode(this.read(this.regs.BX + i, 8));
        this.cur.output += text;
        this.output += text;
        this.cur.note = `INT 7: print ${count} char(s)`;
        return true;
      }
      default:
        return false;
    }
  }

  // ---- execution ----------------------------------------------------------

  private exec(ins: Instr): void {
    const mn = ins.mnemonic;
    const [a, b] = ins.operands;
    const wd = (): Width => widthOf(a) ?? widthOf(b) ?? 16;

    if (CONDITIONAL_JUMPS.has(mn)) {
      if (this.condition(mn)) this.ip = (a as { value: number }).value & 0xffff;
      return;
    }
    switch (mn) {
      case "NOP": return;
      case "HLT": this.halted = true; return;
      case "CLI": this.flags.IF = false; return;
      case "STI": this.flags.IF = true; return;
      case "CLC": this.flags.CF = false; return;
      case "STC": this.flags.CF = true; return;
      case "PUSHF": this.push16(this.flagsWord()); return;
      case "POPF": this.setFlagsWord(this.pop16()); return;
      case "RET": this.ip = this.pop16(); return;
      case "IRET":
        this.ip = this.pop16();
        this.setFlagsWord(this.pop16());
        return;
      case "JMP": this.ip = (a as { value: number }).value & 0xffff; return;
      case "CALL":
        this.push16(this.ip);
        this.ip = (a as { value: number }).value & 0xffff;
        return;
      case "LOOP":
        this.regs.CX = (this.regs.CX - 1) & 0xffff;
        if (this.regs.CX !== 0) this.ip = (a as { value: number }).value & 0xffff;
        return;
      case "PUSH": this.push16(this.readOp(a, 16)); return;
      case "POP": this.writeOp(a, 16, this.pop16()); return;
      case "MOV": {
        const w = wd();
        this.writeOp(a, w, this.readOp(b, w));
        return;
      }
      case "ADD": case "ADC": case "SUB": case "SBB": case "CMP":
      case "AND": case "OR": case "XOR": case "TEST": {
        const w = wd();
        const r = this.alu(mn, this.readOp(a, w), this.readOp(b, w), w);
        if (mn !== "CMP" && mn !== "TEST") this.writeOp(a, w, r);
        return;
      }
      case "INC": case "DEC": {
        const w = widthOf(a) ?? 16;
        const cf = this.flags.CF; // INC/DEC leave CF untouched
        const r = this.alu(mn === "INC" ? "ADD" : "SUB", this.readOp(a, w), 1, w);
        this.flags.CF = cf;
        this.writeOp(a, w, r);
        return;
      }
      case "NOT": {
        const w = widthOf(a) ?? 16;
        this.writeOp(a, w, ~this.readOp(a, w) & mask(w));
        return;
      }
      case "NEG": {
        const w = widthOf(a) ?? 16;
        const x = this.readOp(a, w);
        this.writeOp(a, w, this.alu("SUB", 0, x, w));
        this.flags.CF = x !== 0;
        return;
      }
      case "SHL": case "SHR": {
        const w = widthOf(a) ?? 16;
        const count = b.kind === "imm" ? b.value : this.getReg("CL");
        this.writeOp(a, w, this.shift(mn, this.readOp(a, w), count, w));
        return;
      }
      case "MUL": {
        const w = widthOf(a) ?? 16;
        if (w === 8) {
          this.regs.AX = (this.getReg("AL") * this.readOp(a, 8)) & 0xffff;
          this.flags.CF = this.flags.OF = this.getReg("AH") !== 0;
        } else {
          const p = this.regs.AX * this.readOp(a, 16);
          this.regs.AX = p & 0xffff;
          this.regs.DX = (p >>> 16) & 0xffff;
          this.flags.CF = this.flags.OF = this.regs.DX !== 0;
        }
        return;
      }
      case "DIV": {
        const w = widthOf(a) ?? 16;
        const d = this.readOp(a, w);
        if (d === 0) throw new CpuError("Divide error: division by zero", this.ip);
        const n = w === 8 ? this.regs.AX : this.regs.DX * 0x10000 + this.regs.AX;
        const q = Math.floor(n / d);
        if (q > mask(w)) throw new CpuError("Divide error: quotient overflow", this.ip);
        if (w === 8) {
          this.setReg("AL", q);
          this.setReg("AH", n % d);
        } else {
          this.regs.AX = q;
          this.regs.DX = n % d;
        }
        return;
      }
      case "IN": {
        const w = widthOf(a)!;
        const port = b.kind === "imm" ? b.value : this.regs.DX;
        const v = this.bus.in(port, w);
        this.setReg((a as { reg: Reg }).reg, v);
        this.cur.io.push({ port, value: v, width: w, dir: "in" });
        return;
      }
      case "OUT": {
        const w = widthOf(b)!;
        const port = a.kind === "imm" ? a.value : this.regs.DX;
        const v = this.readOp(b, w);
        this.bus.out(port, w, v);
        this.cur.io.push({ port, value: v, width: w, dir: "out" });
        return;
      }
      case "INT": {
        const n = (a as { value: number }).value;
        if (!this.systemCall(n)) {
          this.enterInterrupt(n, this.ip);
          this.cur.note = `INT ${n}: jump to handler at ${this.ip.toString(16).toUpperCase().padStart(4, "0")}H`;
        }
        return;
      }
      default:
        throw new CpuError(`Unsupported instruction ${mn}`, this.ip);
    }
  }

  private snapshot(): { regs: Regs; flags: Flags } {
    return { regs: { ...this.regs, IP: this.ip }, flags: { ...this.flags } };
  }

  private stackView(): number[] {
    const words: number[] = [];
    for (let sp = this.regs.SP; sp < this.stackBase && words.length < STACK_VIEW_WORDS; sp += 2) {
      words.push(this.read(sp, 16));
    }
    return words;
  }

  /** Runs one instruction (or accepts one pending hardware interrupt) and returns its trace step. */
  step(): TraceStep {
    if (this.halted) throw new CpuError("CPU is halted", this.ip);
    const before = this.snapshot();
    this.cur = { memWrites: [], io: [], output: "" };
    const startIp = this.ip;
    let kind: TraceStep["kind"] = "instr";
    let text: string;
    let line = 0;

    const irq = this.flags.IF ? (this.interruptPoll?.() ?? null) : null;
    if (irq) {
      kind = "irq";
      text = irq.label;
      this.enterInterrupt(irq.vector, this.ip);
    } else {
      const ins = this.program.instrs.get(this.ip);
      if (!ins) {
        throw new CpuError(`No instruction at ${this.ip.toString(16).toUpperCase().padStart(4, "0")}H`, this.ip);
      }
      text = ins.text;
      line = ins.line;
      this.ip = (ins.addr + ins.size) & 0xffff;
      this.exec(ins);
    }
    this.stepCount++;

    const after = this.snapshot();
    return {
      step: this.stepCount,
      kind,
      ip: startIp,
      text,
      line,
      regs: after.regs,
      flags: after.flags,
      changedRegs: REG_NAMES.filter((r) => before.regs[r] !== after.regs[r]),
      changedFlags: FLAG_NAMES.filter((f) => before.flags[f] !== after.flags[f]),
      memWrites: this.cur.memWrites,
      io: this.cur.io,
      stack: this.stackView(),
      output: this.cur.output,
      devices: this.deviceState?.(),
      note: this.cur.note,
    };
  }
}

export interface RunResult {
  steps: TraceStep[];
  reason: "halted" | "max-steps" | "error";
  error?: string;
}

export function run(cpu: Cpu, maxSteps = 10_000): RunResult {
  const steps: TraceStep[] = [];
  while (!cpu.halted) {
    if (steps.length >= maxSteps) return { steps, reason: "max-steps" };
    try {
      steps.push(cpu.step());
    } catch (e) {
      if (e instanceof CpuError) return { steps, reason: "error", error: e.message };
      throw e;
    }
  }
  return { steps, reason: "halted" };
}
