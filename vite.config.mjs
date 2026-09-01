import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "decode-named-character-reference": fileURLToPath(
        import.meta.resolve("decode-named-character-reference"),
      ),
    },
  },
  build: {
    outDir: "dist/client",
    reportCompressedSize: false,
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    proxy: {
      "/api/x": "http://127.0.0.1:48787",
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react()],
});
