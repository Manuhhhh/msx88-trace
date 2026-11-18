import { beforeEach, describe, expect, it } from "vitest";
import { SCRIPTS_KEY, cleanName, deleteScript, listScripts, saveScript } from "../src/ui/scripts";
import type { ScriptStorage } from "../src/ui/scripts";
import type { ShareState } from "../src/ui/share";

const state = (source: string): ShareState => ({ source, input: "abc", maxSteps: 500, events: [{ step: 3, line: 1 }] });

function memory(): ScriptStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe("saved scripts", () => {
  let store: ReturnType<typeof memory>;
  beforeEach(() => {
    store = memory();
  });

  it("round-trips the whole state: source, input, step limit and interrupts", () => {
    expect(saveScript("sum", state("MOV AX, 1 ; ñandú"), store, 1)).toBe("sum");
    expect(listScripts(store)).toEqual([{ name: "sum", state: state("MOV AX, 1 ; ñandú"), savedAt: 1 }]);
  });

  it("lists the newest first", () => {
    saveScript("a", state("A"), store, 1);
    saveScript("b", state("B"), store, 2);
    expect(listScripts(store).map((s) => s.name)).toEqual(["b", "a"]);
  });

  it("replaces a script saved under the same name instead of duplicating it", () => {
    saveScript("a", state("old"), store, 1);
    saveScript("a", state("new"), store, 2);
    const all = listScripts(store);
    expect(all).toHaveLength(1);
    expect(all[0].state.source).toBe("new");
  });

  it("trims and collapses the name, and rejects a blank one", () => {
    expect(cleanName("  my   prog  ")).toBe("my prog");
    expect(saveScript("   ", state("X"), store)).toBeNull();
    expect(store.data.has(SCRIPTS_KEY)).toBe(false);
    expect(saveScript("  my   prog ", state("X"), store)).toBe("my prog");
  });

  it("deletes by name and reports whether anything was removed", () => {
    saveScript("a", state("A"), store, 1);
    saveScript("b", state("B"), store, 2);
    expect(deleteScript("a", store)).toBe(true);
    expect(listScripts(store).map((s) => s.name)).toEqual(["b"]);
    expect(deleteScript("nope", store)).toBe(false);
  });

  it("skips corrupt data without throwing", () => {
    store.setItem(SCRIPTS_KEY, "{not json");
    expect(listScripts(store)).toEqual([]);
    store.setItem(SCRIPTS_KEY, JSON.stringify([{ name: "bad", data: "!!", savedAt: 1 }, 7]));
    expect(listScripts(store)).toEqual([]);
    expect(saveScript("ok", state("X"), store, 1)).toBe("ok");
    expect(listScripts(store)).toHaveLength(1);
  });

  it("fails softly when storage is full, blocked or missing", () => {
    const full: ScriptStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(saveScript("a", state("A"), full)).toBeNull();
    expect(saveScript("a", state("A"), null)).toBeNull();
    expect(listScripts(null)).toEqual([]);
    expect(deleteScript("a", null)).toBe(false);
  });
});
