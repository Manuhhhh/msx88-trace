import { LANGS, getLang, setLang, t } from "./i18n";
import type { Lang } from "./i18n";
import { getArch, archUrl } from "./arch";
import { manualDoc } from "./manual";
import { mipsManualDoc } from "./mips-manual";

/** The instruction manual as its own page: a table of contents on the side and the reference beside it. `?arch=mips` shows the EduMIPS64 one. */
export function mountManual(root: HTMLElement): void {
  const arch = getArch();
  const mips = arch === "mips";
  const home = archUrl(arch, "./");
  root.innerHTML = `
    <div class="docs-shell">
      <header class="topbar">
        <a class="wordmark" href="${home}">${mips ? "EduMIPS64 Trace" : "MSX88 Trace"}</a>
        <div class="topbar-actions flex items-center gap-(--space-sm)">
          <select id="lang" class="control lang-select" aria-label="Idioma / Language"></select>
          <a class="key" href="${home}" id="back"></a>
        </div>
      </header>
      <div class="docs-layout">
        <nav class="docs-nav" id="nav"></nav>
        <main class="docs-main">
          <h1 class="docs-title" id="title"></h1>
          <div id="body"></div>
        </main>
      </div>
    </div>`;

  const q = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#${id}`)!;
  const langEl = q<HTMLSelectElement>("lang");
  langEl.replaceChildren(
    ...LANGS.map((l) => {
      const o = document.createElement("option");
      o.value = l.id;
      o.textContent = l.name;
      return o;
    }),
  );

  function paint(): void {
    const lang = getLang();
    const doc = mips ? mipsManualDoc(lang) : manualDoc(lang);
    const title = t(mips ? "manual.title.mips" : "manual.title");
    document.documentElement.lang = lang;
    document.title = title;
    langEl.value = lang;
    q("back").textContent = t("manual.back");
    q("title").textContent = title;
    q("nav").setAttribute("aria-label", t("manual.contents"));
    q("nav").innerHTML = doc.nav;
    q("body").innerHTML = doc.body;
  }

  langEl.addEventListener("change", () => {
    setLang(langEl.value as Lang);
    paint();
  });
  paint();
  // a link that points at a section (#mov) lands on it once the text exists
  if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
}
