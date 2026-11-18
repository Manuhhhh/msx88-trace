import { describe, expect, it } from "vitest";
import { simulate } from "../src/core/simulate";

const F10_PROGRAM = (eoi: boolean) => `
EOI     EQU 20H
IMR     EQU 21H
INT0    EQU 24H

        ORG 40
IP_F10  DW  RUT_F10

        ORG 1000H
CONT    DB  0

        ORG 2000H
        CLI
        MOV AL, 0FEH
        OUT IMR, AL
        MOV AL, 10
        OUT INT0, AL
        STI
LAZO:   CMP CONT, 3
        JNZ LAZO
        INT 0

        ORG 3000H
RUT_F10: PUSH AX
        INC CONT
${eoi ? "        MOV AL, EOI\n        OUT EOI, AL" : "        NOP"}
        POP AX
        IRET
        END
`;

const press = (...steps: number[]) => steps.map((step) => ({ step, line: 0 }));

describe("PIC registers", () => {
  it("IMR, vector registers and read-only IRR/ISR behave per the port map", () => {
    const r = simulate(
      `MOV AL, 0F0H
       OUT 21H, AL
       IN AL, 21H
       MOV BL, AL
       MOV AL, 33
       OUT 25H, AL
       IN AL, 25H
       MOV CL, AL
       MOV AL, 0FFH
       OUT 22H, AL
       IN AL, 22H
       HLT
       END`,
    );
    const last = r.steps.at(-1)!.regs;
    expect(last.BX & 0xff).toBe(0xf0);
    expect(last.CX & 0xff).toBe(33);
    expect(last.AX & 0xff).toBe(0); // IRR ignores CPU writes
    expect(r.steps.at(-1)!.devices).toEqual({ IMR: 0xf0, IRR: 0, ISR: 0 });
  });
});

describe("F10 interrupt end to end", () => {
  it("serves three F10 presses, each ending with EOI, and the program finishes", () => {
    const r = simulate(F10_PROGRAM(true), { irqEvents: press(12, 40, 70) });
    expect(r.reason).toBe("halted");
    expect(r.steps.filter((s) => s.kind === "irq")).toHaveLength(3);
    expect(r.cpu.read(0x1000, 8)).toBe(3);

    const irq = r.steps.find((s) => s.kind === "irq")!;
    expect(irq.text).toBe("PIC INT0 (F10) → vector 10");
    expect(irq.devices).toEqual({ IMR: 0xfe, IRR: 0, ISR: 1 }); // in service
    expect(irq.flags.IF).toBe(false);

    const eoi = r.steps.find((s) => s.text === "OUT EOI, AL")!;
    expect(eoi.devices!.ISR).toBe(0); // released by EOI
    expect(eoi.io).toEqual([{ port: 0x20, value: 0x20, width: 8, dir: "out" }]);
  });

  it("without EOI the line stays in service and later presses are never served", () => {
    const r = simulate(F10_PROGRAM(false), { irqEvents: press(12, 40, 70), maxSteps: 400 });
    expect(r.reason).toBe("max-steps");
    expect(r.steps.filter((s) => s.kind === "irq")).toHaveLength(1);
    expect(r.cpu.read(0x1000, 8)).toBe(1);
    expect(r.steps.at(-1)!.devices).toMatchObject({ ISR: 1, IRR: 1 }); // 2nd press pending
  });

  it("a press during the handler is queued in IRR and served after EOI", () => {
    const first = simulate(F10_PROGRAM(true), { irqEvents: press(12) });
    const irqStep = first.steps.find((s) => s.kind === "irq")!.step;
    const r = simulate(F10_PROGRAM(true), { irqEvents: press(12, irqStep + 2, 200) });
    const during = r.steps[irqStep + 1]; // a step inside the handler
    expect(during.devices).toMatchObject({ ISR: 1, IRR: 1 });
    expect(r.steps.filter((s) => s.kind === "irq")).toHaveLength(3);
    expect(r.cpu.read(0x1000, 8)).toBe(3);
  });
});

describe("masking and priority", () => {
  const prog = (imr: number) => `
      ORG 40
V10   DW H0
      ORG 44          ; vector 11 -> 4*11 (entries are 4 bytes apart)
V11   DW H1
      ORG 2000H
      MOV AL, ${imr}
      OUT 21H, AL
      MOV AL, 10
      OUT 24H, AL
      MOV AL, 11
      OUT 25H, AL
      STI
      NOP
      NOP
      NOP
      NOP
      NOP
      INT 0
      ORG 3000H
H0:   MOV BL, 1
      MOV AL, 20H
      OUT 20H, AL
      IRET
H1:   MOV BH, 1
      MOV AL, 20H
      OUT 20H, AL
      IRET
      END`;

  it("a masked line is latched in IRR but never served", () => {
    const r = simulate(prog(0xfe), { irqEvents: [{ step: 1, line: 1 }] }); // only INT0 unmasked
    expect(r.steps.some((s) => s.kind === "irq")).toBe(false);
    expect(r.steps.at(-1)!.devices).toMatchObject({ IRR: 2, ISR: 0 });
  });

  it("with both lines pending the lower number is served first, one at a time", () => {
    const r = simulate(prog(0xfc), {
      irqEvents: [
        { step: 1, line: 1 },
        { step: 1, line: 0 },
      ],
    });
    expect(r.reason).toBe("halted");
    const irqs = r.steps.filter((s) => s.kind === "irq").map((s) => s.text);
    expect(irqs).toEqual(["PIC INT0 (F10) → vector 10", "PIC INT1 (Timer) → vector 11"]);
    expect(r.cpu.regs.BX).toBe(0x0101);
  });
});
