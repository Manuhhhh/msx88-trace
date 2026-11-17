import { AsmError } from "./types";
import type { MemOperand, Operand, Reg, Width } from "./types";

// ASSUMPTION: instruction sizes follow standard 8086 encodings for the subset
// below (JMP is assumed short = 2 bytes). Instructions are kept as objects, not
// encoded bytes, so only their sizes (for IP / addresses) matter here.

export const ARITY = new Map<string, number>(
  Object.entries({
    CLI: 0, STI: 0, IRET: 0, RET: 0, NOP: 0, HLT: 0, PUSHF: 0, POPF: 0, CLC: 0, STC: 0,
    PUSH: 1, POP: 1, INC: 1, DEC: 1, NOT: 1, NEG: 1, MUL: 1, DIV: 1,
    INT: 1, CALL: 1, LOOP: 1,
    JMP: 1, JZ: 1, JNZ: 1, JE: 1, JNE: 1, JC: 1, JNC: 1, JS: 1, JNS: 1,
    JA: 1, JAE: 1, JB: 1, JBE: 1, JG: 1, JGE: 1, JL: 1, JLE: 1,
    MOV: 2, ADD: 2, ADC: 2, SUB: 2, SBB: 2, CMP: 2, AND: 2, OR: 2, XOR: 2, TEST: 2,
    IN: 2, OUT: 2, SHL: 2, SHR: 2,
  }),
);

export const CONDITIONAL_JUMPS = new Set([
  "JZ", "JNZ", "JE", "JNE", "JC", "JNC", "JS", "JNS",
  "JA", "JAE", "JB", "JBE", "JG", "JGE", "JL", "JLE",
]);

const ALU = new Set(["ADD", "ADC", "SUB", "SBB", "CMP", "AND", "OR", "XOR", "TEST"]);

export function regWidth(r: Reg): Width {
  return /^[ABCD][LH]$/.test(r) ? 8 : 16;
}

export function isMem(o: Operand): o is MemOperand {
  return o.kind === "mem" || o.kind === "memReg";
}

export function widthOf(o: Operand): Width | undefined {
  if (o.kind === "reg") return regWidth(o.reg);
  if (o.kind === "imm") return undefined;
  return o.width;
}

const disp = (o: MemOperand): number => (o.kind === "mem" ? 2 : 0);

/**
 * Size in bytes of an instruction. `fwd[i]` is true when operand i references
 * a symbol not yet defined in the first pass (its value is unknown).
 */
