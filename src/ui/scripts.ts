import { decodeState, encodeState } from "./share";
import type { ShareState } from "./share";

/** A program the user saved in this browser. */
export interface SavedScript {
  name: string;
  state: ShareState;
  savedAt: number;
}

/** The slice of the Web Storage API this module needs, so tests can pass an in-memory fake. */
export type ScriptStorage = Pick<Storage, "getItem" | "setItem">;

export const SCRIPTS_KEY = "msx88-trace:scripts";
export const MAX_NAME_LENGTH = 60;

/** Each script is kept as its share-link encoding, so reading reuses the same validation as a link. */
interface Stored {
  name: string;
  data: string;
  savedAt: number;
}

function defaultStorage(): ScriptStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // blocked storage can throw on access
  }
}

export const cleanName = (name: string): string => name.trim().replace(/\s+/g, " ").slice(0, MAX_NAME_LENGTH);

function readStored(storage: ScriptStorage | null): Stored[] {
  if (!storage) return [];
  try {
    const raw: unknown = JSON.parse(storage.getItem(SCRIPTS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is Stored =>
        typeof e === "object" &&
        e !== null &&
        typeof (e as Stored).name === "string" &&
        typeof (e as Stored).data === "string" &&
        Number.isFinite((e as Stored).savedAt),
    );
  } catch {
    return [];
  }
}

/** The saved scripts, newest first. Corrupt entries are skipped, never thrown. */
export function listScripts(storage: ScriptStorage | null = defaultStorage()): SavedScript[] {
  const out: SavedScript[] = [];
  for (const e of readStored(storage)) {
    const state = decodeState(e.data);
    if (state) out.push({ name: e.name, state, savedAt: e.savedAt });
  }
  return out.sort((a, b) => b.savedAt - a.savedAt);
}

function write(storage: ScriptStorage | null, entries: Stored[]): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SCRIPTS_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

/** Saves under the given name, replacing a script that already has it. Returns the stored name, or null on failure. */
export function saveScript(
  name: string,
  state: ShareState,
  storage: ScriptStorage | null = defaultStorage(),
  now: number = Date.now(),
): string | null {
  const clean = cleanName(name);
  if (clean === "") return null;
  const others = readStored(storage).filter((e) => e.name !== clean);
  const entry: Stored = { name: clean, data: encodeState(state), savedAt: now };
  return write(storage, [...others, entry]) ? clean : null;
}

export function deleteScript(name: string, storage: ScriptStorage | null = defaultStorage()): boolean {
  const entries = readStored(storage);
  const kept = entries.filter((e) => e.name !== name);
  return kept.length === entries.length ? false : write(storage, kept);
}
