import "./style.css";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <main class="mx-auto max-w-5xl p-6">
    <h1 class="text-2xl font-semibold">MSX88 Trace</h1>
    <p class="mt-2 text-zinc-400">Trace generator for MSX88 assembly.</p>
  </main>
`;