export function instrSize(mn: string, ops: Operand[], fwd: boolean[], line: number): number {
  const arity = ARITY.get(mn);
  if (arity === undefined) throw new AsmError(`Unknown instruction ${mn}`, line);
  if (ops.length !== arity) {
    throw new AsmError(`${mn} expects ${arity} operand(s), got ${ops.length}`, line);
  }
  const bad = (): never => {
    throw new AsmError(`Invalid operands for ${mn}`, line);
  };
  const needWidth = (): never => {
    throw new AsmError(`${mn}: specify BYTE PTR or WORD PTR`, line);
  };
  const [a, b] = ops;

  if (arity === 0) return 1;
  if (mn === "INT") return a.kind !== "imm" ? bad() : a.value === 3 ? 1 : 2;
  if (mn === "CALL") return a.kind === "imm" ? 3 : bad();
  if (mn === "JMP" || mn === "LOOP" || CONDITIONAL_JUMPS.has(mn)) {
    return a.kind === "imm" ? 2 : bad();
  }
  if (mn === "PUSH" || mn === "POP") {
    if (a.kind === "reg") return regWidth(a.reg) === 16 ? 1 : bad();
    return isMem(a) ? 2 + disp(a) : bad();
  }
  if (mn === "INC" || mn === "DEC" || mn === "NOT" || mn === "NEG" || mn === "MUL" || mn === "DIV") {
    if (a.kind === "imm") return bad();
    if (a.kind === "reg") {
      return regWidth(a.reg) === 16 && (mn === "INC" || mn === "DEC") ? 1 : 2;
    }
    return a.width === undefined ? needWidth() : 2 + disp(a);
  }
  if (mn === "OUT") {
    if (b.kind !== "reg" || (b.reg !== "AL" && b.reg !== "AX")) return bad();
    if (a.kind === "reg") return a.reg === "DX" ? 1 : bad();
    return a.kind === "imm" ? 2 : bad();
  }
  if (mn === "IN") {
    if (a.kind !== "reg" || (a.reg !== "AL" && a.reg !== "AX")) return bad();
    if (b.kind === "reg") return b.reg === "DX" ? 1 : bad();
    return b.kind === "imm" ? 2 : bad();
  }
  if (mn === "SHL" || mn === "SHR") {
    const countOk = (b.kind === "imm" && b.value === 1) || (b.kind === "reg" && b.reg === "CL");
    if (!countOk) throw new AsmError(`${mn} count must be 1 or CL`, line);
    if (a.kind === "imm") return bad();
    if (a.kind === "reg") return 2;
    return a.width === undefined ? needWidth() : 2 + disp(a);
  }

  // MOV and the two-operand ALU group.
  if (mn !== "MOV" && !ALU.has(mn)) return bad();
  if (a.kind === "imm") return bad();
  if (isMem(a) && isMem(b)) return bad();
  const wa = widthOf(a);
  const wb = widthOf(b);
  if (b.kind !== "imm" && wa !== undefined && wb !== undefined && wa !== wb) {
    throw new AsmError(`${mn}: operand size mismatch`, line);
  }

  if (b.kind === "imm") {
    if (wa === undefined) return needWidth();
    if (mn === "MOV") {
      if (a.kind === "reg") return wa === 8 ? 2 : 3;
      return 2 + disp(a) + (wa === 8 ? 1 : 2);
    }
    const small = mn !== "TEST" && !fwd[1] && b.value >= -128 && b.value <= 127;
    if (a.kind === "reg") {
      if (a.reg === "AL") return 2;
      if (a.reg === "AX") return 3;
      if (wa === 8) return 3;
      return small ? 3 : 4;
    }
    return 2 + disp(a) + (wa === 8 || small ? 1 : 2);
  }

  if (a.kind === "reg" && b.kind === "reg") return 2;
  const reg = a.kind === "reg" ? a : b;
  const mem = isMem(a) ? a : b;
  if (reg.kind !== "reg" || !isMem(mem)) return bad();
  if (mn === "MOV" && mem.kind === "mem" && (reg.reg === "AL" || reg.reg === "AX")) return 3;
  return 2 + disp(mem);
}

/** Range checks that need resolved values; run in the second pass. */
export function validateResolved(mn: string, ops: Operand[], line: number): void {
  const [a, b] = ops;
  if (mn === "INT" && a.kind === "imm" && (a.value < 0 || a.value > 255)) {
    throw new AsmError(`INT number out of range: ${a.value}`, line);
  }
  if (mn === "OUT" && a.kind === "imm" && (a.value < 0 || a.value > 255)) {
    throw new AsmError(`Port out of range (use DX): ${a.value}`, line);
  }
  if (mn === "IN" && b.kind === "imm" && (b.value < 0 || b.value > 255)) {
    throw new AsmError(`Port out of range (use DX): ${b.value}`, line);
  }
  if (b && b.kind === "imm" && a.kind !== "imm" && (mn === "MOV" || ALU.has(mn))) {
    const w = widthOf(a);
    const min = w === 8 ? -128 : -32768;
    const max = w === 8 ? 255 : 65535;
    if (w !== undefined && (b.value < min || b.value > max)) {
      throw new AsmError(`Immediate ${b.value} does not fit in ${w} bits`, line);
    }
  }
}
