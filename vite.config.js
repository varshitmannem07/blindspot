import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `npm run build` produces dist/index.html: one self-contained file (code, styles,
// fonts, icons inlined) that runs offline by double-clicking it.
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  base: "./",
});
