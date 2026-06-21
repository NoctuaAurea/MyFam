import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  server: {
    proxy: {
      // Proxy CALA AI calls through the dev server to avoid CORS preflight rejection
      "/cala-api": {
        target: "https://api.cala.ai",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/cala-api/, ""),
      },
    },
  },
});
