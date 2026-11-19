import { describe, expect, it } from "vitest";
import { fmtUnsigned, fmtWide } from "../src/ui/radix";

describe("number bases", () => {
  it("writes an unsigned value padded to its width in hex and binary, plain in decimal", () => {
    expect([fmtUnsigned(0x1a, 16, "hex"), fmtUnsigned(0x1a, 8, "hex"), fmtUnsigned(5, 8, "bin"), fmtUnsigned(0x1234, 16, "dec")]).toEqual(["001A", "1A", "00000101", "4660"]);
  });

  it("writes a 64-bit value signed in decimal and as two's complement in hex and binary", () => {
    expect([fmtWide(5n, "dec"), fmtWide(5n, "hex"), fmtWide(5n, "bin"), fmtWide(-1n, "dec"), fmtWide(-1n, "hex")]).toEqual(["5", "0x5", "0b101", "-1", "0xFFFFFFFFFFFFFFFF"]);
  });
});
