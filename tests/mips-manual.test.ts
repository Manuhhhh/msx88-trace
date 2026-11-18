import { describe, expect, it } from "vitest";
import { assembleMips, FORMAT_OF } from "../src/mips/assembler";
import { MIPS_MANUAL, MIPS_SYSCALLS, mipsManualDoc } from "../src/ui/mips-manual";

describe("EduMIPS64 instruction manual", () => {
  const entries = MIPS_MANUAL.flatMap((g) => g.entries);

  it("documents every instruction the assembler accepts, once", () => {
    const covered = entries.flatMap((e) => e.covers);
    expect([...covered].sort()).toEqual([...FORMAT_OF.keys()].sort());
  });

  it("has an example for each entry that assembles as written", () => {
    for (const e of entries) {
      const src = `.data\nVAL: .word 0\n.text\nL: ${e.example}\n halt`;
      expect(() => assembleMips(src), e.example).not.toThrow();
      expect(e.example.split(/\s+/)[0].toLowerCase(), e.example).toBe(e.covers[0]);
    }
  });

  it("explains the syscall numbers the simulator handles", () => {
    expect(MIPS_SYSCALLS.map((s) => s.n)).toEqual([0, 5]);
  });

  it("gives every instruction its own section and a link to it, in both languages", () => {
    for (const lang of ["es", "en"] as const) {
      const { nav, body } = mipsManualDoc(lang);
      for (const e of entries) {
        const id = e.covers[0];
        expect(body, `${lang} ${id}`).toContain(`id="${id}"`);
        expect(nav, `${lang} ${id}`).toContain(`href="#${id}"`);
        expect(e.effect[lang].length, `${lang} ${e.syntax}`).toBeGreaterThan(0);
      }
    }
    expect(mipsManualDoc("es").body).not.toBe(mipsManualDoc("en").body);
  });

  it("has unique section ids, so every link in the contents lands on one place", () => {
    for (const lang of ["es", "en"] as const) {
      const { nav, body } = mipsManualDoc(lang);
      const ids = [...body.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
      expect(new Set(ids).size).toBe(ids.length);
      for (const m of nav.matchAll(/href="#([^"]+)"/g)) expect(ids, m[1]).toContain(m[1]);
    }
  });
});
