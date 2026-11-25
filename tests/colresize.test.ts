import { describe, expect, it } from "vitest";
import { dragWidth, GRIP, MIN_WIDTH, onGrip } from "../src/ui/colresize";

describe("column resize", () => {
  it("grabs only the right edge of a header cell", () => {
    expect(onGrip(200, 100, 200)).toBe(true);
    expect(onGrip(200 - GRIP, 100, 200)).toBe(true);
    expect(onGrip(200 - GRIP - 1, 100, 200)).toBe(false);
    expect(onGrip(201, 100, 200)).toBe(false);
  });

  it("widens and narrows by the drag distance and never goes below the minimum", () => {
    expect(dragWidth(100, 40)).toBe(140);
    expect(dragWidth(100, -30)).toBe(70);
    expect(dragWidth(100, -500)).toBe(MIN_WIDTH);
    expect(dragWidth(100.4, 0.2)).toBe(101);
  });
});
