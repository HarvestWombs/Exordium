import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  root: "src",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1024,
  },
  server: {
    port: 5273,
    strictPort: true,
    hmr: { clientPort: 5273 },
    // The fonts' packages sit in the workspace's node_modules, above `root`.
    fs: { allow: ["../../.."] },
  },
});
