import { describe, expect, it } from "vitest";
import { tokenizeMips } from "../src/mips/highlight";
import { mipsExamplesFor } from "../src/mips/examples";
import { buildPipeline } from "../src/mips/pipeline";
import { simulateMips } from "../src/mips/sim";
import { fmtValue, memoryRows, pipelineWindow, registerTable } from "../src/mips/view";

const sim = (src: string) => simulateMips(src);

describe("EduMIPS64 highlight", () => {
  it("joins back into the exact source", () => {
    const src = '.data\nmsg: .asciiz "hi # there" # c\n.text\nmain: daddi $t0, r0, 0x10 ; x\n';
    expect(tokenizeMips(src).map((t) => t.text).join("")).toBe(src);
  });

  it("classifies instructions, registers, directives, labels, numbers, strings and comments", () => {
    const kinds = Object.fromEntries(
      tokenizeMips('main: DADDI $t0, r1, 0x10 # c\n.word "s"').filter((t) => t.kind).map((t) => [t.text, t.kind]),
    );
    expect(kinds).toMatchObject({
      "main:": "lab", DADDI: "ins", $t0: "reg", r1: "reg", "0x10": "num", "# c": "com", ".word": "dir", '"s"': "str",
    });
  });

  it("leaves unknown words plain", () => {
    expect(tokenizeMips("loop").every((t) => t.kind === undefined)).toBe(true);
  });
});

describe("EduMIPS64 table models", () => {
  const res = sim("daddi r1, r0, 7\nnop\ndadd r2, r1, r1\nddiv r2, r1\nhalt");

  it("lists only the steps and registers that changed, in register order", () => {
    const t = registerTable(res.steps);
    expect(t.cols).toEqual(["r1", "r2", "lo", "hi"]);
    expect(t.rows.map((r) => r.step)).toEqual([1, 3, 4]);
    expect(t.rows[0].set.get("r1")).toBe(7n);
    expect(t.rows[2].set.get("lo")).toBe(2n);
  });

  it("lists every memory access in order", () => {
    const m = sim(".data\nv: .space 8\n.text\ndaddi r1, r0, 3\nsd r1, v(r0)\nld r2, v(r0)\nhalt");
    expect(memoryRows(m.steps).map((r) => [r.step, r.kind, r.addr, r.size, r.after])).toEqual([
      [2, "write", 0, 8, 3n],
      [3, "read", 0, 8, 3n],
    ]);
  });

  it("formats a value as signed decimal and 16 hex digits", () => {
    expect(fmtValue(-1n)).toEqual({ dec: "-1", hex: "0xFFFFFFFFFFFFFFFF" });
    expect(fmtValue(255n).hex).toBe("0x00000000000000FF");
  });
});

describe("pipeline window", () => {
  const steps = sim(Array.from({ length: 10 }, () => "nop").join("\n")).steps;
  const p = buildPipeline(steps, { forwarding: true });

  it("shows a slice of rows and the cycles they span", () => {
    const w = pipelineWindow(p, 2, 4);
    expect(w.rows.map((r) => r.step)).toEqual([3, 4, 5, 6]);
    expect([w.firstCycle, w.lastCycle]).toEqual([3, 10]);
    expect(w.total).toBe(10);
  });

  it("clamps the start so the window is always full", () => {
    expect(pipelineWindow(p, 99, 4).start).toBe(6);
    expect(pipelineWindow(p, -5, 4).start).toBe(0);
  });

  it("handles an empty diagram", () => {
    const w = pipelineWindow(buildPipeline([], { forwarding: true }), 0, 4);
    expect(w.rows).toEqual([]);
    expect(w.lastCycle).toBeLessThan(w.firstCycle);
  });
});

describe("built-in EduMIPS64 examples", () => {
  for (const lang of ["en", "es"] as const) {
    for (const ex of mipsExamplesFor(lang)) {
      it(`"${ex.title}" (${lang}) assembles and halts`, () => {
        const r = simulateMips(ex.source);
        expect(r.error).toBeUndefined();
        expect(r.reason).toBe("halted");
      });
    }
  }

  it("sums 1..5 into memory", () => {
    const r = simulateMips(mipsExamplesFor("en")[0].source);
    expect(r.cpu.regs[2]).toBe(15n);
  });

  it("prints the product", () => {
    const r = simulateMips(mipsExamplesFor("en").find((e) => e.id === "print")!.source);
    expect(r.output).toBe("6 * 7 = 42\n");
  });
});
