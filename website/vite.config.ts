import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const currentDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: currentDir,
  build: {
    outDir: resolve(currentDir, "dist"),
    emptyOutDir: true,
  },
});
