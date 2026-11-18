export const hex = (v: number, digits: number): string =>
  v.toString(16).toUpperCase().padStart(digits, "0");
export const hex16 = (v: number): string => hex(v, 4);
export const hex8 = (v: number): string => hex(v, 2);
export const bin8 = (v: number): string => v.toString(2).padStart(8, "0");

export const FLAG_ORDER = ["ZF", "SF", "CF", "OF", "IF", "PF", "AF"] as const;
export const REG_ORDER = ["AX", "BX", "CX", "DX", "SI", "DI", "BP", "SP"] as const;
