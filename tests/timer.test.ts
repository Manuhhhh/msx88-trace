import { describe, expect, it } from "vitest";
import { simulate } from "../src/core/simulate";
import { Timer } from "../src/core/timer";

// Every 2 seconds the timer handler runs; F10 ends the program.
const PROGRAM = (comp: number) => `
EOI     EQU 20H
IMR     EQU 21H
INT0    EQU 24H
INT1    EQU 25H
CONT    EQU 10H
COMP    EQU 11H

        ORG 40
IP_F10  DW  RUT_F10
        ORG 44
IP_TIM  DW  RUT_TIM

        ORG 1000H
N       DB  0
FIN     DB  0

        ORG 2000H
        CLI
        MOV AL, 0FCH
        OUT IMR, AL
        MOV AL, 10
        OUT INT0, AL
        MOV AL, 11
        OUT INT1, AL
        MOV AL, ${comp}
        OUT COMP, AL
        MOV AL, 0
        OUT CONT, AL
        STI
LAZO:   CMP FIN, 1
        JNZ LAZO
        INT 0

        ORG 3000H
RUT_TIM: PUSH AX
        INC N
        MOV AL, 0
        OUT CONT, AL
        MOV AL, EOI
        OUT EOI, AL
        POP AX
        IRET
RUT_F10: PUSH AX
        MOV FIN, 1
        MOV AL, EOI
        OUT EOI, AL
        POP AX
        IRET
        END`;

const irqs = (r: ReturnType<typeof simulate>) => r.steps.filter((s) => s.kind === "irq");

describe("timer (CONT 10H / COMP 11H, INT1)", () => {
  it("raises INT1 each time CONT reaches COMP, and F10 ends the loop", () => {
    const r = simulate(PROGRAM(2), { stepsPerSecond: 10, irqEvents: [{ step: 200, line: 0 }] });
    expect(r.reason).toBe("halted");
    const texts = irqs(r).map((s) => s.text);
    const ticks = texts.filter((t) => t === "PIC INT1 (Timer) → vector 11");
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(texts.at(-1)).toBe("PIC INT0 (F10) → vector 10");
    expect(r.cpu.read(0x1000, 8)).toBe(ticks.length); // N counted every timer interrupt
    expect(r.cpu.read(0x1001, 8)).toBe(1); // FIN set by F10
  });

  it("keeps a constant period of COMP seconds between timer interrupts", () => {
    const r = simulate(PROGRAM(2), { stepsPerSecond: 10, irqEvents: [{ step: 300, line: 0 }] });
    const at = irqs(r).filter((s) => s.text.includes("INT1")).map((s) => s.step);
    const gaps = at.slice(1).map((s, i) => s - at[i]);
    expect(new Set(gaps).size).toBe(1);
    // COMP=2 means twice as far apart as COMP=1
    const r1 = simulate(PROGRAM(1), { stepsPerSecond: 10, irqEvents: [{ step: 300, line: 0 }] });
    const at1 = irqs(r1).filter((s) => s.text.includes("INT1")).map((s) => s.step);
    const gap1 = at1[1] - at1[0];
    expect(gaps[0]).toBeGreaterThan(gap1);
  });

  it("does not count before the first write to CONT", () => {
    const r = simulate(
      `MOV AL, 1
       OUT 11H, AL
       NOP
       NOP
       NOP
       NOP
       IN AL, 10H
       HLT
       END`,
      { stepsPerSecond: 1 },
    );
    expect(r.cpu.regs.AX & 0xff).toBe(0);
  });

  it("CONT is readable and increments once per second after being written", () => {
    const r = simulate(
      `MOV AL, 0
       OUT 10H, AL
       NOP
       NOP
       NOP
       IN AL, 10H
       HLT
       END`,
      { stepsPerSecond: 2 },
    );
    expect(r.cpu.regs.AX & 0xff).toBe(2); // OUT, NOP, NOP, NOP elapsed = 2 seconds at the IN
  });

  it("a masked timer line stays latched in IRR and is never served", () => {
    const r = simulate(
      `MOV AL, 1
       OUT 11H, AL
       MOV AL, 0
       OUT 10H, AL
       STI
       NOP
       NOP
       NOP
       HLT
       END`,
      { stepsPerSecond: 1 },
    );
    expect(irqs(r)).toHaveLength(0);
    expect(r.steps.at(-1)!.devices).toMatchObject({ IRR: 2 });
  });

  it("rejects a non-positive stepsPerSecond", () => {
    expect(() => new Timer(() => {}, 0)).toThrow(RangeError);
  });
});
