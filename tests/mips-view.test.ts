import { describe, expect, it } from "vitest";
import { tokenizeMips } from "../src/mips/highlight";
import { mipsExamplesFor } from "../src/mips/examples";
import { buildPipeline } from "../src/mips/pipeline";
import { simulateMips } from "../src/mips/sim";
import { fmtValue, memoryRows, pipelineUpTo, pipelineWindow, memoryMap, registerTable, stepFacts, variableTable } from "../src/mips/view";

const sim = (src: string) => simulateMips(src);

describe("MIPS64 highlight", () => {
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

describe("MIPS64 table models", () => {
  const res = sim("daddi r1, r0, 7\nnop\ndadd r2, r1, r1\nddiv r3, r2, r1\nhalt");

  it("lists only the steps and registers that changed, in register order", () => {
    const t = registerTable(res.steps);
    expect(t.cols).toEqual(["r1", "r2", "r3"]);
    expect(t.rows.map((r) => r.step)).toEqual([1, 3, 4]);
    expect(t.rows[0].set.get("r1")).toBe(7n);
    expect(t.rows[2].set.get("r3")).toBe(2n);
  });

  it("lists every memory access in order", () => {
    const m = sim(".data\nv: .space 8\n.text\ndaddi r1, r0, 3\nsd r1, v(r0)\nld r2, v(r0)\nhalt");
    expect(memoryRows(m.steps).map((r) => [r.step, r.kind, r.addr, r.size, r.after])).toEqual([
      [2, "write", 0, 8, 3n],
      [3, "read", 0, 8, 3n],
    ]);
  });

  it("traces each memory location: address, name, initial value and every value stored to it, in order", () => {
    const r = sim(
      ".data\nn: .word 5\narr: .word 1, 2\nb: .byte 7\n.text\ndaddi r1, r0, 9\nsd r1, arr(r0)\ndaddi r1, r1, 1\nsd r1, arr(r0)\nsd r1, arr+8(r0)\nld r2, n(r0)\nsb r1, b(r0)\nhalt",
    );
    const t = variableTable(r.program, r.steps);
    expect(t.cols.map((c) => [c.addr, c.name, c.size, c.initial])).toEqual([
      [0, "n", 8, 5n],
      [8, "arr", 8, 1n],
      [16, "arr+8", 8, 2n],
      [24, "b", 1, 7n],
    ]);
    expect(t.cols[0].writes).toEqual([]);
    expect(t.cols[1].writes.map((w) => [w.step, w.value])).toEqual([[2, 9n], [4, 10n]]);
    expect(t.cols[2].writes.map((w) => w.step)).toEqual([5]);
    expect(t.cols[3].writes.map((w) => [w.step, w.value])).toEqual([[7, 10n]]);
  });

  it("covers only the steps given, and reads signed values by access size", () => {
    const r = sim(".data\nv: .byte 0\n.text\ndaddi r1, r0, -1\nsb r1, v(r0)\nhalt");
    expect(variableTable(r.program, r.steps.slice(0, 1)).cols).toEqual([]);
    expect(variableTable(r.program, r.steps).cols[0].writes[0].value).toBe(-1n);
  });

  it("maps data memory byte by byte: address, label, character, bits and what stores changed", () => {
    const r = sim('.data\nmsg: .asciiz "Hi"\nfin: .byte 0\n.text\ndaddi r1, r0, 33\nsb r1, fin(r0)\nhalt');
    const fin = r.program.symbols.get("fin")!.value;
    const m = memoryMap(r.program, r.steps);
    expect(m.rows.slice(0, 3).map((x) => [x.addr, x.label, x.char, x.bits])).toEqual([
      [0, "msg", "H", "01001000"],
      [1, undefined, "i", "01101001"],
      [2, undefined, "", "00000000"],
    ]);
    const last = m.rows[fin];
    expect([last.label, last.value, last.bits, last.char, last.changed, last.step]).toEqual(["fin", 33, "00100001", "!", true, 2]);
    expect(m.rows).toHaveLength(fin + 1);
    // before the store ran, the byte still holds its initial value
    const before = memoryMap(r.program, r.steps.slice(0, 1)).rows[fin];
    expect([before.value, before.changed, before.step]).toEqual([0, false, undefined]);
  });

  it("caps the rows drawn but reports how many bytes the map covers", () => {
    const r = sim(".data\nbuf: .space 100\n.text\nhalt");
    const m = memoryMap(r.program, r.steps, 16);
    expect([m.rows.length, m.total]).toEqual([16, 100]);
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

describe("built-in MIPS64 examples", () => {
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
    const r = simulateMips(mipsExamplesFor("en").find((e) => e.id === "print-int")!.source);
    expect(r.output).toBe("42\n");
  });
});

describe("step-by-step helpers", () => {
  const res = sim(
    ".data\nv: .space 8\n.text\ndaddi r1, r0, 7\ndadd r2, r1, r1\nsd r2, v(r0)\nbnez r2, end\nnop\nend: halt",
  );
  const p = buildPipeline(res.steps, { forwarding: false });

  it("keeps only the first n rows of the diagram, leaving the rest untouched", () => {
    const cut = pipelineUpTo(p, 2);
    expect(cut.rows.map((r) => r.step)).toEqual([1, 2]);
    expect(cut.rows[1]).toBe(p.rows[1]);
    expect(pipelineUpTo(p, 0).rows).toEqual([]);
    expect(pipelineUpTo(p, 99).rows).toHaveLength(p.rows.length);
  });

  it("lists what a step did: registers, memory, stalls and a taken branch", () => {
    const add = stepFacts(res.steps[1], p.rows[1]);
    expect(add).toMatchObject({ regs: ["r2 = 14"], raw: 2, taken: false });
    const store = stepFacts(res.steps[2], p.rows[2]);
    expect(store.mem).toEqual([{ kind: "write", addr: 0, size: 8, value: 14n }]);
    expect(store.regs).toEqual([]);
    const branch = stepFacts(res.steps[3], p.rows[3]);
    expect(branch.taken).toBe(true);
  });

  it("names the register a division writes", () => {
    const d = sim("daddi r1, r0, 7\ndaddi r2, r0, 2\nddiv r3, r1, r2\nhalt");
    const q = buildPipeline(d.steps, { forwarding: true });
    expect(stepFacts(d.steps[2], q.rows[2]).regs).toEqual(["r3 = 3"]);
  });
});
