import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    // the simulator and its instruction manual are two pages
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL("./index.html", import.meta.url)),
        manual: fileURLToPath(new URL("./manual.html", import.meta.url)),
      },
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
});
