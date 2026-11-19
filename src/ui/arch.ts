export type Arch = "msx88" | "mips";

export const ARCHS: readonly { id: Arch; name: string }[] = [
  { id: "msx88", name: "MSX88" },
  { id: "mips", name: "MIPS64" },
];

/** The architecture a URL asks for (`?arch=mips`); anything else is null. */
export function parseArch(search: string): Arch | null {
  const v = new URLSearchParams(search).get("arch");
  return v === "mips" || v === "msx88" ? v : null;
}

/** MSX88 is the default, so its address stays the plain one existing links already use. */
export function archUrl(arch: Arch, path: string): string {
  return arch === "msx88" ? path : `${path}?arch=${arch}`;
}

export function getArch(): Arch {
  return parseArch(location.search) ?? "msx88";
}

/** Fills an architecture selector and makes choosing another one load that screen (the run in the address is left behind). */
export function wireArchSelect(select: HTMLSelectElement, current: Arch): void {
  select.replaceChildren(
    ...ARCHS.map((a) => {
      const o = document.createElement("option");
      o.value = a.id;
      o.textContent = a.name;
      return o;
    }),
  );
  select.value = current;
  select.addEventListener("change", () => {
    location.assign(archUrl(select.value as Arch, location.pathname));
  });
}
