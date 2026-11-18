import { describe, expect, it } from "vitest";
import { simulate } from "../src/core/simulate";
import { memoryMap, stackMap } from "../src/ui/memmap";

const SRC = 'ORG 1000H\nMSG DB "Hi"\nFIN DB ?\nORG 2000H\nMOV AL, 33\nMOV FIN, AL\nINT 0\nEND';

describe("MSX88 memory map", () => {
  const res = simulate(SRC);

  it("lists every declared byte with its address, label, character and bits", () => {
    const m = memoryMap(res.program, res.steps);
    expect(m.rows.map((r) => [r.addr, r.label, r.char, r.bits])).toEqual([
      [0x1000, "MSG", "H", "01001000"],
      [0x1001, undefined, "i", "01101001"],
      [0x1002, "FIN", "!", "00100001"],
    ]);
  });

  it("marks a '?' byte as blank until a store gives it a value", () => {
    const before = memoryMap(res.program, res.steps.slice(0, 1)).rows[2];
    expect([before.blank, before.changed, before.step]).toEqual([true, false, undefined]);
    const after = memoryMap(res.program, res.steps).rows[2];
    expect([after.blank, after.changed, after.step, after.value]).toEqual([false, true, 2, 33]);
  });

  it("writes a 16-bit store low byte first, and leaves stack pushes out", () => {
    const w = simulate("ORG 1000H\nW DW ?\nORG 2000H\nMOV AX, 1234H\nMOV W, AX\nPUSH AX\nINT 0\nEND");
    const m = memoryMap(w.program, w.steps);
    expect(m.rows.map((r) => [r.addr, r.value])).toEqual([[0x1000, 0x34], [0x1001, 0x12]]);
  });

  it("caps the rows drawn but reports how many bytes the map covers", () => {
    const big = simulate("ORG 1000H\nBUF DB 100 DUP(0)\nORG 2000H\nINT 0\nEND");
    const m = memoryMap(big.program, big.steps, 16);
    expect([m.rows.length, m.total]).toEqual([16, 100]);
  });
});

describe("MSX88 stack map", () => {
  const res = simulate("ORG 2000H\nMOV AX, 1234H\nPUSH AX\nMOV BX, 5\nPUSH BX\nPOP CX\nINT 0\nEND");

  it("lists every byte from the base down to the deepest one reached, with SP and what is still live", () => {
    const m = stackMap(res.steps);
    expect(m.rows.map((r) => [r.addr, r.base, r.value, r.live, r.sp])).toEqual([
      [0x8000, true, 0, true, false],
      [0x7fff, false, 0x12, true, false],
      [0x7ffe, false, 0x34, true, true],
      [0x7ffd, false, 0x00, false, false],
      [0x7ffc, false, 0x05, false, false],
    ]);
    expect(m.rows[1].bits).toBe("00010010");
    expect(m.rows[4].step).toBe(4);
  });

  it("covers only the steps given", () => {
    const m = stackMap(res.steps.slice(0, 2));
    expect(m.rows.map((r) => [r.addr, r.sp])).toEqual([[0x8000, false], [0x7fff, false], [0x7ffe, true]]);
  });

  it("is empty when nothing was pushed", () => {
    expect(stackMap(simulate("ORG 2000H\nMOV AX, 1\nINT 0\nEND").steps).rows).toEqual([]);
  });
});
