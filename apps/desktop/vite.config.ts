import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fileURLToPath, URL } from "node:url";
import { sentinelApiPlugin } from "./server/api-plugin";

export default defineConfig({
  plugins: [react(), tailwindcss(), sentinelApiPlugin()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  optimizeDeps: {
    exclude: [
      "@sw/database",
      "@sw/security-engine",
      "@sw/http-client",
      "@sw/api-parser",
      "@sw/auth",
    ],
  },
});
