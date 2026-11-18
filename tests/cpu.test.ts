import { describe, expect, it } from "vitest";
import { assemble } from "../src/core/assembler";
import { Cpu, PlainBus, run } from "../src/core/cpu";
import type { CpuOptions } from "../src/core/cpu";

const load = (src: string, opts?: CpuOptions) => new Cpu(assemble(src), opts);

describe("ALU and flags", () => {
  it("traces register changes and flags per step", () => {
    const cpu = load("MOV AX, 5\nADD AX, 3\nHLT\nEND");
    const { steps, reason } = run(cpu);
    expect(reason).toBe("halted");
    expect(steps.map((s) => s.text)).toEqual(["MOV AX, 5", "ADD AX, 3", "HLT"]);
    expect(steps[0].changedRegs).toEqual(["AX", "IP"]);
    expect(steps[1].regs.AX).toBe(8);
    expect(steps[1].flags.ZF).toBe(false);
  });

  it("CMP sets ZF on equal and CF+SF when below, without writing", () => {
    const cpu = load("MOV AL, 3\nCMP AL, 3\nCMP AL, 5\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[1].flags).toMatchObject({ ZF: true, CF: false });
    expect(steps[2].flags).toMatchObject({ ZF: false, CF: true, SF: true });
    expect(steps[2].regs.AX & 0xff).toBe(3);
  });

  it("detects signed overflow on ADD and unsigned carry on 8-bit wrap", () => {
    const cpu = load("MOV AL, 7FH\nADD AL, 1\nMOV BL, 0FFH\nADD BL, 1\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[1].flags).toMatchObject({ OF: true, SF: true, CF: false });
    expect(steps[3].flags).toMatchObject({ CF: true, ZF: true, OF: false });
  });

  it("INC leaves CF untouched", () => {
    const cpu = load("STC\nMOV AL, 0FFH\nINC AL\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[2].regs.AX & 0xff).toBe(0);
    expect(steps[2].flags).toMatchObject({ ZF: true, CF: true });
  });

  it("handles 8-bit register halves independently", () => {
    const cpu = load("MOV AX, 1234H\nMOV AH, 0FFH\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[1].regs.AX).toBe(0xff34);
  });

  it("MUL, DIV and shifts", () => {
    const cpu = load("MOV AL, 10\nMOV BL, 7\nMUL BL\nMOV BL, 4\nDIV BL\nSHL AL, 1\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[2].regs.AX).toBe(70);
    expect(steps[4].regs.AX).toBe((2 << 8) | 17); // AH = remainder, AL = quotient
    expect(steps[5].regs.AX & 0xff).toBe(34);
  });

  it("reports divide by zero as a run error", () => {
    const cpu = load("MOV AX, 5\nMOV BL, 0\nDIV BL\nHLT\nEND");
    const r = run(cpu);
    expect(r.reason).toBe("error");
    expect(r.error).toContain("division by zero");
    expect(r.steps).toHaveLength(2);
  });
});

describe("memory, stack and control flow", () => {
  it("records memory writes with before/after values", () => {
    const cpu = load("ORG 1000H\nCONT DB 4\nORG 2000H\nMOV CONT, 9\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[0].memWrites).toEqual([{ addr: 0x1000, before: 4, after: 9, width: 8 }]);
  });

  it("PUSH/POP move SP and expose the stack top first", () => {
    const cpu = load("MOV AX, 1111H\nMOV BX, 2222H\nPUSH AX\nPUSH BX\nPOP CX\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps[3].regs.SP).toBe(0x7ffc);
    expect(steps[3].stack).toEqual([0x2222, 0x1111]);
    expect(steps[4].regs.CX).toBe(0x2222);
    expect(steps[4].stack).toEqual([0x1111]);
  });

  it("CALL/RET return to the next instruction", () => {
    const cpu = load("CALL SUB1\nHLT\nSUB1: MOV AX, 7\nRET\nEND");
    const { steps } = run(cpu);
    expect(steps.map((s) => s.text)).toEqual(["CALL SUB1", "MOV AX, 7", "RET", "HLT"]);
    expect(steps[3].regs.AX).toBe(7);
  });

  it("loops with CMP/JNZ and with LOOP", () => {
    const cpu = load("MOV CX, 3\nMOV AX, 0\nL: ADD AX, 2\nLOOP L\nHLT\nEND");
    const { steps } = run(cpu);
    expect(steps.filter((s) => s.text === "ADD AX, 2")).toHaveLength(3);
    expect(steps.at(-1)!.regs.AX).toBe(6);
  });

  it("stops with an error when IP lands on no instruction, and caps runaway programs", () => {
    expect(run(load("JMP 5000H\nEND")).error).toContain("No instruction at 5000H");
    expect(run(load("L: JMP L\nEND"), 50).reason).toBe("max-steps");
  });
});

describe("I/O and system calls", () => {
  it("IN/OUT go through the bus and are traced", () => {
    const bus = new PlainBus();
    bus.ports[0x30] = 0x5a;
    const cpu = load("IN AL, 30H\nOUT 31H, AL\nHLT\nEND", { bus });
    const { steps } = run(cpu);
    expect(steps[0].io).toEqual([{ port: 0x30, value: 0x5a, width: 8, dir: "in" }]);
    expect(bus.ports[0x31]).toBe(0x5a);
  });

  it("INT 7 prints, INT 6 reads, INT 5 uses the injected RNG, INT 0 ends", () => {
    const src = `
      ORG 1000H
MSG   DB 'Hola'
KEY   DB 0
      ORG 2000H
      MOV BX, OFFSET MSG
      MOV AL, 4
      INT 7
      MOV BX, OFFSET KEY
      INT 6
      MOV AL, 9
      INT 5
      INT 0
      END`;
    const cpu = load(src, { input: "x", random: (max) => max - 1 });
    const { steps, reason } = run(cpu);
    expect(reason).toBe("halted");
    expect(cpu.output).toBe("Hola");
    expect(steps[2].output).toBe("Hola");
    expect(cpu.read(0x1004, 8)).toBe("x".charCodeAt(0));
    expect(steps[6].regs.AX & 0xff).toBe(8);
  });

  it("a user-installed software interrupt jumps to its handler and IRET returns", () => {
    const src = `
      ORG 40
V10   DW HAND
      ORG 2000H
      STI
      INT 10
      HLT
      ORG 3000H
HAND: MOV AX, 77
      IRET
      END`;
    const cpu = load(src);
    const { steps } = run(cpu);
    expect(steps.map((s) => s.text)).toEqual(["STI", "INT 10", "MOV AX, 77", "IRET", "HLT"]);
    expect(steps[1].regs.IP).toBe(0x3000);
    expect(steps[1].flags.IF).toBe(false);
    // stack: return IP on top, saved FLAGS (IF=1) below
    expect(steps[1].stack).toEqual([0x2003, 0x0200]);
    expect(steps[3].flags.IF).toBe(true);
    expect(steps[3].regs.SP).toBe(0x8000);
  });
});

describe("hardware interrupt hook", () => {
  it("accepts an interrupt only while IF=1, pushing FLAGS and IP", () => {
    const src = `
      ORG 40
V10   DW HAND
      ORG 2000H
      NOP
      STI
      NOP
      HLT
      ORG 3000H
HAND: IRET
      END`;
    let pending = true;
    const cpu = load(src, {
      interruptPoll: () => {
        if (!pending) return null;
        pending = false;
        return { vector: 10, label: "IRQ0 -> INT 10" };
      },
    });
    const { steps } = run(cpu);
    // The first NOP runs with IF=0, so the request waits; it is accepted right after STI.
    expect(steps.map((s) => [s.kind, s.text])).toEqual([
      ["instr", "NOP"],
      ["instr", "STI"],
      ["irq", "IRQ0 -> INT 10"],
      ["instr", "IRET"],
      ["instr", "NOP"],
      ["instr", "HLT"],
    ]);
    expect(steps[2]).toMatchObject({ ip: 0x2002 });
    expect(steps[2].regs.IP).toBe(0x3000);
    expect(steps[2].stack).toEqual([0x2002, 0x0200]);
  });
});
