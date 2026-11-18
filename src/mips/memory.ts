// ASSUMPTION: EduMIPS64 data memory is big-endian (its memory view is a bit vector read
// most-significant-first). It is a single constant so it can be flipped if the manual says otherwise.
export const BIG_ENDIAN = true;

/** Writes the low `size` bytes of `value` at `at`. */
export function storeBytes(mem: Uint8Array, at: number, size: number, value: bigint): void {
  const v = BigInt.asUintN(size * 8, value);
  for (let b = 0; b < size; b++) {
    const shift = BigInt(8 * (BIG_ENDIAN ? size - 1 - b : b));
    mem[at + b] = Number((v >> shift) & 0xffn);
  }
}

/** Reads `size` bytes at `at` as an unsigned value. */
export function loadBytes(mem: Uint8Array, at: number, size: number): bigint {
  let v = 0n;
  for (let b = 0; b < size; b++) {
    const shift = BigInt(8 * (BIG_ENDIAN ? size - 1 - b : b));
    v |= BigInt(mem[at + b]) << shift;
  }
  return v;
}
