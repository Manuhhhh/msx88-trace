import { describe, expect, it } from "vitest";
import { simulate } from "../src/core/simulate";
import { EXAMPLES, examplesFor } from "../src/ui/examples";
import { bin8, hex16 } from "../src/ui/format";
import { decodeState, encodeState } from "../src/ui/share";
import type { ShareState } from "../src/ui/share";

describe("format", () => {
  it("pads hex and binary", () => {
    expect(hex16(0x2a)).toBe("002A");
    expect(bin8(5)).toBe("00000101");
  });
});

describe("share state", () => {
  const state: ShareState = {
    source: "MOV AL, 'ñ' ; acentuación\nHLT\nEND",
    input: "x",
    maxSteps: 500,
    events: [{ step: 3, line: 0 }],
  };

  it("round-trips unicode source through the URL encoding", () => {
    const encoded = encodeState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeState(encoded)).toEqual(state);
  });

  it("rejects garbage and malformed shapes without throwing", () => {
    expect(decodeState("not base64 !!")).toBeNull();
    expect(decodeState(encodeState({ ...state, maxSteps: 0 }))).toBeNull();
    expect(decodeState(encodeState({ ...state, events: [{ step: 0, line: 0 }] }))).toBeNull();
    expect(decodeState(encodeState({ ...state, events: [{ step: 1, line: 9 }] }))).toBeNull();
  });
});

describe("built-in examples", () => {
  for (const ex of [...examplesFor("en"), ...examplesFor("es")]) {
    it(`"${ex.title}" assembles and halts`, () => {
      const r = simulate(ex.state.source, {
        input: ex.state.input,
        waitForInput: true,
        maxSteps: ex.state.maxSteps,
        irqEvents: ex.state.events,
      });
      // the terminal example starts without input: it pauses at its first INT 6 until you type
      expect(r.reason).toBe(ex.id === "echo" ? "waiting-input" : "halted");
    });
  }

  it("the terminal example prints back the three characters typed", () => {
    const echo = EXAMPLES.find((e) => e.id === "echo")!.state;
    const r = simulate(echo.source, { input: "abc", waitForInput: true });
    expect(r.reason).toBe("halted");
    expect(r.output).toBe("Type 3 characters: You typed: abc");
  });

  it("the F10 example serves each press and the sum example computes 15", () => {
    const f10 = EXAMPLES.find((e) => e.id === "f10")!.state;
    const r = simulate(f10.source, { irqEvents: f10.events, maxSteps: f10.maxSteps });
    expect(r.steps.filter((s) => s.kind === "irq")).toHaveLength(3);
    const sum = simulate(EXAMPLES.find((e) => e.id === "sum")!.state.source);
    expect(sum.cpu.regs.AX).toBe(15);
    const print = simulate(EXAMPLES.find((e) => e.id === "print")!.state.source);
    expect(print.output).toBe("Hello, MSX88");
    const stack = simulate(EXAMPLES.find((e) => e.id === "stack")!.state.source);
    expect(stack.cpu.regs.AX).toBe(12);
    expect(stack.cpu.regs.SP).toBe(0x8000);
    expect(stack.cpu.regs.BP).toBe(0);
  });

  it("run the same program in both languages, with only the comments and titles translated", () => {
    const code = (src: string) => src.split("\n").map((l) => l.replace(/;.*$/, "").trimEnd()).join("\n");
    for (const en of examplesFor("en")) {
      const es = examplesFor("es").find((e) => e.id === en.id)!;
      expect(code(es.state.source)).toBe(code(en.state.source));
      expect(es.title).not.toBe(en.title);
      expect(es.state.events).toEqual(en.state.events);
    }
  });
});
