import { describe, expect, it } from "vitest";
import { buildPipeline } from "../src/mips/pipeline";
import { simulateMips } from "../src/mips/sim";

const pipe = (src: string, forwarding: boolean) => {
  const sim = simulateMips(src);
  expect(sim.reason).toBe("halted");
  return buildPipeline(sim.steps, { forwarding });
};
const stages = (row: { cells: { stage: string }[] }) => row.cells.map((c) => c.stage).join(" ");

describe("pipeline cycle diagram", () => {
  it("overlaps independent instructions with no stalls", () => {
    const p = pipe("daddi r1, r0, 1\ndaddi r2, r0, 2\ndaddi r3, r0, 3", false);
    expect(stages(p.rows[0])).toBe("IF ID EX MEM WB");
    expect(p.rows.map((r) => r.cells[0].cycle)).toEqual([1, 2, 3]);
    expect(p.cycles).toBe(7);
    expect(p.stats).toMatchObject({ instructions: 3, cycles: 7, raw: 0, flushes: 0 });
    expect(p.stats.cpi).toBeCloseTo(7 / 3);
  });

  it("stalls two cycles in ID for a RAW dependency without forwarding", () => {
    const p = pipe("daddi r1, r0, 1\ndadd r2, r1, r1", false);
    expect(stages(p.rows[1])).toBe("IF ID RAW RAW EX MEM WB");
    expect(p.rows[1].raw).toBe(2);
    expect(p.cycles).toBe(8);
  });

  it("removes the ALU-to-ALU stall with forwarding", () => {
    const p = pipe("daddi r1, r0, 1\ndadd r2, r1, r1", true);
    expect(stages(p.rows[1])).toBe("IF ID EX MEM WB");
    expect(p.stats.raw).toBe(0);
  });

  it("keeps a one-cycle load-use stall with forwarding", () => {
    const p = pipe(".data\nv: .word 1\n.text\nld r1, v(r0)\ndadd r2, r1, r1", true);
    expect(stages(p.rows[1])).toBe("IF ID RAW EX MEM WB");
  });

  it("holds the next instruction in IF while one stalls in ID", () => {
    const p = pipe("daddi r1, r0, 1\ndadd r2, r1, r1\ndaddi r3, r0, 3", false);
    expect(stages(p.rows[2])).toBe("IF IF IF ID EX MEM WB");
  });

  it("waits on the latest writer of a register, not an older one", () => {
    const p = pipe("daddi r1, r0, 1\ndaddi r2, r0, 2\ndaddi r1, r0, 9\ndadd r4, r1, r1", false);
    expect(stages(p.rows[3])).toBe("IF ID RAW RAW EX MEM WB");
  });

  it("needs no stall when the producer is three instructions away, even without forwarding", () => {
    const p = pipe("daddi r1, r0, 1\ndaddi r2, r0, 2\ndaddi r3, r0, 3\ndadd r4, r1, r1", false);
    expect(stages(p.rows[3])).toBe("IF ID EX MEM WB");
  });

  it("does not depend on r0", () => {
    const p = pipe("daddi r0, r0, 1\ndadd r2, r0, r0", false);
    expect(p.stats.raw).toBe(0);
  });

  it("makes mflo wait for ddiv through LO, like a register dependency", () => {
    const src = "daddi r1, r0, 4\ndaddi r2, r0, 2\nddiv r1, r2\nmflo r3";
    expect(pipe(src, false).rows[3].raw).toBe(2);
    expect(pipe(src, true).rows[3].raw).toBe(0);
  });

  it("loses a cycle on a taken branch and none on a fallen-through one", () => {
    const taken = pipe("b end\nnop\nend: nop", true);
    expect(taken.rows.map((r) => r.cells[0].cycle)).toEqual([1, 3]);
    expect(taken.rows[0].flush).toBe(true);
    expect(taken.stats.flushes).toBe(1);
    const fallen = pipe("bnez r1, end\nnop\nend: nop", true);
    expect(fallen.rows.map((r) => r.cells[0].cycle)).toEqual([1, 2, 3]);
  });

  it("makes a branch wait for the register it reads in ID", () => {
    const fwd = pipe("daddi r1, r0, 1\nbnez r1, end\nend: nop", true);
    expect(fwd.rows[1].raw).toBe(1);
    const plain = pipe("daddi r1, r0, 1\nbnez r1, end\nend: nop", false);
    expect(plain.rows[1].raw).toBe(2);
  });

  it("returns an empty diagram for an empty stream", () => {
    const p = buildPipeline([], { forwarding: true });
    expect(p.rows).toEqual([]);
    expect(p.stats).toMatchObject({ instructions: 0, cycles: 0, cpi: 0 });
  });
});
