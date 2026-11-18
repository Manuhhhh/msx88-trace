import { describe, expect, it } from "vitest";
import { archUrl, parseArch } from "../src/ui/arch";
import { decodeMipsState, encodeMipsState } from "../src/mips/share";

describe("architecture selection", () => {
  it("reads ?arch= and ignores anything else", () => {
    expect(parseArch("?arch=mips")).toBe("mips");
    expect(parseArch("?arch=msx88")).toBe("msx88");
    expect(parseArch("?arch=arm")).toBeNull();
    expect(parseArch("")).toBeNull();
    expect(parseArch("?x=1&arch=mips")).toBe("mips");
  });

  it("keeps the MSX88 address plain", () => {
    expect(archUrl("msx88", "/app/")).toBe("/app/");
    expect(archUrl("mips", "/app/")).toBe("/app/?arch=mips");
  });
});

describe("EduMIPS64 share state", () => {
  const state = { source: "daddi r1, r0, 1 ; ñ\nhalt", maxSteps: 500, forwarding: true };

  it("round-trips unicode source through the URL encoding", () => {
    const encoded = encodeMipsState(state);
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeMipsState(encoded)).toEqual(state);
  });

  it("rejects garbage and malformed shapes without throwing", () => {
    expect(decodeMipsState("not base64 !!")).toBeNull();
    expect(decodeMipsState(encodeMipsState({ ...state, maxSteps: 0 }))).toBeNull();
    expect(decodeMipsState(btoa(JSON.stringify({ source: "x", maxSteps: 5 })))).toBeNull();
  });
});
