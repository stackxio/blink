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
          if (id.includes("node_modules/monaco-editor")) return "monaco";
          // xterm and its addons are only used in the terminal — split them out
          // so they don't inflate the main bundle for users who never open a terminal.
          if (id.includes("node_modules/@xterm")) return "xterm";
          // react-markdown + remark/rehype plugins are only used in BlinkCodePanel
          // (which is already lazy-loaded). Keep them in their own chunk.
          if (
            id.includes("node_modules/react-markdown") ||
            id.includes("node_modules/remark") ||
            id.includes("node_modules/rehype") ||
            id.includes("node_modules/unified") ||
            id.includes("node_modules/mdast") ||
            id.includes("node_modules/micromark") ||
            id.includes("node_modules/hast")
          ) {
            return "markdown";
          }
          // Stable vendor chunk for frequently-reused React-ecosystem packages.
          // Improves cache hit rate between deploys since these rarely change.
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/react-router") ||
            id.includes("node_modules/zustand") ||
            id.includes("node_modules/lucide-react")
          ) {
            return "vendor";
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
