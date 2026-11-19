/** Everything needed to reproduce an MIPS64 run; lives in the URL hash so a link shares it. */
export interface MipsShareState {
  source: string;
  maxSteps: number;
  forwarding: boolean;
}

const toBase64Url = (bytes: Uint8Array): string => {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

const fromBase64Url = (s: string): Uint8Array => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function encodeMipsState(state: MipsShareState): string {
  return toBase64Url(new TextEncoder().encode(JSON.stringify(state)));
}

/** Returns null for anything that is not a valid state, never throws. */
export function decodeMipsState(encoded: string): MipsShareState | null {
  try {
    const raw: unknown = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded)));
    if (typeof raw !== "object" || raw === null) return null;
    const s = raw as Record<string, unknown>;
    if (typeof s.source !== "string" || typeof s.forwarding !== "boolean") return null;
    if (typeof s.maxSteps !== "number" || !Number.isInteger(s.maxSteps) || s.maxSteps < 1) return null;
    return { source: s.source, maxSteps: s.maxSteps, forwarding: s.forwarding };
  } catch {
    return null;
  }
}
