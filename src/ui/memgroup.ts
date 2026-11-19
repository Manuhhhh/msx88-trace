/** The fields of a memory-map row (either simulator's) that grouping needs. */
export interface GroupableByte {
  addr: number;
  label?: string;
  value: number;
  char: string;
  blank?: boolean;
  changed: boolean;
  step?: number;
}

/** A run of bytes shown as one row: where it starts, where it ends and the text it holds. */
export interface TextGroup<R extends GroupableByte> {
  kind: "text";
  start: number;
  end: number;
  label?: string;
  /** The text, without its terminating zero bytes; control characters are shown escaped. */
  text: string;
  count: number;
  /** The bytes of the run, for the hover title. */
  bytes: R[];
  changed: boolean;
  step?: number;
}

/** A multi-byte datum (a word, a DUP, a .space) shown as one row from its first to its last address. */
export interface UnitGroup<R extends GroupableByte> {
  kind: "unit";
  start: number;
  end: number;
  label?: string;
  size: number;
  /** Its value, when it fits in 64 bits and every byte has one. */
  value?: bigint;
  /** Declared with `?` and not stored to yet. */
  blank: boolean;
  bytes: R[];
  changed: boolean;
  step?: number;
}

export type MemoryEntry<R extends GroupableByte> = { kind: "byte"; row: R } | TextGroup<R> | UnitGroup<R>;

const MIN_TEXT = 3;
const ESCAPES: Record<number, string> = { 9: "\\t", 10: "\\n", 13: "\\r" };
const isText = (v: number): boolean => (v >= 0x20 && v < 0x7f) || v in ESCAPES;

/**
 * Collapses each string in the map (a labelled run of printable bytes, optionally ended by a zero and padding) into one entry with its first
 * and last address, leaving numbers and short data byte by byte. A run starts at a label or where the addresses jump.
 */
export function groupText<R extends GroupableByte>(rows: readonly R[]): MemoryEntry<R>[] {
  const out: MemoryEntry<R>[] = [];
  let i = 0;
  while (i < rows.length) {
    let j = i + 1;
    while (j < rows.length && rows[j].addr === rows[j - 1].addr + 1 && rows[j].label === undefined) j++;
    const run = rows.slice(i, j);
    let body = run.length;
    while (body > 0 && run[body - 1].value === 0 && !run[body - 1].blank) body--;
    const printable = body >= MIN_TEXT && run.slice(0, body).every((r) => !r.blank && isText(r.value));
    if (printable) {
      // the string ends at its terminating zero; any zeros after it are alignment padding and are left out
      const shown = run.slice(0, Math.min(body + 1, run.length));
      const steps = shown.map((r) => r.step).filter((s): s is number => s !== undefined);
      out.push({
        kind: "text",
        start: run[0].addr,
        end: shown[shown.length - 1].addr,
        label: run[0].label,
        text: run.slice(0, body).map((r) => ESCAPES[r.value] ?? String.fromCharCode(r.value)).join(""),
        count: shown.length,
        bytes: shown,
        changed: shown.some((r) => r.changed),
        step: steps.length > 0 ? Math.max(...steps) : undefined,
      });
    } else {
      for (const row of run) out.push({ kind: "byte", row });
    }
    i = j;
  }
  return out;
}

/**
 * Everything the map shows with one row per datum: strings (see `groupText`) and every datum that spans several
 * addresses, taken from `units`. Single bytes stay as they are. `littleEndian` says how a unit's bytes make its value.
 */
export function groupMemory<R extends GroupableByte>(rows: readonly R[], units: readonly { addr: number; size: number }[], littleEndian: boolean): MemoryEntry<R>[] {
  const unitAt = new Map(units.filter((u) => u.size > 1).map((u) => [u.addr, u.size] as const));
  const out: MemoryEntry<R>[] = [];
  let plain: R[] = [];
  const flush = (): void => {
    out.push(...groupText(plain));
    plain = [];
  };
  let i = 0;
  while (i < rows.length) {
    const size = unitAt.get(rows[i].addr);
    const bytes = size === undefined ? [] : rows.slice(i, i + size);
    // the unit counts only when every one of its addresses is on the map, one right after the other
    if (size !== undefined && bytes.length === size && bytes.every((r, k) => r.addr === rows[i].addr + k)) {
      flush();
      const blank = bytes.every((r) => r.blank);
      const ordered = littleEndian ? [...bytes].reverse() : bytes;
      const steps = bytes.map((r) => r.step).filter((s): s is number => s !== undefined);
      out.push({
        kind: "unit",
        start: bytes[0].addr,
        end: bytes[size - 1].addr,
        label: bytes[0].label,
        size,
        value: size <= 8 && !bytes.some((r) => r.blank) ? ordered.reduce((v, r) => (v << 8n) | BigInt(r.value), 0n) : undefined,
        blank,
        bytes,
        changed: bytes.some((r) => r.changed),
        step: steps.length > 0 ? Math.max(...steps) : undefined,
      });
      i += size;
    } else {
      plain.push(rows[i]);
      i++;
    }
  }
  flush();
  return out;
}
