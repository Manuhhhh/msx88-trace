/** The number base the trace tables show their values in. */
export type Radix = "dec" | "hex" | "bin";

const RADIXES: readonly Radix[] = ["dec", "hex", "bin"];

let key = "msx88-trace.radix";
let fallback: Radix = "hex";
let current: Radix | undefined;

/** Each simulator keeps its own choice and its own default: MSX88 reads hex, MIPS64 decimal. */
export function useRadixFor(arch: "msx88" | "mips"): void {
  key = `msx88-trace.radix.${arch}`;
  fallback = arch === "mips" ? "dec" : "hex";
  current = undefined;
}

/** The base in use; the saved choice (the simulator's default until one is made) is read the first time it is needed. */
export function getRadix(): Radix {
  if (current === undefined) {
    try {
      const v = localStorage.getItem(key);
      current = RADIXES.find((r) => r === v) ?? fallback;
    } catch {
      current = fallback; // private windows or blocked storage
    }
  }
  return current;
}

export function setRadix(radix: Radix): void {
  current = radix;
  try {
    localStorage.setItem(key, radix);
  } catch {
    /* the choice still applies for this visit */
  }
}

/** An unsigned value of `bits` width written in the base, padded to the digits it needs (decimal is not padded). */
export function fmtUnsigned(v: number, bits: 8 | 16, radix: Radix = getRadix()): string {
  if (radix === "dec") return String(v);
  if (radix === "hex") return v.toString(16).toUpperCase().padStart(bits / 4, "0");
  return v.toString(2).padStart(bits, "0");
}

/** A 64-bit value: signed in decimal, two's complement in hex and binary (no padding, so small numbers stay short). */
export function fmtWide(v: bigint, radix: Radix = getRadix()): string {
  if (radix === "dec") return v.toString();
  const u = BigInt.asUintN(64, v);
  return radix === "hex" ? `0x${u.toString(16).toUpperCase()}` : `0b${u.toString(2)}`;
}

/**
 * Wires the base buttons (`[data-radix]`) under `root`: they show the saved base as pressed and, on click,
 * save the new one, update the pressed state and call `onChange`.
 */
export function wireRadix(root: ParentNode, onChange: () => void): void {
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-radix]")];
  const paint = (): void => {
    for (const b of buttons) b.setAttribute("aria-pressed", String(b.dataset.radix === getRadix()));
  };
  for (const b of buttons) {
    b.addEventListener("click", () => {
      if (b.dataset.radix === getRadix()) return;
      setRadix(b.dataset.radix as Radix);
      paint();
      onChange();
    });
  }
  paint();
}
