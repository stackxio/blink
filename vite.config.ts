import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./ui"),
      "@@": path.resolve(__dirname, "./packages/blink-code"),
      "@contracts": path.resolve(__dirname, "./packages/contracts"),
    },
  },
  build: {
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor")) {
            return "monaco";
          }
        },
      },
    },
  },
  optimizeDeps: {
    exclude: ["monaco-editor", "monaco-editor/esm/vs/editor/editor.api"],
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/core/**"],
    },
  },
});
