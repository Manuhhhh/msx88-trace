import { describe, expect, it } from "vitest";
import { Pio } from "../src/core/pio";
import { simulate } from "../src/core/simulate";

describe("PIO ports 30H-33H", () => {
  it("starts with every line an input", () => {
    const p = new Pio();
    expect([p.in(0x32, 8), p.in(0x33, 8), p.in(0x30, 8), p.in(0x31, 8)]).toEqual([0xff, 0xff, 0, 0]);
  });
  it("only writes the lines configured as outputs", () => {
    const p = new Pio();
    p.out(0x31, 8, 0xaa);
    expect(p.in(0x31, 8)).toBe(0);
    p.out(0x33, 8, 0x0f);
    p.out(0x31, 8, 0xaa);
    expect(p.in(0x31, 8)).toBe(0xa0);
    expect(p.in(0x33, 8)).toBe(0x0f);
  });
  it("leaves other ports alone", () => {
    const p = new Pio();
    p.out(0x50, 8, 7);
    expect(p.in(0x50, 8)).toBe(7);
  });
  it("works from a program and shows PB in the trace", () => {
    const r = simulate(`
        ORG 2000H
        MOV AL, 0
        OUT 33H, AL
        MOV AL, 5
        OUT 31H, AL
        IN AL, 31H
        HLT
        END`);
    expect(r.steps.at(-1)!.regs.AX & 0xff).toBe(5);
    expect(r.steps.some((s) => s.io.some((a) => a.port === 0x31 && a.dir === "out" && a.value === 5))).toBe(true);
  });
});

describe("PIO in the trace", () => {
  it("records PA, PB, CA and CB after every step and leaves devices to the PIC", () => {
    const r = simulate(`
        ORG 2000H
        MOV AL, 0
        OUT 32H, AL
        MOV AL, 9
        OUT 30H, AL
        HLT
        END`);
    const last = r.steps.at(-1)!;
    expect(last.ports).toEqual({ PA: 9, PB: 0, CA: 0, CB: 0xff });
    expect(Object.keys(last.devices!).sort()).toEqual(["IMR", "IRR", "ISR"]);
  });
});
