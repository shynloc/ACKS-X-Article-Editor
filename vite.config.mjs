import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const bridgeTarget = process.env.X_BRIDGE_TARGET || "http://127.0.0.1:48787";

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
      "/api/x": bridgeTarget,
    },
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  preview: {
    proxy: { "/api/x": bridgeTarget },
  },
  plugins: [react()],
});
