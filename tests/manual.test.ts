import { describe, expect, it } from "vitest";
import { assemble } from "../src/core/assembler";
import { ARITY } from "../src/core/isa";
import { INT_SERVICES, MANUAL, manualDoc } from "../src/ui/manual";

describe("instruction manual", () => {
  const entries = MANUAL.flatMap((g) => g.entries);

  it("documents every instruction the assembler accepts, once", () => {
    const covered = entries.flatMap((e) => e.covers);
    expect([...covered].sort()).toEqual([...ARITY.keys()].sort());
  });

  it("has an example for each entry that assembles as written", () => {
    for (const e of entries) {
      const src = `ORG 1000H\nVAL DB 0\nORG 2000H\nL: ${e.example}\n    END`;
      expect(() => assemble(src), e.example).not.toThrow();
      expect(e.example.split(/\s+/)[0].toUpperCase(), e.example).toBe(e.covers[0]);
    }
  });

  it("explains the INT numbers the simulator handles", () => {
    expect(INT_SERVICES.map((s) => s.n)).toEqual([0, 3, 5, 6, 7]);
  });

  it("documents the timer ports and the PIC ports, in both languages", () => {
    for (const lang of ["en", "es"] as const) {
      const html = manualDoc(lang).body;
      for (const port of ["10H CONT", "11H COMP", "20H EOI", "21H IMR", "24H to 2BH"]) {
        if (lang === "en" || !port.includes(" to ")) expect(html, `${lang} ${port}`).toContain(port);
      }
    }
  });

  it("gives every instruction its own section and a link to it, in both languages", () => {
    for (const lang of ["es", "en"] as const) {
      const { nav, body } = manualDoc(lang);
      for (const e of entries) {
        const id = e.covers[0].toLowerCase();
        expect(body, `${lang} ${id}`).toContain(`id="${id}"`);
        expect(nav, `${lang} ${id}`).toContain(`href="#${id}"`);
        expect(e.effect[lang].length, `${lang} ${e.syntax}`).toBeGreaterThan(0);
      }
    }
    expect(manualDoc("es").body).not.toBe(manualDoc("en").body);
  });

  it("has unique section ids, so every link in the contents lands on one place", () => {
    const { nav, body } = manualDoc("en");
    const ids = [...body.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of nav.matchAll(/href="#([^"]+)"/g)) expect(ids, m[1]).toContain(m[1]);
  });
});
