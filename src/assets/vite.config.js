// vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

const onnxMimePlugin = () => ({
  name: "onnx-mime",
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.includes(".onnx")) {
        res.setHeader("Content-Type", "application/octet-stream");
      }
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url && req.url.includes(".onnx")) {
        res.setHeader("Content-Type", "application/octet-stream");
      }
      next();
    });
  },
});

// ===============================================
// ⚙️ BankAI — Vite Config (ONNX Mode)
// -----------------------------------------------
// ✔ Allows loading large ONNX + tokenizer JSON files
// ✔ Prevents Vite from inlining model binary assets
// ✔ Serves models from /public/models correctly
// ===============================================

export default defineConfig({
  plugins: [react(), onnxMimePlugin()],
  base: "/",

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "/src": path.resolve(__dirname, "./src"),
    },
  },

  // Let Vite treat these as static assets (not JS)
  assetsInclude: [
    "**/*.onnx",
    "**/*.json",
    "**/*.bin",
    "**/*.safetensors",
    "**/*.txt",
  ],

  build: {
    assetsInlineLimit: 0, // never inline big binaries
    sourcemap: false,
  },

  server: {
    fs: { allow: ["./"] },
    mimeTypes: {
      "application/octet-stream": ["onnx"],
    },
  },
});
