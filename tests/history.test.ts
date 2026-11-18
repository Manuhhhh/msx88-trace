import { describe, expect, it } from "vitest";
import { simulate } from "../src/core/simulate";
import { EXAMPLES } from "../src/ui/examples";
import { buildHistory, stackSlots } from "../src/ui/history";

const run = (source: string, opts = {}) => buildHistory(simulate(source, opts).steps);

describe("run history", () => {
  it("records every value a register passes through, with its step", () => {
    const h = run("ORG 2000H\nMOV AX, 5\nADD AX, 3\nMOV AX, 1\nINT 0\nEND");
    const ax = h.registers.find((r) => r.name === "AX")!;
    expect(ax.initial).toBe(0);
    expect(ax.points.map((p) => [p.step, p.value])).toEqual([
      [1, 5],
      [2, 8],
      [3, 1],
    ]);
    expect(h.registers.find((r) => r.name === "BX")!.points).toEqual([]);
  });

  it("records only the flag changes and starts from the flag's initial value", () => {
    const h = run("ORG 2000H\nMOV AX, 1\nSUB AX, 1\nADD AX, 1\nINT 0\nEND");
    const zf = h.flags.find((f) => f.name === "ZF")!;
    expect(zf.initial).toBe(0);
    expect(zf.points.map((p) => [p.step, p.value])).toEqual([
      [2, 1],
      [3, 0],
    ]);
  });

  it("lists the data memory writes by address, without the stack pushes", () => {
    const h = run("ORG 1000H\nDATO DB 7\nORG 2000H\nMOV DATO, 9\nPUSH AX\nPOP AX\nINT 0\nEND");
    expect(h.heap).toHaveLength(1);
    expect(h.heap[0]).toMatchObject({ addr: 0x1000, width: 8, initial: 7 });
    expect(h.heap[0].points.map((p) => p.value)).toEqual([9]);
  });

  it("logs each push and pop with its address and value", () => {
    const h = run("ORG 2000H\nMOV AX, 0ABCDH\nPUSH AX\nMOV AX, 0\nPOP AX\nINT 0\nEND");
    expect(h.stack.map((e) => [e.op, e.addr, e.value])).toEqual([
      ["push", 0x7ffe, 0xabcd],
      ["pop", 0x7ffe, 0xabcd],
    ]);
  });

  it("shows the words an interrupt pushes and IRET pops", () => {
    const f10 = EXAMPLES.find((e) => e.id === "f10")!.state;
    const h = run(f10.source, { irqEvents: f10.events, maxSteps: f10.maxSteps });
    const fromIrq = h.stack.filter((e) => e.irq && e.op === "push");
    expect(fromIrq.length).toBeGreaterThan(0);
    expect(h.stack.filter((e) => e.op === "pop").length).toBeGreaterThan(0);
  });
});

describe("stack by address", () => {
  it("lists the base empty, then each address with every value pushed there", () => {
    const h = run("ORG 2000H\nMOV AX, 1\nPUSH AX\nPUSH AX\nPOP BX\nMOV AX, 2\nPUSH AX\nINT 0\nEND");
    const slots = stackSlots(h.stack);
    expect(slots.map((s) => s.addr)).toEqual([0x8000, 0x7ffe, 0x7ffc]);
    expect(slots[0].writes).toEqual([]);
    expect(slots[1].writes.map((w) => [w.step, w.value, w.poppedAt])).toEqual([[2, 1, undefined]]);
    expect(slots[2].writes.map((w) => [w.step, w.value, w.poppedAt])).toEqual([
      [3, 1, 4],
      [6, 2, undefined],
    ]);
  });

  it("is just the base when the stack was never used", () => {
    expect(stackSlots(run("ORG 2000H\nINT 0\nEND").stack)).toEqual([{ addr: 0x8000, writes: [] }]);
  });
});
